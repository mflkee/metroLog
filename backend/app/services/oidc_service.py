"""Single sign-on against Authentik (OpenID Connect, authorization code + PKCE).

The app keeps its own HMAC session token: Authentik only proves *who* the user is,
the app then issues the same token it always did. Nothing about the existing login
path changes — SSO is additive and lives behind ``OIDC_ENABLED``.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
import threading
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository

OIDC_COOKIE = "metrolog_oidc_txn"
OIDC_COOKIE_PATH = "/api/v1/auth/oidc"

# Authentik group -> app role. Order matters: the most privileged match wins.
GROUP_ROLE_MAP: tuple[tuple[str, UserRole], ...] = (
    ("metrolog-developer", UserRole.DEVELOPER),
    ("metrolog-administrator", UserRole.ADMINISTRATOR),
    ("metrolog-mkair", UserRole.MKAIR),
    ("metrolog-customer", UserRole.CUSTOMER),
)
ACCESS_GROUP = "metrolog-users"
ACCESS_GROUP_PREFIX = "metrolog-"

_DISCOVERY_TTL_SECONDS = 3600


class OidcError(Exception):
    """A user-facing failure of the SSO flow; carries a short machine code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class _Discovery:
    authorization_endpoint: str
    token_endpoint: str
    jwks_uri: str
    fetched_at: float


@dataclass(frozen=True)
class OidcTransaction:
    state: str
    nonce: str
    code_verifier: str
    redirect: str | None


_discovery: _Discovery | None = None
_discovery_lock = threading.Lock()
_jwks_client: jwt.PyJWKClient | None = None


def is_enabled() -> bool:
    return bool(settings.oidc_enabled and settings.oidc_client_secret)


