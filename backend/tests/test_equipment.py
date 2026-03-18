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
async def test_operator_can_create_filter_and_update_registry_entities(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={
            "name": "Лаборатория 1",
            "description": "Основная папка оборудования",
            "sort_order": 10,
        },
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "group_id": None,
            "object_name": "Химическая лаборатория",
            "equipment_type": "SI",
            "name": "Весы лабораторные",
            "modification": "AX-200",
            "serial_number": "SN-001",
            "manufacture_year": 2024,
            "status": "ACTIVE",
            "current_location_manual": "Шкаф 3",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    second_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Химическая лаборатория",
            "equipment_type": "OTHER",
            "name": "Стол металлический",
            "status": "ARCHIVED",
        },
    )
    assert second_equipment_response.status_code == 201

    folders_list = await client.get("/api/v1/equipment/folders", headers=headers)
    assert folders_list.status_code == 200
    assert len(folders_list.json()) == 1

    groups_list = await client.get(
        f"/api/v1/equipment/groups?folder_id={folder['id']}",
        headers=headers,
    )
    assert groups_list.status_code == 200
    assert len(groups_list.json()) == 0

    equipment_list = await client.get(
        f"/api/v1/equipment?folder_id={folder['id']}",
        headers=headers,
    )
    assert equipment_list.status_code == 200
    assert len(equipment_list.json()) == 2

    search_response = await client.get(
        "/api/v1/equipment?query=AX-200",
        headers=headers,
    )
    assert search_response.status_code == 200
    assert len(search_response.json()) == 1
    assert search_response.json()[0]["id"] == equipment["id"]

    status_response = await client.get(
        "/api/v1/equipment?status=ARCHIVED",
        headers=headers,
    )
    assert status_response.status_code == 200
    assert len(status_response.json()) == 1
    assert status_response.json()[0]["status"] == "ARCHIVED"

    update_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
        json={
            "status": "IN_REPAIR",
            "current_location_manual": "Ремонтный участок",
            "modification": None,
        },
    )
    assert update_response.status_code == 200
    updated_equipment = update_response.json()
    assert updated_equipment["status"] == "IN_REPAIR"
    assert updated_equipment["current_location_manual"] == "Ремонтный участок"
    assert updated_equipment["modification"] is None

    detail_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
    )
    assert detail_response.status_code == 200
    assert detail_response.json()["folder_id"] == folder["id"]

    delete_equipment_response = await client.delete(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
    )
    assert delete_equipment_response.status_code == 204

    deleted_equipment_detail = await client.get(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
    )
    assert deleted_equipment_detail.status_code == 404

    delete_folder_response = await client.delete(
        f"/api/v1/equipment/folders/{folder['id']}",
        headers=headers,
    )
    assert delete_folder_response.status_code == 204

    folders_after_delete = await client.get("/api/v1/equipment/folders", headers=headers)
    assert folders_after_delete.status_code == 200
    assert folders_after_delete.json() == []

    archived_after_folder_delete = await client.get(
        "/api/v1/equipment?status=ARCHIVED",
        headers=headers,
    )
    assert archived_after_folder_delete.status_code == 200
    assert archived_after_folder_delete.json() == []


@pytest.mark.anyio
async def test_customer_can_view_registry_but_cannot_mutate(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    create_customer_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Customer",
            "last_name": "Viewer",
            "patronymic": "",
            "email": "viewer@example.com",
            "role": "CUSTOMER",
            "is_active": True,
        },
    )
    assert create_customer_response.status_code == 201
    customer_password = create_customer_response.json()["temporary_password"]
    customer = await login_user(client, email="viewer@example.com", password=customer_password)
    customer_headers = {"Authorization": f"Bearer {customer['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Доступная папка"},
    )
    assert folder_response.status_code == 201

    list_response = await client.get("/api/v1/equipment/folders", headers=customer_headers)
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    forbidden_response = await client.post(
        "/api/v1/equipment/folders",
        headers=customer_headers,
        json={"name": "Запрещенная папка"},
    )
    assert forbidden_response.status_code == 403
    assert forbidden_response.json()["detail"] == "Operator role is required."


@pytest.mark.anyio
async def test_equipment_detail_returns_404_for_missing_item(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)

    response = await client.get(
        "/api/v1/equipment/9999",
        headers={"Authorization": f"Bearer {admin['access_token']}"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Equipment not found."
