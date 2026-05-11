from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.user import User, UserRole
from app.services.user_service import UserService
from app.utils.security import hash_password


def bootstrap_admin(db_engine) -> tuple[str, str]:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        UserService(session).ensure_bootstrap_admin()
    return settings.bootstrap_admin_email, settings.bootstrap_admin_password


def create_user_directly(
    db_engine,
    *,
    first_name: str,
    last_name: str,
    email: str,
    password: str,
    role: UserRole,
) -> User:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        user = User(
            first_name=first_name,
            last_name=last_name,
            patronymic=None,
            email=email,
            password_hash=hash_password(password),
            role=role,
            is_active=True,
            must_change_password=False,
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        session.expunge(user)
        return user


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
    assert payload["user"]["last_login_at"] is not None
    assert payload["user"]["last_seen_at"] is not None


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
async def test_administrator_creation_sends_temporary_password_email(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)

    sent_emails: list[dict[str, str]] = []

    def fake_send_temporary_password_email(self, **kwargs):  # noqa: ANN001
        sent_emails.append(kwargs)

    monkeypatch.setattr(
        "app.services.notification_service.NotificationService.send_temporary_password_email",
        fake_send_temporary_password_email,
    )

    create_response = await client.post(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
        json={
            "first_name": "Mail",
            "last_name": "Recipient",
            "email": "mail-recipient@example.com",
            "role": "CUSTOMER",
            "is_active": True,
        },
    )

    assert create_response.status_code == 201
    payload = create_response.json()
    assert len(sent_emails) == 1
    assert sent_emails[0]["recipient_email"] == "mail-recipient@example.com"
    assert sent_emails[0]["temporary_password"] == payload["temporary_password"]


@pytest.mark.anyio
async def test_administrator_can_delete_user(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    create_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Delete",
            "last_name": "Me",
            "email": "delete-me@example.com",
            "role": "CUSTOMER",
            "is_active": True,
        },
    )
    assert create_response.status_code == 201
    user_id = create_response.json()["user"]["id"]
    temporary_password = create_response.json()["temporary_password"]

    delete_response = await client.delete(
        f"/api/v1/users/{user_id}",
        headers=admin_headers,
    )
    assert delete_response.status_code == 204

    detail_response = await client.get(
        f"/api/v1/users/{user_id}",
        headers=admin_headers,
    )
    assert detail_response.status_code == 404

    login_response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "delete-me@example.com",
            "password": temporary_password,
        },
    )
    assert login_response.status_code == 401


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
    assert me_response.json()["last_seen_at"] is not None


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
            "mention_email_notifications_enabled": False,
            "theme_preference": "dark",
            "enabled_theme_options": ["light", "gray", "dark", "tokyonight"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["phone"] == "+7 (999) 123-45-67"
    assert payload["organization"] == 'ООО "МКАИР-ИТ"'
    assert payload["position"] == "Инженер-метролог"
    assert payload["facility"] == 'ПСП ХАЛ "Северный"'
    assert payload["mention_email_notifications_enabled"] is False
    assert payload["theme_preference"] == "dark"
    assert payload["enabled_theme_options"] == ["light", "gray", "dark", "tokyonight"]


@pytest.mark.anyio
async def test_admin_can_assign_allowed_folders_to_customer(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    first_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Папка 1"},
    )
    second_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Папка 2"},
    )
    assert first_folder_response.status_code == 201
    assert second_folder_response.status_code == 201

    create_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Customer",
            "last_name": "Folders",
            "email": "folders@example.com",
            "role": "CUSTOMER",
            "is_active": True,
        },
    )
    assert create_response.status_code == 201
    user_id = create_response.json()["user"]["id"]

    update_response = await client.patch(
        f"/api/v1/users/{user_id}",
        headers=admin_headers,
        json={
            "allowed_folder_ids": [
                first_folder_response.json()["id"],
                second_folder_response.json()["id"],
            ]
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["allowed_folder_ids"] == [
        first_folder_response.json()["id"],
        second_folder_response.json()["id"],
    ]


@pytest.mark.anyio
async def test_restricted_user_can_choose_only_allowed_dashboard_folder(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    allowed_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Разрешенная папка"},
    )
    forbidden_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Запрещенная папка"},
    )
    assert allowed_folder_response.status_code == 201
    assert forbidden_folder_response.status_code == 201

    create_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Restricted",
            "last_name": "User",
            "email": "restricted@example.com",
            "role": "CUSTOMER",
            "is_active": True,
            "allowed_folder_ids": [allowed_folder_response.json()["id"]],
        },
    )
    assert create_response.status_code == 201
    user_password = create_response.json()["temporary_password"]
    user = await login_user(client, email="restricted@example.com", password=user_password)
    user_headers = {"Authorization": f"Bearer {user['access_token']}"}

    forbidden_response = await client.patch(
        "/api/v1/auth/me",
        headers=user_headers,
        json={"dashboard_folder_id": forbidden_folder_response.json()["id"]},
    )
    assert forbidden_response.status_code == 403
    assert (
        forbidden_response.json()["detail"] == "Выбранная папка недоступна для этого пользователя."
    )

    allowed_response = await client.patch(
        "/api/v1/auth/me",
        headers=user_headers,
        json={"dashboard_folder_id": allowed_folder_response.json()["id"]},
    )
    assert allowed_response.status_code == 200
    assert allowed_response.json()["dashboard_folder_id"] == allowed_folder_response.json()["id"]
    assert allowed_response.json()["dashboard_folder_ids"] == [allowed_folder_response.json()["id"]]
    assert allowed_response.json()["allowed_folder_ids"] == [allowed_folder_response.json()["id"]]


