"""Пагинация реестра: `page`/`per_page` рядом с историческими `limit`/`offset`."""

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


async def login_user(client: AsyncClient, *, email: str, password: str) -> dict[str, object]:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


async def admin_headers(client: AsyncClient, db_engine) -> tuple[dict[str, str], str]:
    email, password = bootstrap_admin(db_engine)
    tokens = await login_user(client, email=email, password=password)
    token = str(tokens["access_token"])
    return {"Authorization": f"Bearer {token}"}, token


async def create_folder(client: AsyncClient, headers: dict[str, str], name: str) -> int:
    response = await client.post("/api/v1/equipment/folders", headers=headers, json={"name": name})
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


async def create_equipment(
    client: AsyncClient,
    headers: dict[str, str],
    *,
    folder_id: int,
    name: str,
) -> int:
    response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder_id,
            "object_name": "ХАЛ",
            "equipment_type": "OTHER",
            "name": name,
            "status": "IN_WORK",
        },
    )
    assert response.status_code == 201, response.text
    return int(response.json()["id"])


async def seed_folder(
    client: AsyncClient,
    headers: dict[str, str],
    *,
    folder_name: str,
    equipment_names: list[str],
) -> int:
    folder_id = await create_folder(client, headers, folder_name)
    for name in equipment_names:
        await create_equipment(client, headers, folder_id=folder_id, name=name)
    return folder_id


@pytest.mark.anyio
async def test_page_per_page_match_limit_offset(client: AsyncClient, db_engine) -> None:
    headers, _ = await admin_headers(client, db_engine)
    folder_id = await seed_folder(
        client,
        headers,
        folder_name="Пагинация",
        equipment_names=[f"Прибор #{index}" for index in range(1, 6)],
    )

    page_response = await client.get(
        f"/api/v1/equipment/page?folder_id={folder_id}&page=2&per_page=2",
        headers=headers,
    )
    legacy_response = await client.get(
        f"/api/v1/equipment/page?folder_id={folder_id}&limit=2&offset=2",
        headers=headers,
    )

    assert page_response.status_code == 200, page_response.text
    assert legacy_response.status_code == 200, legacy_response.text
    page_payload = page_response.json()
    legacy_payload = legacy_response.json()

    assert [item["id"] for item in page_payload["items"]] == [
        item["id"] for item in legacy_payload["items"]
    ]
    assert page_payload["total"] == legacy_payload["total"] == 5
    assert page_payload["limit"] == 2
    assert page_payload["offset"] == 2
    assert page_payload["page"] == 2
    assert page_payload["per_page"] == 2
    assert page_payload["total_pages"] == 3


