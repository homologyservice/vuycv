import asyncio
import sys
import json
import re
from datetime import datetime, timezone
from telethon import TelegramClient, functions
from telethon.sessions import StringSession
from telethon.errors import AuthKeyUnregisteredError, SessionRevokedError

API_ID = 17349
API_HASH = '344583e45741c457fe1862106095a5eb'

# Longer timeouts — Render free-tier network can be slow reaching Telegram DCs
CONNECT_TIMEOUT = 35
MESSAGES_TIMEOUT = 25
AUTHZ_TIMEOUT = 20
IS_AUTH_TIMEOUT = 15


async def fetch_otp_and_check_login(session_str):
    client = None
    try:
        # NOTE: do NOT wrap client.connect() in asyncio.wait_for — Telethon's
        # own retry logic would be cancelled as soon as the outer timeout fires.
        client = TelegramClient(
            StringSession(session_str),
            API_ID,
            API_HASH,
            connection_retries=5,
            retry_delay=2,
            auto_reconnect=True,
            timeout=20,
            request_retries=5,
        )

        await client.connect()

        if not client.is_connected():
            return {"error": "Failed to connect to Telegram servers. Please try Resend."}

        # Guard: session may be revoked / logged out
        try:
            authorized = await asyncio.wait_for(
                client.is_user_authorized(), timeout=IS_AUTH_TIMEOUT
            )
        except asyncio.TimeoutError:
            return {"error": "Auth check timed out. Please try Resend."}
        except (AuthKeyUnregisteredError, SessionRevokedError):
            return {"error": "Session is invalid or revoked"}
        except Exception as e:
            return {"error": f"Auth check failed: {type(e).__name__}: {e}"}

        if not authorized:
            return {"error": "Session is invalid or expired"}

        # 1. Fetch latest OTP message from 777000 (Telegram service account)
        otp_data = None
        target_id = 777000
        try:
            messages = await asyncio.wait_for(
                client.get_messages(target_id, limit=10), timeout=MESSAGES_TIMEOUT
            )
        except asyncio.TimeoutError:
            messages = []

        if messages:
            for msg in messages:
                text = msg.text or ''
                if not otp_data and re.search(r'\b\d{5,6}\b', text):
                    otp_data = {
                        "text": text,
                        "date": msg.date.timestamp(),
                    }
                    break

        # 2. Get all authorizations to find the latest login
        latest_auth_date = 0
        session_count = 1
        try:
            authorizations = await asyncio.wait_for(
                client(functions.account.GetAuthorizationsRequest()),
                timeout=AUTHZ_TIMEOUT,
            )
            session_count = len(authorizations.authorizations)
            for auth in authorizations.authorizations:
                if not auth.current:
                    auth_ts = auth.date.timestamp()
                    if auth_ts > latest_auth_date:
                        latest_auth_date = auth_ts
        except Exception:
            pass

        return {
            "otp": otp_data,
            "latest_auth_date": latest_auth_date,
            "session_count": session_count,
        }
    except asyncio.TimeoutError:
        return {"error": "Connection timed out. Please try Resend."}
    except Exception as e:
        return {"error": f"{type(e).__name__}: {e}"}
    finally:
        if client is not None:
            try:
                await client.disconnect()
            except Exception:
                pass


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No session string provided"}))
        sys.exit(1)

    session_input = sys.argv[1]
    try:
        result = asyncio.run(fetch_otp_and_check_login(session_input))
    except Exception as e:
        result = {"error": f"Fatal: {type(e).__name__}: {e}"}

    print(json.dumps(result))
