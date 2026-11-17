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

CONNECT_TIMEOUT = 35
MESSAGES_TIMEOUT = 25
AUTHZ_TIMEOUT = 20
IS_AUTH_TIMEOUT = 15

# OTP retry configuration
OTP_MAX_RETRIES = 12
OTP_RETRY_DELAY = 3

# Telegram OTP always comes from 777000
OTP_SENDER = 777000


def extract_otp_code(text):
    """Extract OTP code from message text"""
    if not text:
        return None

    # 1) "Login code: 61526" / "code: 123456" / "code is 12345"
    m = re.search(
        r'(?:login\s*code|code|otp)\s*[:\-]?\s*(\d{5,6})',
        text, re.IGNORECASE
    )
    if m:
        return m.group(1)

    # 2) "123456 is your Telegram code"
    m = re.search(r'\b(\d{5,6})\b\s+is\s+your', text, re.IGNORECASE)
    if m:
        return m.group(1)

    # 3) Space/dash separated code "1 2 3 4 5 6"
    m = re.search(r'\b(?:\d[\s\-]?){5,6}\b', text)
    if m:
        raw = re.sub(r'[\s\-]', '', m.group(0))
        if raw.isdigit() and 5 <= len(raw) <= 6:
            return raw

    # 4) Fallback: first 5-6 digit
    m = re.search(r'\b\d{5,6}\b', text)
    if m:
        return m.group(0)

    return None


async def fetch_otp_and_check_login(session_str, target_time=None):
    """target_time: Unix timestamp — reject OTP older than this"""
    client = None
    try:
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

        # ---- OTP fetch with retry loop ----
        otp_data = None
        debug_log = []

        for attempt in range(OTP_MAX_RETRIES):
            try:
                messages = await asyncio.wait_for(
                    client.get_messages(OTP_SENDER, limit=10),
                    timeout=MESSAGES_TIMEOUT,
                )
            except asyncio.TimeoutError:
                messages = []
                debug_log.append(f"attempt {attempt+1}: timeout")
            except Exception as e:
                messages = []
                debug_log.append(f"attempt {attempt+1}: {type(e).__name__}")

            if messages:
                for msg in messages:
                    text = msg.text or ""
                    msg_ts = msg.date.timestamp()

                    if target_time and msg_ts < target_time - 5:
                        continue

                    code = extract_otp_code(text)
                    if code:
                        otp_data = {
                            "text": text,
                            "code": code,
                            "sender": OTP_SENDER,
                            "date": msg_ts,
                        }
                        break

            if otp_data:
                break

            await asyncio.sleep(OTP_RETRY_DELAY)

        # ---- Get all authorizations ----
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
            "debug": debug_log[:5],
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
    target_time = None
    if len(sys.argv) >= 3:
        try:
            target_time = float(sys.argv[2])
        except (ValueError, TypeError):
            target_time = None

    try:
        result = asyncio.run(fetch_otp_and_check_login(session_input, target_time))
    except Exception as e:
        result = {"error": f"Fatal: {type(e).__name__}: {e}"}

    print(json.dumps(result))
