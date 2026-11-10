"""Эндпоинты статистики: агрегаты и изоляция по доступным папкам."""

from __future__ import annotations

from datetime import date

import pytest
from httpx import AsyncClient
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.equipment import (
    Equipment,
    EquipmentGroup,
    EquipmentStatus,
    EquipmentType,
    Repair,
    Verification,
)
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


async def create_scoped_user(
    client: AsyncClient,
    *,
    admin_token: str,
    email: str,
    role: str,
    allowed_folder_ids: list[int],
) -> dict[str, str]:
    response = await client.post(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "first_name": "Скоуп",
            "last_name": "Ограниченный",
            "email": email,
            "role": role,
            "is_active": True,
            "allowed_folder_ids": allowed_folder_ids,
        },
    )
    assert response.status_code == 201, response.text
    tokens = await login_user(
        client,
        email=email,
        password=str(response.json()["temporary_password"]),
    )
    return {"Authorization": f"Bearer {tokens['access_token']}"}


def seed_registry(db_engine, *, folder_a: int, folder_b: int) -> dict[str, int]:
    """Детерминированный набор данных: 5 приборов, 2 группы, поверки и ремонты."""

    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        equipment = [
            Equipment(
                folder_id=folder_a,
                object_name="ХАЛ",
                equipment_type=EquipmentType.SI,
                name="Прибор A-1",
                status=EquipmentStatus.IN_WORK,
            ),
            Equipment(
                folder_id=folder_a,
                object_name="ХАЛ",
                equipment_type=EquipmentType.OTHER,
                name="Прибор A-2",
                status=EquipmentStatus.IN_WORK,
            ),
            Equipment(
                folder_id=folder_a,
                object_name="ХАЛ",
                equipment_type=EquipmentType.SI,
                name="Прибор A-3",
                status=EquipmentStatus.IN_REPAIR,
            ),
            Equipment(
                folder_id=folder_b,
                object_name="ТЭЦ",
                equipment_type=EquipmentType.ESI,
                name="Прибор B-1",
                status=EquipmentStatus.IN_WORK,
            ),
            Equipment(
                folder_id=folder_b,
                object_name="ТЭЦ",
                equipment_type=EquipmentType.SI,
                name="Прибор B-2",
                status=EquipmentStatus.REPAIRED,
            ),
        ]
        session.add_all(equipment)
        session.flush()
        session.add_all(
            [
                EquipmentGroup(folder_id=folder_a, name="Группа А"),
                EquipmentGroup(folder_id=folder_b, name="Группа Б"),
                Verification(
                    equipment_id=equipment[0].id,
                    route_city="Иркутск",
                    route_destination="Ленск",
                    sent_to_verification_at=date(2026, 1, 10),
                ),
                Verification(
                    equipment_id=equipment[2].id,
                    route_city="Иркутск",
                    route_destination="Ленск",
                    sent_to_verification_at=date(2026, 1, 5),
                    closed_at=date(2026, 2, 1),
                ),
                Verification(
                    equipment_id=equipment[3].id,
                    route_city="Иркутск",
                    route_destination="Мирный",
                    sent_to_verification_at=date(2026, 1, 12),
                ),
                Repair(
                    equipment_id=equipment[2].id,
                    route_city="Иркутск",
                    route_destination="Ленск",
                    sent_to_repair_at=date(2026, 1, 5),
                    repair_deadline_at=date(2026, 3, 5),
                    repair_total_days_snapshot=60,
                    registration_after_arrival_days_snapshot=5,
                    incoming_control_after_receipt_days_snapshot=5,
                    payment_after_control_days_snapshot=10,
                ),
                Repair(
                    equipment_id=equipment[4].id,
                    route_city="Иркутск",
                    route_destination="Ленск",
                    sent_to_repair_at=date(2025, 6, 1),
                    repair_deadline_at=date(2025, 8, 1),
                    repair_total_days_snapshot=60,
                    registration_after_arrival_days_snapshot=5,
                    incoming_control_after_receipt_days_snapshot=5,
                    payment_after_control_days_snapshot=10,
                    closed_at=date(2025, 7, 20),
                ),
            ]
        )
        session.commit()
        return {"equipment_a1": equipment[0].id, "equipment_b1": equipment[3].id}