@pytest.mark.anyio
async def test_restricted_user_can_choose_multiple_allowed_dashboard_folders(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    first_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Папка 1"},
    )
    second_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Папка 2"},
    )
    forbidden_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Папка 3"},
    )
    assert first_folder_response.status_code == 201
    assert second_folder_response.status_code == 201
    assert forbidden_folder_response.status_code == 201

    create_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Dashboard",
            "last_name": "User",
            "email": "dashboard-user@example.com",
            "role": "CUSTOMER",
            "is_active": True,
            "allowed_folder_ids": [
                first_folder_response.json()["id"],
                second_folder_response.json()["id"],
            ],
        },
    )
    assert create_response.status_code == 201
    user_password = create_response.json()["temporary_password"]
    user = await login_user(client, email="dashboard-user@example.com", password=user_password)
    user_headers = {"Authorization": f"Bearer {user['access_token']}"}

    allowed_response = await client.patch(
        "/api/v1/auth/me",
        headers=user_headers,
        json={
            "dashboard_folder_id": first_folder_response.json()["id"],
            "dashboard_folder_ids": [
                first_folder_response.json()["id"],
                second_folder_response.json()["id"],
            ],
        },
    )
    assert allowed_response.status_code == 200
    assert allowed_response.json()["dashboard_folder_ids"] == [
        first_folder_response.json()["id"],
        second_folder_response.json()["id"],
    ]
    assert allowed_response.json()["dashboard_folder_id"] == first_folder_response.json()["id"]

    mixed_response = await client.patch(
        "/api/v1/auth/me",
        headers=user_headers,
        json={
            "dashboard_folder_ids": [
                first_folder_response.json()["id"],
                forbidden_folder_response.json()["id"],
            ]
        },
    )
    assert mixed_response.status_code == 200
    assert mixed_response.json()["dashboard_folder_ids"] == [
        first_folder_response.json()["id"],
    ]
    assert (
        mixed_response.json()["dashboard_folder_id"]
        == first_folder_response.json()["id"]
    )


@pytest.mark.anyio
async def test_dashboard_folder_ids_filters_out_deleted_folders(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Живая папка"},
    )
    assert folder_response.status_code == 201
    folder_id = folder_response.json()["id"]

    create_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Stale",
            "last_name": "User",
            "email": "stale-user@example.com",
            "role": "CUSTOMER",
            "is_active": True,
            "allowed_folder_ids": [folder_id],
        },
    )
    assert create_response.status_code == 201
    user_password = create_response.json()["temporary_password"]
    user = await login_user(client, email="stale-user@example.com", password=user_password)
    user_headers = {"Authorization": f"Bearer {user['access_token']}"}

    # Пытаемся сохранить dashboard_folder_ids с несуществующим ID (имитация удалённой папки)
    response = await client.patch(
        "/api/v1/auth/me",
        headers=user_headers,
        json={
            "dashboard_folder_ids": [folder_id, 999999],
        },
    )
    assert response.status_code == 200
    assert response.json()["dashboard_folder_ids"] == [folder_id]
    assert response.json()["dashboard_folder_id"] == folder_id


@pytest.mark.anyio
async def test_me_filters_out_inaccessible_dashboard_folders(
    client: AsyncClient,
    db_engine,
) -> None:
    from sqlalchemy.orm import Session
    from app.models.user import User

    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    allowed_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Доступная папка"},
    )
    forbidden_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Недоступная папка"},
    )
    assert allowed_folder_response.status_code == 201
    assert forbidden_folder_response.status_code == 201
    allowed_folder_id = allowed_folder_response.json()["id"]
    forbidden_folder_id = forbidden_folder_response.json()["id"]

    create_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Scoped",
            "last_name": "Dash",
            "email": "scoped-dash@example.com",
            "role": "CUSTOMER",
            "is_active": True,
            "allowed_folder_ids": [allowed_folder_id],
        },
    )
    assert create_response.status_code == 201
    user_id = create_response.json()["user"]["id"]
    user_password = create_response.json()["temporary_password"]

    # Имитируем "рассинхронизацию" напрямую в БД (админ убрал доступ, но dashboard не почистил)
    with Session(db_engine) as session:
        user = session.get(User, user_id)
        assert user is not None
        user.dashboard_folder_ids = [allowed_folder_id, forbidden_folder_id]
        user.dashboard_folder_id = forbidden_folder_id
        session.commit()

    user = await login_user(client, email="scoped-dash@example.com", password=user_password)
    user_headers = {"Authorization": f"Bearer {user['access_token']}"}

    me_response = await client.get("/api/v1/auth/me", headers=user_headers)
    assert me_response.status_code == 200
    assert me_response.json()["dashboard_folder_ids"] == [allowed_folder_id]
    assert me_response.json()["dashboard_folder_id"] == allowed_folder_id


