from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from httpx import AsyncClient
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.user import User, UserRole
from app.services import oidc_service
from app.services.oidc_service import OidcError, OidcTransaction
from app.utils.security import hash_password


def _session(db_engine):
    factory = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    return factory()


def _enable_oidc(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "oidc_enabled", True)
    monkeypatch.setattr(settings, "oidc_client_secret", "client-secret")


# --------------------------------------------------------------------------- #
# pure helpers
# --------------------------------------------------------------------------- #


def test_role_from_groups_prefers_the_most_privileged() -> None:
    assert oidc_service._role_from_groups(["metrolog-developer"]) == UserRole.DEVELOPER
    assert oidc_service._role_from_groups(["metrolog-administrator"]) == UserRole.ADMINISTRATOR
    assert oidc_service._role_from_groups(["metrolog-mkair"]) == UserRole.MKAIR
    assert oidc_service._role_from_groups(["metrolog-customer"]) == UserRole.CUSTOMER
    assert oidc_service._role_from_groups(["metrolog-users"]) is None
    assert (
        oidc_service._role_from_groups(["metrolog-users", "metrolog-mkair", "metrolog-developer"])
        == UserRole.DEVELOPER
    )


def test_has_access_requires_a_metrolog_group() -> None:
    assert oidc_service._has_access(["metrolog-users"]) is True
    assert oidc_service._has_access(["metrolog-mkair"]) is True
    assert oidc_service._has_access(["authentik Admins"]) is False
    assert oidc_service._has_access([]) is False


def test_sanitize_redirect_only_allows_local_paths() -> None:
    assert oidc_service._sanitize_redirect("/equipment") == "/equipment"
    assert oidc_service._sanitize_redirect("//evil.example") is None
    assert oidc_service._sanitize_redirect("https://evil.example") is None
    assert oidc_service._sanitize_redirect(None) is None


def test_claim_groups_accepts_list_and_string() -> None:
    assert oidc_service._claim_groups({"groups": ["a", "b"]}) == ["a", "b"]
    assert oidc_service._claim_groups({"groups": "a, b"}) == ["a", "b"]
    assert oidc_service._claim_groups({}) == []


def test_build_login_url(monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_oidc(monkeypatch)
    monkeypatch.setattr(
        oidc_service,
        "_get_discovery",
        lambda: oidc_service._Discovery(
            authorization_endpoint="https://auth.example/authorize",
            token_endpoint="https://auth.example/token",
            jwks_uri="https://auth.example/jwks",
            fetched_at=0.0,
        ),
    )

    url, transaction = oidc_service.build_login_url(redirect="/equipment")

    assert url.startswith("https://auth.example/authorize?")
    assert "code_challenge_method=S256" in url
    assert f"client_id={settings.oidc_client_id}" in url
    assert transaction["state"] and transaction["nonce"] and transaction["code_verifier"]
    assert transaction["redirect"] == "/equipment"


def test_build_login_url_is_disabled_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "oidc_enabled", False)
    with pytest.raises(OidcError):
        oidc_service.build_login_url(redirect=None)


# --------------------------------------------------------------------------- #
# id token verification
# --------------------------------------------------------------------------- #


def _rsa_key():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _stub_jwks(monkeypatch: pytest.MonkeyPatch, key) -> None:
    public_key = key.public_key()

    class _StubKey:
        key = public_key

    class _StubClient:
        uri = "https://auth.example/jwks"

        def get_signing_key_from_jwt(self, _token: str) -> _StubKey:
            return _StubKey()

    monkeypatch.setattr(oidc_service, "_get_jwks_client", lambda _uri: _StubClient())


