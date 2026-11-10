"""Единый формат ошибок: `detail` остаётся строкой, добавлены `error_code` и `field`."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.services.equipment_service import EquipmentService
from app.services.user_service import UserService

ENVELOPE_KEYS = {"detail", "error_code", "field"}


def bootstrap_admin(db_engine) -> tuple[str, str]:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        UserService(session).ensure_bootstrap_admin()
    return settings.bootstrap_admin_email, settings.bootstrap_admin_password


async def login_user(client: AsyncClient, *, email: str, password: str) -> dict[str, object]:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


async def admin_headers(client: AsyncClient, db_engine) -> dict[str, str]:
    email, password = bootstrap_admin(db_engine)
    tokens = await login_user(client, email=email, password=password)
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def create_user_via_api(
    client: AsyncClient,
    *,
    admin_token: str,
    email: str,
    role: str = "CUSTOMER",
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "first_name": "Тест",
            "last_name": "Ошибкин",
            "email": email,
            "role": role,
            "is_active": True,
            "allowed_folder_ids": [],
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def assert_envelope(payload: dict[str, object]) -> None:
    assert set(payload) == ENVELOPE_KEYS, payload
    assert isinstance(payload["detail"], str) and payload["detail"]
    assert isinstance(payload["error_code"], str) and payload["error_code"]
    assert payload["field"] is None or isinstance(payload["field"], str)


@pytest.mark.anyio
async def test_missing_token_returns_unauthorized_envelope(client: AsyncClient, db_engine) -> None:
    response = await client.get("/api/v1/equipment")

    assert response.status_code == 401
    payload = response.json()
    assert_envelope(payload)
    assert payload["error_code"] == "UNAUTHORIZED"
    assert payload["field"] is None


@pytest.mark.anyio
async def test_unknown_equipment_returns_not_found_envelope(client: AsyncClient, db_engine) -> None:
    headers = await admin_headers(client, db_engine)

    response = await client.get("/api/v1/equipment/999999", headers=headers)

    assert response.status_code == 404
    payload = response.json()
    assert_envelope(payload)
    assert payload["error_code"] == "NOT_FOUND"
    assert payload["detail"] == "Equipment not found."


@pytest.mark.anyio
async def test_unknown_route_returns_not_found_envelope(client: AsyncClient) -> None:
    response = await client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    payload = response.json()
    assert_envelope(payload)
    assert payload["error_code"] == "NOT_FOUND"


@pytest.mark.anyio
async def test_duplicate_user_email_returns_conflict_envelope(
    client: AsyncClient,
    db_engine,
) -> None:
    headers = await admin_headers(client, db_engine)
    token = headers["Authorization"].removeprefix("Bearer ")
    await create_user_via_api(client, admin_token=token, email="duplicate@example.com")

    response = await client.post(
        "/api/v1/users",
        headers=headers,
        json={
            "first_name": "Тест",
            "last_name": "Ошибкин",
            "email": "duplicate@example.com",
            "role": "CUSTOMER",
            "is_active": True,
            "allowed_folder_ids": [],
        },
    )

    assert response.status_code == 409
    payload = response.json()
    assert_envelope(payload)
    assert payload["error_code"] == "CONFLICT"
    assert payload["detail"] == "A user with this email already exists."


@pytest.mark.anyio
async def test_duplicate_folder_name_returns_conflict_envelope(
    client: AsyncClient,
    db_engine,
) -> None:
    headers = await admin_headers(client, db_engine)
    first = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Дубликат"},
    )
    assert first.status_code == 201

    second = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Дубликат"},
    )

    assert second.status_code == 409
    payload = second.json()
    assert_envelope(payload)
    assert payload["error_code"] == "CONFLICT"


@pytest.mark.anyio
async def test_forbidden_role_returns_forbidden_envelope(client: AsyncClient, db_engine) -> None:
    headers = await admin_headers(client, db_engine)
    token = headers["Authorization"].removeprefix("Bearer ")
    created = await create_user_via_api(
        client,
        admin_token=token,
        email="customer@example.com",
        role="CUSTOMER",
    )
    customer = await login_user(
        client,
        email="customer@example.com",
        password=str(created["temporary_password"]),
    )
    customer_headers = {"Authorization": f"Bearer {customer['access_token']}"}

    response = await client.post(
        "/api/v1/equipment/folders",
        headers=customer_headers,
        json={"name": "Чужая папка"},
    )

    assert response.status_code == 403
    payload = response.json()
    assert_envelope(payload)
    assert payload["error_code"] == "FORBIDDEN"
    assert payload["detail"] == "Operator role is required."


@pytest.mark.anyio
async def test_request_validation_error_has_error_code_and_field(
    client: AsyncClient,
    db_engine,
) -> None:
    headers = await admin_headers(client, db_engine)

    response = await client.get("/api/v1/equipment/page?per_page=0", headers=headers)

    assert response.status_code == 422
    payload = response.json()
    assert_envelope(payload)
    assert payload["error_code"] == "VALIDATION_ERROR"
    assert payload["field"] == "per_page"
    assert "per_page" in payload["detail"]


@pytest.mark.anyio
async def test_body_validation_error_reports_the_field(client: AsyncClient, db_engine) -> None:
    headers = await admin_headers(client, db_engine)

    response = await client.post("/api/v1/equipment/folders", headers=headers, json={})

    assert response.status_code == 422
    payload = response.json()
    assert_envelope(payload)
    assert payload["error_code"] == "VALIDATION_ERROR"
    assert payload["field"] == "name"


@pytest.mark.anyio
async def test_unhandled_error_returns_internal_error_without_traceback(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers = await admin_headers(client, db_engine)

    def explode(self, **kwargs):  # noqa: ANN001, ARG001
        raise RuntimeError("secret internal failure")

    monkeypatch.setattr(EquipmentService, "list_equipment", explode)

    response = await client.get("/api/v1/equipment", headers=headers)

    assert response.status_code == 500
    payload = response.json()
    assert_envelope(payload)
    assert payload["error_code"] == "INTERNAL_ERROR"
    assert payload["detail"] == "Internal server error."
    assert "secret internal failure" not in response.text
    assert "Traceback" not in response.text
