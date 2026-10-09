from __future__ import annotations

from datetime import date, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.services.task_service import send_task_deadline_reminders
from app.services.user_service import UserService


def bootstrap_admin(db_engine) -> tuple[str, str]:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        UserService(session).ensure_bootstrap_admin()
    return settings.bootstrap_admin_email, settings.bootstrap_admin_password


async def login_user(client: AsyncClient, *, email: str, password: str) -> dict[str, object]:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


async def current_user(client: AsyncClient, token: str) -> dict[str, object]:
    response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200, response.text
    return response.json()


async def create_user(
    client: AsyncClient,
    *,
    admin_token: str,
    email: str,
    role: str,
    password: str = "TestPass123",
    allowed_folder_ids: list[int] | None = None,
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "first_name": role.title(),
            "last_name": "Тестов",
            "email": email,
            "role": role,
            "is_active": True,
            "allowed_folder_ids": allowed_folder_ids or [],
            "temporary_password": password,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_folder(client: AsyncClient, token: str, name: str) -> dict[str, object]:
    response = await client.post(
        "/api/v1/equipment/folders",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": name},
    )
    assert response.status_code == 201, response.text
    return response.json()


async def create_equipment(client: AsyncClient, token: str, folder_id: int, name: str) -> dict:
    response = await client.post(
        "/api/v1/equipment",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "folder_id": folder_id,
            "object_name": "Объект",
            "equipment_type": "OTHER",
            "name": name,
            "status": "IN_WORK",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


@pytest.mark.anyio
async def test_operator_can_create_tasks_with_and_without_equipment(
    client: AsyncClient,
    db_engine,
) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}
    admin_id = (await current_user(client, admin["access_token"]))["id"]

    folder = await create_folder(client, admin["access_token"], "Задачи: база")
    equipment = await create_equipment(client, admin["access_token"], folder["id"], "Прибор-1")

    with_equipment = await client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "title": "Поверить прибор",
            "responsible_user_id": admin_id,
            "equipment_ids": [equipment["id"]],
            "priority": "HIGH",
            "tags": ["метрология", "план"],
        },
    )
    assert with_equipment.status_code == 201, with_equipment.text
    created = with_equipment.json()
    assert created["status"] == "NEW"
    assert created["priority"] == "HIGH"
    assert [item["equipment_id"] for item in created["equipment"]] == [equipment["id"]]
    assert created["equipment"][0]["name"] == "Прибор-1"

    without_equipment = await client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "title": "Бумажная работа",
            "responsible_user_id": admin_id,
        },
    )
    assert without_equipment.status_code == 201, without_equipment.text
    assert without_equipment.json()["equipment"] == []
    assert without_equipment.json()["priority"] == "NORMAL"

    listing = await client.get("/api/v1/tasks", headers=headers)
    assert listing.status_code == 200
    page = listing.json()
    assert page["total"] == 2

    detail = await client.get(f"/api/v1/tasks/{created['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["title"] == "Поверить прибор"


@pytest.mark.anyio
async def test_task_participants_keep_a_single_responsible(client: AsyncClient, db_engine) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}
    admin_id = (await current_user(client, admin["access_token"]))["id"]

    folder = await create_folder(client, admin["access_token"], "Задачи: участники")
    assignee = await create_user(
        client,
        admin_token=admin["access_token"],
        email="assignee@example.test",
        role="MKAIR",
        allowed_folder_ids=[folder["id"]],
    )
    observer = await create_user(
        client,
        admin_token=admin["access_token"],
        email="observer@example.test",
        role="MKAIR",
        allowed_folder_ids=[folder["id"]],
    )
    assignee_id = assignee["user"]["id"]
    observer_id = observer["user"]["id"]

    response = await client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "title": "С участниками",
            "responsible_user_id": admin_id,
            "assignee_user_ids": [assignee_id],
            "observer_user_ids": [observer_id],
        },
    )
    assert response.status_code == 201, response.text
    task = response.json()
    roles = {(item["user_id"], item["role"]) for item in task["participants"]}
    assert (admin_id, "RESPONSIBLE") in roles
    assert (assignee_id, "ASSIGNEE") in roles
    assert (observer_id, "OBSERVER") in roles

    replaced = await client.patch(
        f"/api/v1/tasks/{task['id']}",
        headers=headers,
        json={
            "responsible_user_id": assignee_id,
            "assignee_user_ids": [],
            "observer_user_ids": [observer_id],
        },
    )
    assert replaced.status_code == 200, replaced.text
    responsible = [
        item for item in replaced.json()["participants"] if item["role"] == "RESPONSIBLE"
    ]
    assert len(responsible) == 1
    assert responsible[0]["user_id"] == assignee_id


