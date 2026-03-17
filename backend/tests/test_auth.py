from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.services.user_service import UserService


def bootstrap_admin(db_engine) -> tuple[str, str]:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        UserService(session).ensure_bootstrap_admin()
    return settings.bootstrap_admin_email, settings.bootstrap_admin_password


async def login_user(
    client: AsyncClient,
    *,
    email: str,
    password: str,
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": email,
            "password": password,
        },
    )
    assert response.status_code == 200
    return response.json()


@pytest.mark.anyio
async def test_bootstrap_admin_can_login_and_is_forced_to_change_password(
    client: AsyncClient,
    db_engine,
) -> None:
    email, password = bootstrap_admin(db_engine)

    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": email,
            "password": password,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["user"]["role"] == "ADMINISTRATOR"
    assert payload["user"]["must_change_password"] is True


@pytest.mark.anyio
async def test_administrator_can_create_list_and_reset_users(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)

    create_response = await client.post(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
        json={
            "first_name": "Customer",
            "last_name": "User",
            "patronymic": "Test",
            "email": "customer@example.com",
            "role": "CUSTOMER",
            "is_active": True,
        },
    )
    assert create_response.status_code == 201
    created_payload = create_response.json()
    assert created_payload["user"]["must_change_password"] is True
    assert created_payload["temporary_password"]

    list_response = await client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
    )
    assert list_response.status_code == 200
    assert len(list_response.json()) == 2

    reset_response = await client.post(
        f"/api/v1/users/{created_payload['user']['id']}/reset-password",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
    )
    assert reset_response.status_code == 200
    assert reset_response.json()["temporary_password"]
    assert reset_response.json()["user"]["must_change_password"] is True

    detail_response = await client.get(
        f"/api/v1/users/{created_payload['user']['id']}",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
    )
    assert detail_response.status_code == 200
    assert detail_response.json()["email"] == "customer@example.com"


@pytest.mark.anyio
async def test_created_user_must_change_password_and_can_clear_flag(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)

    create_response = await client.post(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
        json={
            "first_name": "Operator",
            "last_name": "User",
            "patronymic": "Test",
            "email": "operator@example.com",
            "role": "MKAIR",
            "is_active": True,
        },
    )
    assert create_response.status_code == 201
    temporary_password = create_response.json()["temporary_password"]

    login_response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "operator@example.com",
            "password": temporary_password,
        },
    )
    assert login_response.status_code == 200
    operator = login_response.json()
    assert operator["user"]["must_change_password"] is True

    change_response = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {operator['access_token']}"},
        json={
            "current_password": temporary_password,
            "new_password": "Operator123",
            "confirm_new_password": "Operator123",
        },
    )
    assert change_response.status_code == 200

    me_response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {operator['access_token']}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["must_change_password"] is False


@pytest.mark.anyio
async def test_user_can_update_profile_fields(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)

    response = await client.patch(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
        json={
            "phone": "+7 (999) 123-45-67",
            "organization": 'ООО "МКАИР-ИТ"',
            "position": "Инженер-метролог",
            "facility": 'ПСП ХАЛ "Северный"',
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["phone"] == "+7 (999) 123-45-67"
    assert payload["organization"] == 'ООО "МКАИР-ИТ"'
    assert payload["position"] == "Инженер-метролог"
    assert payload["facility"] == 'ПСП ХАЛ "Северный"'


@pytest.mark.anyio
async def test_customer_cannot_access_user_admin_routes(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)

    create_response = await client.post(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
        json={
            "first_name": "Customer",
            "last_name": "User",
            "patronymic": "Test",
            "email": "customer@example.com",
            "role": "CUSTOMER",
            "is_active": True,
        },
    )
    customer_password = create_response.json()["temporary_password"]
    customer = await login_user(client, email="customer@example.com", password=customer_password)

    response = await client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {customer['access_token']}"},
    )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_last_administrator_cannot_be_demoted_or_deactivated(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)

    demote_response = await client.patch(
        f"/api/v1/users/{admin['user']['id']}",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
        json={"role": "CUSTOMER"},
    )
    assert demote_response.status_code == 400
    assert demote_response.json()["detail"] == "The system must keep at least one administrator."

    deactivate_response = await client.patch(
        f"/api/v1/users/{admin['user']['id']}",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
        json={"is_active": False},
    )
    assert deactivate_response.status_code == 400
    assert (
        deactivate_response.json()["detail"]
        == "The system must keep at least one administrator."
    )