def build_login_url(*, redirect: str | None) -> tuple[str, dict[str, str]]:
    """Return the Authentik authorize URL plus the transaction we must remember."""

    if not is_enabled():
        raise OidcError("disabled", "Single sign-on is not enabled.")

    discovery = _get_discovery()
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(64)
    code_challenge = _pkce_challenge(code_verifier)

    query = urlencode(
        {
            "response_type": "code",
            "client_id": settings.oidc_client_id,
            "redirect_uri": settings.oidc_redirect_uri,
            "scope": settings.oidc_scopes,
            "state": state,
            "nonce": nonce,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
    )
    return f"{discovery.authorization_endpoint}?{query}", {
        "state": state,
        "nonce": nonce,
        "code_verifier": code_verifier,
        "redirect": _sanitize_redirect(redirect),
    }


def resolve_callback(
    *,
    session: Session,
    code: str,
    state: str,
    transaction: OidcTransaction,
) -> tuple[User, str | None]:
    """Exchange the code, verify the identity token and return the app user."""

    if not is_enabled():
        raise OidcError("disabled", "Single sign-on is not enabled.")
    if not code:
        raise OidcError("no_code", "Authentik did not return an authorization code.")
    if not state or not secrets.compare_digest(state, transaction.state):
        raise OidcError("bad_state", "The login session is invalid or has expired.")

    tokens = _exchange_code(code=code, code_verifier=transaction.code_verifier)
    id_token = tokens.get("id_token")
    if not id_token:
        raise OidcError("no_id_token", "Authentik did not return an identity token.")

    claims = _verify_id_token(id_token, nonce=transaction.nonce)
    return _resolve_user(session, claims), transaction.redirect


# --------------------------------------------------------------------------- #
# internals
# --------------------------------------------------------------------------- #


def _resolve_user(session: Session, claims: dict[str, Any]) -> User:
    email = str(claims.get("email") or "").strip().lower()
    if not email:
        raise OidcError("no_email", "Authentik did not provide an email address.")

    groups = _claim_groups(claims)
    if not _has_access(groups):
        raise OidcError("no_access", "Учётная запись не имеет доступа к metroLog.")

    users = UserRepository(session)
    user = users.get_by_email(email)
    if user is None:
        if not settings.oidc_auto_provision:
            raise OidcError("unknown_user", "Учётная запись не найдена в metroLog.")
        user = _provision_user(users, claims, email=email, groups=groups)

    if not user.is_active:
        raise OidcError("inactive", "Учётная запись отключена.")

    role = _role_from_groups(groups)
    if role is not None and user.role != role:
        user.role = role

    now = datetime.now(tz=UTC)
    user.last_login_at = now
    user.last_seen_at = now
    session.commit()
    session.refresh(user)
    return user


def _provision_user(
    users: UserRepository,
    claims: dict[str, Any],
    *,
    email: str,
    groups: list[str],
) -> User:
    given = str(claims.get("given_name") or "").strip()
    family = str(claims.get("family_name") or "").strip()
    if not given and not family:
        given = str(claims.get("name") or email.split("@")[0]).strip()

    user = User(
        email=email,
        first_name=given or email.split("@")[0],
        last_name=family,
        role=_role_from_groups(groups) or UserRole.CUSTOMER,
        # SSO users never authenticate with a local password.
        password_hash="!",
        is_active=True,
        must_change_password=False,
    )
    users.add(user)
    return user


def _role_from_groups(groups: list[str]) -> UserRole | None:
    for group, role in GROUP_ROLE_MAP:
        if group in groups:
            return role
    return None


def _has_access(groups: list[str]) -> bool:
    if ACCESS_GROUP in groups:
        return True
    if _role_from_groups(groups) is not None:
        return True
    return any(group.startswith(ACCESS_GROUP_PREFIX) for group in groups)


def _claim_groups(claims: dict[str, Any]) -> list[str]:
    raw = claims.get("groups")
    if isinstance(raw, str):
        return [item for item in (part.strip() for part in raw.split(",")) if item]
    if isinstance(raw, list):
        return [str(item) for item in raw]
    return []


def _pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")


def _sanitize_redirect(redirect: str | None) -> str | None:
    if not redirect or not redirect.startswith("/") or redirect.startswith("//"):
        return None
    return redirect


def _get_discovery() -> _Discovery:
    global _discovery
    with _discovery_lock:
        fresh = (
            _discovery is not None
            and time.monotonic() - _discovery.fetched_at < _DISCOVERY_TTL_SECONDS
        )
        if fresh:
            return _discovery
        url = f"{settings.oidc_issuer.rstrip('/')}/.well-known/openid-configuration"
        try:
            response = httpx.get(url, timeout=settings.oidc_http_timeout_seconds)
            response.raise_for_status()
            document = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise OidcError("discovery_failed", "Не удалось связаться с сервером входа.") from exc

        _discovery = _Discovery(
            authorization_endpoint=document["authorization_endpoint"],
            token_endpoint=document["token_endpoint"],
            jwks_uri=document["jwks_uri"],
            fetched_at=time.monotonic(),
        )
        return _discovery


def _exchange_code(*, code: str, code_verifier: str) -> dict[str, Any]:
    discovery = _get_discovery()
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": settings.oidc_redirect_uri,
        "client_id": settings.oidc_client_id,
        "client_secret": settings.oidc_client_secret or "",
        "code_verifier": code_verifier,
    }
    try:
        response = httpx.post(
            discovery.token_endpoint,
            data=data,
            timeout=settings.oidc_http_timeout_seconds,
        )
        response.raise_for_status()
        return response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise OidcError("token_exchange_failed", "Не удалось завершить вход.") from exc


def _verify_id_token(id_token: str, *, nonce: str) -> dict[str, Any]:
    discovery = _get_discovery()
    try:
        signing_key = _get_jwks_client(discovery.jwks_uri).get_signing_key_from_jwt(id_token)
        claims = jwt.decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=settings.oidc_client_id,
            issuer=settings.oidc_issuer,
            options={"require": ["exp", "iat", "aud", "iss"]},
        )
    except jwt.PyJWTError as exc:
        raise OidcError("bad_id_token", "Токен входа недействителен.") from exc

    token_nonce = claims.get("nonce")
    if not token_nonce or not secrets.compare_digest(str(token_nonce), nonce):
        raise OidcError("bad_nonce", "Токен входа не соответствует сессии.")
    return claims


def _get_jwks_client(jwks_uri: str) -> jwt.PyJWKClient:
    global _jwks_client
    if _jwks_client is None or _jwks_client.uri != jwks_uri:
        _jwks_client = jwt.PyJWKClient(jwks_uri, cache_keys=True, lifespan=300)
    return _jwks_client


def frontend_error_url(code: str) -> str:
    base = settings.frontend_app_url.rstrip("/")
    return f"{base}/login#oidc_error={code}"


def frontend_success_url(*, token: str, redirect: str | None) -> str:
    # The token goes in the fragment: it is never sent to the server and never
    # ends up in nginx access logs or the Referer header.
    base = settings.frontend_app_url.rstrip("/")
    fragment = urlencode({"token": token, "redirect": redirect or "/dashboard"})
    return f"{base}/auth/callback#{fragment}"