def test_verify_id_token_accepts_valid_and_rejects_wrong_nonce(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    key = _rsa_key()
    now = datetime.now(tz=UTC)
    token = jwt.encode(
        {
            "sub": "hashed-1",
            "aud": settings.oidc_client_id,
            "iss": settings.oidc_issuer,
            "iat": now,
            "exp": now + timedelta(minutes=5),
            "nonce": "nonce-123",
            "email": "user@mkair.ru",
        },
        key,
        algorithm="RS256",
    )

    _stub_jwks(monkeypatch, key)

    claims = oidc_service._verify_id_token(token, nonce="nonce-123")
    assert claims["email"] == "user@mkair.ru"

    with pytest.raises(OidcError):
        oidc_service._verify_id_token(token, nonce="other")


def test_verify_id_token_rejects_wrong_issuer(monkeypatch: pytest.MonkeyPatch) -> None:
    key = _rsa_key()
    now = datetime.now(tz=UTC)
    token = jwt.encode(
        {
            "sub": "1",
            "aud": settings.oidc_client_id,
            "iss": "https://evil.example/",
            "iat": now,
            "exp": now + timedelta(minutes=5),
            "nonce": "n",
        },
        key,
        algorithm="RS256",
    )

    _stub_jwks(monkeypatch, key)
    with pytest.raises(OidcError):
        oidc_service._verify_id_token(token, nonce="n")


# --------------------------------------------------------------------------- #
# resolve_callback
# --------------------------------------------------------------------------- #


def test_resolve_callback_links_user_and_maps_role(
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_oidc(monkeypatch)
    monkeypatch.setattr(oidc_service, "_exchange_code", lambda **_kw: {"id_token": "token"})
    monkeypatch.setattr(
        oidc_service,
        "_verify_id_token",
        lambda _token, nonce: {
            "email": "user@mkair.ru",
            "groups": ["metrolog-users", "metrolog-mkair"],
        },
    )

    with _session(db_engine) as session:
        session.add(
            User(
                first_name="Иван",
                last_name="Тестов",
                email="user@mkair.ru",
                password_hash=hash_password("secret1"),
                role=UserRole.CUSTOMER,
                is_active=True,
            )
        )
        session.commit()

    transaction = OidcTransaction(state="s", nonce="n", code_verifier="v", redirect="/equipment")
    with _session(db_engine) as session:
        user, redirect = oidc_service.resolve_callback(
            session=session,
            code="code",
            state="s",
            transaction=transaction,
        )
        assert user.role == UserRole.MKAIR
        assert user.last_login_at is not None
        assert redirect == "/equipment"


def test_resolve_callback_rejects_bad_state(db_engine, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_oidc(monkeypatch)
    transaction = OidcTransaction(state="s", nonce="n", code_verifier="v", redirect=None)
    with _session(db_engine) as session, pytest.raises(OidcError):
        oidc_service.resolve_callback(
            session=session,
            code="code",
            state="tampered",
            transaction=transaction,
        )


def test_resolve_callback_rejects_user_without_access(
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_oidc(monkeypatch)
    monkeypatch.setattr(oidc_service, "_exchange_code", lambda **_kw: {"id_token": "token"})
    monkeypatch.setattr(
        oidc_service,
        "_verify_id_token",
        lambda _token, nonce: {"email": "user@mkair.ru", "groups": ["other-team"]},
    )
    transaction = OidcTransaction(state="s", nonce="n", code_verifier="v", redirect=None)
    with _session(db_engine) as session, pytest.raises(OidcError):
        oidc_service.resolve_callback(
            session=session,
            code="code",
            state="s",
            transaction=transaction,
        )


# --------------------------------------------------------------------------- #
# HTTP surface
# --------------------------------------------------------------------------- #


@pytest.mark.anyio
async def test_oidc_status_is_disabled_by_default(client: AsyncClient) -> None:
    response = await client.get("/api/v1/auth/oidc/status")
    assert response.status_code == 200
    assert response.json() == {"enabled": False}


@pytest.mark.anyio
async def test_oidc_login_redirects_to_error_when_disabled(client: AsyncClient) -> None:
    response = await client.get("/api/v1/auth/oidc/login", follow_redirects=False)
    assert response.status_code == 302
    assert "#oidc_error=disabled" in response.headers["location"]