@pytest.mark.anyio
async def test_observer_cannot_mutate_but_assignee_can(client: AsyncClient, db_engine) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}
    admin_id = (await current_user(client, admin["access_token"]))["id"]

    folder = await create_folder(client, admin["access_token"], "Задачи: права")
    assignee = await create_user(
        client,
        admin_token=admin["access_token"],
        email="worker@example.test",
        role="CUSTOMER",
        allowed_folder_ids=[folder["id"]],
    )
    observer = await create_user(
        client,
        admin_token=admin["access_token"],
        email="watcher@example.test",
        role="CUSTOMER",
        allowed_folder_ids=[folder["id"]],
    )
    assignee_login = await login_user(client, email="worker@example.test", password="TestPass123")
    observer_login = await login_user(client, email="watcher@example.test", password="TestPass123")

    created = await client.post(
        "/api/v1/tasks",
        headers=admin_headers,
        json={
            "folder_id": folder["id"],
            "title": "Смена статуса",
            "responsible_user_id": admin_id,
            "assignee_user_ids": [assignee["user"]["id"]],
            "observer_user_ids": [observer["user"]["id"]],
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["can_mutate"] is True  # the admin is an operator
    task_id = created.json()["id"]

    denied = await client.patch(
        f"/api/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {observer_login['access_token']}"},
        json={"status": "IN_PROGRESS"},
    )
    assert denied.status_code == 403

    allowed = await client.patch(
        f"/api/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {assignee_login['access_token']}"},
        json={"status": "IN_PROGRESS"},
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["status"] == "IN_PROGRESS"

    # The screens hide the controls from the very same flag, so it has to travel with the payload.
    observer_view = await client.get(
        f"/api/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {observer_login['access_token']}"},
    )
    assert observer_view.status_code == 200, observer_view.text
    assert observer_view.json()["can_mutate"] is False

    assignee_view = await client.get(
        f"/api/v1/tasks/{task_id}",
        headers={"Authorization": f"Bearer {assignee_login['access_token']}"},
    )
    assert assignee_view.status_code == 200, assignee_view.text
    assert assignee_view.json()["can_mutate"] is True

    # The board reads the flag per card to decide whether a card may be dragged.
    observer_list = await client.get(
        "/api/v1/tasks",
        headers={"Authorization": f"Bearer {observer_login['access_token']}"},
    )
    assert observer_list.status_code == 200, observer_list.text
    assert observer_list.json()["items"][0]["can_mutate"] is False


@pytest.mark.anyio
async def test_task_folder_scoping_for_customer(client: AsyncClient, db_engine) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)

    allowed_folder = await create_folder(client, admin["access_token"], "Задачи: доступная")
    denied_folder = await create_folder(client, admin["access_token"], "Задачи: закрытая")

    customer = await create_user(
        client,
        admin_token=admin["access_token"],
        email="customer@example.test",
        role="CUSTOMER",
        allowed_folder_ids=[allowed_folder["id"]],
    )
    customer_id = customer["user"]["id"]
    customer_login = await login_user(client, email="customer@example.test", password="TestPass123")
    customer_headers = {"Authorization": f"Bearer {customer_login['access_token']}"}

    ok = await client.post(
        "/api/v1/tasks",
        headers=customer_headers,
        json={
            "folder_id": allowed_folder["id"],
            "title": "Заявка клиента",
            "responsible_user_id": customer_id,
        },
    )
    assert ok.status_code == 201, ok.text

    denied = await client.post(
        "/api/v1/tasks",
        headers=customer_headers,
        json={
            "folder_id": denied_folder["id"],
            "title": "Чужая задача",
            "responsible_user_id": customer_id,
        },
    )
    assert denied.status_code == 404

    listing = await client.get("/api/v1/tasks", headers=customer_headers)
    assert listing.status_code == 200
    assert listing.json()["total"] == 1