@pytest.mark.anyio
async def test_user_can_hide_only_accessible_equipment_folders(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    visible_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Видимая папка"},
    )
    hidden_forbidden_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Чужая папка"},
    )
    assert visible_folder_response.status_code == 201
    assert hidden_forbidden_folder_response.status_code == 201

    create_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Scoped",
            "last_name": "User",
            "email": "scoped@example.com",
            "role": "CUSTOMER",
            "is_active": True,
            "allowed_folder_ids": [visible_folder_response.json()["id"]],
        },
    )
    assert create_response.status_code == 201
    user_password = create_response.json()["temporary_password"]
    user = await login_user(client, email="scoped@example.com", password=user_password)
    user_headers = {"Authorization": f"Bearer {user['access_token']}"}

    save_hidden_response = await client.patch(
        "/api/v1/auth/me",
        headers=user_headers,
        json={"hidden_equipment_folder_ids": [visible_folder_response.json()["id"]]},
    )
    assert save_hidden_response.status_code == 200
    assert save_hidden_response.json()["hidden_equipment_folder_ids"] == [
        visible_folder_response.json()["id"]
    ]

    forbidden_hidden_response = await client.patch(
        "/api/v1/auth/me",
        headers=user_headers,
        json={"hidden_equipment_folder_ids": [hidden_forbidden_folder_response.json()["id"]]},
    )
    assert forbidden_hidden_response.status_code == 403
    assert (
        forbidden_hidden_response.json()["detail"]
        == "Нельзя скрыть папку, к которой у пользователя нет доступа."
    )


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
        deactivate_response.json()["detail"] == "The system must keep at least one administrator."
    )


@pytest.mark.anyio
async def test_administrator_cannot_delete_self(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)

    delete_response = await client.delete(
        f"/api/v1/users/{admin['user']['id']}",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
    )
    assert delete_response.status_code == 400
    assert delete_response.json()["detail"] == "Нельзя удалить текущего пользователя."


@pytest.mark.anyio
async def test_administrator_cannot_assign_developer_role(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    create_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Denied",
            "last_name": "Developer",
            "email": "denied-developer@example.com",
            "role": "DEVELOPER",
            "is_active": True,
        },
    )
    assert create_response.status_code == 403
    assert (
        create_response.json()["detail"] == "Только разработчик может назначить роль «Разработчик»."
    )


@pytest.mark.anyio
async def test_developer_can_assign_developer_role_and_developer_cannot_be_deleted(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    await login_user(client, email=admin_email, password=admin_password)

    developer = create_user_directly(
        db_engine,
        first_name="Lead",
        last_name="Developer",
        email="developer@example.com",
        password="Developer123",
        role=UserRole.DEVELOPER,
    )
    developer_auth = await login_user(client, email=developer.email, password="Developer123")
    developer_headers = {"Authorization": f"Bearer {developer_auth['access_token']}"}

    create_response = await client.post(
        "/api/v1/users",
        headers=developer_headers,
        json={
            "first_name": "Second",
            "last_name": "Developer",
            "email": "second-developer@example.com",
            "role": "DEVELOPER",
            "is_active": True,
        },
    )
    assert create_response.status_code == 201
    created_user = create_response.json()["user"]
    assert created_user["role"] == "DEVELOPER"

    delete_response = await client.delete(
        f"/api/v1/users/{created_user['id']}",
        headers=developer_headers,
    )
    assert delete_response.status_code == 400
    assert delete_response.json()["detail"] == "Пользователя с ролью «Разработчик» удалить нельзя."


@pytest.mark.anyio
async def test_administrator_cannot_modify_existing_developer_account(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    developer = create_user_directly(
        db_engine,
        first_name="Protected",
        last_name="Developer",
        email="protected-developer@example.com",
        password="Developer123",
        role=UserRole.DEVELOPER,
    )

    update_response = await client.patch(
        f"/api/v1/users/{developer.id}",
        headers=admin_headers,
        json={"is_active": False},
    )
    assert update_response.status_code == 403
    assert (
        update_response.json()["detail"]
        == "Пользователя с ролью «Разработчик» может изменять только разработчик."
    )