@pytest.mark.anyio
async def test_summary_counts_only_visible_folders(client: AsyncClient, db_engine) -> None:
    headers, admin_token = await admin_headers(client, db_engine)
    folder_a = await create_folder(client, headers, "Объект А")
    folder_b = await create_folder(client, headers, "Объект Б")
    seed_registry(db_engine, folder_a=folder_a, folder_b=folder_b)
    scoped_headers = await create_scoped_user(
        client,
        admin_token=admin_token,
        email="mkair-stats@example.com",
        role="MKAIR",
        allowed_folder_ids=[folder_a],
    )

    admin_response = await client.get("/api/v1/stats/summary", headers=headers)
    assert admin_response.status_code == 200, admin_response.text
    admin_summary = admin_response.json()
    assert admin_summary["equipment_total"] == 5
    assert admin_summary["folders_total"] == 2
    assert admin_summary["groups_total"] == 2
    assert admin_summary["active_verifications_total"] == 2
    assert admin_summary["active_repairs_total"] == 1
    users_response = await client.get("/api/v1/users", headers=headers)
    assert admin_summary["users_total"] == len(
        [user for user in users_response.json() if user["is_active"]]
    )

    scoped_response = await client.get("/api/v1/stats/summary", headers=scoped_headers)
    assert scoped_response.status_code == 200, scoped_response.text
    scoped_summary = scoped_response.json()
    assert scoped_summary["equipment_total"] == 3
    assert scoped_summary["folders_total"] == 1
    assert scoped_summary["groups_total"] == 1
    assert scoped_summary["active_verifications_total"] == 1
    assert scoped_summary["active_repairs_total"] == 1
    # Администратор без ограничения по папкам виден всем, плюс сам пользователь.
    assert scoped_summary["users_total"] == 2


@pytest.mark.anyio
async def test_equipment_stats_group_by_status_orders_by_count_desc(
    client: AsyncClient,
    db_engine,
) -> None:
    headers, _ = await admin_headers(client, db_engine)
    folder_a = await create_folder(client, headers, "Объект А")
    folder_b = await create_folder(client, headers, "Объект Б")
    seed_registry(db_engine, folder_a=folder_a, folder_b=folder_b)

    response = await client.get("/api/v1/stats/equipment?group_by=status", headers=headers)

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["group_by"] == "status"
    assert payload["total"] == 5
    assert [item["key"] for item in payload["items"]] == ["IN_WORK", "IN_REPAIR", "REPAIRED"]
    assert [item["count"] for item in payload["items"]] == [3, 1, 1]
    assert payload["items"][0]["label"] == "В работе"


@pytest.mark.anyio
async def test_equipment_stats_group_by_type_and_folder(client: AsyncClient, db_engine) -> None:
    headers, _ = await admin_headers(client, db_engine)
    folder_a = await create_folder(client, headers, "Объект А")
    folder_b = await create_folder(client, headers, "Объект Б")
    seed_registry(db_engine, folder_a=folder_a, folder_b=folder_b)

    by_type = await client.get("/api/v1/stats/equipment?group_by=equipment_type", headers=headers)
    assert by_type.status_code == 200, by_type.text
    type_items = {item["key"]: item["count"] for item in by_type.json()["items"]}
    assert type_items == {"SI": 3, "OTHER": 1, "ESI": 1}
    assert by_type.json()["total"] == 5

    by_folder = await client.get("/api/v1/stats/equipment?group_by=folder_id", headers=headers)
    assert by_folder.status_code == 200, by_folder.text
    folder_items = {
        item["key"]: (item["label"], item["count"]) for item in by_folder.json()["items"]
    }
    assert folder_items == {folder_a: ("Объект А", 3), folder_b: ("Объект Б", 2)}