@pytest.mark.anyio
async def test_status_lifecycle_and_checklist_progress(client: AsyncClient, db_engine) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}
    admin_id = (await current_user(client, admin["access_token"]))["id"]

    folder = await create_folder(client, admin["access_token"], "Задачи: жизненный цикл")
    created = await client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "title": "Жизненный цикл",
            "responsible_user_id": admin_id,
        },
    )
    assert created.status_code == 201, created.text
    task_id = created.json()["id"]

    done = await client.patch(f"/api/v1/tasks/{task_id}", headers=headers, json={"status": "DONE"})
    assert done.status_code == 200, done.text
    assert done.json()["completed_at"] is not None

    reopened = await client.patch(
        f"/api/v1/tasks/{task_id}", headers=headers, json={"status": "IN_PROGRESS"}
    )
    assert reopened.status_code == 200
    assert reopened.json()["completed_at"] is None

    first = await client.post(
        f"/api/v1/tasks/{task_id}/checklist", headers=headers, json={"label": "Шаг 1"}
    )
    assert first.status_code == 200, first.text
    second = await client.post(
        f"/api/v1/tasks/{task_id}/checklist", headers=headers, json={"label": "Шаг 2"}
    )
    assert second.status_code == 200
    items = second.json()["checklist"]
    assert len(items) == 2
    assert second.json()["checklist_done"] == 0
    assert second.json()["checklist_total"] == 2

    item_id = items[0]["id"]
    toggled = await client.patch(
        f"/api/v1/tasks/{task_id}/checklist/{item_id}", headers=headers, json={"is_done": True}
    )
    assert toggled.status_code == 200, toggled.text
    assert toggled.json()["checklist_done"] == 1

    removed = await client.delete(f"/api/v1/tasks/{task_id}/checklist/{item_id}", headers=headers)
    assert removed.status_code == 200, removed.text
    assert removed.json()["checklist_total"] == 1


@pytest.mark.anyio
async def test_overdue_filter_excludes_terminal_tasks(client: AsyncClient, db_engine) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}
    admin_id = (await current_user(client, admin["access_token"]))["id"]

    folder = await create_folder(client, admin["access_token"], "Задачи: дедлайны")
    past = (date.today() - timedelta(days=3)).isoformat()
    future = (date.today() + timedelta(days=3)).isoformat()

    overdue = await client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "title": "Просроченная",
            "responsible_user_id": admin_id,
            "due_date": past,
        },
    )
    assert overdue.status_code == 201, overdue.text

    upcoming = await client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "title": "Будущая",
            "responsible_user_id": admin_id,
            "due_date": future,
        },
    )
    assert upcoming.status_code == 201

    filtered = await client.get("/api/v1/tasks?overdue_only=true", headers=headers)
    assert filtered.status_code == 200
    titles = [item["title"] for item in filtered.json()["items"]]
    assert titles == ["Просроченная"]

    await client.patch(
        f"/api/v1/tasks/{overdue.json()['id']}", headers=headers, json={"status": "DONE"}
    )
    after_close = await client.get("/api/v1/tasks?overdue_only=true", headers=headers)
    assert after_close.status_code == 200
    assert after_close.json()["total"] == 0


