from __future__ import annotations

from datetime import date, timedelta

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
