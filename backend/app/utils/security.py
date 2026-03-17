from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import string
from datetime import UTC, datetime, timedelta


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 600_000)
    return f"{salt.hex()}:{digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        salt_hex, digest_hex = password_hash.split(":", maxsplit=1)
    except ValueError:
        return False

    salt = bytes.fromhex(salt_hex)
    expected_digest = bytes.fromhex(digest_hex)
    actual_digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 600_000)
    return hmac.compare_digest(actual_digest, expected_digest)


def create_numeric_code(length: int = 6) -> str:
    max_value = 10**length
    return f"{secrets.randbelow(max_value):0{length}d}"


def create_temporary_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(length))
        if any(character.isalpha() for character in password) and any(
            character.isdigit() for character in password
        ):
            return password


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def create_access_token(*, user_id: int, role: str, secret_key: str, ttl_hours: int) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "iat": int(datetime.now(tz=UTC).timestamp()),
        "exp": int((datetime.now(tz=UTC) + timedelta(hours=ttl_hours)).timestamp()),
    }
    encoded_payload = _b64encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = encoded_payload.encode("utf-8")
    signature = _b64encode(
        hmac.new(secret_key.encode("utf-8"), signing_input, hashlib.sha256).digest()
    )
    return f"{encoded_payload}.{signature}"


def decode_access_token(token: str, secret_key: str) -> dict[str, int | str]:
    try:
        encoded_payload, encoded_signature = token.split(".", maxsplit=1)
    except ValueError as exc:
        raise ValueError("Malformed token.") from exc

    signing_input = encoded_payload.encode("utf-8")
    expected_signature = _b64encode(
        hmac.new(secret_key.encode("utf-8"), signing_input, hashlib.sha256).digest()
    )
    if not hmac.compare_digest(encoded_signature, expected_signature):
        raise ValueError("Invalid token signature.")

    try:
        payload = json.loads(_b64decode(encoded_payload).decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError("Token payload is invalid.") from exc

    if int(payload.get("exp", 0)) < int(datetime.now(tz=UTC).timestamp()):
        raise ValueError("Token has expired.")

    return payload


def _b64encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")