@pytest.mark.anyio
async def test_task_messages_private_visibility(client: AsyncClient, db_engine) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}
    admin_id = (await current_user(client, admin["access_token"]))["id"]

    folder = await create_folder(client, admin["access_token"], "Задачи: обсуждение")
    await create_user(
        client,
        admin_token=admin["access_token"],
        email="talker@example.test",
        role="CUSTOMER",
        allowed_folder_ids=[folder["id"]],
    )
    customer_login = await login_user(client, email="talker@example.test", password="TestPass123")
    customer_headers = {"Authorization": f"Bearer {customer_login['access_token']}"}

    created = await client.post(
        "/api/v1/tasks",
        headers=admin_headers,
        json={"folder_id": folder["id"], "title": "Обсуждаемая", "responsible_user_id": admin_id},
    )
    task_id = created.json()["id"]

    public_message = await client.post(
        f"/api/v1/tasks/{task_id}/messages",
        headers=customer_headers,
        data={"text": "Комментарий клиента"},
    )
    assert public_message.status_code == 201, public_message.text

    private_denied = await client.post(
        f"/api/v1/tasks/{task_id}/messages",
        headers=customer_headers,
        data={"text": "секрет", "is_private": "true"},
    )
    assert private_denied.status_code == 403

    private_note = await client.post(
        f"/api/v1/tasks/{task_id}/messages",
        headers=admin_headers,
        data={"text": "Внутренняя заметка", "is_private": "true"},
    )
    assert private_note.status_code == 201, private_note.text

    customer_view = await client.get(f"/api/v1/tasks/{task_id}/messages", headers=customer_headers)
    assert customer_view.status_code == 200
    assert [m["text"] for m in customer_view.json()] == ["Комментарий клиента"]

    admin_view = await client.get(f"/api/v1/tasks/{task_id}/messages", headers=admin_headers)
    assert admin_view.status_code == 200
    assert len(admin_view.json()) == 2


@pytest.mark.anyio
async def test_task_attachments_flow_and_size_limit(
    client: AsyncClient, db_engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}
    admin_id = (await current_user(client, admin["access_token"]))["id"]

    folder = await create_folder(client, admin["access_token"], "Задачи: вложения")
    created = await client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"folder_id": folder["id"], "title": "С файлом", "responsible_user_id": admin_id},
    )
    task_id = created.json()["id"]

    upload = await client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        headers=headers,
        files={"files": ("план.txt", b"hello", "text/plain")},
    )
    assert upload.status_code == 201, upload.text
    attachment = upload.json()[0]
    assert attachment["file_name"] == "план.txt"

    listing = await client.get(f"/api/v1/tasks/{task_id}/attachments", headers=headers)
    assert listing.status_code == 200
    assert len(listing.json()) == 1

    download = await client.get(
        f"/api/v1/tasks/{task_id}/attachments/{attachment['id']}", headers=headers
    )
    assert download.status_code == 200
    assert download.content == b"hello"

    removed = await client.delete(
        f"/api/v1/tasks/{task_id}/attachments/{attachment['id']}", headers=headers
    )
    assert removed.status_code == 204
    assert (await client.get(f"/api/v1/tasks/{task_id}/attachments", headers=headers)).json() == []

    monkeypatch.setattr(settings, "upload_max_file_size_bytes", 3)
    too_big = await client.post(
        f"/api/v1/tasks/{task_id}/attachments",
        headers=headers,
        files={"files": ("big.bin", b"0123456789", "application/octet-stream")},
    )
    assert too_big.status_code == 413


@pytest.mark.anyio
async def test_task_subscription_toggle(client: AsyncClient, db_engine) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}
    admin_id = (await current_user(client, admin["access_token"]))["id"]

    folder = await create_folder(client, admin["access_token"], "Задачи: подписка")
    created = await client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"folder_id": folder["id"], "title": "Подписка", "responsible_user_id": admin_id},
    )
    task_id = created.json()["id"]

    status_before = await client.get(f"/api/v1/tasks/{task_id}/subscription", headers=headers)
    assert status_before.json()["is_subscribed"] is False

    subscribed = await client.post(f"/api/v1/tasks/{task_id}/subscription", headers=headers)
    assert subscribed.status_code == 200
    assert subscribed.json()["is_subscribed"] is True

    unsubscribed = await client.delete(f"/api/v1/tasks/{task_id}/subscription", headers=headers)
    assert unsubscribed.json()["is_subscribed"] is False