@pytest.mark.anyio
async def test_legacy_limit_offset_reports_page_fields(client: AsyncClient, db_engine) -> None:
    headers, _ = await admin_headers(client, db_engine)
    folder_id = await seed_folder(
        client,
        headers,
        folder_name="Старые клиенты",
        equipment_names=[f"Прибор #{index}" for index in range(1, 6)],
    )

    response = await client.get(
        f"/api/v1/equipment/page?folder_id={folder_id}&limit=2&offset=0",
        headers=headers,
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["limit"] == 2
    assert payload["offset"] == 0
    assert payload["page"] == 1
    assert payload["per_page"] == 2
    assert payload["total_pages"] == 3
    assert len(payload["items"]) == 2


@pytest.mark.anyio
async def test_defaults_keep_the_legacy_page_size(client: AsyncClient, db_engine) -> None:
    headers, _ = await admin_headers(client, db_engine)
    folder_id = await seed_folder(
        client,
        headers,
        folder_name="Значения по умолчанию",
        equipment_names=[f"Прибор #{index}" for index in range(1, 4)],
    )

    response = await client.get(f"/api/v1/equipment/page?folder_id={folder_id}", headers=headers)

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["limit"] == 100
    assert payload["offset"] == 0
    assert payload["page"] == 1
    assert payload["per_page"] == 100
    assert payload["total_pages"] == 1


@pytest.mark.anyio
async def test_page_beyond_the_last_one_is_empty(client: AsyncClient, db_engine) -> None:
    headers, _ = await admin_headers(client, db_engine)
    folder_id = await seed_folder(
        client,
        headers,
        folder_name="Пустая страница",
        equipment_names=[f"Прибор #{index}" for index in range(1, 6)],
    )

    response = await client.get(
        f"/api/v1/equipment/page?folder_id={folder_id}&page=4&per_page=2",
        headers=headers,
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["items"] == []
    assert payload["page"] == 4
    assert payload["total_pages"] == 3
    assert payload["total"] == 5


@pytest.mark.anyio
async def test_total_pages_is_zero_for_an_empty_registry(client: AsyncClient, db_engine) -> None:
    headers, _ = await admin_headers(client, db_engine)
    folder_id = await create_folder(client, headers, "Пустая папка")

    response = await client.get(
        f"/api/v1/equipment/page?folder_id={folder_id}&page=1&per_page=20",
        headers=headers,
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["items"] == []
    assert payload["total"] == 0
    assert payload["total_pages"] == 0


@pytest.mark.anyio
async def test_mixing_pagination_styles_is_rejected(client: AsyncClient, db_engine) -> None:
    headers, _ = await admin_headers(client, db_engine)

    page_and_limit = await client.get(
        "/api/v1/equipment/page?page=2&limit=5",
        headers=headers,
    )
    assert page_and_limit.status_code == 422
    page_payload = page_and_limit.json()
    assert page_payload["error_code"] == "VALIDATION_ERROR"
    assert page_payload["field"] == "page"
    assert "page/per_page" in page_payload["detail"]

    per_page_and_offset = await client.get(
        "/api/v1/equipment/page?per_page=5&offset=0",
        headers=headers,
    )
    assert per_page_and_offset.status_code == 422
    per_page_payload = per_page_and_offset.json()
    assert per_page_payload["error_code"] == "VALIDATION_ERROR"
    assert per_page_payload["field"] == "per_page"


@pytest.mark.anyio
async def test_pagination_bounds_are_enforced(client: AsyncClient, db_engine) -> None:
    headers, _ = await admin_headers(client, db_engine)

    too_large = await client.get("/api/v1/equipment/page?per_page=201", headers=headers)
    assert too_large.status_code == 422
    assert too_large.json()["field"] == "per_page"

    zero_page = await client.get("/api/v1/equipment/page?page=0", headers=headers)
    assert zero_page.status_code == 422
    assert zero_page.json()["field"] == "page"


@pytest.mark.anyio
async def test_page_counts_only_visible_folders(client: AsyncClient, db_engine) -> None:
    headers, admin_token = await admin_headers(client, db_engine)
    visible_folder = await seed_folder(
        client,
        headers,
        folder_name="Доступная папка",
        equipment_names=["Прибор В-1", "Прибор В-2", "Прибор В-3"],
    )
    await seed_folder(
        client,
        headers,
        folder_name="Скрытая папка",
        equipment_names=["Прибор С-1", "Прибор С-2"],
    )

    create_response = await client.post(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "first_name": "Скоуп",
            "last_name": "Пагин",
            "email": "mkair-pagination@example.com",
            "role": "MKAIR",
            "is_active": True,
            "allowed_folder_ids": [visible_folder],
        },
    )
    assert create_response.status_code == 201, create_response.text
    tokens = await login_user(
        client,
        email="mkair-pagination@example.com",
        password=str(create_response.json()["temporary_password"]),
    )
    scoped_headers = {"Authorization": f"Bearer {tokens['access_token']}"}

    response = await client.get("/api/v1/equipment/page?page=1&per_page=2", headers=scoped_headers)

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["total"] == 3
    assert payload["total_pages"] == 2
    assert len(payload["items"]) == 2
