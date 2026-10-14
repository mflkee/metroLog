from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from sqlalchemy import event
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.user import User, UserRole
from app.services import accounts_client
from app.services.user_service import UserService
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


def test_the_stamp_goes_on_the_wire_with_an_offset():
    """The registry compares stamps, so the one we send must say which timezone it is in."""

    naive = datetime(2026, 10, 14, 5, 43, 35, 451482)
    aware = naive.replace(tzinfo=UTC)

    assert accounts_client._stamp_for_wire(naive) == "2026-10-14T05:43:35.451482+00:00"
    assert accounts_client._stamp_for_wire(aware) == "2026-10-14T05:43:35.451482+00:00"
    assert accounts_client._stamp_for_wire(None) is None


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


def _registry_listing(
    email: str = "target@mkair.ru",
    role: str = "ADMINISTRATOR",
    *,
    service_active: bool = True,
    stamp: str | None = "2026-10-14T05:43:35.451482Z",
) -> list[dict]:
    """What `GET /internal/accounts` returns: accounts with their per-service grants."""

    return [
        {
            "email": email,
            "first_name": "Цель",
            "last_name": "Тест",
            "patronymic": None,
            "is_active": True,
            "services": [
                {
                    "service": "metrolog",
                    "role": role,
                    "is_active": service_active,
                    "role_updated_at": stamp,
                }
            ],
        }
    ]


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


async def _login_admin_token(client, db_engine, monkeypatch) -> str:
    """Sign in locally first: the registry switch is flipped only for the call under test."""

    email, password = _create_local_admin(db_engine)
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    _enable_registry(monkeypatch)
    return token


def _add_local_user(db_engine, **overrides) -> int:
    fields = {
        "first_name": "Цель",
        "last_name": "Тест",
        "patronymic": None,
        "email": "target@mkair.ru",
        "password_hash": "!",
        "role": UserRole.CUSTOMER,
        "is_active": True,
        "must_change_password": False,
    }
    fields.update(overrides)
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        user = User(**fields)
        session.add(user)
        session.commit()
        return user.id


def _local_role(db_engine, email: str) -> UserRole:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        return session.query(User).filter_by(email=email).one().role


def _local_folder_scope(db_engine, email: str) -> list[int] | None:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        return session.query(User).filter_by(email=email).one().allowed_folder_ids


def _as_utc(value: datetime | None) -> datetime | None:
    """A stamp as it should compare: one backend hands them back, the other keeps the offset."""

    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=UTC)


def _local_stamp(db_engine, email: str) -> datetime | None:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        stamp = session.query(User).filter_by(email=email).one().role_synced_at
    if stamp is not None and stamp.tzinfo is None:
        return stamp.replace(tzinfo=UTC)
    return stamp


def _set_local_stamp(db_engine, email: str, stamp: datetime) -> None:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        session.query(User).filter_by(email=email).one().role_synced_at = stamp
        session.commit()


@pytest.mark.anyio
async def test_role_update_is_written_into_the_registry(client, db_engine, monkeypatch):
    """The registry owns the role: a change here is written there, not only kept locally."""

    email, password = _create_local_admin(db_engine)
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    target_id = _add_local_user(db_engine)

    _enable_registry(monkeypatch)
    written: list[dict] = []

    def fake_set(**kwargs):
        written.append(kwargs)
        return accounts_client.Grant(
            role=kwargs["role"], role_updated_at="2026-10-14T06:00:00.000000Z"
        )

    monkeypatch.setattr(accounts_client, "set_service", fake_set)

    response = await client.patch(
        f"/api/v1/users/{target_id}/role",
        headers={"Authorization": f"Bearer {token}"},
        json={"role": "ADMINISTRATOR"},
    )

    assert response.status_code == 200, response.text
    assert written and written[0]["email"] == "target@mkair.ru"
    assert written[0]["role"] == "ADMINISTRATOR"
    assert response.json()["role"] == "ADMINISTRATOR"
    assert _local_role(db_engine, "target@mkair.ru") is UserRole.ADMINISTRATOR


@pytest.mark.anyio
async def test_a_refused_role_is_not_applied_locally(client, db_engine, monkeypatch):
    """Someone changed the role meanwhile: the local copy stays as it was, loudly."""

    email, password = _create_local_admin(db_engine)
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    target_id = _add_local_user(db_engine)

    _enable_registry(monkeypatch)

    def refuse(**_):
        raise HTTPException(status_code=409, detail="Роль изменена в реестре.")

    monkeypatch.setattr(accounts_client, "set_service", refuse)

    response = await client.patch(
        f"/api/v1/users/{target_id}/role",
        headers={"Authorization": f"Bearer {token}"},
        json={"role": "ADMINISTRATOR"},
    )

    assert response.status_code == 409
    assert _local_role(db_engine, "target@mkair.ru") is UserRole.CUSTOMER