@pytest.mark.anyio
async def test_task_deadline_reminder_is_idempotent(client: AsyncClient, db_engine) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}
    admin_id = (await current_user(client, admin["access_token"]))["id"]

    folder = await create_folder(client, admin["access_token"], "Задачи: напоминания")
    due = (date.today() + timedelta(days=1)).isoformat()
    created = await client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "title": "Скоро дедлайн",
            "responsible_user_id": admin_id,
            "due_date": due,
        },
    )
    assert created.status_code == 201, created.text

    session_factory = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with session_factory() as session:
        assert send_task_deadline_reminders(session, window_days=3) == 1
    with session_factory() as session:
        assert send_task_deadline_reminders(session, window_days=3) == 0


@pytest.mark.anyio
async def test_status_change_notifies_participants_and_subscriber(
    client: AsyncClient, db_engine, monkeypatch: pytest.MonkeyPatch
) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}
    admin_id = (await current_user(client, admin["access_token"]))["id"]

    folder = await create_folder(client, admin["access_token"], "Задачи: уведомления")
    await create_user(
        client,
        admin_token=admin["access_token"],
        email="follower@example.test",
        role="CUSTOMER",
        allowed_folder_ids=[folder["id"]],
    )
    follower_login = await login_user(client, email="follower@example.test", password="TestPass123")
    follower_headers = {"Authorization": f"Bearer {follower_login['access_token']}"}

    created = await client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"folder_id": folder["id"], "title": "Уведомляемая", "responsible_user_id": admin_id},
    )
    task_id = created.json()["id"]

    await client.post(f"/api/v1/tasks/{task_id}/subscription", headers=follower_headers)

    calls: list[dict[str, object]] = []
    monkeypatch.setattr(
        "app.services.task_service.enqueue_process_update_email",
        lambda **kwargs: calls.append(kwargs),
    )
    updated = await client.patch(
        f"/api/v1/tasks/{task_id}", headers=headers, json={"status": "IN_PROGRESS"}
    )
    assert updated.status_code == 200, updated.text
    recipients = {call["recipient_email"] for call in calls}
    assert "follower@example.test" in recipients


@pytest.mark.anyio
async def test_task_message_attachment_download(client: AsyncClient, db_engine) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}
    admin_id = (await current_user(client, admin["access_token"]))["id"]

    folder = await create_folder(client, admin["access_token"], "Задачи: вложения обсуждения")
    created = await client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "title": "С файлом в обсуждении",
            "responsible_user_id": admin_id,
        },
    )
    task_id = created.json()["id"]

    message = await client.post(
        f"/api/v1/tasks/{task_id}/messages",
        headers=headers,
        data={"text": "во вложении"},
        files={"files": ("note.txt", b"hello", "text/plain")},
    )
    assert message.status_code == 201, message.text
    payload = message.json()
    attachment_id = payload["attachments"][0]["id"]

    download = await client.get(
        f"/api/v1/tasks/{task_id}/messages/{payload['id']}/attachments/{attachment_id}",
        headers=headers,
    )
    assert download.status_code == 200, download.text
    assert download.content == b"hello"