@pytest.mark.anyio
async def test_equipment_stats_never_show_hidden_folders(client: AsyncClient, db_engine) -> None:
    headers, admin_token = await admin_headers(client, db_engine)
    folder_a = await create_folder(client, headers, "Объект А")
    folder_b = await create_folder(client, headers, "Объект Б")
    seed_registry(db_engine, folder_a=folder_a, folder_b=folder_b)
    scoped_headers = await create_scoped_user(
        client,
        admin_token=admin_token,
        email="mkair-grouping@example.com",
        role="MKAIR",
        allowed_folder_ids=[folder_a],
    )

    by_status = await client.get("/api/v1/stats/equipment?group_by=status", headers=scoped_headers)
    assert by_status.status_code == 200, by_status.text
    payload = by_status.json()
    assert payload["total"] == 3
    assert {item["key"]: item["count"] for item in payload["items"]} == {
        "IN_WORK": 2,
        "IN_REPAIR": 1,
    }

    by_folder = await client.get(
        "/api/v1/stats/equipment?group_by=folder_id",
        headers=scoped_headers,
    )
    assert by_folder.status_code == 200, by_folder.text
    assert [item["key"] for item in by_folder.json()["items"]] == [folder_a]
    assert by_folder.json()["items"][0]["label"] == "Объект А"


@pytest.mark.anyio
async def test_verification_stats_respect_folder_scope(client: AsyncClient, db_engine) -> None:
    headers, admin_token = await admin_headers(client, db_engine)
    folder_a = await create_folder(client, headers, "Объект А")
    folder_b = await create_folder(client, headers, "Объект Б")
    seed_registry(db_engine, folder_a=folder_a, folder_b=folder_b)
    scoped_headers = await create_scoped_user(
        client,
        admin_token=admin_token,
        email="mkair-verifications@example.com",
        role="MKAIR",
        allowed_folder_ids=[folder_a],
    )

    admin_response = await client.get("/api/v1/stats/verifications", headers=headers)
    assert admin_response.status_code == 200, admin_response.text
    assert admin_response.json()["total"] == 3
    assert {item["key"]: item["count"] for item in admin_response.json()["items"]} == {
        "ACTIVE": 2,
        "CLOSED": 1,
    }

    scoped_response = await client.get("/api/v1/stats/verifications", headers=scoped_headers)
    assert scoped_response.status_code == 200, scoped_response.text
    assert scoped_response.json()["total"] == 2
    assert {item["key"]: item["count"] for item in scoped_response.json()["items"]} == {
        "ACTIVE": 1,
        "CLOSED": 1,
    }


@pytest.mark.anyio
async def test_user_without_any_folder_sees_nothing(client: AsyncClient, db_engine) -> None:
    headers, admin_token = await admin_headers(client, db_engine)
    folder_a = await create_folder(client, headers, "Объект А")
    seed_registry(db_engine, folder_a=folder_a, folder_b=folder_a)
    scoped_headers = await create_scoped_user(
        client,
        admin_token=admin_token,
        email="mkair-empty@example.com",
        role="MKAIR",
        allowed_folder_ids=[],
    )

    summary = await client.get("/api/v1/stats/summary", headers=scoped_headers)
    assert summary.status_code == 200, summary.text
    assert summary.json()["equipment_total"] == 0
    assert summary.json()["folders_total"] == 0

    by_status = await client.get("/api/v1/stats/equipment?group_by=status", headers=scoped_headers)
    assert by_status.status_code == 200, by_status.text
    assert by_status.json() == {"group_by": "status", "total": 0, "items": []}


@pytest.mark.anyio
async def test_stats_require_authentication(client: AsyncClient, db_engine) -> None:
    summary = await client.get("/api/v1/stats/summary")
    assert summary.status_code == 401
    assert summary.json()["error_code"] == "UNAUTHORIZED"

    equipment = await client.get("/api/v1/stats/equipment")
    assert equipment.status_code == 401
    verifications = await client.get("/api/v1/stats/verifications")
    assert verifications.status_code == 401


@pytest.mark.anyio
async def test_unknown_group_by_is_rejected(client: AsyncClient, db_engine) -> None:
    headers, _ = await admin_headers(client, db_engine)

    response = await client.get("/api/v1/stats/equipment?group_by=folder", headers=headers)

    assert response.status_code == 422
    payload = response.json()
    assert payload["error_code"] == "VALIDATION_ERROR"
    assert payload["field"] == "group_by"

    verifications = await client.get("/api/v1/stats/verifications?group_by=flow", headers=headers)
    assert verifications.status_code == 422
    assert verifications.json()["field"] == "group_by"