@pytest.mark.anyio
async def test_user_list_takes_the_role_from_the_registry(client, db_engine, monkeypatch):
    """A role changed in the console shows up on the next page load, not at the next login."""

    token = await _login_admin_token(client, db_engine, monkeypatch)
    _add_local_user(db_engine)
    monkeypatch.setattr(
        accounts_client,
        "list_accounts",
        lambda: _registry_listing(role="ADMINISTRATOR"),
    )

    response = await client.get("/api/v1/users", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200, response.text
    listed = {item["email"]: item["role"] for item in response.json()}
    assert listed["target@mkair.ru"] == "ADMINISTRATOR"
    assert _local_role(db_engine, "target@mkair.ru") is UserRole.ADMINISTRATOR


@pytest.mark.anyio
async def test_user_list_keeps_a_registry_role_it_refuses(client, db_engine, monkeypatch):
    """The mirror never leaves the service unadministrable: the last developer stays one."""

    token = await _login_admin_token(client, db_engine, monkeypatch)
    _add_local_user(db_engine, role=UserRole.DEVELOPER)
    monkeypatch.setattr(
        accounts_client,
        "list_accounts",
        lambda: _registry_listing(role="CUSTOMER"),
    )

    response = await client.get("/api/v1/users", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200, response.text
    listed = {item["email"]: item["role"] for item in response.json()}
    assert listed["target@mkair.ru"] == "DEVELOPER"
    assert _local_role(db_engine, "target@mkair.ru") is UserRole.DEVELOPER


@pytest.mark.anyio
async def test_user_list_survives_a_registry_outage(client, db_engine, monkeypatch):
    """A page load is not the place to fail: the local copy is served, and said so in the log."""

    token = await _login_admin_token(client, db_engine, monkeypatch)
    _add_local_user(db_engine, role=UserRole.MKAIR)

    def unavailable():
        raise accounts_client.AccountsUnavailable()

    monkeypatch.setattr(accounts_client, "list_accounts", unavailable)

    response = await client.get("/api/v1/users", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200, response.text
    listed = {item["email"]: item["role"] for item in response.json()}
    assert listed["target@mkair.ru"] == "MKAIR"


@pytest.mark.anyio
async def test_user_list_survives_a_registry_that_does_not_know_the_endpoint(
    client, db_engine, monkeypatch
):
    """Deploy order is not a trap: a registry older than this service still opens the page."""

    token = await _login_admin_token(client, db_engine, monkeypatch)
    _add_local_user(db_engine, role=UserRole.MKAIR)

    def older_registry():
        raise HTTPException(status_code=404, detail="Not Found")

    monkeypatch.setattr(accounts_client, "list_accounts", older_registry)

    response = await client.get("/api/v1/users", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200, response.text
    listed = {item["email"]: item["role"] for item in response.json()}
    assert listed["target@mkair.ru"] == "MKAIR"


@pytest.mark.anyio
async def test_login_moves_the_folder_scope_with_the_role(client, db_engine, monkeypatch):
    """A role that arrives at sign-in brings its scope: an administrator has all folders."""

    _create_local_admin(db_engine)
    _add_local_user(db_engine, role=UserRole.MKAIR, allowed_folder_ids=[1, 2])
    _enable_registry(monkeypatch)
    monkeypatch.setattr(
        accounts_client,
        "verify",
        lambda **_: _registry_account(email="target@mkair.ru", role="ADMINISTRATOR"),
    )

    response = await client.post(
        "/api/v1/auth/login", json={"email": "target@mkair.ru", "password": "Whatever-1"}
    )

    assert response.status_code == 200, response.text
    assert response.json()["user"]["role"] == "ADMINISTRATOR"
    assert _local_folder_scope(db_engine, "target@mkair.ru") is None


@pytest.mark.anyio
async def test_user_list_remembers_the_stamp_it_took_the_role_from(client, db_engine, monkeypatch):
    """The copy remembers which registry value it mirrors — that is what a write will send."""

    token = await _login_admin_token(client, db_engine, monkeypatch)
    _add_local_user(db_engine)
    monkeypatch.setattr(accounts_client, "list_accounts", lambda: _registry_listing())

    response = await client.get("/api/v1/users", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200, response.text
    assert _local_stamp(db_engine, "target@mkair.ru") == datetime(
        2026, 10, 14, 5, 43, 35, 451482, tzinfo=UTC
    )


@pytest.mark.anyio
async def test_role_write_sends_the_stamp_it_read(client, db_engine, monkeypatch):
    """A save says what it was looking at, so the registry can refuse a stale one."""

    email, password = _create_local_admin(db_engine)
    login = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    token = login.json()["access_token"]
    target_id = _add_local_user(db_engine)
    stamped = datetime(2026, 10, 14, 5, 43, 35, 451482, tzinfo=UTC)
    _set_local_stamp(db_engine, "target@mkair.ru", stamped)

    _enable_registry(monkeypatch)
    written: list[dict] = []

    def fake_set(**kwargs):
        written.append(kwargs)
        return accounts_client.Grant(
            role=kwargs["role"], role_updated_at="2026-10-14T06:00:00.000000Z"
        )

    monkeypatch.setattr(accounts_client, "set_service", fake_set)

    response = await client.patch(
        f"/api/v1/users/{target_id}/role",
        headers={"Authorization": f"Bearer {token}"},
        json={"role": "ADMINISTRATOR"},
    )

    assert response.status_code == 200, response.text
    assert _as_utc(written[0]["if_unmodified_since"]) == stamped
    # ...and the answer's stamp becomes the new memory.
    assert _local_stamp(db_engine, "target@mkair.ru") == datetime(2026, 10, 14, 6, 0, 0, tzinfo=UTC)


def test_a_second_page_load_writes_nothing(db_engine, monkeypatch):
    """Reading twice is not two writes: matching stamps stop the mirror from rewriting rows.

    The second pass is a fresh session on purpose: on SQLite the stamp comes back without a
    timezone, and it still has to compare equal.
    """

    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    _add_local_user(db_engine)
    _enable_registry(monkeypatch)
    monkeypatch.setattr(accounts_client, "list_accounts", lambda: _registry_listing())

    commits: list[int] = []
    event.listen(testing_session, "before_commit", lambda _session: commits.append(1))

    with testing_session() as db:
        assert UserService(db).list_users()[0].role is UserRole.ADMINISTRATOR
    with testing_session() as db:
        assert UserService(db).list_users()[0].role is UserRole.ADMINISTRATOR

    assert len(commits) == 1
