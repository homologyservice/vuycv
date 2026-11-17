import asyncio
import sys
import json
import re
from datetime import datetime, timezone
from telethon import TelegramClient, functions
from telethon.sessions import StringSession

API_ID = 17349
API_HASH = '344583e45741c457fe1862106095a5eb'

# Hard caps so a stuck Telegram connection can never hang the Node parent
CONNECT_TIMEOUT = 15
AUTH_CHECK_TIMEOUT = 10
MESSAGES_TIMEOUT = 15
AUTHZ_TIMEOUT = 15


async def fetch_otp_and_check_login(session_str):
    client = None  # defined before try so `finally` can never NameError
    try:
        client = TelegramClient(
            StringSession(session_str),
            API_ID,
            API_HASH,
            connection_retries=2,
            timeout=10,
        )
        await asyncio.wait_for(client.connect(), timeout=CONNECT_TIMEOUT)

        authorized = await asyncio.wait_for(
            client.is_user_authorized(), timeout=AUTH_CHECK_TIMEOUT
        )
        if not authorized:
            return {"error": "Session is invalid or expired"}

        # 1. Fetch latest OTP message from 777000 (Telegram service account)
        target_id = 777000
        messages = await asyncio.wait_for(
            client.get_messages(target_id, limit=5), timeout=MESSAGES_TIMEOUT
        )

        otp_data = None
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
            # Not fatal — we still return OTP info even if this call fails
            pass

        return {
            "otp": otp_data,
            "latest_auth_date": latest_auth_date,
            "session_count": session_count,
        }
    except asyncio.TimeoutError:
        return {"error": "Telegram server did not respond in time (timeout)"}
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

    # Always emit valid JSON on stdout so the Node side never breaks on parse
    print(json.dumps(result))
