from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.user import User, UserRole
from app.services import accounts_client
from app.utils.security import hash_password


def _enable_registry(monkeypatch) -> None:
    monkeypatch.setattr(settings, "accounts_enabled", True)
    monkeypatch.setattr(settings, "accounts_url", "http://registry:8000")
    monkeypatch.setattr(settings, "accounts_service_token", "service-token")


def _create_local_admin(db_engine) -> tuple[str, str]:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        user = User(
            first_name="Админ",
            last_name="Тестов",
            patronymic=None,
            email="admin@mkair.ru",
            password_hash=hash_password("AdminPass-1"),
            role=UserRole.ADMINISTRATOR,
            is_active=True,
            must_change_password=False,
        )
        session.add(user)
        session.commit()
    return "admin@mkair.ru", "AdminPass-1"


def _registry_account(**overrides) -> dict:
    account = {
        "email": "new@mkair.ru",
        "first_name": "Новый",
        "last_name": "Сотрудник",
        "patronymic": None,
        "is_active": True,
        "role": "ADMINISTRATOR",
    }
    account.update(overrides)
    return account


@pytest.mark.anyio
def test_accounts_client_calls_the_versioned_internal_path(monkeypatch):
    _enable_registry(monkeypatch)
    captured: dict = {}

    class _Response:
        status_code = 200

        def json(self) -> dict:
            return {"ok": True, "account": {"email": "x@mkair.ru"}, "role": "MKAIR"}

    def fake_request(method: str, url: str, **kwargs):
        captured["method"] = method
        captured["url"] = url
        captured["headers"] = kwargs.get("headers")
        return _Response()

    monkeypatch.setattr(accounts_client.httpx, "request", fake_request)

    result = accounts_client.verify(email="x@mkair.ru", password="secret")

    assert captured["method"] == "POST"
    assert captured["url"].endswith("/api/v1/internal/verify")
    assert captured["headers"]["X-Service-Name"] == "metrolog"
    assert result["role"] == "MKAIR"


@pytest.mark.anyio
async def test_login_via_registry_provisions_and_maps_role(client, db_engine, monkeypatch):
    _enable_registry(monkeypatch)
    monkeypatch.setattr(accounts_client, "verify", lambda **_: _registry_account())

    response = await client.post(
        "/api/v1/auth/login", json={"email": "new@mkair.ru", "password": "Whatever-1"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["user"]["role"] == "ADMINISTRATOR"

    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        user = session.query(User).filter_by(email="new@mkair.ru").one()
        assert user.role is UserRole.ADMINISTRATOR
        assert user.last_login_at is not None


@pytest.mark.anyio
async def test_login_via_registry_syncs_role_of_existing_user(client, db_engine, monkeypatch):
    _create_local_admin(db_engine)
    _enable_registry(monkeypatch)
    monkeypatch.setattr(
        accounts_client,
        "verify",
        lambda **_: _registry_account(email="admin@mkair.ru", role="CUSTOMER"),
    )

    response = await client.post(
        "/api/v1/auth/login", json={"email": "admin@mkair.ru", "password": "Whatever-1"}
    )

    assert response.status_code == 200
    assert response.json()["user"]["role"] == "CUSTOMER"


@pytest.mark.anyio
async def test_login_via_registry_propagates_denial(client, monkeypatch):
    _enable_registry(monkeypatch)

    def deny(**_):
        raise HTTPException(status_code=403, detail="Нет доступа к сервису «metrolog».")

    monkeypatch.setattr(accounts_client, "verify", deny)

    response = await client.post(
        "/api/v1/auth/login", json={"email": "new@mkair.ru", "password": "Whatever-1"}
    )
    assert response.status_code == 403
    assert "metrolog" in response.json()["detail"]


@pytest.mark.anyio
async def test_change_password_goes_through_registry(client, db_engine, monkeypatch):
    email, password = _create_local_admin(db_engine)
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]

    calls: list[dict] = []
    _enable_registry(monkeypatch)
    monkeypatch.setattr(accounts_client, "change_password", lambda **kw: calls.append(kw))

    response = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "current_password": password,
            "new_password": "Brand-New-1",
            "confirm_new_password": "Brand-New-1",
        },
    )

    assert response.status_code == 200, response.text
    assert calls and calls[0]["email"] == email
    assert calls[0]["new_password"] == "Brand-New-1"


@pytest.mark.anyio
async def test_create_user_asks_the_registry_and_sends_an_invite(client, db_engine, monkeypatch):
    email, password = _create_local_admin(db_engine)
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]

    created: list[dict] = []
    _enable_registry(monkeypatch)
    monkeypatch.setattr(accounts_client, "create_account", lambda **kw: created.append(kw))

    response = await client.post(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "first_name": "Пётр",
            "last_name": "Петров",
            "email": "petrov@mkair.ru",
            "role": "MKAIR",
        },
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["temporary_password"] is None
    assert "приглашение" in body["message"]
    assert created and created[0]["email"] == "petrov@mkair.ru"
    assert created[0]["role"] == "MKAIR"


@pytest.mark.anyio
async def test_reset_password_asks_the_registry_for_an_invite(client, db_engine, monkeypatch):
    email, password = _create_local_admin(db_engine)
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]

    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        target = User(
            first_name="Цель",
            last_name="Тест",
            patronymic=None,
            email="target@mkair.ru",
            password_hash=hash_password("Target-1"),
            role=UserRole.CUSTOMER,
            is_active=True,
            must_change_password=False,
        )
        session.add(target)
        session.commit()
        target_id = target.id

    invited: list[str] = []
    _enable_registry(monkeypatch)
    monkeypatch.setattr(accounts_client, "send_invite", lambda **kw: invited.append(kw["email"]))

    response = await client.post(
        f"/api/v1/users/{target_id}/reset-password",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200, response.text
    assert response.json()["temporary_password"] is None
    assert invited == ["target@mkair.ru"]