@pytest.mark.anyio
async def test_mention_candidates_are_scoped_to_callers_folders(
    client: AsyncClient, db_engine
) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)
    admin_token = admin["access_token"]

    folder_a = await create_folder(client, admin_token, "Упоминания: папка A")
    folder_b = await create_folder(client, admin_token, "Упоминания: папка B")

    await create_user(
        client,
        admin_token=admin_token,
        email="mentions-a@example.test",
        role="CUSTOMER",
        allowed_folder_ids=[folder_a["id"]],
    )
    await create_user(
        client,
        admin_token=admin_token,
        email="mentions-b@example.test",
        role="CUSTOMER",
        allowed_folder_ids=[folder_b["id"]],
    )

    colleague = await login_user(client, email="mentions-a@example.test", password="TestPass123")
    colleague_headers = {"Authorization": f"Bearer {colleague['access_token']}"}

    scoped = await client.get("/api/v1/users/mentions", headers=colleague_headers)
    assert scoped.status_code == 200, scoped.text
    scoped_emails = {item["email"] for item in scoped.json()}
    assert "mentions-a@example.test" in scoped_emails
    assert settings.bootstrap_admin_email in scoped_emails
    assert "mentions-b@example.test" not in scoped_emails

    everyone = await client.get(
        "/api/v1/users/mentions", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert everyone.status_code == 200, everyone.text
    admin_emails = {item["email"] for item in everyone.json()}
    assert {"mentions-a@example.test", "mentions-b@example.test"} <= admin_emails


@pytest.mark.anyio
async def test_folder_of_a_task_follows_its_equipment(client: AsyncClient, db_engine) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}
    admin_id = (await current_user(client, admin["access_token"]))["id"]

    first = await create_folder(client, admin["access_token"], "Задачи: папка 1")
    second = await create_folder(client, admin["access_token"], "Задачи: папка 2")
    item_a = await create_equipment(client, admin["access_token"], first["id"], "Прибор А")
    item_b = await create_equipment(client, admin["access_token"], second["id"], "Прибор Б")

    single = await client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": "По прибору",
            "responsible_user_id": admin_id,
            "equipment_ids": [item_a["id"]],
        },
    )
    assert single.status_code == 201, single.text
    assert single.json()["folder_id"] == first["id"]

    empty = await client.post(
        "/api/v1/tasks",
        headers=headers,
        json={"title": "Без приборов", "responsible_user_id": admin_id},
    )
    assert empty.status_code == 201, empty.text
    assert empty.json()["folder_id"] is None

    mixed = await client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": "По двум папкам",
            "responsible_user_id": admin_id,
            "equipment_ids": [item_a["id"], item_b["id"]],
        },
    )
    assert mixed.status_code == 201, mixed.text
    assert mixed.json()["folder_id"] is None

    # Attaching equipment to a folder-less task hands it the equipment's folder...
    attached = await client.patch(
        f"/api/v1/tasks/{empty.json()['id']}",
        headers=headers,
        json={"equipment_ids": [item_b["id"]]},
    )
    assert attached.status_code == 200, attached.text
    assert attached.json()["folder_id"] == second["id"]

    # ...while detaching never drops a folder the task already has.
    detached = await client.patch(
        f"/api/v1/tasks/{attached.json()['id']}",
        headers=headers,
        json={"equipment_ids": []},
    )
    assert detached.status_code == 200, detached.text
    assert detached.json()["folder_id"] == second["id"]


@pytest.mark.anyio
async def test_folderless_task_is_visible_to_its_people(client: AsyncClient, db_engine) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)

    folder = await create_folder(client, admin["access_token"], "Задачи: общая")
    author = await create_user(
        client,
        admin_token=admin["access_token"],
        email="author@example.test",
        role="CUSTOMER",
        allowed_folder_ids=[folder["id"]],
    )
    await create_user(
        client,
        admin_token=admin["access_token"],
        email="bystander@example.test",
        role="CUSTOMER",
        allowed_folder_ids=[folder["id"]],
    )
    author_login = await login_user(client, email="author@example.test", password="TestPass123")
    bystander_login = await login_user(
        client, email="bystander@example.test", password="TestPass123"
    )
    author_headers = {"Authorization": f"Bearer {author_login['access_token']}"}
    bystander_headers = {"Authorization": f"Bearer {bystander_login['access_token']}"}

    created = await client.post(
        "/api/v1/tasks",
        headers=author_headers,
        json={"title": "Задача без папки", "responsible_user_id": author["user"]["id"]},
    )
    assert created.status_code == 201, created.text
    assert created.json()["folder_id"] is None
    task_id = created.json()["id"]

    assert (await client.get(f"/api/v1/tasks/{task_id}", headers=author_headers)).status_code == 200
    # A colleague who may see the whole folder still gets nothing: the task belongs to its people.
    assert (
        await client.get(f"/api/v1/tasks/{task_id}", headers=bystander_headers)
    ).status_code == 404

    bystander_list = await client.get("/api/v1/tasks", headers=bystander_headers)
    assert all(item["id"] != task_id for item in bystander_list.json()["items"])
    author_list = await client.get("/api/v1/tasks", headers=author_headers)
    assert any(item["id"] == task_id for item in author_list.json()["items"])


