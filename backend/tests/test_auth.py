import re

import pytest
from httpx import AsyncClient

from app.services.email_service import email_outbox


def extract_code_from_email_body(body: str) -> str:
    match = re.search(r"Код(?: подтверждения| сброса)?: (\d{6})", body)
    assert match is not None
    return match.group(1)


async def register_user(
    client: AsyncClient,
    *,
    display_name: str,
    email: str,
    password: str = "password123",
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "display_name": display_name,
            "email": email,
            "password": password,
            "confirm_password": password,
        },
    )
    assert response.status_code == 201
    return response.json()


async def register_and_verify_user(
    client: AsyncClient,
    *,
    display_name: str,
    email: str,
    password: str = "password123",
) -> dict[str, object]:
    await register_user(
        client,
        display_name=display_name,
        email=email,
        password=password,
    )
    verification_code = extract_code_from_email_body(email_outbox[-1].body)
    response = await client.post(
        "/api/v1/auth/verify-email",
        json={
            "email": email,
            "code": verification_code,
        },
    )
    assert response.status_code == 200
    return response.json()


@pytest.mark.anyio
async def test_registration_sends_verification_email_and_blocks_login_until_verified(
    client: AsyncClient,
) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Admin User",
            "email": "admin@example.com",
            "password": "password123",
            "confirm_password": "password123",
        },
    )

    assert response.status_code == 201
    assert response.json()["message"] == "Verification email sent."
    assert len(email_outbox) == 1
    assert email_outbox[0].to_email == "admin@example.com"

    login_response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "admin@example.com",
            "password": "password123",
        },
    )
    assert login_response.status_code == 403
    assert login_response.json()["detail"] == "Email address is not verified."


@pytest.mark.anyio
async def test_registration_rejects_weak_password(client: AsyncClient) -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Admin User",
            "email": "admin@example.com",
            "password": "123456",
            "confirm_password": "123456",
        },
    )

    assert response.status_code == 400
    assert (
        response.json()["detail"]
        == "Password must be at least 6 characters long and include both letters and digits."
    )


@pytest.mark.anyio
async def test_verify_email_authenticates_user_and_first_user_becomes_administrator(
    client: AsyncClient,
) -> None:
    await register_user(
        client,
        display_name="Admin User",
        email="admin@example.com",
    )
    verification_code = extract_code_from_email_body(email_outbox[-1].body)

    verify_response = await client.post(
        "/api/v1/auth/verify-email",
        json={
            "email": "admin@example.com",
            "code": verification_code,
        },
    )
    assert verify_response.status_code == 200
    payload = verify_response.json()
    assert payload["user"]["role"] == "ADMINISTRATOR"
    assert payload["user"]["email_verified_at"] is not None

    me_response = await client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {payload['access_token']}"},
    )
    assert me_response.status_code == 200
    assert me_response.json()["email"] == "admin@example.com"


@pytest.mark.anyio
async def test_next_verified_user_defaults_to_customer(client: AsyncClient) -> None:
    await register_and_verify_user(
        client,
        display_name="Admin User",
        email="admin@example.com",
    )
    payload = await register_and_verify_user(
        client,
        display_name="Customer User",
        email="customer@example.com",
    )

    assert payload["user"]["role"] == "CUSTOMER"


@pytest.mark.anyio
async def test_administrator_can_list_users_and_update_roles(client: AsyncClient) -> None:
    admin = await register_and_verify_user(
        client,
        display_name="Admin User",
        email="admin@example.com",
    )
    customer = await register_and_verify_user(
        client,
        display_name="Customer User",
        email="customer@example.com",
    )

    list_response = await client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
    )
    assert list_response.status_code == 200
    assert len(list_response.json()) == 2

    update_response = await client.patch(
        f"/api/v1/users/{customer['user']['id']}/role",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
        json={"role": "MKAIR"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["role"] == "MKAIR"


@pytest.mark.anyio
async def test_customer_cannot_access_user_admin_routes(client: AsyncClient) -> None:
    await register_and_verify_user(
        client,
        display_name="Admin User",
        email="admin@example.com",
    )
    customer = await register_and_verify_user(
        client,
        display_name="Customer User",
        email="customer@example.com",
    )

    response = await client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {customer['access_token']}"},
    )
    assert response.status_code == 403


@pytest.mark.anyio
async def test_last_administrator_cannot_be_demoted(client: AsyncClient) -> None:
    admin = await register_and_verify_user(
        client,
        display_name="Admin User",
        email="admin@example.com",
    )

    response = await client.patch(
        f"/api/v1/users/{admin['user']['id']}/role",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
        json={"role": "CUSTOMER"},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "The system must keep at least one administrator."


@pytest.mark.anyio
async def test_user_can_change_password_and_login_with_new_one(client: AsyncClient) -> None:
    admin = await register_and_verify_user(
        client,
        display_name="Admin User",
        email="admin@example.com",
    )

    change_response = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
        json={
            "current_password": "password123",
            "new_password": "newpassword123",
            "confirm_new_password": "newpassword123",
        },
    )
    assert change_response.status_code == 200

    old_login_response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "admin@example.com",
            "password": "password123",
        },
    )
    assert old_login_response.status_code == 401

    new_login_response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "admin@example.com",
            "password": "newpassword123",
        },
    )
    assert new_login_response.status_code == 200


@pytest.mark.anyio
async def test_change_password_requires_correct_current_password(client: AsyncClient) -> None:
    admin = await register_and_verify_user(
        client,
        display_name="Admin User",
        email="admin@example.com",
    )

    response = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
        json={
            "current_password": "wrongpassword123",
            "new_password": "newpassword123",
            "confirm_new_password": "newpassword123",
        },
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "Current password is incorrect."


@pytest.mark.anyio
async def test_change_password_rejects_weak_new_password(client: AsyncClient) -> None:
    admin = await register_and_verify_user(
        client,
        display_name="Admin User",
        email="admin@example.com",
    )

    response = await client.post(
        "/api/v1/auth/change-password",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
        json={
            "current_password": "password123",
            "new_password": "abcdef",
            "confirm_new_password": "abcdef",
        },
    )

    assert response.status_code == 400
    assert (
        response.json()["detail"]
        == "Password must be at least 6 characters long and include both letters and digits."
    )


@pytest.mark.anyio
async def test_forgot_password_sends_reset_code_and_allows_password_reset(
    client: AsyncClient,
) -> None:
    await register_and_verify_user(
        client,
        display_name="Admin User",
        email="admin@example.com",
    )
    email_outbox.clear()

    forgot_response = await client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "admin@example.com"},
    )
    assert forgot_response.status_code == 200
    assert forgot_response.json()["message"] == "Password reset email sent if the account exists."
    assert len(email_outbox) == 1

    reset_code = extract_code_from_email_body(email_outbox[-1].body)
    reset_response = await client.post(
        "/api/v1/auth/reset-password",
        json={
            "email": "admin@example.com",
            "code": reset_code,
            "new_password": "resetpassword123",
            "confirm_new_password": "resetpassword123",
        },
    )
    assert reset_response.status_code == 200

    login_response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "admin@example.com",
            "password": "resetpassword123",
        },
    )
    assert login_response.status_code == 200