@pytest.mark.anyio
async def test_responsible_may_also_be_an_assignee(client: AsyncClient, db_engine) -> None:
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}
    admin_id = (await current_user(client, admin["access_token"]))["id"]

    created = await client.post(
        "/api/v1/tasks",
        headers=headers,
        json={
            "title": "Сам себе исполнитель",
            "responsible_user_id": admin_id,
            "assignee_user_ids": [admin_id],
        },
    )
    assert created.status_code == 201, created.text
    roles = {
        (participant["user_id"], participant["role"])
        for participant in created.json()["participants"]
    }
    assert (admin_id, "RESPONSIBLE") in roles
    assert (admin_id, "ASSIGNEE") in roles

    # The overlap is what makes the task show up under «Где я исполнитель».
    listing = await client.get(f"/api/v1/tasks?assignee_user_id={admin_id}", headers=headers)
    assert listing.status_code == 200, listing.text
    assert any(item["id"] == created.json()["id"] for item in listing.json()["items"])


@pytest.mark.anyio
async def test_invited_participant_sees_the_task_without_folder_access(
    client: AsyncClient,
    db_engine,
) -> None:
    """An invitation outranks the folder scope, or the email link would lead nowhere."""
    email, password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=email, password=password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}
    admin_id = (await current_user(client, admin["access_token"]))["id"]

    task_folder = await create_folder(client, admin["access_token"], "Задачи: папка задачи")
    other_folder = await create_folder(client, admin["access_token"], "Задачи: другая папка")
    equipment = await create_equipment(
        client, admin["access_token"], task_folder["id"], "Прибор задачи"
    )

    invited = await create_user(
        client,
        admin_token=admin["access_token"],
        email="invited@example.test",
        role="CUSTOMER",
        allowed_folder_ids=[other_folder["id"]],
    )
    await create_user(
        client,
        admin_token=admin["access_token"],
        email="outsider@example.test",
        role="CUSTOMER",
        allowed_folder_ids=[other_folder["id"]],
    )
    invited_login = await login_user(client, email="invited@example.test", password="TestPass123")
    outsider_login = await login_user(client, email="outsider@example.test", password="TestPass123")
    invited_headers = {"Authorization": f"Bearer {invited_login['access_token']}"}
    outsider_headers = {"Authorization": f"Bearer {outsider_login['access_token']}"}

    created = await client.post(
        "/api/v1/tasks",
        headers=admin_headers,
        json={
            "title": "Задача в чужой папке",
            "responsible_user_id": admin_id,
            "observer_user_ids": [invited["user"]["id"]],
            "equipment_ids": [equipment["id"]],
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["folder_id"] == task_folder["id"]
    task_id = created.json()["id"]

    detail = await client.get(f"/api/v1/tasks/{task_id}", headers=invited_headers)
    assert detail.status_code == 200, detail.text
    assert detail.json()["can_mutate"] is False  # an observer stays read-only

    invited_list = await client.get("/api/v1/tasks", headers=invited_headers)
    assert any(item["id"] == task_id for item in invited_list.json()["items"])

    # Somebody with the same folders but no invitation stays outside.
    assert (
        await client.get(f"/api/v1/tasks/{task_id}", headers=outsider_headers)
    ).status_code == 404
    outsider_list = await client.get("/api/v1/tasks", headers=outsider_headers)
    assert all(item["id"] != task_id for item in outsider_list.json()["items"])
