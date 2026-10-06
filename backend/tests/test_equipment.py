from __future__ import annotations

from datetime import date, datetime, timedelta
from io import BytesIO
from urllib.parse import quote
from zipfile import ZipFile

import httpx
import pytest
from httpx import AsyncClient
from openpyxl import Workbook, load_workbook
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.models.equipment import Repair
from app.models.user import User
from app.schemas.arshin import ArshinRegistryKind, ArshinSearchResultRead, ArshinVriDetailRead
from app.schemas.equipment import SIVerificationCreateRequest
from app.services.arshin_service import ArshinService
from app.services.equipment_service import EquipmentService
from app.services.folder_refresh_matcher import FolderRefreshMatcher, FolderRefreshMatchResult
from app.services.notification_service import NotificationDeliveryError
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


async def create_user_via_api(
    client: AsyncClient,
    *,
    admin_access_token: str,
    first_name: str,
    last_name: str,
    email: str,
    role: str,
    allowed_folder_ids: list[int] | None = None,
) -> dict[str, object]:
    response = await client.post(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {admin_access_token}"},
        json={
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "role": role,
            "is_active": True,
            "allowed_folder_ids": allowed_folder_ids or [],
        },
    )
    assert response.status_code == 201
    return response.json()


async def process_folder_refresh_task(db_engine, *, task_id: int) -> None:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        service = EquipmentService(session)
        await service.process_folder_refresh_task(task_id=task_id)


def create_folder_refresh_task(
    db_engine,
    *,
    folder_id: int,
    user_email: str,
) -> int:
    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        current_user = session.execute(select(User).where(User.email == user_email)).scalar_one()
        service = EquipmentService(session, access_user=current_user)
        task = service.create_folder_refresh_task(
            folder_id=folder_id,
            current_user=current_user,
        )
        return task.id


def build_large_test_jpeg() -> bytes:
    image = Image.effect_noise((3600, 2400), 100).convert("RGB")
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=96)
    payload = buffer.getvalue()
    assert len(payload) > settings.attachment_image_target_size_bytes
    return payload


def with_last_process_stage_date(process: dict[str, object], value: str) -> list[dict[str, object]]:
    custom_stages = [
        dict(stage) for stage in process.get("custom_stages", []) if isinstance(stage, dict)
    ]
    assert custom_stages
    custom_stages[-1]["date"] = value
    return custom_stages


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
            "status": "IN_WORK",
            "current_location_manual": "Шкаф 3",
            "si_verification": {
                "vri_id": "1-SI-001",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/1-SI-001",
                "org_title": "ФБУ Тест",
                "mit_number": "12345-01",
                "mit_title": "Весы лабораторные",
                "mit_notation": "AX-200",
                "mi_number": "SN-001",
                "result_docnum": "AA 001234",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "12345-01",
                            "mitypeTitle": "Весы лабораторные",
                            "mitypeType": "AX-200",
                            "manufactureNum": "SN-001",
                            "manufactureYear": 2024,
                            "modification": "AX-200M",
                        }
                    }
                },
            },
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()
    assert equipment["si_verification"]["vri_id"] == "1-SI-001"

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
    assert detail_response.json()["si_verification"]["result_docnum"] == "AA 001234"

    delete_equipment_response = await client.delete(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
    )
    assert delete_equipment_response.status_code == 204


@pytest.mark.anyio
async def test_operator_can_create_si_with_manual_verification_interval_override(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Ручной межповерочный интервал"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Лаборатория",
            "equipment_type": "SI",
            "name": "Манометр",
            "status": "IN_WORK",
            "manual_verification_interval_months": 12,
            "si_verification": {
                "vri_id": "manual-interval-create",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/manual-interval-create",
                "mit_number": "12345-01",
                "mit_title": "Манометр",
                "mit_notation": "M-1",
                "mi_number": "SN-100",
                "result_docnum": "CERT-MANUAL-1",
                "verification_date": "2025-09-17T00:00:00",
                "valid_date": "2029-09-16T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {
                    "vriInfo": {"validDate": "2029-09-16", "vrfDate": "2025-09-17"}
                },
            },
        },
    )

    assert equipment_response.status_code == 201
    equipment = equipment_response.json()
    assert equipment["manual_verification_interval_months"] == 12
    assert equipment["si_verification"]["verification_date"] == "2025-09-17T00:00:00"
    assert equipment["si_verification"]["valid_date"] == "2026-09-16T00:00:00"


@pytest.mark.anyio
async def test_deadline_presets_can_be_listed_created_and_attached_to_folder(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    presets_response = await client.get("/api/v1/equipment/deadline-presets", headers=headers)
    assert presets_response.status_code == 200
    presets = presets_response.json()
    assert any(preset["code"] == "tyungd" for preset in presets)

    create_preset_response = await client.post(
        "/api/v1/equipment/deadline-presets",
        headers=headers,
        json={
            "name": "Быстрый ремонт",
            "description": "Для срочных договоров",
            "sort_order": 10,
            "is_active": True,
            "repair_total_days": 30,
            "registration_after_arrival_days": 2,
            "incoming_control_after_receipt_days": 7,
            "payment_after_control_days": 9,
        },
    )
    assert create_preset_response.status_code == 201
    preset = create_preset_response.json()
    assert preset["name"] == "Быстрый ремонт"

    create_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={
            "name": "Папка со срочным ремонтом",
            "deadline_preset_id": preset["id"],
        },
    )
    assert create_folder_response.status_code == 201
    folder = create_folder_response.json()
    assert folder["deadline_preset_id"] == preset["id"]
    assert folder["deadline_preset_name"] == "Быстрый ремонт"
    snapshot = folder["deadline_preset_snapshot_json"]
    assert {
        key: snapshot[key]
        for key in (
            "repair_total_days",
            "registration_after_arrival_days",
            "incoming_control_after_receipt_days",
            "payment_after_control_days",
        )
    } == {
        "repair_total_days": 30,
        "registration_after_arrival_days": 2,
        "incoming_control_after_receipt_days": 7,
        "payment_after_control_days": 9,
    }
    assert snapshot["repair_stage_templates_json"]["variants"]
    assert snapshot["verification_stage_templates_json"]["variants"]


@pytest.mark.anyio
async def test_repair_deadlines_use_folder_deadline_preset_snapshot(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    create_preset_response = await client.post(
        "/api/v1/equipment/deadline-presets",
        headers=headers,
        json={
            "name": "Папка 30-2-7-9",
            "sort_order": 20,
            "is_active": True,
            "repair_total_days": 30,
            "registration_after_arrival_days": 2,
            "incoming_control_after_receipt_days": 7,
            "payment_after_control_days": 9,
        },
    )
    assert create_preset_response.status_code == 201
    preset = create_preset_response.json()

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={
            "name": "Папка ремонта по пресету",
            "deadline_preset_id": preset["id"],
        },
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Лаборатория 7",
            "equipment_type": "OTHER",
            "name": "Компрессор",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    create_repair_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        data={
            "route_city": "Иркутск",
            "route_destination": "МК",
            "sent_to_repair_at": "2026-03-20",
        },
    )
    assert create_repair_response.status_code == 201
    repair = create_repair_response.json()
    assert repair["repair_deadline_at"] == "2026-04-19"

    update_repair_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        json={
            "arrived_to_destination_at": "2026-03-21",
            "sent_from_repair_at": "2026-03-28",
            "sent_from_irkutsk_at": "2026-03-30",
            "arrived_to_lensk_at": "2026-04-01",
            "actually_received_at": "2026-04-04",
            "incoming_control_at": "2026-04-12",
        },
    )
    assert update_repair_response.status_code == 200

    create_second_preset_response = await client.post(
        "/api/v1/equipment/deadline-presets",
        headers=headers,
        json={
            "name": "Папка 60-10-20-30",
            "sort_order": 21,
            "is_active": True,
            "repair_total_days": 60,
            "registration_after_arrival_days": 10,
            "incoming_control_after_receipt_days": 20,
            "payment_after_control_days": 30,
        },
    )
    assert create_second_preset_response.status_code == 201
    second_preset = create_second_preset_response.json()

    update_folder_response = await client.patch(
        f"/api/v1/equipment/folders/{folder['id']}",
        headers=headers,
        json={"deadline_preset_id": second_preset["id"]},
    )
    assert update_folder_response.status_code == 200

    queue_response = await client.get(
        "/api/v1/equipment/repairs?lifecycle_status=active&query=Компрессор",
        headers=headers,
    )
    assert queue_response.status_code == 200
    queue_item = queue_response.json()[0]
    assert queue_item["repair_id"] == repair["id"]
    assert queue_item["repair_deadline_at"] == "2026-04-19"


@pytest.mark.anyio
async def test_on_site_repair_uses_demolition_flow_and_closes_after_mounting(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Ремонт на месте"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Цех 5",
            "equipment_type": "OTHER",
            "name": "Блок питания",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    create_repair_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        data={
            "route_city": "На месте",
            "route_destination": "На месте",
            "sent_to_repair_at": "2026-03-20",
            "is_on_site": "true",
        },
    )
    assert create_repair_response.status_code == 201
    repair = create_repair_response.json()
    assert repair["is_on_site"] is True

    queue_response = await client.get(
        "/api/v1/equipment/repairs?lifecycle_status=active&query=Блок питания",
        headers=headers,
    )
    assert queue_response.status_code == 200
    queue_item = queue_response.json()[0]
    assert queue_item["is_on_site"] is True
    assert queue_item["current_stage_label"] == "Демонтаж"

    close_too_early_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair/close",
        headers=headers,
    )
    assert close_too_early_response.status_code == 422
    assert close_too_early_response.json()["detail"] == (
        "Ремонт можно завершить только после даты этапа «Монтаж»."
    )

    custom_stages = with_last_process_stage_date(repair, "2026-03-23")
    update_repair_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        json={
            "sent_from_repair_at": "2026-03-21",
            "arrived_to_lensk_at": "2026-03-22",
            "custom_stages": custom_stages,
        },
    )
    assert update_repair_response.status_code == 200

    queue_after_update_response = await client.get(
        "/api/v1/equipment/repairs?lifecycle_status=active&query=Блок питания",
        headers=headers,
    )
    assert queue_after_update_response.status_code == 200
    assert (
        queue_after_update_response.json()[0]["current_stage_label"] == custom_stages[-1]["label"]
    )

    close_repair_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair/close",
        headers=headers,
    )
    assert close_repair_response.status_code == 200
    assert close_repair_response.json()["closed_at"] is not None


@pytest.mark.anyio
async def test_deadline_preset_cannot_delete_system_or_used_preset(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    presets_response = await client.get("/api/v1/equipment/deadline-presets", headers=headers)
    assert presets_response.status_code == 200
    system_preset = next(preset for preset in presets_response.json() if preset["code"] == "tyungd")

    delete_system_response = await client.delete(
        f"/api/v1/equipment/deadline-presets/{system_preset['id']}",
        headers=headers,
    )
    assert delete_system_response.status_code == 400

    create_preset_response = await client.post(
        "/api/v1/equipment/deadline-presets",
        headers=headers,
        json={
            "name": "Занятый пресет",
            "sort_order": 30,
            "is_active": True,
            "repair_total_days": 45,
            "registration_after_arrival_days": 3,
            "incoming_control_after_receipt_days": 8,
            "payment_after_control_days": 11,
        },
    )
    assert create_preset_response.status_code == 201
    preset = create_preset_response.json()

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={
            "name": "Папка занятого пресета",
            "deadline_preset_id": preset["id"],
        },
    )
    assert folder_response.status_code == 201

    delete_used_response = await client.delete(
        f"/api/v1/equipment/deadline-presets/{preset['id']}",
        headers=headers,
    )
    assert delete_used_response.status_code == 400


@pytest.mark.anyio
async def test_operator_can_store_manual_compliance_for_io_and_vo(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Поверочная", "description": None, "sort_order": 0},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Стенд ИО",
            "equipment_type": "IO",
            "name": "Стенд испытательный",
            "status": "IN_WORK",
            "compliance_date": "2026-03-01",
            "compliance_interval_months": 24,
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()
    assert equipment["compliance_date"] == "2026-03-01"
    assert equipment["compliance_interval_months"] == 24

    fetch_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
    )
    assert fetch_response.status_code == 200
    payload = fetch_response.json()
    assert payload["compliance_date"] == "2026-03-01"
    assert payload["compliance_interval_months"] == 24


@pytest.mark.anyio
async def test_operator_can_change_other_equipment_type_to_supported_category(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Смена категории", "description": None, "sort_order": 0},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Склад",
            "equipment_type": "OTHER",
            "name": "Импортированный прибор",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    update_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
        json={
            "equipment_type": "IO",
            "compliance_date": "2026-04-01",
            "compliance_interval_months": 24,
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["equipment_type"] == "IO"
    assert updated["compliance_date"] == "2026-04-01"
    assert updated["compliance_interval_months"] == 24

    update_to_si_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
        json={
            "equipment_type": "SI",
            "measurement_range_start": "0",
            "measurement_range_end": "100",
            "measurement_unit": "В",
        },
    )
    assert update_to_si_response.status_code == 422
    assert (
        update_to_si_response.json()["detail"]
        == "Категорию этого прибора после создания менять нельзя."
    )


@pytest.mark.anyio
async def test_operator_can_update_manual_verification_interval_for_si(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Редактирование интервала"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Лаборатория",
            "equipment_type": "SI",
            "name": "Калибратор",
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "manual-interval-update",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/manual-interval-update",
                "mit_number": "12345-02",
                "mit_title": "Калибратор",
                "mit_notation": "K-1",
                "mi_number": "SN-200",
                "result_docnum": "CERT-MANUAL-2",
                "verification_date": "2025-09-17T00:00:00",
                "valid_date": "2029-09-16T00:00:00",
                "raw_payload_json": {"validDate": "2029-09-16"},
                "detail_payload_json": {
                    "vriInfo": {"validDate": "2029-09-16", "vrfDate": "2025-09-17"}
                },
            },
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    update_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
        json={"manual_verification_interval_months": 12},
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["manual_verification_interval_months"] == 12
    assert updated["si_verification"]["valid_date"] == "2026-09-16T00:00:00"

    reset_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
        json={"manual_verification_interval_months": None},
    )
    assert reset_response.status_code == 200
    reset_payload = reset_response.json()
    assert reset_payload["manual_verification_interval_months"] is None
    assert reset_payload["si_verification"]["valid_date"] == "2029-09-16T00:00:00"


@pytest.mark.anyio
async def test_operator_can_change_other_equipment_type_to_si_without_arshin_payload(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Смена в СИ", "description": None, "sort_order": 0},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Склад",
            "equipment_type": "OTHER",
            "name": "Импортированный прибор СИ",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    update_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
        json={
            "equipment_type": "SI",
            "measurement_range_start": "0",
            "measurement_range_end": "100",
            "measurement_unit": "В",
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["equipment_type"] == "SI"
    assert updated["measurement_range_start"] == "0"
    assert updated["measurement_range_end"] == "100"
    assert updated["measurement_unit"] == "В"
    assert updated["si_verification"] is None


@pytest.mark.anyio
async def test_operator_can_add_persisted_esi_composition_entry(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "ЭСИ состав", "description": "Тест состава ЭСИ", "sort_order": 0},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": 'ООО "МКАИР"',
            "equipment_type": "ESI",
            "name": "Калибраторы многофункциональные",
            "modification": "ЭЛМЕТРО-Паскаль-03-0,005",
            "serial_number": "0050",
            "manufacture_year": 2020,
            "status": "IN_WORK",
            "esi_internal_modules": [
                {
                    "registry_number": "73828.19.3Р.01021102",
                    "measurement_limit": "в режиме измерения постоянного электрического напряжения",
                },
                {
                    "registry_number": "73828.19.1Р.00156416",
                    "measurement_limit": (
                        "в режиме измерения и воспроизведения силы постоянного электрического тока"
                    ),
                },
            ],
            "si_verification": {
                "vri_id": "1-503716225",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/etalons/1021102",
                "org_title": 'ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                "mit_number": "73828-19",
                "mit_title": "Калибраторы многофункциональные",
                "mit_notation": "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                "mi_number": "0050",
                "result_docnum": "73828.19.3Р.01021102",
                "verification_date": "2026-02-05T00:00:00",
                "valid_date": "2027-02-04T00:00:00",
                "raw_payload_json": {"number": "73828.19.3Р.01021102", "rankcode": "3Р"},
                "detail_payload_json": {
                    "number": "73828.19.3Р.01021102",
                    "rankcode": "3Р",
                    "rankclass": "Эталон 3-го разряда",
                    "vriInfo": {
                        "organization": 'ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                        "vrfDate": "05.02.2026",
                        "validDate": "04.02.2027",
                        "applicable": {"certNum": "С-ВЯ/05-02-2026/503716225"},
                    },
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "73828-19",
                            "mitypeTitle": "Калибраторы многофункциональные",
                            "manufactureNum": "0050",
                            "manufactureYear": 2020,
                            "modification": "ЭЛМЕТРО-Паскаль-03-0,005",
                        }
                    },
                    "metrolog_related_esi_profiles": [
                        {
                            "number": "73828.19.3Р.01021102",
                            "rankcode": "3Р",
                            "rankclass": "Эталон 3-го разряда",
                            "mitype_num": "73828-19",
                            "mitype": "Калибраторы многофункциональные",
                            "minotation": "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                            "modification": "ЭЛМЕТРО-Паскаль-03-0,005",
                            "factory_num": "0050",
                            "year": 2020,
                            "verification_date": "05.02.2026",
                            "valid_date": "04.02.2027",
                            "selected": True,
                        },
                        {
                            "number": "73828.19.1Р.00156416",
                            "rankcode": "1Р",
                            "rankclass": "Эталон 1-го разряда",
                            "mitype_num": "73828-19",
                            "mitype": "Калибраторы многофункциональные",
                            "minotation": "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                            "modification": "нет модификации",
                            "factory_num": "0050",
                            "year": 2020,
                            "verification_date": "05.02.2026",
                            "valid_date": "04.02.2027",
                            "selected": False,
                        },
                    ],
                    "metrolog_related_esi_verification_records": [
                        {
                            "vri_id": "1-503716224",
                            "certificate_number": "С-ВЯ/05-02-2026/503716224",
                            "eta_number": "73828.19.1Р.00156416",
                            "verification_date": "05.02.2026",
                            "valid_date": "04.02.2027",
                            "organization": 'ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                            "selected": False,
                        }
                    ],
                },
            },
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    add_entry_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/esi-composition",
        headers=headers,
        json={
            "si_verification": {
                "vri_id": "1-503716186",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/etalons/761953",
                "org_title": 'ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                "mit_number": "77090-19",
                "mit_title": "Преобразователи давления эталонные",
                "mit_notation": "ЭЛМЕТРО-Паскаль-04, Паскаль-04",
                "mi_number": "3124",
                "result_docnum": "77090.19.2Р.00761953",
                "verification_date": "2026-02-05T00:00:00",
                "valid_date": "2027-02-04T00:00:00",
                "raw_payload_json": {"number": "77090.19.2Р.00761953", "rankcode": "2Р"},
                "detail_payload_json": {
                    "number": "77090.19.2Р.00761953",
                    "rankcode": "2Р",
                    "rankclass": "Эталон 2-го разряда",
                    "vriInfo": {
                        "organization": 'ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                        "vrfDate": "05.02.2026",
                        "validDate": "04.02.2027",
                        "applicable": {"certNum": "С-ВЯ/05-02-2026/503716186"},
                    },
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "77090-19",
                            "mitypeTitle": "Преобразователи давления эталонные",
                            "mitypeType": "ЭЛМЕТРО-Паскаль-04, Паскаль-04",
                            "manufactureNum": "3124",
                            "manufactureYear": 2020,
                            "modification": "160KР-0,02-Т35",
                        }
                    },
                },
            }
        },
    )
    assert add_entry_response.status_code == 201
    assert add_entry_response.json()["vri_id"] == "1-503716186"

    details_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/details",
        headers=headers,
    )
    assert details_response.status_code == 200
    payload = details_response.json()
    assert len(payload["esi_composition_entries"]) == 3
    internal_entries = [
        entry for entry in payload["esi_composition_entries"] if entry["module_kind"] == "INTERNAL"
    ]
    assert len(internal_entries) == 2
    assert {entry["result_docnum"] for entry in internal_entries} == {
        "73828.19.3Р.01021102",
        "73828.19.1Р.00156416",
    }
    assert {entry["measurement_limit"] for entry in internal_entries} == {
        "в режиме измерения постоянного электрического напряжения",
        "в режиме измерения и воспроизведения силы постоянного электрического тока",
    }
    external_entry = next(
        entry for entry in payload["esi_composition_entries"] if entry["module_kind"] == "EXTERNAL"
    )
    assert external_entry["result_docnum"] == "77090.19.2Р.00761953"
    assert external_entry["measurement_limit"] is None

    update_entry_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}/esi-composition/{external_entry['id']}",
        headers=headers,
        json={"measurement_limit": "(-100)- +160 кПа"},
    )
    assert update_entry_response.status_code == 200
    assert update_entry_response.json()["measurement_limit"] == "(-100)- +160 кПа"

    monitoring_response = await client.get(
        f"/api/v1/equipment/folders/{folder['id']}/esi-monitoring",
        headers=headers,
    )
    assert monitoring_response.status_code == 200
    monitoring_payload = monitoring_response.json()
    assert len(monitoring_payload) == 1
    assert monitoring_payload[0]["equipment_id"] == equipment["id"]
    assert len(monitoring_payload[0]["modules"]) == 3
    assert {module["module_kind"] for module in monitoring_payload[0]["modules"]} == {
        "INTERNAL",
        "EXTERNAL",
    }
    assert any(
        module["measurement_limit"] == "(-100)- +160 кПа"
        for module in monitoring_payload[0]["modules"]
    )

    duplicate_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/esi-composition",
        headers=headers,
        json={
            "si_verification": {
                "vri_id": "1-503716186",
                "detail_payload_json": {
                    "vriInfo": {"applicable": {"certNum": "С-ВЯ/05-02-2026/503716186"}}
                },
            }
        },
    )
    assert duplicate_response.status_code == 409

    delete_response = await client.delete(
        f"/api/v1/equipment/{equipment['id']}/esi-composition/{external_entry['id']}",
        headers=headers,
    )
    assert delete_response.status_code == 204

    details_after_delete_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/details",
        headers=headers,
    )
    assert details_after_delete_response.status_code == 200
    assert len(details_after_delete_response.json()["esi_composition_entries"]) == 2


@pytest.mark.anyio
async def test_operator_can_create_esi_with_internal_profile_without_verification_record(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "ЭСИ без VRI", "description": "Тест внутреннего профиля", "sort_order": 0},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": 'ООО "МКАИР"',
            "equipment_type": "ESI",
            "name": "Калибраторы многофункциональные",
            "modification": "исполнение ЭЛМЕТРО-Паскаль-03-0,005",
            "serial_number": "0414",
            "manufacture_year": 2025,
            "status": "IN_WORK",
            "esi_internal_modules": [
                {
                    "registry_number": "73828.19.3Р.01262789",
                    "measurement_limit": "в режиме измерения постоянного электрического напряжения",
                },
                {
                    "registry_number": "73828.19.1Р.01262800",
                    "measurement_limit": (
                        "в режиме измерения и воспроизведения силы постоянного электрического тока"
                    ),
                },
            ],
            "si_verification": {
                "vri_id": "1-415504034",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/etalons/1262789",
                "org_title": 'ФБУ "КАЛУЖСКИЙ ЦСМ"',
                "mit_number": "73828-19",
                "mit_title": "Калибраторы многофункциональные",
                "mit_notation": "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                "mi_number": "0414",
                "result_docnum": "73828.19.3Р.01262789",
                "verification_date": "2025-03-04T00:00:00",
                "valid_date": "2026-03-03T00:00:00",
                "raw_payload_json": {"number": "73828.19.3Р.01262789", "rankcode": "3Р"},
                "detail_payload_json": {
                    "number": "73828.19.3Р.01262789",
                    "rankcode": "3Р",
                    "rankclass": "Эталон 3-го разряда",
                    "vriInfo": {
                        "organization": 'ФБУ "КАЛУЖСКИЙ ЦСМ"',
                        "vrfDate": "04.03.2025",
                        "validDate": "03.03.2026",
                        "applicable": {"certNum": "С-ГА/04-03-2025/415504034"},
                    },
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "73828-19",
                            "mitypeTitle": "Калибраторы многофункциональные",
                            "mitypeType": "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                            "manufactureNum": "0414",
                            "manufactureYear": 2025,
                            "modification": "исполнение ЭЛМЕТРО-Паскаль-03-0,005",
                            "rankCode": "3Р",
                            "rankTitle": "Эталон 3-го разряда",
                            "regNumber": "73828.19.3Р.01262789",
                        }
                    },
                    "metrolog_related_esi_profiles": [
                        {
                            "number": "73828.19.3Р.01262789",
                            "rankcode": "3Р",
                            "rankclass": "Эталон 3-го разряда",
                            "mitype_num": "73828-19",
                            "mitype": "Калибраторы многофункциональные",
                            "minotation": "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                            "modification": "исполнение ЭЛМЕТРО-Паскаль-03-0,005",
                            "factory_num": "0414",
                            "year": 2025,
                            "verification_date": "04.03.2025",
                            "valid_date": "03.03.2026",
                            "selected": True,
                        },
                        {
                            "number": "73828.19.1Р.01262800",
                            "rankcode": "1Р",
                            "mitype_num": "73828-19",
                            "mitype": "Калибраторы многофункциональные",
                            "factory_num": "0414",
                            "year": 2025,
                            "verification_date": "04.03.2025",
                            "valid_date": "03.03.2026",
                            "selected": False,
                        },
                    ],
                },
            },
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    details_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/details",
        headers=headers,
    )
    assert details_response.status_code == 200
    payload = details_response.json()
    internal_entries = [
        entry for entry in payload["esi_composition_entries"] if entry["module_kind"] == "INTERNAL"
    ]
    assert len(internal_entries) == 2
    internal_by_registry = {entry["result_docnum"]: entry for entry in internal_entries}
    assert set(internal_by_registry) == {
        "73828.19.3Р.01262789",
        "73828.19.1Р.01262800",
    }
    assert (
        internal_by_registry["73828.19.1Р.01262800"]["measurement_limit"]
        == "в режиме измерения и воспроизведения силы постоянного электрического тока"
    )
    assert (
        internal_by_registry["73828.19.1Р.01262800"]["vri_id"] == "esi-profile:73828.19.1Р.01262800"
    )


@pytest.mark.anyio
async def test_operator_can_delete_equipment_batch(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Массовое удаление"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_ids: list[int] = []
    for index in range(2):
        equipment_response = await client.post(
            "/api/v1/equipment",
            headers=headers,
            json={
                "folder_id": folder["id"],
                "object_name": "Комната подготовки воды",
                "equipment_type": "OTHER",
                "name": f"Прибор #{index + 1}",
                "status": "IN_WORK",
            },
        )
        assert equipment_response.status_code == 201
        equipment_ids.append(equipment_response.json()["id"])

    delete_response = await client.post(
        "/api/v1/equipment/delete-batch",
        headers=headers,
        json={"equipment_ids": equipment_ids},
    )
    assert delete_response.status_code == 204

    equipment_list = await client.get(
        f"/api/v1/equipment?folder_id={folder['id']}",
        headers=headers,
    )
    assert equipment_list.status_code == 200
    assert equipment_list.json() == []


@pytest.mark.anyio
async def test_operator_can_list_events_with_filters(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Журнал событий"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    second_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Журнал событий 2"},
    )
    assert second_folder_response.status_code == 201
    second_folder = second_folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Пусковой объект",
            "equipment_type": "OTHER",
            "name": "Манометр",
            "serial_number": "MN-001",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    repair_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Иркутск",
            "sent_to_repair_at": "2026-03-20",
            "initial_message_text": "Прибор упакован и отправлен.",
        },
    )
    assert repair_response.status_code == 201

    second_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": second_folder["id"],
            "object_name": "Резервный объект",
            "equipment_type": "OTHER",
            "name": "Термометр",
            "serial_number": "TM-001",
            "status": "IN_WORK",
        },
    )
    assert second_equipment_response.status_code == 201

    events_response = await client.get("/api/v1/events", headers=headers)
    assert events_response.status_code == 200
    events = events_response.json()
    assert any(event["action"] == "equipment_created" for event in events)
    assert any(event["action"] == "repair_created" for event in events)

    repair_events_response = await client.get(
        "/api/v1/events?category=REPAIR",
        headers=headers,
    )
    assert repair_events_response.status_code == 200
    repair_events = repair_events_response.json()
    assert repair_events
    assert all(event["category"] == "REPAIR" for event in repair_events)

    search_events_response = await client.get(
        "/api/v1/events?query=Манометр",
        headers=headers,
    )
    assert search_events_response.status_code == 200
    search_events = search_events_response.json()
    assert search_events
    assert any(event["equipment_name"] == "Манометр" for event in search_events)

    folder_events_response = await client.get(
        f"/api/v1/events?folder_id={folder['id']}",
        headers=headers,
    )
    assert folder_events_response.status_code == 200
    folder_events = folder_events_response.json()
    assert folder_events
    assert all(event["folder_id"] == folder["id"] for event in folder_events)
    assert all(event["equipment_name"] != "Термометр" for event in folder_events)


@pytest.mark.anyio
async def test_operator_can_page_equipment_registry(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Пагинация реестра"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    for index in range(3):
        equipment_response = await client.post(
            "/api/v1/equipment",
            headers=headers,
            json={
                "folder_id": folder["id"],
                "object_name": "ХАЛ",
                "equipment_type": "OTHER",
                "name": f"Прибор #{index + 1}",
                "status": "IN_WORK",
            },
        )
        assert equipment_response.status_code == 201

    first_page_response = await client.get(
        f"/api/v1/equipment/page?folder_id={folder['id']}&limit=2&offset=0",
        headers=headers,
    )
    assert first_page_response.status_code == 200
    first_page = first_page_response.json()
    assert first_page["total"] == 3
    assert first_page["limit"] == 2
    assert first_page["offset"] == 0
    assert [item["name"] for item in first_page["items"]] == ["Прибор #3", "Прибор #2"]

    second_page_response = await client.get(
        f"/api/v1/equipment/page?folder_id={folder['id']}&limit=2&offset=2",
        headers=headers,
    )
    assert second_page_response.status_code == 200
    second_page = second_page_response.json()
    assert second_page["total"] == 3
    assert second_page["limit"] == 2
    assert second_page["offset"] == 2
    assert [item["name"] for item in second_page["items"]] == ["Прибор #1"]


@pytest.mark.anyio
async def test_operator_can_sort_equipment_registry_page_server_side(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Сортировка реестра"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    si_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "SI",
            "name": "Весы",
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "sort-si-1",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "detail_payload_json": {"source": "test"},
            },
        },
    )
    assert si_response.status_code == 201

    io_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "IO",
            "name": "Стенд",
            "status": "IN_WORK",
            "compliance_date": "2026-02-10",
            "compliance_interval_months": 12,
        },
    )
    assert io_response.status_code == 201

    other_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "OTHER",
            "name": "Тележка",
            "status": "IN_WORK",
        },
    )
    assert other_response.status_code == 201

    name_sorted_response = await client.get(
        (
            f"/api/v1/equipment/page?folder_id={folder['id']}&limit=10&offset=0"
            "&sort_key=name&sort_direction=asc"
        ),
        headers=headers,
    )
    assert name_sorted_response.status_code == 200
    name_sorted_payload = name_sorted_response.json()
    assert [item["name"] for item in name_sorted_payload["items"]] == ["Весы", "Стенд", "Тележка"]

    valid_to_sorted_response = await client.get(
        (
            f"/api/v1/equipment/page?folder_id={folder['id']}&limit=10&offset=0"
            "&sort_key=validTo&sort_direction=asc"
        ),
        headers=headers,
    )
    assert valid_to_sorted_response.status_code == 200
    valid_to_sorted_payload = valid_to_sorted_response.json()
    assert [item["name"] for item in valid_to_sorted_payload["items"]] == [
        "Стенд",
        "Весы",
        "Тележка",
    ]


@pytest.mark.anyio
async def test_operator_can_export_filtered_equipment_registry_to_excel(
    client: AsyncClient,
    db_engine,
) -> None:
    from io import BytesIO

    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Экспорт реестра"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    si_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "SI",
            "name": "Весы лабораторные",
            "modification": "AX-200",
            "serial_number": "SN-001",
            "manufacture_year": 2024,
            "status": "IN_WORK",
            "current_location_manual": "Шкаф 3",
            "si_verification": {
                "vri_id": "1-SI-EXPORT",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/1-SI-EXPORT",
                "org_title": "ФБУ Тест",
                "mit_number": "12345-01",
                "mit_title": "Весы лабораторные",
                "mit_notation": "AX-200",
                "mi_number": "SN-001",
                "result_docnum": "AA 001234",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "12345-01",
                            "mitypeTitle": "Весы лабораторные",
                            "mitypeType": "AX-200",
                            "manufactureNum": "SN-001",
                            "manufactureYear": 2024,
                            "modification": "AX-200",
                        }
                    }
                },
            },
        },
    )
    assert si_response.status_code == 201

    other_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "OTHER",
            "name": "Стол поверочный",
            "status": "ARCHIVED",
            "current_location_manual": "Архив",
        },
    )
    assert other_response.status_code == 201
    other_equipment = other_response.json()

    export_response = await client.get(
        f"/api/v1/equipment/export/xlsx?folder_id={folder['id']}&equipment_type=SI",
        headers=headers,
    )
    assert export_response.status_code == 200
    assert (
        export_response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    workbook = load_workbook(
        filename=BytesIO(export_response.content),
        read_only=True,
        data_only=True,
    )
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    workbook.close()

    assert rows[0] == (
        "Папка",
        "Категория",
        "Статус",
        "Наименование",
        "Модификация",
        "Заводской номер",
        "Год выпуска",
        "Объект",
        "Локация",
        "Номер Аршина",
        "Действительно до",
    )
    assert len(rows) == 2
    assert rows[1][0] == "Экспорт реестра"
    assert rows[1][1] == "SI"
    assert rows[1][3] == "Весы лабораторные"
    assert rows[1][9] == "AA 001234"

    selected_export_response = await client.get(
        f"/api/v1/equipment/export/xlsx?folder_id={folder['id']}&equipment_ids={other_equipment['id']}",
        headers=headers,
    )
    assert selected_export_response.status_code == 200

    selected_workbook = load_workbook(
        filename=BytesIO(selected_export_response.content),
        read_only=True,
        data_only=True,
    )
    selected_sheet = selected_workbook.active
    selected_rows = list(selected_sheet.iter_rows(values_only=True))
    selected_workbook.close()

    assert len(selected_rows) == 2
    assert selected_rows[1][0] == "Экспорт реестра"
    assert selected_rows[1][1] == "OTHER"
    assert selected_rows[1][2] == "ARCHIVED"
    assert selected_rows[1][3] == "Стол поверочный"


@pytest.mark.anyio
async def test_operator_can_export_repair_queue_to_excel(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Экспорт ремонтов"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "OTHER",
            "name": "Источник питания",
            "status": "IN_WORK",
            "current_location_manual": "Комната ремонта",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    create_repair_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Тюмень",
            "sent_to_repair_at": "2026-03-20",
        },
    )
    assert create_repair_response.status_code == 201

    export_response = await client.get(
        "/api/v1/equipment/repairs/export/xlsx?lifecycle_status=active&query=Источник",
        headers=headers,
    )
    assert export_response.status_code == 200
    assert (
        export_response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    workbook = load_workbook(
        filename=BytesIO(export_response.content),
        read_only=True,
        data_only=True,
    )
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    workbook.close()

    assert rows[0] == (
        "Папка",
        "Группа ремонта",
        "Объект",
        "Категория",
        "Наименование",
        "Модификация",
        "Заводской номер",
        "Местонахождение",
        "Откуда",
        "Куда",
        "Отправлено в ремонт",
        "Дедлайн ремонта",
        "Текущий этап",
        "Макс. просрочка, дн.",
        "Номер Аршина",
        "Закрыт",
    )
    assert len(rows) == 2
    assert rows[1][0] == "Экспорт ремонтов"
    assert rows[1][3] == "OTHER"
    assert rows[1][4] == "Источник питания"
    assert rows[1][7] == "Комната ремонта"
    assert rows[1][8] == "Ленск"
    assert rows[1][9] == "Тюмень"
    assert rows[1][10] == "20.03.2026"
    assert rows[1][12] == "Демонтаж"


@pytest.mark.anyio
async def test_operator_can_export_verification_queue_to_excel(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Экспорт поверок"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "SI",
            "name": "Манометр",
            "modification": "DM2005",
            "serial_number": "SN-V-001",
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "1-SI-VER-EXPORT",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/1-SI-VER-EXPORT",
                "org_title": "ФБУ Тест",
                "mit_number": "12345-01",
                "mit_title": "Манометр",
                "mit_notation": "DM2005",
                "mi_number": "SN-V-001",
                "result_docnum": "CERT-V-001",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {"miInfo": {"singleMI": {"manufactureYear": 2024}}},
            },
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    create_verification_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/verification",
        headers=headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Иркутск",
            "sent_to_verification_at": "2026-03-20",
        },
    )
    assert create_verification_response.status_code == 201

    export_response = await client.get(
        "/api/v1/equipment/verifications/export/xlsx?lifecycle_status=active&query=Манометр",
        headers=headers,
    )
    assert export_response.status_code == 200
    assert (
        export_response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    workbook = load_workbook(
        filename=BytesIO(export_response.content),
        read_only=True,
        data_only=True,
    )
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    workbook.close()

    assert rows[0] == (
        "Папка",
        "Группа поверки",
        "Объект",
        "Наименование",
        "Модификация",
        "Заводской номер",
        "Откуда",
        "Куда",
        "Отправлено в поверку",
        "Состояние",
        "Номер Аршина",
        "Действительно до",
        "Закрыта",
    )
    assert len(rows) == 2
    assert rows[1][0] == "Экспорт поверок"
    assert rows[1][2] == "ХАЛ"
    assert rows[1][3] == "Манометр"
    assert rows[1][4] == "DM2005"
    assert rows[1][5] == "SN-V-001"
    assert rows[1][6] == "Ленск"
    assert rows[1][7] == "Иркутск"
    assert rows[1][8] == "20.03.2026"
    assert rows[1][9] == "Демонтаж"
    assert rows[1][10] == "CERT-V-001"
    assert rows[1][11] == "01.03.2027"


@pytest.mark.anyio
async def test_customer_can_view_registry_but_cannot_mutate(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Доступная папка"},
    )
    assert folder_response.status_code == 201
    folder_id = folder_response.json()["id"]
    forbidden_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Скрытая папка заказчика"},
    )
    assert forbidden_folder_response.status_code == 201
    forbidden_folder_id = forbidden_folder_response.json()["id"]

    create_customer_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Customer",
            "last_name": "Viewer",
            "email": "viewer@example.com",
            "role": "CUSTOMER",
            "is_active": True,
            "allowed_folder_ids": [folder_id],
        },
    )
    assert create_customer_response.status_code == 201
    customer_password = create_customer_response.json()["temporary_password"]
    customer = await login_user(client, email="viewer@example.com", password=customer_password)
    customer_headers = {"Authorization": f"Bearer {customer['access_token']}"}

    allowed_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=admin_headers,
        json={
            "folder_id": folder_id,
            "object_name": "Объект заказчика",
            "equipment_type": "OTHER",
            "name": "Разрешенный прибор заказчика",
            "status": "IN_WORK",
        },
    )
    forbidden_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=admin_headers,
        json={
            "folder_id": forbidden_folder_id,
            "object_name": "Объект заказчика",
            "equipment_type": "OTHER",
            "name": "Скрытый прибор заказчика",
            "status": "IN_WORK",
        },
    )
    assert allowed_equipment_response.status_code == 201
    assert forbidden_equipment_response.status_code == 201

    list_response = await client.get("/api/v1/equipment/folders", headers=customer_headers)
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1

    equipment_page_response = await client.get(
        "/api/v1/equipment/page?limit=50&offset=0",
        headers=customer_headers,
    )
    assert equipment_page_response.status_code == 200
    equipment_page = equipment_page_response.json()
    assert equipment_page["total"] == 1
    assert [item["folder_id"] for item in equipment_page["items"]] == [folder_id]
    assert [item["name"] for item in equipment_page["items"]] == ["Разрешенный прибор заказчика"]

    events_response = await client.get("/api/v1/events?limit=50", headers=customer_headers)
    assert events_response.status_code == 200
    assert events_response.json()
    assert all(item["folder_id"] == folder_id for item in events_response.json())

    export_response = await client.get("/api/v1/events/export/xlsx", headers=customer_headers)
    assert export_response.status_code == 200
    workbook = load_workbook(BytesIO(export_response.content))
    worksheet = workbook.active
    exported_rows = list(worksheet.iter_rows(values_only=True))
    workbook.close()
    assert len(exported_rows) >= 2
    assert exported_rows[0][7] == "Папка"
    assert all(row[7] == "Доступная папка" for row in exported_rows[1:])

    forbidden_response = await client.post(
        "/api/v1/equipment/folders",
        headers=customer_headers,
        json={"name": "Запрещенная папка"},
    )
    assert forbidden_response.status_code == 403
    assert forbidden_response.json()["detail"] == "Operator role is required."


@pytest.mark.anyio
async def test_mkair_sees_only_allowed_folders_and_events(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    allowed_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Папка МКАИР"},
    )
    forbidden_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Скрытая папка"},
    )
    assert allowed_folder_response.status_code == 201
    assert forbidden_folder_response.status_code == 201
    allowed_folder_id = allowed_folder_response.json()["id"]
    forbidden_folder_id = forbidden_folder_response.json()["id"]

    create_mkair_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Mkair",
            "last_name": "Scoped",
            "email": "mkair-scoped@example.com",
            "role": "MKAIR",
            "is_active": True,
            "allowed_folder_ids": [allowed_folder_id],
        },
    )
    assert create_mkair_response.status_code == 201
    mkair_password = create_mkair_response.json()["temporary_password"]
    mkair = await login_user(client, email="mkair-scoped@example.com", password=mkair_password)
    mkair_headers = {"Authorization": f"Bearer {mkair['access_token']}"}

    allowed_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=admin_headers,
        json={
            "folder_id": allowed_folder_id,
            "object_name": "ХАЛ",
            "equipment_type": "OTHER",
            "name": "Разрешенный прибор",
            "status": "IN_WORK",
        },
    )
    forbidden_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=admin_headers,
        json={
            "folder_id": forbidden_folder_id,
            "object_name": "ХАЛ",
            "equipment_type": "OTHER",
            "name": "Скрытый прибор",
            "status": "IN_WORK",
        },
    )
    assert allowed_equipment_response.status_code == 201
    assert forbidden_equipment_response.status_code == 201

    folders_response = await client.get("/api/v1/equipment/folders", headers=mkair_headers)
    assert folders_response.status_code == 200
    assert [folder["id"] for folder in folders_response.json()] == [allowed_folder_id]

    equipment_response = await client.get("/api/v1/equipment", headers=mkair_headers)
    assert equipment_response.status_code == 200
    assert [item["folder_id"] for item in equipment_response.json()] == [allowed_folder_id]
    assert [item["name"] for item in equipment_response.json()] == ["Разрешенный прибор"]

    equipment_page_response = await client.get(
        "/api/v1/equipment/page?limit=50&offset=0",
        headers=mkair_headers,
    )
    assert equipment_page_response.status_code == 200
    equipment_page = equipment_page_response.json()
    assert equipment_page["total"] == 1
    assert [item["folder_id"] for item in equipment_page["items"]] == [allowed_folder_id]
    assert [item["name"] for item in equipment_page["items"]] == ["Разрешенный прибор"]

    create_in_forbidden_folder_response = await client.post(
        "/api/v1/equipment",
        headers=mkair_headers,
        json={
            "folder_id": forbidden_folder_id,
            "object_name": "ХАЛ",
            "equipment_type": "OTHER",
            "name": "Не должен создаться",
            "status": "IN_WORK",
        },
    )
    assert create_in_forbidden_folder_response.status_code == 404

    events_response = await client.get("/api/v1/events?limit=50", headers=mkair_headers)
    assert events_response.status_code == 200
    assert events_response.json()
    assert all(item["folder_id"] == allowed_folder_id for item in events_response.json())


@pytest.mark.anyio
async def test_mkair_created_folder_becomes_allowed_for_author(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    existing_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Разрешенная папка МКАИР"},
    )
    assert existing_folder_response.status_code == 201
    existing_folder_id = existing_folder_response.json()["id"]

    create_mkair_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Folder",
            "last_name": "Owner",
            "email": "mkair-folder-owner@example.com",
            "role": "MKAIR",
            "is_active": True,
            "allowed_folder_ids": [existing_folder_id],
        },
    )
    assert create_mkair_response.status_code == 201
    mkair_password = create_mkair_response.json()["temporary_password"]
    mkair = await login_user(
        client,
        email="mkair-folder-owner@example.com",
        password=mkair_password,
    )
    mkair_headers = {"Authorization": f"Bearer {mkair['access_token']}"}

    create_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=mkair_headers,
        json={"name": "Новая папка МКАИР"},
    )
    assert create_folder_response.status_code == 201
    created_folder_id = create_folder_response.json()["id"]

    me_response = await client.get("/api/v1/auth/me", headers=mkair_headers)
    assert me_response.status_code == 200
    assert set(me_response.json()["allowed_folder_ids"]) == {
        existing_folder_id,
        created_folder_id,
    }

    folders_response = await client.get("/api/v1/equipment/folders", headers=mkair_headers)
    assert folders_response.status_code == 200
    assert {folder["id"] for folder in folders_response.json()} == {
        existing_folder_id,
        created_folder_id,
    }


@pytest.mark.anyio
async def test_operator_can_search_arshin_and_si_requires_profile(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    async def fake_search(
        self: ArshinService,
        *,
        payload,
    ):
        assert payload.certificate_number == "AA 001234"
        return [
            ArshinSearchResultRead(
                vri_id="1-SI-SEARCH",
                arshin_url="https://fgis.gost.ru/fundmetrology/cm/results/1-SI-SEARCH",
                mit_title="Манометр",
                mit_notation="DM2005",
                mi_modification="серия 5",
                mi_number="SN-7788",
                result_docnum="AA 001234",
                applicability=True,
                verification_date="2026-03-10T00:00:00",
                valid_date="2027-03-10T00:00:00",
                raw_payload_json={"mocked": True},
            )
        ]

    async def fake_get_vri_detail(self: ArshinService, *, vri_id: str):
        assert vri_id == "1-SI-SEARCH"
        return ArshinVriDetailRead(
            vri_id=vri_id,
            arshin_url="https://fgis.gost.ru/fundmetrology/cm/results/1-SI-SEARCH",
            certificate_number="AA 001234",
            reg_number="60026-15",
            type_designation="201, 523",
            type_name="Скобы с отсчетным устройством",
            serial_number="00024605",
            manufacture_year=2020,
            modification="серии 523",
            organization='АО "АПЗ"',
            verification_date="07.03.2026",
            valid_until="06.03.2027",
            is_usable=True,
            raw_payload_json={"detail": True},
        )

    monkeypatch.setattr(ArshinService, "search", fake_search)
    monkeypatch.setattr(ArshinService, "get_vri_detail", fake_get_vri_detail)

    search_response = await client.post(
        "/api/v1/arshin/search",
        headers=headers,
        json={
            "certificate_number": "AA 001234",
        },
    )
    assert search_response.status_code == 200
    assert search_response.json()[0]["vri_id"] == "1-SI-SEARCH"
    assert search_response.json()[0]["mi_modification"] == "серия 5"
    assert search_response.json()[0]["applicability"] is True

    detail_response = await client.get(
        "/api/v1/arshin/vri/1-SI-SEARCH",
        headers=headers,
    )
    assert detail_response.status_code == 200
    assert detail_response.json()["modification"] == "серии 523"

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "СИ"},
    )
    folder = folder_response.json()

    invalid_create = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Узел учета",
            "equipment_type": "SI",
            "name": "Манометр",
            "status": "IN_WORK",
        },
    )
    assert invalid_create.status_code == 422
    assert (
        invalid_create.json()["detail"]
        == "SI and ESI equipment must be created from an Arshin search result."
    )


@pytest.mark.anyio
async def test_customer_can_use_arshin_but_cannot_create_si_from_search_result(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    async def fake_search(
        self: ArshinService,
        *,
        payload,
    ):
        assert payload.certificate_number == "AA 001234"
        return [
            ArshinSearchResultRead(
                vri_id="1-SI-CUSTOMER",
                arshin_url="https://fgis.gost.ru/fundmetrology/cm/results/1-SI-CUSTOMER",
                mit_title="Манометр",
                mit_notation="DM2005",
                mi_modification="серия 5",
                mi_number="SN-9900",
                result_docnum="AA 001234",
                applicability=True,
                verification_date="2026-03-10T00:00:00",
                valid_date="2027-03-10T00:00:00",
                raw_payload_json={"mocked": True},
            )
        ]

    async def fake_get_vri_detail(self: ArshinService, *, vri_id: str):
        assert vri_id == "1-SI-CUSTOMER"
        return ArshinVriDetailRead(
            vri_id=vri_id,
            arshin_url="https://fgis.gost.ru/fundmetrology/cm/results/1-SI-CUSTOMER",
            certificate_number="AA 001234",
            reg_number="60026-15",
            type_designation="201, 523",
            type_name="Скобы с отсчетным устройством",
            serial_number="SN-9900",
            manufacture_year=2020,
            modification="серии 523",
            organization='АО "АПЗ"',
            verification_date="07.03.2026",
            valid_until="06.03.2027",
            is_usable=True,
            raw_payload_json={
                "miInfo": {
                    "singleMI": {
                        "mitypeNumber": "60026-15",
                        "mitypeTitle": "Скобы с отсчетным устройством",
                        "mitypeType": "201, 523",
                        "manufactureNum": "SN-9900",
                        "manufactureYear": 2020,
                        "modification": "серии 523",
                    }
                }
            },
        )

    monkeypatch.setattr(ArshinService, "search", fake_search)
    monkeypatch.setattr(ArshinService, "get_vri_detail", fake_get_vri_detail)

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Аршин заказчика"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    create_customer_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Customer",
            "last_name": "Arshin",
            "email": "customer-arshin@example.com",
            "role": "CUSTOMER",
            "is_active": True,
            "allowed_folder_ids": [folder["id"]],
        },
    )
    assert create_customer_response.status_code == 201
    customer_password = create_customer_response.json()["temporary_password"]
    customer = await login_user(
        client,
        email="customer-arshin@example.com",
        password=customer_password,
    )
    customer_headers = {"Authorization": f"Bearer {customer['access_token']}"}

    search_response = await client.post(
        "/api/v1/arshin/search",
        headers=customer_headers,
        json={"certificate_number": "AA 001234"},
    )
    assert search_response.status_code == 200
    assert search_response.json()[0]["vri_id"] == "1-SI-CUSTOMER"

    detail_response = await client.get(
        "/api/v1/arshin/vri/1-SI-CUSTOMER",
        headers=customer_headers,
    )
    assert detail_response.status_code == 200
    detail_payload = detail_response.json()

    create_si_response = await client.post(
        "/api/v1/equipment",
        headers=customer_headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "SI",
            "name": "Манометр",
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "1-SI-CUSTOMER",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/1-SI-CUSTOMER",
                "mit_number": detail_payload["reg_number"],
                "mit_title": detail_payload["type_name"],
                "mit_notation": detail_payload["type_designation"],
                "mi_number": detail_payload["serial_number"],
                "result_docnum": detail_payload["certificate_number"],
                "verification_date": "2026-03-07T00:00:00",
                "valid_date": "2027-03-06T00:00:00",
                "raw_payload_json": {"mocked": True},
                "detail_payload_json": detail_payload["raw_payload_json"],
            },
        },
    )
    assert create_si_response.status_code == 403
    assert (
        create_si_response.json()["detail"]
        == "Equipment creation is not available for this account."
    )

    create_other_response = await client.post(
        "/api/v1/equipment",
        headers=customer_headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "OTHER",
            "name": "Не из Аршина",
            "status": "IN_WORK",
        },
    )
    assert create_other_response.status_code == 403
    assert (
        create_other_response.json()["detail"]
        == "Equipment creation is not available for this account."
    )


@pytest.mark.anyio
async def test_operator_can_search_arshin_with_extended_filters(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    async def fake_search(self: ArshinService, *, payload):
        assert payload.search == "манометр"
        assert payload.mit_number == "60026-15"
        assert payload.mi_number == "00024605"
        assert payload.applicability is True
        assert str(payload.verification_date) == "2026-03-07"
        assert str(payload.valid_date) == "2027-03-06"
        return [
            ArshinSearchResultRead(
                vri_id="1-SI-EXTENDED",
                arshin_url="https://fgis.gost.ru/fundmetrology/cm/results/1-SI-EXTENDED",
                mit_number="60026-15",
                mit_title="Скобы с отсчетным устройством",
                mit_notation="201, 523",
                mi_modification="серии 523",
                mi_number="00024605",
                result_docnum="CERT-EXT-1",
                applicability=True,
                verification_date="2026-03-07T00:00:00",
                valid_date="2027-03-06T00:00:00",
                raw_payload_json={"extended": True},
            )
        ]

    monkeypatch.setattr(ArshinService, "search", fake_search)

    response = await client.post(
        "/api/v1/arshin/search",
        headers=headers,
        json={
            "search": "манометр",
            "mit_number": "60026-15",
            "mi_number": "00024605",
            "applicability": True,
            "verification_date": "2026-03-07",
            "valid_date": "2027-03-06",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["vri_id"] == "1-SI-EXTENDED"
    assert payload[0]["applicability"] is True


@pytest.mark.anyio
async def test_operator_can_search_esi_and_create_equipment_from_registry_number(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    async def fake_search(self: ArshinService, *, payload):
        assert payload.registry_kind == ArshinRegistryKind.ESI
        assert payload.number == "10003.85.РЭ.00046"
        return [
            ArshinSearchResultRead(
                vri_id="rmieta-46",
                arshin_url=None,
                org_title="Тестовый ЮЛ РССТД 3",
                mit_number="10003-85",
                mit_title="Анализаторы",
                mit_notation="АКК-М-02",
                mi_modification="мод_1",
                mi_number="6467-10.04",
                result_docnum="10003.85.РЭ.00046",
                applicability=True,
                verification_date="2020-04-03T00:00:00",
                raw_payload_json={
                    "rmieta_id": "46",
                    "number": "10003.85.РЭ.00046",
                    "mitype_num": "10003-85",
                    "mitype": "Анализаторы",
                    "minotation": '["АКК-М-02"]',
                    "modification": "мод_1",
                    "factory_num": "6467-10.04",
                    "year": 2020,
                    "organization": "Тестовый ЮЛ РССТД 3",
                    "rankcode": "РЭ",
                    "npenumber": "гэт131-81",
                    "applicability": True,
                    "verification_date": "2020-04-03T00:00:00Z",
                },
            )
        ]

    monkeypatch.setattr(ArshinService, "search", fake_search)

    search_response = await client.post(
        "/api/v1/arshin/search",
        headers=headers,
        json={
            "registry_kind": "ESI",
            "number": "10003.85.РЭ.00046",
        },
    )
    assert search_response.status_code == 200
    search_payload = search_response.json()
    assert search_payload[0]["vri_id"] == "rmieta-46"
    assert search_payload[0]["result_docnum"] == "10003.85.РЭ.00046"
    assert search_payload[0]["arshin_url"] is None

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "ЭСИ"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    create_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Метрология",
            "equipment_type": "ESI",
            "name": "Анализаторы",
            "modification": "мод_1",
            "serial_number": "6467-10.04",
            "manufacture_year": 2020,
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "rmieta-46",
                "org_title": "Тестовый ЮЛ РССТД 3",
                "mit_number": "10003-85",
                "mit_title": "Анализаторы",
                "mit_notation": "АКК-М-02",
                "mi_number": "6467-10.04",
                "result_docnum": "10003.85.РЭ.00046",
                "verification_date": "2020-04-03T00:00:00",
                "raw_payload_json": search_payload[0]["raw_payload_json"],
            },
        },
    )
    assert create_response.status_code == 201
    created = create_response.json()
    assert created["equipment_type"] == "ESI"
    assert created["si_verification"]["result_docnum"] == "10003.85.РЭ.00046"
    assert created["si_verification"]["detail_payload_json"] is None


@pytest.mark.anyio
async def test_operator_can_create_verification_for_esi_and_see_it_in_queue(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "ЭСИ поверка"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Лаборатория",
            "equipment_type": "ESI",
            "name": "Анализаторы",
            "modification": "мод_1",
            "serial_number": "6467-10.04",
            "manufacture_year": 2020,
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "rmieta-46",
                "org_title": "Тестовый ЮЛ РССТД 3",
                "mit_number": "10003-85",
                "mit_title": "Анализаторы",
                "mit_notation": "АКК-М-02",
                "mi_number": "6467-10.04",
                "result_docnum": "10003.85.РЭ.00046",
                "verification_date": "2020-04-03T00:00:00",
                "raw_payload_json": {
                    "rmieta_id": "46",
                    "number": "10003.85.РЭ.00046",
                    "mitype_num": "10003-85",
                    "mitype": "Анализаторы",
                    "minotation": '["АКК-М-02"]',
                    "modification": "мод_1",
                    "factory_num": "6467-10.04",
                    "year": 2020,
                },
            },
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    create_verification_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/verification",
        headers=headers,
        data={
            "route_city": "Иркутск",
            "route_destination": "ЦСМ",
            "sent_to_verification_at": "2026-03-15",
        },
    )
    assert create_verification_response.status_code == 201

    queue_response = await client.get(
        f"/api/v1/equipment/verifications?lifecycle_status=active&folder_id={folder['id']}",
        headers=headers,
    )
    assert queue_response.status_code == 200
    queue_payload = queue_response.json()
    assert len(queue_payload) == 1
    assert queue_payload[0]["equipment_type"] == "ESI"
    assert queue_payload[0]["result_docnum"] == "10003.85.РЭ.00046"


@pytest.mark.anyio
async def test_operator_can_refresh_si_card_with_new_certificate(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "СИ обновление"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "SI",
            "name": "Скобы",
            "modification": "старое обозначение",
            "serial_number": "OLD-001",
            "manufacture_year": 2018,
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "vri-old-1",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/vri-old-1",
                "org_title": "Старый поверитель",
                "mit_number": "10000-01",
                "mit_title": "Старый тип",
                "mit_notation": "старое обозначение",
                "mi_number": "OLD-001",
                "result_docnum": "OLD-CERT-1",
                "verification_date": "2025-03-01T00:00:00",
                "valid_date": "2026-03-01T00:00:00",
                "raw_payload_json": {"source": "old"},
                "detail_payload_json": {
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "10000-01",
                            "mitypeTitle": "Старый тип",
                            "mitypeType": "обозначение старое",
                            "manufactureNum": "OLD-001",
                            "manufactureYear": 2018,
                            "modification": "старое обозначение",
                        }
                    },
                    "vriInfo": {
                        "organization": "Старый поверитель",
                        "vrfDate": "2025-03-01",
                        "validDate": "2026-03-01",
                        "applicable": {"certNum": "OLD-CERT-1"},
                    },
                },
            },
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    refresh_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/si/refresh",
        headers=headers,
        json={
            "si_verification": {
                "vri_id": "vri-new-1",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/vri-new-1",
                "org_title": 'АО "АПЗ"',
                "mit_number": "60026-15",
                "mit_title": "Скобы с отсчетным устройством",
                "mit_notation": "201, 523",
                "mi_number": "00024605",
                "result_docnum": "С-АСГ/07-03-2026/509468383",
                "verification_date": "2026-03-07T00:00:00",
                "valid_date": "2027-03-06T00:00:00",
                "raw_payload_json": {"source": "new-search"},
                "detail_payload_json": {
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "60026-15",
                            "mitypeTitle": "Скобы с отсчетным устройством",
                            "mitypeType": "201, 523",
                            "manufactureNum": "00024605",
                            "manufactureYear": 2020,
                            "modification": "серии 523",
                        }
                    },
                    "vriInfo": {
                        "organization": 'АО "АПЗ"',
                        "vrfDate": "2026-03-07",
                        "validDate": "2027-03-06",
                        "applicable": {"certNum": "С-АСГ/07-03-2026/509468383"},
                    },
                },
            }
        },
    )
    assert refresh_response.status_code == 200
    refreshed = refresh_response.json()
    assert refreshed["name"] == "Скобы с отсчетным устройством"
    assert refreshed["modification"] == "серии 523"
    assert refreshed["serial_number"] == "00024605"
    assert refreshed["manufacture_year"] == 2020
    assert refreshed["si_verification"]["vri_id"] == "vri-new-1"
    assert refreshed["si_verification"]["result_docnum"] == "С-АСГ/07-03-2026/509468383"
    assert refreshed["si_verification"]["mit_notation"] == "201, 523"
    assert (
        refreshed["si_verification"]["detail_payload_json"]["miInfo"]["singleMI"]["modification"]
        == "серии 523"
    )


@pytest.mark.anyio
async def test_refresh_si_uses_manual_verification_interval_override(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Refresh c ручным интервалом"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "SI",
            "name": "Скоба",
            "status": "IN_WORK",
            "manual_verification_interval_months": 12,
            "si_verification": {
                "vri_id": "refresh-manual-interval-old",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/refresh-manual-interval-old",
                "mit_number": "60026-15",
                "mit_title": "Скобы",
                "mit_notation": "201",
                "mi_number": "00024605",
                "result_docnum": "OLD-CERT-2",
                "verification_date": "2025-03-07T00:00:00",
                "valid_date": "2026-03-06T00:00:00",
                "raw_payload_json": {"source": "old"},
                "detail_payload_json": {
                    "vriInfo": {"validDate": "2026-03-06", "vrfDate": "2025-03-07"}
                },
            },
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    refresh_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/si/refresh",
        headers=headers,
        json={
            "si_verification": {
                "vri_id": "refresh-manual-interval-new",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/refresh-manual-interval-new",
                "org_title": 'АО "АПЗ"',
                "mit_number": "60026-15",
                "mit_title": "Скобы с отсчетным устройством",
                "mit_notation": "201, 523",
                "mi_number": "00024605",
                "result_docnum": "С-АСГ/07-03-2026/509468383",
                "verification_date": "2026-03-07T00:00:00",
                "valid_date": "2031-03-06T00:00:00",
                "raw_payload_json": {"source": "new-search"},
                "detail_payload_json": {
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "60026-15",
                            "mitypeTitle": "Скобы с отсчетным устройством",
                            "mitypeType": "201, 523",
                            "manufactureNum": "00024605",
                            "manufactureYear": 2020,
                            "modification": "серии 523",
                        }
                    },
                    "vriInfo": {
                        "organization": 'АО "АПЗ"',
                        "vrfDate": "2026-03-07",
                        "validDate": "2031-03-06",
                        "applicable": {"certNum": "С-АСГ/07-03-2026/509468383"},
                    },
                },
            }
        },
    )
    assert refresh_response.status_code == 200
    refreshed = refresh_response.json()
    assert refreshed["manual_verification_interval_months"] == 12
    assert refreshed["si_verification"]["verification_date"] == "2026-03-07T00:00:00"
    assert refreshed["si_verification"]["valid_date"] == "2027-03-06T00:00:00"


@pytest.mark.anyio
async def test_operator_can_bulk_import_si_from_excel(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Массовый импорт СИ"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()
    search_calls: dict[str, int | None] = {}

    async def fake_search_by_certificate(
        self: ArshinService,
        *,
        certificate_number: str,
        year: int | None = None,
    ):
        search_calls[certificate_number] = year
        if certificate_number == "CERT-OK-1":
            return [
                ArshinSearchResultRead(
                    vri_id="vri-bulk-1",
                    arshin_url="https://fgis.gost.ru/fundmetrology/cm/results/vri-bulk-1",
                    org_title='АО "АПЗ"',
                    mit_number="60026-15",
                    mit_title="Скобы с отсчетным устройством",
                    mit_notation="201, 523",
                    mi_modification="серии 523",
                    mi_number="00024605",
                    result_docnum="CERT-OK-1",
                    verification_date="2026-03-07T00:00:00",
                    valid_date="2027-03-06T00:00:00",
                    raw_payload_json={"certificate": certificate_number},
                )
            ]
        return []

    async def fake_get_vri_detail(self: ArshinService, *, vri_id: str):
        assert vri_id == "vri-bulk-1"
        return ArshinVriDetailRead(
            vri_id=vri_id,
            arshin_url="https://fgis.gost.ru/fundmetrology/cm/results/vri-bulk-1",
            certificate_number="CERT-OK-1",
            organization='АО "АПЗ"',
            reg_number="60026-15",
            type_designation="201, 523",
            type_name="Скобы с отсчетным устройством",
            serial_number="00024605",
            manufacture_year=2020,
            modification="серии 523",
            verification_date="07.03.2026",
            valid_until="06.03.2027",
            raw_payload_json={
                "miInfo": {
                    "singleMI": {
                        "mitypeNumber": "60026-15",
                        "mitypeTitle": "Скобы с отсчетным устройством",
                        "mitypeType": "201, 523",
                        "manufactureNum": "00024605",
                        "manufactureYear": 2020,
                        "modification": "серии 523",
                    }
                },
                "vriInfo": {
                    "organization": 'АО "АПЗ"',
                    "vrfDate": "2026-03-07",
                    "validDate": "2027-03-06",
                    "applicable": {"certNum": "CERT-OK-1"},
                },
            },
        )

    monkeypatch.setattr(ArshinService, "search_by_certificate", fake_search_by_certificate)
    monkeypatch.setattr(ArshinService, "get_vri_detail", fake_get_vri_detail)

    workbook = Workbook()
    sheet = workbook.active
    sheet["A1"] = "Служебная строка"
    sheet["B2"] = "Еще заголовок"
    sheet["D3"] = "Не тот столбец"
    sheet["A4"] = "Пояснение"
    sheet["B5"] = "Документ"
    sheet["C5"] = "Наименование"
    sheet["D5"] = "Дата поверки"
    sheet["E5"] = "Примечание"
    sheet["B6"] = "CERT-OK-1"
    sheet["C6"] = "Скобы"
    sheet["D6"] = "12/01/2025"
    sheet["B7"] = "CERT-OK-1"
    sheet["C7"] = "Дубликат"
    sheet["D7"] = "12/01/2025"
    sheet["B8"] = "CERT-MISSING"
    sheet["C8"] = "Не найдено"
    sheet["D8"] = "05.02.2024"

    from io import BytesIO

    stream = BytesIO()
    workbook.save(stream)
    workbook.close()
    stream.seek(0)

    response = await client.post(
        "/api/v1/equipment/si/import",
        headers=headers,
        data={
            "folder_id": str(folder["id"]),
            "object_name": "ХАЛ Северный",
            "status_value": "IN_WORK",
            "current_location_manual": "Поступило по Excel",
        },
        files={
            "file": (
                "si-certificates.xlsx",
                stream.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["total_rows"] == 3
    assert payload["created_count"] == 1
    assert payload["skipped_count"] == 1
    assert payload["error_count"] == 1
    assert payload["rows"][0]["row_number"] == 6
    assert payload["rows"][0]["status"] == "created"
    assert payload["rows"][0]["vri_id"] == "vri-bulk-1"
    assert payload["rows"][1]["row_number"] == 7
    assert payload["rows"][1]["status"] == "skipped"
    assert payload["rows"][2]["row_number"] == 8
    assert payload["rows"][2]["status"] == "error"
    assert search_calls == {
        "CERT-OK-1": 2025,
        "CERT-MISSING": 2024,
    }

    equipment_list_response = await client.get(
        f"/api/v1/equipment?folder_id={folder['id']}",
        headers=headers,
    )
    assert equipment_list_response.status_code == 200
    items = equipment_list_response.json()
    assert len(items) == 1
    assert items[0]["equipment_type"] == "SI"
    assert items[0]["object_name"] == "ХАЛ Северный"
    assert items[0]["si_verification"]["result_docnum"] == "CERT-OK-1"


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


@pytest.mark.anyio
async def test_equipment_attachments_can_be_uploaded_listed_and_downloaded(
    client: AsyncClient,
    db_engine,
    tmp_path,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Вложения"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Лаборатория",
            "equipment_type": "OTHER",
            "name": "Насос",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    original_dir = settings.attachment_storage_dir
    settings.attachment_storage_dir = str(tmp_path / "attachments")
    settings.__dict__.pop("attachment_storage_path", None)

    try:
        upload_response = await client.post(
            f"/api/v1/equipment/{equipment['id']}/attachments",
            headers=headers,
            files={"file": ("passport.pdf", b"test attachment payload", "application/pdf")},
        )
        assert upload_response.status_code == 201
        attachment = upload_response.json()
        assert attachment["file_name"] == "passport.pdf"
        assert attachment["uploaded_by_display_name"]
        assert attachment["file_size"] == len(b"test attachment payload")

        list_response = await client.get(
            f"/api/v1/equipment/{equipment['id']}/attachments",
            headers=headers,
        )
        assert list_response.status_code == 200
        attachments = list_response.json()
        assert len(attachments) == 1
        assert attachments[0]["id"] == attachment["id"]

        download_response = await client.get(
            f"/api/v1/equipment/{equipment['id']}/attachments/{attachment['id']}/download",
            headers=headers,
        )
        assert download_response.status_code == 200
        assert download_response.content == b"test attachment payload"
        assert 'attachment; filename="passport.pdf"' in (
            download_response.headers.get("content-disposition") or ""
        )

        delete_response = await client.delete(
            f"/api/v1/equipment/{equipment['id']}/attachments/{attachment['id']}",
            headers=headers,
        )
        assert delete_response.status_code == 204

        attachments_after_delete = await client.get(
            f"/api/v1/equipment/{equipment['id']}/attachments",
            headers=headers,
        )
        assert attachments_after_delete.status_code == 200
        assert attachments_after_delete.json() == []

        download_after_delete = await client.get(
            f"/api/v1/equipment/{equipment['id']}/attachments/{attachment['id']}/download",
            headers=headers,
        )
        assert download_after_delete.status_code == 404
    finally:
        settings.attachment_storage_dir = original_dir
        settings.__dict__.pop("attachment_storage_path", None)


@pytest.mark.anyio
async def test_uploaded_equipment_photo_is_compressed_before_storage(
    client: AsyncClient,
    db_engine,
    tmp_path,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Сжатие фото"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Лаборатория",
            "equipment_type": "OTHER",
            "name": "Фотофиксация",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    original_dir = settings.attachment_storage_dir
    settings.attachment_storage_dir = str(tmp_path / "compressed-attachments")
    settings.__dict__.pop("attachment_storage_path", None)

    original_payload = build_large_test_jpeg()

    try:
        upload_response = await client.post(
            f"/api/v1/equipment/{equipment['id']}/attachments",
            headers=headers,
            files={"file": ("large-photo.jpg", original_payload, "image/jpeg")},
        )
        assert upload_response.status_code == 201
        attachment = upload_response.json()
        assert attachment["file_name"] == "large-photo.jpg"
        assert attachment["file_size"] < len(original_payload)
        assert attachment["file_size"] <= settings.attachment_image_target_size_bytes

        download_response = await client.get(
            f"/api/v1/equipment/{equipment['id']}/attachments/{attachment['id']}/download",
            headers=headers,
        )
        assert download_response.status_code == 200
        assert len(download_response.content) == attachment["file_size"]

        with Image.open(BytesIO(download_response.content)) as downloaded_image:
            assert downloaded_image.format == "JPEG"
            assert max(downloaded_image.size) <= settings.attachment_image_max_dimension_pixels
    finally:
        settings.attachment_storage_dir = original_dir
        settings.__dict__.pop("attachment_storage_path", None)


@pytest.mark.anyio
async def test_equipment_attachment_upload_rejects_oversized_file(
    client: AsyncClient,
    db_engine,
    tmp_path,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Лимит вложений"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Лаборатория",
            "equipment_type": "OTHER",
            "name": "Манометр",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    original_dir = settings.attachment_storage_dir
    original_limit = settings.upload_max_file_size_bytes
    settings.attachment_storage_dir = str(tmp_path / "attachments-limit")
    settings.upload_max_file_size_bytes = 8
    settings.__dict__.pop("attachment_storage_path", None)

    try:
        upload_response = await client.post(
            f"/api/v1/equipment/{equipment['id']}/attachments",
            headers=headers,
            files={"file": ("too-large.pdf", b"123456789", "application/pdf")},
        )
        assert upload_response.status_code == 413
        assert "Maximum allowed size" in upload_response.json()["detail"]

        list_response = await client.get(
            f"/api/v1/equipment/{equipment['id']}/attachments",
            headers=headers,
        )
        assert list_response.status_code == 200
        assert list_response.json() == []
    finally:
        settings.attachment_storage_dir = original_dir
        settings.upload_max_file_size_bytes = original_limit
        settings.__dict__.pop("attachment_storage_path", None)


@pytest.mark.anyio
async def test_equipment_comments_can_be_created_and_listed(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Комментарии"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Лаборатория",
            "equipment_type": "OTHER",
            "name": "Компрессор",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    create_comment_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/comments",
        headers=headers,
        json={"text": "Прибор осмотрен, внешних повреждений не выявлено."},
    )
    assert create_comment_response.status_code == 201
    comment = create_comment_response.json()
    assert comment["text"] == "Прибор осмотрен, внешних повреждений не выявлено."
    assert comment["author_display_name"]

    list_comments_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/comments",
        headers=headers,
    )
    assert list_comments_response.status_code == 200
    comments = list_comments_response.json()
    assert len(comments) == 1
    assert comments[0]["id"] == comment["id"]
    assert comments[0]["text"] == comment["text"]

    update_comment_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}/comments/{comment['id']}",
        headers=headers,
        json={"text": "Комментарий уточнен после повторного осмотра."},
    )
    assert update_comment_response.status_code == 200
    updated_comment = update_comment_response.json()
    assert updated_comment["text"] == "Комментарий уточнен после повторного осмотра."

    delete_comment_response = await client.delete(
        f"/api/v1/equipment/{equipment['id']}/comments/{comment['id']}",
        headers=headers,
    )
    assert delete_comment_response.status_code == 204

    comments_after_delete_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/comments",
        headers=headers,
    )
    assert comments_after_delete_response.status_code == 200
    assert comments_after_delete_response.json() == []


@pytest.mark.anyio
async def test_customer_cannot_create_or_view_private_equipment_comments(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Приватные комментарии"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=admin_headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Лаборатория",
            "equipment_type": "OTHER",
            "name": "Компрессор",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    created_customer = await create_user_via_api(
        client,
        admin_access_token=admin["access_token"],
        first_name="Петр",
        last_name="Заказчик",
        email="private-comment-customer@example.com",
        role="CUSTOMER",
        allowed_folder_ids=[folder["id"]],
    )
    customer = await login_user(
        client,
        email="private-comment-customer@example.com",
        password=created_customer["temporary_password"],
    )
    customer_headers = {"Authorization": f"Bearer {customer['access_token']}"}

    create_private_as_customer_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/comments",
        headers=customer_headers,
        json={"text": "Не должен пройти.", "is_private": True},
    )
    assert create_private_as_customer_response.status_code == 403

    public_comment_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/comments",
        headers=admin_headers,
        json={"text": "Публичный комментарий."},
    )
    assert public_comment_response.status_code == 201

    private_comment_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/comments",
        headers=admin_headers,
        json={"text": "Приватный комментарий.", "is_private": True},
    )
    assert private_comment_response.status_code == 201
    assert private_comment_response.json()["is_private"] is True

    admin_list_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/comments",
        headers=admin_headers,
    )
    assert admin_list_response.status_code == 200
    assert len(admin_list_response.json()) == 2

    customer_list_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/comments",
        headers=customer_headers,
    )
    assert customer_list_response.status_code == 200
    customer_comments = customer_list_response.json()
    assert len(customer_comments) == 1
    assert customer_comments[0]["text"] == "Публичный комментарий."
    assert customer_comments[0]["is_private"] is False

    customer_details_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/details",
        headers=customer_headers,
    )
    assert customer_details_response.status_code == 200
    customer_details = customer_details_response.json()
    assert len(customer_details["comments"]) == 1
    assert customer_details["comments"][0]["text"] == "Публичный комментарий."


@pytest.mark.anyio
async def test_customer_cannot_view_private_repair_messages(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Приватный ремонт"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=admin_headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Ремонтная зона",
            "equipment_type": "OTHER",
            "name": "Насос",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    created_customer = await create_user_via_api(
        client,
        admin_access_token=admin["access_token"],
        first_name="Олег",
        last_name="Заказчик",
        email="private-repair-customer@example.com",
        role="CUSTOMER",
        allowed_folder_ids=[folder["id"]],
    )
    customer = await login_user(
        client,
        email="private-repair-customer@example.com",
        password=created_customer["temporary_password"],
    )
    customer_headers = {"Authorization": f"Bearer {customer['access_token']}"}

    create_repair_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=admin_headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Иркутск",
            "sent_to_repair_at": "2026-04-01",
        },
    )
    assert create_repair_response.status_code == 201

    public_message_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair/messages",
        headers=admin_headers,
        data={"text": "Публичное сообщение ремонта."},
    )
    assert public_message_response.status_code == 201

    private_message_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair/messages",
        headers=admin_headers,
        data={"text": "Приватное сообщение ремонта.", "is_private": "true"},
    )
    assert private_message_response.status_code == 201
    assert private_message_response.json()["is_private"] is True

    customer_messages_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/repair/messages",
        headers=customer_headers,
    )
    assert customer_messages_response.status_code == 200
    customer_messages = customer_messages_response.json()
    assert len(customer_messages) == 1
    assert customer_messages[0]["text"] == "Публичное сообщение ремонта."

    customer_details_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/details",
        headers=customer_headers,
    )
    assert customer_details_response.status_code == 200
    assert customer_details_response.json()["active_repair_message_count"] == 1


@pytest.mark.anyio
async def test_customer_cannot_view_private_verification_messages(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Приватная поверка"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=admin_headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Поверочная зона",
            "equipment_type": "SI",
            "name": "Манометр",
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "1-SI-PRIVATE-CHECK",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/1-SI-PRIVATE-CHECK",
                "org_title": "ФБУ Тест",
                "mit_number": "12345-01",
                "mit_title": "Манометры",
                "mit_notation": "МП-1",
                "mi_number": "SN-PRIVATE-001",
                "result_docnum": "AA 001999",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "12345-01",
                            "mitypeTitle": "Манометры",
                            "manufactureNum": "SN-PRIVATE-001",
                        }
                    }
                },
            },
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    created_customer = await create_user_via_api(
        client,
        admin_access_token=admin["access_token"],
        first_name="Сергей",
        last_name="Заказчик",
        email="private-verification-customer@example.com",
        role="CUSTOMER",
        allowed_folder_ids=[folder["id"]],
    )
    customer = await login_user(
        client,
        email="private-verification-customer@example.com",
        password=created_customer["temporary_password"],
    )
    customer_headers = {"Authorization": f"Bearer {customer['access_token']}"}

    create_verification_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/verification",
        headers=admin_headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Иркутск",
            "sent_to_verification_at": "2026-04-01",
        },
    )
    assert create_verification_response.status_code == 201

    public_message_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/verification/messages",
        headers=admin_headers,
        data={"text": "Публичное сообщение поверки."},
    )
    assert public_message_response.status_code == 201

    private_message_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/verification/messages",
        headers=admin_headers,
        data={"text": "Приватное сообщение поверки.", "is_private": "true"},
    )
    assert private_message_response.status_code == 201
    assert private_message_response.json()["is_private"] is True

    customer_messages_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/verification/messages",
        headers=customer_headers,
    )
    assert customer_messages_response.status_code == 200
    customer_messages = customer_messages_response.json()
    assert len(customer_messages) == 1
    assert customer_messages[0]["text"] == "Публичное сообщение поверки."

    customer_details_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/details",
        headers=customer_headers,
    )
    assert customer_details_response.status_code == 200
    assert customer_details_response.json()["active_verification_message_count"] == 1


@pytest.mark.anyio
async def test_equipment_comment_attachments_can_be_uploaded_and_downloaded(
    client: AsyncClient,
    db_engine,
    tmp_path,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Комментарии с файлами"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Лаборатория",
            "equipment_type": "OTHER",
            "name": "Калибратор",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    original_dir = settings.attachment_storage_dir
    settings.attachment_storage_dir = str(tmp_path / "comment-attachments")
    settings.__dict__.pop("attachment_storage_path", None)

    try:
        create_comment_response = await client.post(
            f"/api/v1/equipment/{equipment['id']}/comments",
            headers=headers,
            data={"text": "Добавил фото шильдика и акт осмотра."},
            files=[
                ("files", ("nameplate.jpg", b"image-bytes", "image/jpeg")),
                ("files", ("inspection.txt", b"inspection payload", "text/plain")),
            ],
        )
        assert create_comment_response.status_code == 201
        comment = create_comment_response.json()
        assert comment["text"] == "Добавил фото шильдика и акт осмотра."
        assert len(comment["attachments"]) == 2

        list_comments_response = await client.get(
            f"/api/v1/equipment/{equipment['id']}/comments",
            headers=headers,
        )
        assert list_comments_response.status_code == 200
        comments = list_comments_response.json()
        assert len(comments) == 1
        assert len(comments[0]["attachments"]) == 2

        attachment = comments[0]["attachments"][0]
        download_response = await client.get(
            (
                f"/api/v1/equipment/{equipment['id']}/comments/{comment['id']}"
                f"/attachments/{attachment['id']}/download"
            ),
            headers=headers,
        )
        assert download_response.status_code == 200
        assert download_response.content in {b"image-bytes", b"inspection payload"}

        delete_comment_response = await client.delete(
            f"/api/v1/equipment/{equipment['id']}/comments/{comment['id']}",
            headers=headers,
        )
        assert delete_comment_response.status_code == 204

        download_after_delete_response = await client.get(
            (
                f"/api/v1/equipment/{equipment['id']}/comments/{comment['id']}"
                f"/attachments/{attachment['id']}/download"
            ),
            headers=headers,
        )
        assert download_after_delete_response.status_code == 404
    finally:
        settings.attachment_storage_dir = original_dir
        settings.__dict__.pop("attachment_storage_path", None)


@pytest.mark.anyio
async def test_equipment_comment_draft_attachments_can_be_uploaded_before_submit(
    client: AsyncClient,
    db_engine,
    tmp_path,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Комментарии с предзагрузкой"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Лаборатория",
            "equipment_type": "OTHER",
            "name": "Осциллограф",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    original_dir = settings.attachment_storage_dir
    settings.attachment_storage_dir = str(tmp_path / "comment-draft-attachments")
    settings.__dict__.pop("attachment_storage_path", None)

    try:
        draft_upload_response = await client.post(
            f"/api/v1/equipment/{equipment['id']}/comment-uploads",
            headers=headers,
            files={"file": ("draft-photo.jpg", b"draft-photo-payload", "image/jpeg")},
        )
        assert draft_upload_response.status_code == 201
        draft_attachment = draft_upload_response.json()
        assert draft_attachment["file_name"] == "draft-photo.jpg"
        assert draft_attachment["upload_token"]

        delete_draft_response = await client.delete(
            (
                f"/api/v1/equipment/{equipment['id']}/comment-uploads/"
                f"{draft_attachment['upload_token']}"
            ),
            headers=headers,
        )
        assert delete_draft_response.status_code == 204

        second_draft_upload_response = await client.post(
            f"/api/v1/equipment/{equipment['id']}/comment-uploads",
            headers=headers,
            files={"file": ("draft-photo.jpg", b"draft-photo-payload", "image/jpeg")},
        )
        assert second_draft_upload_response.status_code == 201
        second_draft_attachment = second_draft_upload_response.json()

        create_comment_response = await client.post(
            f"/api/v1/equipment/{equipment['id']}/comments",
            headers=headers,
            files=[
                ("text", (None, "")),
                (
                    "uploaded_attachment_tokens",
                    (None, second_draft_attachment["upload_token"]),
                ),
            ],
        )
        assert create_comment_response.status_code == 201
        comment = create_comment_response.json()
        assert comment["text"] == ""
        assert len(comment["attachments"]) == 1
        attachment = comment["attachments"][0]
        assert attachment["file_name"] == "draft-photo.jpg"

        download_response = await client.get(
            (
                f"/api/v1/equipment/{equipment['id']}/comments/{comment['id']}"
                f"/attachments/{attachment['id']}/download"
            ),
            headers=headers,
        )
        assert download_response.status_code == 200
        assert download_response.content == b"draft-photo-payload"

        missing_draft_response = await client.delete(
            (
                f"/api/v1/equipment/{equipment['id']}/comment-uploads/"
                f"{second_draft_attachment['upload_token']}"
            ),
            headers=headers,
        )
        assert missing_draft_response.status_code == 404
    finally:
        settings.attachment_storage_dir = original_dir
        settings.__dict__.pop("attachment_storage_path", None)


@pytest.mark.anyio
async def test_equipment_comments_accept_frontend_multipart_payloads(
    client: AsyncClient,
    db_engine,
    tmp_path,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Комментарии multipart"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Лаборатория",
            "equipment_type": "OTHER",
            "name": "Мультиметр",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    original_dir = settings.attachment_storage_dir
    settings.attachment_storage_dir = str(tmp_path / "frontend-comment-payloads")
    settings.__dict__.pop("attachment_storage_path", None)

    try:
        text_response = await client.post(
            f"/api/v1/equipment/{equipment['id']}/comments",
            headers=headers,
            data={"text": "Комментарий из frontend FormData"},
            files=[("ignored", ("ignored.txt", b"ignored", "text/plain"))],
        )
        assert text_response.status_code == 201
        assert text_response.json()["text"] == "Комментарий из frontend FormData"
        assert text_response.json()["is_private"] is False
        assert text_response.json()["attachments"] == []

        attachment_response = await client.post(
            f"/api/v1/equipment/{equipment['id']}/comments",
            headers=headers,
            files=[("files", ("photo.jpg", b"photo-bytes", "image/jpeg"))],
        )
        assert attachment_response.status_code == 201
        attachment_comment = attachment_response.json()
        assert attachment_comment["text"] == ""
        assert len(attachment_comment["attachments"]) == 1
        assert attachment_comment["attachments"][0]["file_name"] == "photo.jpg"
    finally:
        settings.attachment_storage_dir = original_dir
        settings.__dict__.pop("attachment_storage_path", None)


@pytest.mark.anyio
async def test_equipment_comment_attachment_download_supports_unicode_file_names(
    client: AsyncClient,
    db_engine,
    tmp_path,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Unicode download"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Лаборатория",
            "equipment_type": "OTHER",
            "name": "PDF-протокол",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    original_dir = settings.attachment_storage_dir
    settings.attachment_storage_dir = str(tmp_path / "unicode-comment-attachments")
    settings.__dict__.pop("attachment_storage_path", None)

    try:
        create_comment_response = await client.post(
            f"/api/v1/equipment/{equipment['id']}/comments",
            headers=headers,
            data={"text": "Загрузил PDF с кириллицей в имени."},
            files=[
                (
                    "files",
                    ("Акт проверки 21 МБ.pdf", b"pdf payload", "application/pdf"),
                )
            ],
        )
        assert create_comment_response.status_code == 201
        comment = create_comment_response.json()
        attachment = comment["attachments"][0]

        download_response = await client.get(
            (
                f"/api/v1/equipment/{equipment['id']}/comments/{comment['id']}"
                f"/attachments/{attachment['id']}/download"
            ),
            headers=headers,
        )
        assert download_response.status_code == 200
        assert download_response.content == b"pdf payload"
        content_disposition = download_response.headers.get("content-disposition") or ""
        assert 'filename="download.pdf"' in content_disposition
        expected_file_name = quote("Акт проверки 21 МБ.pdf", safe="")
        assert f"filename*=UTF-8''{expected_file_name}" in content_disposition
    finally:
        settings.attachment_storage_dir = original_dir
        settings.__dict__.pop("attachment_storage_path", None)


@pytest.mark.anyio
async def test_equipment_details_endpoint_aggregates_related_data(
    client: AsyncClient,
    db_engine,
    tmp_path,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Карточка прибора"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Лаборатория",
            "equipment_type": "OTHER",
            "name": "Течеискатель",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    original_dir = settings.attachment_storage_dir
    settings.attachment_storage_dir = str(tmp_path / "equipment-details")
    settings.__dict__.pop("attachment_storage_path", None)

    try:
        upload_attachment_response = await client.post(
            f"/api/v1/equipment/{equipment['id']}/attachments",
            headers=headers,
            files={"file": ("passport.pdf", b"passport", "application/pdf")},
        )
        assert upload_attachment_response.status_code == 201

        create_comment_response = await client.post(
            f"/api/v1/equipment/{equipment['id']}/comments",
            headers=headers,
            data={"text": "Добавил комплект документов."},
            files=[("files", ("note.txt", b"comment attachment", "text/plain"))],
        )
        assert create_comment_response.status_code == 201

        subscription_response = await client.put(
            f"/api/v1/equipment/{equipment['id']}/process-subscription",
            headers=headers,
            json={"enabled": True},
        )
        assert subscription_response.status_code == 200
        assert subscription_response.json()["enabled"] is True

        details_response = await client.get(
            f"/api/v1/equipment/{equipment['id']}/details",
            headers=headers,
        )
        assert details_response.status_code == 200
        payload = details_response.json()

        assert payload["equipment"]["id"] == equipment["id"]
        assert payload["equipment"]["name"] == "Течеискатель"
        assert payload["process_subscription_enabled"] is True
        assert len(payload["attachments"]) == 1
        assert payload["attachments"][0]["file_name"] == "passport.pdf"
        assert len(payload["comments"]) == 1
        assert payload["comments"][0]["text"] == "Добавил комплект документов."
        assert len(payload["comments"][0]["attachments"]) == 1
        assert payload["comments"][0]["attachments"][0]["file_name"] == "note.txt"
        assert payload["active_repair_message_count"] == 0
        assert payload["active_verification_message_count"] == 0
        assert payload["repair_history"] == []
        assert payload["verification_history"] == []
    finally:
        settings.attachment_storage_dir = original_dir
        settings.__dict__.pop("attachment_storage_path", None)


@pytest.mark.anyio
async def test_equipment_details_endpoint_returns_active_repair_message_count(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Карточка ремонта"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Мастерская",
            "equipment_type": "OTHER",
            "name": "Тестер",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    create_repair_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Якутск",
            "sent_to_repair_at": "2026-03-10",
            "initial_message_text": "Стартовое сообщение ремонта",
        },
    )
    assert create_repair_response.status_code == 201

    create_repair_message_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair/messages",
        headers=headers,
        data={"text": "Дополнительное сообщение ремонта"},
    )
    assert create_repair_message_response.status_code == 201

    details_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/details",
        headers=headers,
    )
    assert details_response.status_code == 200
    payload = details_response.json()
    assert payload["active_repair_message_count"] == 2
    assert payload["active_verification_message_count"] == 0


@pytest.mark.anyio
async def test_equipment_details_endpoint_returns_active_verification_message_count(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Карточка поверки"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Поверочная",
            "equipment_type": "SI",
            "name": "Манометр",
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "details-vri-1",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/details-vri-1",
                "mit_number": "10000-01",
                "mit_title": "Манометр",
                "mit_notation": "DM2005",
                "mi_number": "SN-DET-001",
                "result_docnum": "CERT-DET-001",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "10000-01",
                            "mitypeTitle": "Манометр",
                            "mitypeType": "DM2005",
                            "manufactureNum": "SN-DET-001",
                            "manufactureYear": 2024,
                            "modification": "серия A",
                        }
                    }
                },
            },
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    create_verification_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/verification",
        headers=headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Якутск",
            "sent_to_verification_at": "2026-03-11",
            "initial_message_text": "Стартовое сообщение поверки",
        },
    )
    assert create_verification_response.status_code == 201

    create_verification_message_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/verification/messages",
        headers=headers,
        data={"text": "Дополнительное сообщение поверки"},
    )
    assert create_verification_message_response.status_code == 201

    details_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/details",
        headers=headers,
    )
    assert details_response.status_code == 200
    payload = details_response.json()
    assert payload["active_repair_message_count"] == 0
    assert payload["active_verification_message_count"] == 2


@pytest.mark.anyio
async def test_user_mentions_are_available_and_comment_mention_triggers_notification(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    create_user_response = await client.post(
        "/api/v1/users",
        headers=headers,
        json={
            "first_name": "Григорий",
            "last_name": "Макеев",
            "patronymic": "Михайлович",
            "email": "operator@example.com",
            "role": "MKAIR",
            "is_active": True,
        },
    )
    assert create_user_response.status_code == 201

    mention_users_response = await client.get("/api/v1/users/mentions", headers=headers)
    assert mention_users_response.status_code == 200
    mention_users = mention_users_response.json()
    mentioned_user = next(item for item in mention_users if item["email"] == "operator@example.com")
    assert mentioned_user["mention_key"]

    sent_notifications: list[dict[str, str]] = []

    def fake_send_mention_email(self, **kwargs):  # noqa: ANN001
        sent_notifications.append(kwargs)

    monkeypatch.setattr(
        "app.services.notification_service.NotificationService.send_mention_email",
        fake_send_mention_email,
    )

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={
            "name": "Упоминания",
            "description": "Папка для теста mentions",
            "sort_order": 1,
        },
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Цех 1",
            "equipment_type": "OTHER",
            "name": "Компрессор",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    create_comment_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/comments",
        headers=headers,
        json={
            "text": f"Нужно проверить @{mentioned_user['mention_key']} перед запуском.",
        },
    )
    assert create_comment_response.status_code == 201
    comment = create_comment_response.json()

    assert len(sent_notifications) == 1
    assert sent_notifications[0]["recipient_email"] == "operator@example.com"
    assert sent_notifications[0]["context_title"] == "в карточке прибора «Компрессор»"
    assert sent_notifications[0]["target_url"].endswith(
        f"/equipment/{equipment['id']}?commentId={comment['id']}"
    )


@pytest.mark.anyio
async def test_equipment_process_subscription_can_be_enabled_and_disabled(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Подписки"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Цех 2",
            "equipment_type": "OTHER",
            "name": "Насос подпитки",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    subscription_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/process-subscription",
        headers=headers,
    )
    assert subscription_response.status_code == 200
    assert subscription_response.json() == {"enabled": False}

    enable_response = await client.put(
        f"/api/v1/equipment/{equipment['id']}/process-subscription",
        headers=headers,
        json={"enabled": True},
    )
    assert enable_response.status_code == 200
    assert enable_response.json() == {"enabled": True}

    enabled_state_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/process-subscription",
        headers=headers,
    )
    assert enabled_state_response.status_code == 200
    assert enabled_state_response.json() == {"enabled": True}

    disable_response = await client.put(
        f"/api/v1/equipment/{equipment['id']}/process-subscription",
        headers=headers,
        json={"enabled": False},
    )
    assert disable_response.status_code == 200
    assert disable_response.json() == {"enabled": False}


@pytest.mark.anyio
async def test_folder_process_subscriptions_are_scoped_to_users_with_folder_access(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Рассылка по папке"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    operator_response = await client.post(
        "/api/v1/users",
        headers=headers,
        json={
            "first_name": "Иван",
            "last_name": "Оператор",
            "email": "folder-subscriber@example.com",
            "role": "MKAIR",
            "is_active": True,
            "allowed_folder_ids": [folder["id"]],
        },
    )
    assert operator_response.status_code == 201
    operator_user = operator_response.json()["user"]

    outsider_response = await client.post(
        "/api/v1/users",
        headers=headers,
        json={
            "first_name": "Петр",
            "last_name": "Посторонний",
            "email": "folder-outsider@example.com",
            "role": "CUSTOMER",
            "is_active": True,
            "allowed_folder_ids": [],
        },
    )
    assert outsider_response.status_code == 201
    outsider_user = outsider_response.json()["user"]

    initial_response = await client.get(
        f"/api/v1/equipment/folders/{folder['id']}/process-subscriptions",
        headers=headers,
    )
    assert initial_response.status_code == 200
    initial_payload = initial_response.json()
    visible_user_ids = {item["user_id"] for item in initial_payload["users"]}
    assert operator_user["id"] in visible_user_ids
    assert outsider_user["id"] not in visible_user_ids

    update_response = await client.put(
        f"/api/v1/equipment/folders/{folder['id']}/process-subscriptions",
        headers=headers,
        json={"user_ids": [operator_user["id"]]},
    )
    assert update_response.status_code == 200
    updated_payload = update_response.json()
    enabled_by_user_id = {item["user_id"]: item["enabled"] for item in updated_payload["users"]}
    assert enabled_by_user_id[operator_user["id"]] is True


@pytest.mark.anyio
async def test_equipment_share_allows_direct_email_when_mentions_are_disabled(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    monkeypatch.setattr(settings, "mention_notifications_enabled", False)
    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_username", "robot@example.com")
    monkeypatch.setattr(settings, "smtp_password", "secret")
    monkeypatch.setattr(settings, "smtp_from_email", "robot@example.com")

    sent_notifications: list[dict[str, str]] = []

    def fake_send_equipment_share_email(self, **kwargs):  # noqa: ANN001
        sent_notifications.append(kwargs)

    monkeypatch.setattr(
        "app.services.notification_service.NotificationService.send_equipment_share_email",
        fake_send_equipment_share_email,
    )

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Шаринг прибора"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Цех 4",
            "equipment_type": "OTHER",
            "name": "Компрессор",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    recipients_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/share-recipients",
        headers=headers,
    )
    assert recipients_response.status_code == 200
    current_user = next(
        item for item in recipients_response.json()["users"] if item["email"] == admin_email
    )

    share_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/share",
        headers=headers,
        json={"user_ids": [current_user["user_id"]]},
    )
    assert share_response.status_code == 200
    assert share_response.json()["recipient_count"] == 1
    assert len(sent_notifications) == 1
    assert sent_notifications[0]["recipient_email"] == admin_email


@pytest.mark.anyio
async def test_equipment_share_returns_clear_email_delivery_error(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    monkeypatch.setattr(settings, "smtp_host", "smtp.example.com")
    monkeypatch.setattr(settings, "smtp_username", "robot@example.com")
    monkeypatch.setattr(settings, "smtp_password", "secret")
    monkeypatch.setattr(settings, "smtp_from_email", "robot@example.com")

    def fail_send_equipment_share_email(self, **kwargs):  # noqa: ANN001
        raise NotificationDeliveryError(
            "Не удалось отправить ссылку на прибор: mailbox unavailable"
        )

    monkeypatch.setattr(
        "app.services.notification_service.NotificationService.send_equipment_share_email",
        fail_send_equipment_share_email,
    )

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Ошибка шаринга"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Цех 5",
            "equipment_type": "OTHER",
            "name": "Осциллограф",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    recipients_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/share-recipients",
        headers=headers,
    )
    assert recipients_response.status_code == 200
    current_user = next(
        item for item in recipients_response.json()["users"] if item["email"] == admin_email
    )

    share_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/share",
        headers=headers,
        json={"user_ids": [current_user["user_id"]]},
    )
    assert share_response.status_code == 400
    assert (
        share_response.json()["detail"]
        == "Не удалось отправить ссылку на прибор: mailbox unavailable"
    )


@pytest.mark.anyio
async def test_grouped_repair_message_notifies_subscribed_equipment_member(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    sent_notifications: list[dict[str, str]] = []

    def fake_send_process_update_email(self, **kwargs):  # noqa: ANN001
        sent_notifications.append(kwargs)

    monkeypatch.setattr(
        "app.services.notification_service.NotificationService.send_process_update_email",
        fake_send_process_update_email,
    )

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Подписки на группы"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    create_user_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Ирина",
            "last_name": "Петрова",
            "email": "repair-operator@example.com",
            "role": "MKAIR",
            "is_active": True,
            "allowed_folder_ids": [folder["id"]],
        },
    )
    assert create_user_response.status_code == 201
    operator_password = create_user_response.json()["temporary_password"]
    operator = await login_user(
        client,
        email="repair-operator@example.com",
        password=operator_password,
    )
    operator_headers = {"Authorization": f"Bearer {operator['access_token']}"}

    equipment_ids: list[int] = []
    for index in range(2):
        equipment_response = await client.post(
            "/api/v1/equipment",
            headers=admin_headers,
            json={
                "folder_id": folder["id"],
                "object_name": "Цех ремонта",
                "equipment_type": "OTHER",
                "name": f"Групповой прибор #{index + 1}",
                "status": "IN_WORK",
            },
        )
        assert equipment_response.status_code == 201
        equipment_ids.append(equipment_response.json()["id"])

    for equipment_id in equipment_ids:
        enable_subscription_response = await client.put(
            f"/api/v1/equipment/{equipment_id}/process-subscription",
            headers=admin_headers,
            json={"enabled": True},
        )
        assert enable_subscription_response.status_code == 200

    batch_response = await client.post(
        "/api/v1/equipment/repairs/bulk",
        headers=operator_headers,
        files=[
            *[("equipment_ids", (None, str(equipment_id))) for equipment_id in equipment_ids],
            ("batch_name", (None, "Ремонтная группа")),
            ("route_city", (None, "Ленск")),
            ("route_destination", (None, "Тюмень")),
            ("sent_to_repair_at", (None, "2026-03-20")),
            ("initial_message_text", (None, "Старт группового ремонта.")),
        ],
    )
    assert batch_response.status_code == 201
    sent_notifications.clear()

    add_message_response = await client.post(
        f"/api/v1/equipment/{equipment_ids[0]}/repair/messages",
        headers=operator_headers,
        data={"text": "Группа принята в работу."},
    )
    assert add_message_response.status_code == 201

    assert len(sent_notifications) == 1
    assert sent_notifications[0]["recipient_email"] == admin_email
    assert sent_notifications[0]["process_label"] == "ремонту"
    assert (
        sent_notifications[0]["event_title"]
        == "Добавлено сообщение по ремонту «Групповой прибор #1»"
    )
    assert sent_notifications[0]["target_url"].endswith("/repairs")


@pytest.mark.anyio
async def test_tracked_equipment_changes_notify_other_user_but_not_author(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    sent_notifications: list[dict[str, str]] = []

    def fake_send_process_update_email(self, **kwargs):  # noqa: ANN001
        sent_notifications.append(kwargs)

    monkeypatch.setattr(
        "app.services.notification_service.NotificationService.send_process_update_email",
        fake_send_process_update_email,
    )

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Подписка на карточку"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    create_user_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Олег",
            "last_name": "Смирнов",
            "email": "equipment-operator@example.com",
            "role": "MKAIR",
            "is_active": True,
            "allowed_folder_ids": [folder["id"]],
        },
    )
    assert create_user_response.status_code == 201
    operator_password = create_user_response.json()["temporary_password"]
    operator = await login_user(
        client,
        email="equipment-operator@example.com",
        password=operator_password,
    )
    operator_headers = {"Authorization": f"Bearer {operator['access_token']}"}

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=admin_headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "OTHER",
            "name": "Контрольный насос",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    enable_subscription_response = await client.put(
        f"/api/v1/equipment/{equipment['id']}/process-subscription",
        headers=admin_headers,
        json={"enabled": True},
    )
    assert enable_subscription_response.status_code == 200

    update_equipment_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}",
        headers=operator_headers,
        json={"current_location_manual": "Склад РБУ"},
    )
    assert update_equipment_response.status_code == 200

    comment_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/comments",
        headers=operator_headers,
        json={"text": "Проверил состояние и обновил местонахождение."},
    )
    assert comment_response.status_code == 201

    attachment_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/attachments",
        headers=operator_headers,
        files={
            "file": ("inspection-photo.jpg", b"fake-image", "image/jpeg"),
        },
    )
    assert attachment_response.status_code == 201

    assert [item["recipient_email"] for item in sent_notifications] == [
        admin_email,
        admin_email,
        admin_email,
    ]
    assert [item["event_title"] for item in sent_notifications] == [
        "Обновлен прибор «Контрольный насос»",
        "Добавлен комментарий к прибору «Контрольный насос»",
        "Добавлено вложение к прибору «Контрольный насос»",
    ]
    assert all(
        item["target_url"].endswith(f"/equipment/{equipment['id']}") for item in sent_notifications
    )
    assert all(
        item["process_label"] == "карточке прибора «Контрольный насос»"
        for item in sent_notifications
    )

    sent_notifications.clear()
    self_update_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}",
        headers=admin_headers,
        json={"current_location_manual": "ХАЛ"},
    )
    assert self_update_response.status_code == 200
    assert sent_notifications == []


@pytest.mark.anyio
async def test_only_administrator_can_delete_other_users_equipment_comments_and_attachments(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Удаление карточки"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    create_author_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Author",
            "last_name": "Mkair",
            "email": "author-mkair@example.com",
            "role": "MKAIR",
            "is_active": True,
            "allowed_folder_ids": [folder["id"]],
        },
    )
    assert create_author_response.status_code == 201
    author_password = create_author_response.json()["temporary_password"]
    author = await login_user(
        client,
        email="author-mkair@example.com",
        password=author_password,
    )
    author_headers = {"Authorization": f"Bearer {author['access_token']}"}

    create_second_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Second",
            "last_name": "Mkair",
            "email": "second-mkair@example.com",
            "role": "MKAIR",
            "is_active": True,
            "allowed_folder_ids": [folder["id"]],
        },
    )
    assert create_second_response.status_code == 201
    second_password = create_second_response.json()["temporary_password"]
    second = await login_user(
        client,
        email="second-mkair@example.com",
        password=second_password,
    )
    second_headers = {"Authorization": f"Bearer {second['access_token']}"}

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=admin_headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "OTHER",
            "name": "Карточка для удаления",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    comment_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/comments",
        headers=author_headers,
        json={"text": "Комментарий автора."},
    )
    assert comment_response.status_code == 201
    comment_id = comment_response.json()["id"]

    attachment_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/attachments",
        headers=author_headers,
        files={"file": ("author-note.txt", b"hello", "text/plain")},
    )
    assert attachment_response.status_code == 201
    attachment_id = attachment_response.json()["id"]

    foreign_comment_delete_response = await client.delete(
        f"/api/v1/equipment/{equipment['id']}/comments/{comment_id}",
        headers=second_headers,
    )
    assert foreign_comment_delete_response.status_code == 403
    assert foreign_comment_delete_response.json()["detail"] == "You cannot delete this comment."

    foreign_attachment_delete_response = await client.delete(
        f"/api/v1/equipment/{equipment['id']}/attachments/{attachment_id}",
        headers=second_headers,
    )
    assert foreign_attachment_delete_response.status_code == 403
    assert (
        foreign_attachment_delete_response.json()["detail"] == "You cannot delete this attachment."
    )

    admin_comment_delete_response = await client.delete(
        f"/api/v1/equipment/{equipment['id']}/comments/{comment_id}",
        headers=admin_headers,
    )
    assert admin_comment_delete_response.status_code == 204

    admin_attachment_delete_response = await client.delete(
        f"/api/v1/equipment/{equipment['id']}/attachments/{attachment_id}",
        headers=admin_headers,
    )
    assert admin_attachment_delete_response.status_code == 204


@pytest.mark.anyio
async def test_only_administrator_can_delete_other_users_repair_and_verification_messages(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Удаление процессов"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    create_mkair_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Repair",
            "last_name": "Mkair",
            "email": "process-mkair@example.com",
            "role": "MKAIR",
            "is_active": True,
            "allowed_folder_ids": [folder["id"]],
        },
    )
    assert create_mkair_response.status_code == 201
    mkair_password = create_mkair_response.json()["temporary_password"]
    mkair = await login_user(
        client,
        email="process-mkair@example.com",
        password=mkair_password,
    )
    mkair_headers = {"Authorization": f"Bearer {mkair['access_token']}"}

    repair_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=admin_headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "OTHER",
            "name": "Прибор ремонта",
            "status": "IN_WORK",
        },
    )
    assert repair_equipment_response.status_code == 201
    repair_equipment = repair_equipment_response.json()

    create_repair_response = await client.post(
        f"/api/v1/equipment/{repair_equipment['id']}/repair",
        headers=admin_headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Тюмень",
            "sent_to_repair_at": "2026-03-20",
        },
    )
    assert create_repair_response.status_code == 201

    repair_message_response = await client.post(
        f"/api/v1/equipment/{repair_equipment['id']}/repair/messages",
        headers=admin_headers,
        data={"text": "Сообщение администратора по ремонту."},
    )
    assert repair_message_response.status_code == 201
    repair_message_id = repair_message_response.json()["id"]

    foreign_repair_delete_response = await client.delete(
        f"/api/v1/equipment/{repair_equipment['id']}/repair/messages/{repair_message_id}",
        headers=mkair_headers,
    )
    assert foreign_repair_delete_response.status_code == 403
    assert (
        foreign_repair_delete_response.json()["detail"] == "You cannot delete this repair message."
    )

    admin_repair_delete_response = await client.delete(
        f"/api/v1/equipment/{repair_equipment['id']}/repair/messages/{repair_message_id}",
        headers=admin_headers,
    )
    assert admin_repair_delete_response.status_code == 204

    verification_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=admin_headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "SI",
            "name": "Прибор поверки",
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "verification-delete-1",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/verification-delete-1",
                "mit_number": "70000-01",
                "mit_title": "Поверочный прибор",
                "mit_notation": "VP-1",
                "mi_number": "VP-001",
                "result_docnum": "CERT-VP-001",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "70000-01",
                            "mitypeTitle": "Поверочный прибор",
                            "mitypeType": "VP-1",
                            "manufactureNum": "VP-001",
                            "manufactureYear": 2024,
                            "modification": "серия V",
                        }
                    }
                },
            },
        },
    )
    assert verification_equipment_response.status_code == 201
    verification_equipment = verification_equipment_response.json()

    create_verification_response = await client.post(
        f"/api/v1/equipment/{verification_equipment['id']}/verification",
        headers=admin_headers,
        data={
            "route_city": "Ленск",
            "route_destination": "ЦСМ",
            "sent_to_verification_at": "2026-03-20",
        },
    )
    assert create_verification_response.status_code == 201

    verification_message_response = await client.post(
        f"/api/v1/equipment/{verification_equipment['id']}/verification/messages",
        headers=admin_headers,
        data={"text": "Сообщение администратора по поверке."},
    )
    assert verification_message_response.status_code == 201
    verification_message_id = verification_message_response.json()["id"]

    foreign_verification_delete_response = await client.delete(
        f"/api/v1/equipment/{verification_equipment['id']}/verification/messages/{verification_message_id}",
        headers=mkair_headers,
    )
    assert foreign_verification_delete_response.status_code == 403
    assert (
        foreign_verification_delete_response.json()["detail"]
        == "You cannot delete this verification message."
    )

    admin_verification_delete_response = await client.delete(
        f"/api/v1/equipment/{verification_equipment['id']}/verification/messages/{verification_message_id}",
        headers=admin_headers,
    )
    assert admin_verification_delete_response.status_code == 204


@pytest.mark.anyio
async def test_only_author_can_update_repair_and_verification_messages(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Правка процессов"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    create_mkair_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Editor",
            "last_name": "Mkair",
            "email": "editor-mkair@example.com",
            "role": "MKAIR",
            "is_active": True,
            "allowed_folder_ids": [folder["id"]],
        },
    )
    assert create_mkair_response.status_code == 201
    mkair_password = create_mkair_response.json()["temporary_password"]
    mkair = await login_user(
        client,
        email="editor-mkair@example.com",
        password=mkair_password,
    )
    mkair_headers = {"Authorization": f"Bearer {mkair['access_token']}"}

    repair_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=admin_headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "OTHER",
            "name": "Прибор ремонта для правки",
            "status": "IN_WORK",
        },
    )
    assert repair_equipment_response.status_code == 201
    repair_equipment = repair_equipment_response.json()

    create_repair_response = await client.post(
        f"/api/v1/equipment/{repair_equipment['id']}/repair",
        headers=admin_headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Тюмень",
            "sent_to_repair_at": "2026-03-20",
        },
    )
    assert create_repair_response.status_code == 201

    repair_message_response = await client.post(
        f"/api/v1/equipment/{repair_equipment['id']}/repair/messages",
        headers=mkair_headers,
        data={"text": "Первичный текст ремонта."},
    )
    assert repair_message_response.status_code == 201
    repair_message_id = repair_message_response.json()["id"]

    foreign_repair_update_response = await client.patch(
        f"/api/v1/equipment/{repair_equipment['id']}/repair/messages/{repair_message_id}",
        headers=admin_headers,
        json={"text": "Попытка админа изменить чужое сообщение."},
    )
    assert foreign_repair_update_response.status_code == 403
    assert (
        foreign_repair_update_response.json()["detail"] == "You cannot modify this repair message."
    )

    own_repair_update_response = await client.patch(
        f"/api/v1/equipment/{repair_equipment['id']}/repair/messages/{repair_message_id}",
        headers=mkair_headers,
        json={"text": "Исправленный текст ремонта."},
    )
    assert own_repair_update_response.status_code == 200
    assert own_repair_update_response.json()["text"] == "Исправленный текст ремонта."

    verification_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=admin_headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "SI",
            "name": "Прибор поверки для правки",
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "verification-edit-1",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/verification-edit-1",
                "mit_number": "70000-02",
                "mit_title": "Поверочный прибор",
                "mit_notation": "VP-2",
                "mi_number": "VP-002",
                "result_docnum": "CERT-VP-002",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "70000-02",
                            "mitypeTitle": "Поверочный прибор",
                            "mitypeType": "VP-2",
                            "manufactureNum": "VP-002",
                            "manufactureYear": 2024,
                            "modification": "серия V",
                        }
                    }
                },
            },
        },
    )
    assert verification_equipment_response.status_code == 201
    verification_equipment = verification_equipment_response.json()

    create_verification_response = await client.post(
        f"/api/v1/equipment/{verification_equipment['id']}/verification",
        headers=admin_headers,
        data={
            "route_city": "Ленск",
            "route_destination": "ЦСМ",
            "sent_to_verification_at": "2026-03-20",
        },
    )
    assert create_verification_response.status_code == 201

    verification_message_response = await client.post(
        f"/api/v1/equipment/{verification_equipment['id']}/verification/messages",
        headers=mkair_headers,
        data={"text": "Первичный текст поверки."},
    )
    assert verification_message_response.status_code == 201
    verification_message_id = verification_message_response.json()["id"]

    foreign_verification_update_response = await client.patch(
        f"/api/v1/equipment/{verification_equipment['id']}/verification/messages/{verification_message_id}",
        headers=admin_headers,
        json={"text": "Попытка админа изменить чужое сообщение."},
    )
    assert foreign_verification_update_response.status_code == 403
    assert (
        foreign_verification_update_response.json()["detail"]
        == "You cannot modify this verification message."
    )

    own_verification_update_response = await client.patch(
        f"/api/v1/equipment/{verification_equipment['id']}/verification/messages/{verification_message_id}",
        headers=mkair_headers,
        json={"text": "Исправленный текст поверки."},
    )
    assert own_verification_update_response.status_code == 200
    assert own_verification_update_response.json()["text"] == "Исправленный текст поверки."


@pytest.mark.anyio
async def test_operator_can_create_active_repair_with_route_and_dialog_messages(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Ремонтная папка"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "OTHER",
            "name": "Источник питания",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    create_repair_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        data={
            "route_city": "Тюмень",
            "route_destination": "ПСП ХАЛ Северный",
            "sent_to_repair_at": "2026-03-19",
            "initial_message_text": "Прибор упакован и передан в ремонт.",
        },
        files=[
            (
                "files",
                (
                    "packing-photo.jpg",
                    b"fake-image-payload",
                    "image/jpeg",
                ),
            ),
        ],
    )
    assert create_repair_response.status_code == 201
    repair = create_repair_response.json()
    assert repair["route_city"] == "Тюмень"
    assert repair["route_destination"] == "ПСП ХАЛ Северный"
    assert repair["sent_to_repair_at"] == "2026-03-19"
    assert repair["repair_deadline_at"] == "2026-06-27"

    equipment_detail_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
    )
    assert equipment_detail_response.status_code == 200
    equipment_detail = equipment_detail_response.json()
    assert equipment_detail["status"] == "IN_REPAIR"
    assert equipment_detail["active_repair"] is not None
    assert equipment_detail["active_repair"]["id"] == repair["id"]
    assert equipment_detail["active_repair"]["route_city"] == "Тюмень"
    assert equipment_detail["active_repair"]["route_destination"] == "ПСП ХАЛ Северный"

    in_repair_list_response = await client.get(
        f"/api/v1/equipment?folder_id={folder['id']}&status=IN_REPAIR",
        headers=headers,
    )
    assert in_repair_list_response.status_code == 200
    in_repair_items = in_repair_list_response.json()
    assert len(in_repair_items) == 1
    assert in_repair_items[0]["id"] == equipment["id"]

    suggestions_response = await client.get(
        f"/api/v1/equipment/folders/{folder['id']}/suggestions",
        headers=headers,
    )
    assert suggestions_response.status_code == 200
    suggestions = suggestions_response.json()
    assert suggestions["object_names"] == ["ХАЛ"]
    assert suggestions["repair_route_cities"] == ["Тюмень"]
    assert suggestions["repair_route_destinations"] == ["ПСП ХАЛ Северный"]

    repair_messages_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/repair/messages",
        headers=headers,
    )
    assert repair_messages_response.status_code == 200
    repair_messages = repair_messages_response.json()
    assert len(repair_messages) == 1
    assert repair_messages[0]["text"] == "Прибор упакован и передан в ремонт."
    assert len(repair_messages[0]["attachments"]) == 1
    assert repair_messages[0]["attachments"][0]["file_name"] == "packing-photo.jpg"

    add_message_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair/messages",
        headers=headers,
        data={"text": "Чек о перевозке добавлен позже."},
        files=[
            (
                "files",
                (
                    "transport-check.pdf",
                    b"fake-check-payload",
                    "application/pdf",
                ),
            ),
        ],
    )
    assert add_message_response.status_code == 201
    second_message = add_message_response.json()
    assert second_message["text"] == "Чек о перевозке добавлен позже."
    assert len(second_message["attachments"]) == 1
    assert second_message["attachments"][0]["file_name"] == "transport-check.pdf"

    duplicate_repair_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        data={
            "route_city": "Томск",
            "route_destination": "Второй маршрут",
            "sent_to_repair_at": "2026-03-20",
        },
    )
    assert duplicate_repair_response.status_code == 409
    assert (
        duplicate_repair_response.json()["detail"] == "Для этого прибора уже есть активный ремонт."
    )


@pytest.mark.anyio
async def test_repair_queue_lists_active_and_archived_repairs(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Очередь ремонтов"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Комната ремонта",
            "equipment_type": "SI",
            "name": "Калибратор",
            "serial_number": "REP-001",
            "status": "IN_WORK",
            "current_location_manual": "Склад",
            "si_verification": {
                "vri_id": "repair-queue-si-1",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/repair-queue-si-1",
                "mit_number": "20000-01",
                "mit_title": "Калибратор",
                "mit_notation": "CAL-100",
                "mi_number": "REP-001",
                "result_docnum": "CERT-REP-001",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "20000-01",
                            "mitypeTitle": "Калибратор",
                            "mitypeType": "CAL-100",
                            "manufactureNum": "REP-001",
                            "manufactureYear": 2024,
                            "modification": "серия R",
                        }
                    }
                },
            },
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    sent_to_repair_at = date.today() - timedelta(days=120)
    create_repair_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        data={
            "route_city": "Тюмень",
            "route_destination": "Иркутск",
            "sent_to_repair_at": sent_to_repair_at.isoformat(),
        },
    )
    assert create_repair_response.status_code == 201
    repair = create_repair_response.json()

    active_queue_response = await client.get(
        "/api/v1/equipment/repairs?lifecycle_status=active&query=Иркутск",
        headers=headers,
    )
    assert active_queue_response.status_code == 200
    active_items = active_queue_response.json()
    assert len(active_items) == 1
    assert active_items[0]["repair_id"] == repair["id"]
    assert active_items[0]["equipment_id"] == equipment["id"]
    assert active_items[0]["equipment_type"] == "SI"
    assert active_items[0]["route_city"] == "Тюмень"
    assert active_items[0]["route_destination"] == "Иркутск"
    assert active_items[0]["current_stage_label"] == "Демонтаж"
    assert active_items[0]["repair_overdue_days"] == 20
    assert active_items[0]["registration_overdue_days"] == 0
    assert active_items[0]["control_overdue_days"] == 0
    assert active_items[0]["payment_overdue_days"] == 0
    assert active_items[0]["max_overdue_days"] == 20
    assert active_items[0]["has_active_verification"] is False
    assert active_items[0]["result_docnum"] == "CERT-REP-001"

    update_repair_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        json={
            "arrived_to_destination_at": (sent_to_repair_at + timedelta(days=3)).isoformat(),
            "sent_from_repair_at": (sent_to_repair_at + timedelta(days=110)).isoformat(),
            "sent_from_irkutsk_at": (sent_to_repair_at + timedelta(days=112)).isoformat(),
            "arrived_to_lensk_at": (sent_to_repair_at + timedelta(days=117)).isoformat(),
            "actually_received_at": (sent_to_repair_at + timedelta(days=119)).isoformat(),
            "incoming_control_at": (sent_to_repair_at + timedelta(days=161)).isoformat(),
            "paid_at": (sent_to_repair_at + timedelta(days=233)).isoformat(),
        },
    )
    assert update_repair_response.status_code == 200
    updated_repair = update_repair_response.json()
    assert (
        updated_repair["sent_from_repair_at"]
        == (sent_to_repair_at + timedelta(days=110)).isoformat()
    )
    assert (
        updated_repair["arrived_to_lensk_at"]
        == (sent_to_repair_at + timedelta(days=117)).isoformat()
    )
    assert updated_repair["paid_at"] == (sent_to_repair_at + timedelta(days=233)).isoformat()

    active_queue_after_update_response = await client.get(
        "/api/v1/equipment/repairs?lifecycle_status=active&query=Калибратор",
        headers=headers,
    )
    assert active_queue_after_update_response.status_code == 200
    active_item = active_queue_after_update_response.json()[0]
    assert (
        active_item["sent_from_repair_at"] == (sent_to_repair_at + timedelta(days=110)).isoformat()
    )
    assert (
        active_item["registration_deadline_at"]
        == (sent_to_repair_at + timedelta(days=122)).isoformat()
    )
    assert (
        active_item["control_deadline_at"] == (sent_to_repair_at + timedelta(days=159)).isoformat()
    )
    assert (
        active_item["payment_deadline_at"] == (sent_to_repair_at + timedelta(days=231)).isoformat()
    )
    assert active_item["current_stage_label"] == "Оплата"
    assert active_item["repair_overdue_days"] == 17
    assert active_item["registration_overdue_days"] == 0
    assert active_item["control_overdue_days"] == 2
    assert active_item["payment_overdue_days"] == 2
    assert active_item["max_overdue_days"] == 17

    testing_session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    with testing_session() as session:
        repair_row = session.get(Repair, repair["id"])
        assert repair_row is not None
        repair_row.closed_at = date.today()
        session.commit()

    archived_queue_response = await client.get(
        "/api/v1/equipment/repairs?lifecycle_status=archived&query=Калибратор",
        headers=headers,
    )
    assert archived_queue_response.status_code == 200
    archived_items = archived_queue_response.json()
    assert len(archived_items) == 1
    assert archived_items[0]["repair_id"] == repair["id"]
    assert archived_items[0]["closed_at"] == date.today().isoformat()
    assert archived_items[0]["current_stage_label"] == "Ремонт завершен"


@pytest.mark.anyio
async def test_repair_queue_can_be_filtered_by_folder(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    first_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Ремонт папка 1"},
    )
    second_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Ремонт папка 2"},
    )
    assert first_folder_response.status_code == 201
    assert second_folder_response.status_code == 201
    first_folder_id = first_folder_response.json()["id"]
    second_folder_id = second_folder_response.json()["id"]

    first_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": first_folder_id,
            "object_name": "Цех 1",
            "equipment_type": "OTHER",
            "name": "Насос 1",
            "status": "IN_WORK",
        },
    )
    second_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": second_folder_id,
            "object_name": "Цех 2",
            "equipment_type": "OTHER",
            "name": "Насос 2",
            "status": "IN_WORK",
        },
    )
    assert first_equipment_response.status_code == 201
    assert second_equipment_response.status_code == 201

    first_repair_response = await client.post(
        f"/api/v1/equipment/{first_equipment_response.json()['id']}/repair",
        headers=headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Иркутск",
            "sent_to_repair_at": "2026-03-20",
        },
    )
    second_repair_response = await client.post(
        f"/api/v1/equipment/{second_equipment_response.json()['id']}/repair",
        headers=headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Тюмень",
            "sent_to_repair_at": "2026-03-21",
        },
    )
    assert first_repair_response.status_code == 201
    assert second_repair_response.status_code == 201

    filtered_response = await client.get(
        f"/api/v1/equipment/repairs?lifecycle_status=active&folder_id={first_folder_id}",
        headers=headers,
    )
    assert filtered_response.status_code == 200
    filtered_items = filtered_response.json()
    assert len(filtered_items) == 1
    assert filtered_items[0]["folder_id"] == first_folder_id
    assert filtered_items[0]["equipment_name"] == "Насос 1"


@pytest.mark.anyio
async def test_repair_queue_page_paginates_by_groups_without_splitting_batch(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Пагинация ремонтов"},
    )
    assert folder_response.status_code == 201
    folder_id = folder_response.json()["id"]

    batch_equipment_ids: list[int] = []
    for index in range(2):
        equipment_response = await client.post(
            "/api/v1/equipment",
            headers=headers,
            json={
                "folder_id": folder_id,
                "object_name": "Ремонтный участок",
                "equipment_type": "OTHER",
                "name": f"Прибор партии #{index + 1}",
                "status": "IN_WORK",
            },
        )
        assert equipment_response.status_code == 201
        batch_equipment_ids.append(equipment_response.json()["id"])

    single_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder_id,
            "object_name": "Ремонтный участок",
            "equipment_type": "OTHER",
            "name": "Одиночный ремонт",
            "status": "IN_WORK",
        },
    )
    assert single_equipment_response.status_code == 201
    single_equipment_id = single_equipment_response.json()["id"]

    batch_response = await client.post(
        "/api/v1/equipment/repairs/bulk",
        headers=headers,
        files=[
            *[("equipment_ids", (None, str(equipment_id))) for equipment_id in batch_equipment_ids],
            ("batch_name", (None, "Партия ремонта")),
            ("route_city", (None, "Ленск")),
            ("route_destination", (None, "Иркутск")),
            ("sent_to_repair_at", (None, "2026-03-21")),
        ],
    )
    assert batch_response.status_code == 201
    batch_payload = batch_response.json()
    assert len(batch_payload) == 2

    single_repair_response = await client.post(
        f"/api/v1/equipment/{single_equipment_id}/repair",
        headers=headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Тюмень",
            "sent_to_repair_at": "2026-03-20",
        },
    )
    assert single_repair_response.status_code == 201

    first_page_response = await client.get(
        "/api/v1/equipment/repairs/page",
        headers=headers,
        params={"lifecycle_status": "active", "limit": 1, "offset": 0},
    )
    assert first_page_response.status_code == 200
    first_page = first_page_response.json()
    assert first_page["total_groups"] == 2
    assert first_page["total_items"] == 3
    assert first_page["limit"] == 1
    assert first_page["offset"] == 0
    assert len(first_page["items"]) == 2
    assert {item["batch_key"] for item in first_page["items"]} == {batch_payload[0]["batch_key"]}

    second_page_response = await client.get(
        "/api/v1/equipment/repairs/page",
        headers=headers,
        params={"lifecycle_status": "active", "limit": 1, "offset": 1},
    )
    assert second_page_response.status_code == 200
    second_page = second_page_response.json()
    assert second_page["total_groups"] == 2
    assert second_page["total_items"] == 3
    assert len(second_page["items"]) == 1
    assert second_page["items"][0]["batch_key"] is None
    assert second_page["items"][0]["equipment_name"] == "Одиночный ремонт"


@pytest.mark.anyio
async def test_repair_queue_page_query_keeps_only_matching_batch_rows(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Поиск пагинации ремонтов"},
    )
    assert folder_response.status_code == 201
    folder_id = folder_response.json()["id"]

    equipment_names = ["Насос эталонный", "Компрессор резервный"]
    equipment_ids: list[int] = []
    for equipment_name in equipment_names:
        equipment_response = await client.post(
            "/api/v1/equipment",
            headers=headers,
            json={
                "folder_id": folder_id,
                "object_name": "Комната ремонта",
                "equipment_type": "OTHER",
                "name": equipment_name,
                "status": "IN_WORK",
            },
        )
        assert equipment_response.status_code == 201
        equipment_ids.append(equipment_response.json()["id"])

    batch_response = await client.post(
        "/api/v1/equipment/repairs/bulk",
        headers=headers,
        files=[
            *[("equipment_ids", (None, str(equipment_id))) for equipment_id in equipment_ids],
            ("batch_name", (None, "Смешанная партия ремонта")),
            ("route_city", (None, "Ленск")),
            ("route_destination", (None, "Иркутск")),
            ("sent_to_repair_at", (None, "2026-03-22")),
        ],
    )
    assert batch_response.status_code == 201

    page_response = await client.get(
        "/api/v1/equipment/repairs/page",
        headers=headers,
        params={
            "lifecycle_status": "active",
            "query": "Насос эталонный",
            "limit": 20,
            "offset": 0,
        },
    )
    assert page_response.status_code == 200
    page = page_response.json()
    assert page["total_groups"] == 1
    assert page["total_items"] == 1
    assert len(page["items"]) == 1
    assert page["items"][0]["equipment_name"] == "Насос эталонный"


@pytest.mark.anyio
async def test_repair_milestones_reject_invalid_stage_order(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Валидация ремонта"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Лаборатория",
            "equipment_type": "OTHER",
            "name": "Источник питания",
            "serial_number": "R-ORDER-1",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    create_repair_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Иркутск",
            "sent_to_repair_at": "2026-03-20",
        },
    )
    assert create_repair_response.status_code == 201

    invalid_update_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        json={
            "arrived_to_lensk_at": "2026-03-22",
            "sent_from_irkutsk_at": "2026-03-21",
        },
    )
    assert invalid_update_response.status_code == 422
    assert (
        invalid_update_response.json()["detail"]
        == "Этап «Отправлено обратно» нельзя указать раньше, чем этап «Прибыло в пункт назначения»."
    )


@pytest.mark.anyio
async def test_operator_can_create_repair_batch(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Массовый ремонт"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_ids: list[int] = []
    for index in range(2):
        equipment_response = await client.post(
            "/api/v1/equipment",
            headers=headers,
            json={
                "folder_id": folder["id"],
                "object_name": "Комната подготовки воды",
                "equipment_type": "OTHER",
                "name": f"Прибор ремонта #{index + 1}",
                "status": "IN_WORK",
            },
        )
        assert equipment_response.status_code == 201
        equipment_ids.append(equipment_response.json()["id"])

    batch_response = await client.post(
        "/api/v1/equipment/repairs/bulk",
        headers=headers,
        files=[
            *[("equipment_ids", (None, str(equipment_id))) for equipment_id in equipment_ids],
            ("batch_name", (None, "Комната подготовки воды / ремонт")),
            ("route_city", (None, "Ленск")),
            ("route_destination", (None, "Тюмень")),
            ("sent_to_repair_at", (None, "2026-03-20")),
            ("initial_message_text", (None, "Партия приборов отправлена в ремонт.")),
            (
                "files",
                (
                    "repair-batch-photo.jpg",
                    b"fake-repair-batch-image",
                    "image/jpeg",
                ),
            ),
        ],
    )
    assert batch_response.status_code == 201
    payload = batch_response.json()
    assert len(payload) == 2
    assert payload[0]["batch_name"] == "Комната подготовки воды / ремонт"
    assert payload[0]["batch_key"] is not None
    assert payload[1]["batch_key"] == payload[0]["batch_key"]
    assert {item["equipment_id"] for item in payload} == set(equipment_ids)

    repair_queue_response = await client.get(
        "/api/v1/equipment/repairs?lifecycle_status=active&query=Комната подготовки воды / ремонт",
        headers=headers,
    )
    assert repair_queue_response.status_code == 200
    repair_queue = repair_queue_response.json()
    assert len(repair_queue) == 2
    assert all(item["batch_name"] == "Комната подготовки воды / ремонт" for item in repair_queue)
    assert all(item["route_city"] == "Ленск" for item in repair_queue)
    assert all(item["route_destination"] == "Тюмень" for item in repair_queue)

    first_messages_response = await client.get(
        f"/api/v1/equipment/{equipment_ids[0]}/repair/messages",
        headers=headers,
    )
    assert first_messages_response.status_code == 200
    first_messages = first_messages_response.json()
    assert len(first_messages) == 1
    assert first_messages[0]["text"] == "Партия приборов отправлена в ремонт."
    assert len(first_messages[0]["attachments"]) == 1
    assert first_messages[0]["attachments"][0]["file_name"] == "repair-batch-photo.jpg"


@pytest.mark.anyio
async def test_grouped_repair_shares_messages_updates_and_closes(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Групповой ремонт"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_ids: list[int] = []
    for index in range(2):
        equipment_response = await client.post(
            "/api/v1/equipment",
            headers=headers,
            json={
                "folder_id": folder["id"],
                "object_name": "Подготовка воды",
                "equipment_type": "OTHER",
                "name": f"Ремонтный прибор #{index + 1}",
                "status": "IN_WORK",
            },
        )
        assert equipment_response.status_code == 201
        equipment_ids.append(equipment_response.json()["id"])

    batch_response = await client.post(
        "/api/v1/equipment/repairs/bulk",
        headers=headers,
        files=[
            *[("equipment_ids", (None, str(equipment_id))) for equipment_id in equipment_ids],
            ("batch_name", (None, "Общая партия ремонта")),
            ("route_city", (None, "Ленск")),
            ("route_destination", (None, "Тюмень")),
            ("sent_to_repair_at", (None, "2026-03-20")),
            ("initial_message_text", (None, "Ящик с приборами отправлен в ремонт.")),
        ],
    )
    assert batch_response.status_code == 201
    payload = batch_response.json()
    assert len(payload) == 2
    batch_key = payload[0]["batch_key"]
    assert batch_key is not None
    assert payload[1]["batch_key"] == batch_key

    first_messages_response = await client.get(
        f"/api/v1/equipment/{equipment_ids[0]}/repair/messages",
        headers=headers,
    )
    assert first_messages_response.status_code == 200
    first_messages = first_messages_response.json()
    assert len(first_messages) == 1
    assert first_messages[0]["text"] == "Ящик с приборами отправлен в ремонт."

    second_messages_response = await client.get(
        f"/api/v1/equipment/{equipment_ids[1]}/repair/messages",
        headers=headers,
    )
    assert second_messages_response.status_code == 200
    second_messages = second_messages_response.json()
    assert len(second_messages) == 1
    assert second_messages[0]["text"] == "Ящик с приборами отправлен в ремонт."

    add_group_message_response = await client.post(
        f"/api/v1/equipment/{equipment_ids[1]}/repair/messages",
        headers=headers,
        data={"text": "Группа принята в Тюмени."},
    )
    assert add_group_message_response.status_code == 201

    messages_from_first_after_update = await client.get(
        f"/api/v1/equipment/{equipment_ids[0]}/repair/messages",
        headers=headers,
    )
    assert messages_from_first_after_update.status_code == 200
    shared_messages = messages_from_first_after_update.json()
    assert len(shared_messages) == 2
    assert shared_messages[1]["text"] == "Группа принята в Тюмени."

    update_batch_response = await client.patch(
        f"/api/v1/equipment/repairs/batch/{batch_key}",
        headers=headers,
        json={
            "arrived_to_destination_at": "2026-03-21",
            "sent_from_repair_at": "2026-03-24",
            "sent_from_irkutsk_at": "2026-03-25",
            "arrived_to_lensk_at": "2026-03-27",
            "actually_received_at": "2026-03-28",
            "incoming_control_at": "2026-03-29",
            "paid_at": "2026-03-30",
            "custom_stages": with_last_process_stage_date(payload[0], "2026-03-30"),
        },
    )
    assert update_batch_response.status_code == 200
    updated_batch = update_batch_response.json()
    assert len(updated_batch) == 2
    assert all(item["custom_stages"][-1]["date"] == "2026-03-30" for item in updated_batch)

    close_batch_response = await client.post(
        f"/api/v1/equipment/repairs/batch/{batch_key}/close",
        headers=headers,
    )
    assert close_batch_response.status_code == 200
    closed_batch = close_batch_response.json()
    assert len(closed_batch) == 2
    assert all(item["closed_at"] == date.today().isoformat() for item in closed_batch)

    for equipment_id in equipment_ids:
        equipment_detail_response = await client.get(
            f"/api/v1/equipment/{equipment_id}",
            headers=headers,
        )
        assert equipment_detail_response.status_code == 200
        equipment_detail = equipment_detail_response.json()
        assert equipment_detail["status"] == "IN_WORK"
        assert equipment_detail["active_repair"] is None


@pytest.mark.anyio
async def test_repair_can_be_closed_only_after_payment(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Закрытие ремонта"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Ремонтная зона",
            "equipment_type": "OTHER",
            "name": "Блок питания",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    create_repair_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Тюмень",
            "sent_to_repair_at": "2026-03-20",
        },
    )
    assert create_repair_response.status_code == 201
    repair = create_repair_response.json()

    close_without_payment_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair/close",
        headers=headers,
    )
    assert close_without_payment_response.status_code == 422
    assert (
        close_without_payment_response.json()["detail"]
        == "Ремонт можно завершить только после даты этапа «Оплата»."
    )

    update_repair_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        json={
            "arrived_to_destination_at": "2026-03-21",
            "sent_from_repair_at": "2026-03-25",
            "sent_from_irkutsk_at": "2026-03-26",
            "arrived_to_lensk_at": "2026-03-28",
            "actually_received_at": "2026-03-29",
            "incoming_control_at": "2026-03-30",
            "paid_at": "2026-04-01",
            "custom_stages": with_last_process_stage_date(repair, "2026-04-01"),
        },
    )
    assert update_repair_response.status_code == 200

    close_with_payment_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair/close",
        headers=headers,
    )
    assert close_with_payment_response.status_code == 200
    assert close_with_payment_response.json()["closed_at"] == date.today().isoformat()

    equipment_detail_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
    )
    assert equipment_detail_response.status_code == 200
    equipment_detail = equipment_detail_response.json()
    assert equipment_detail["status"] == "IN_WORK"
    assert equipment_detail["active_repair"] is None


@pytest.mark.anyio
async def test_closed_repair_is_visible_in_history_and_archive_zip(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Архив ремонтов"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "OTHER",
            "name": "Источник питания",
            "status": "IN_WORK",
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    create_repair_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        data={
            "route_city": "Тюмень",
            "route_destination": "Иркутск",
            "sent_to_repair_at": "2026-03-19",
            "initial_message_text": "Прибор упакован и отправлен в ремонт.",
        },
        files=[
            (
                "files",
                (
                    "packing-photo.jpg",
                    b"fake-image-payload",
                    "image/jpeg",
                ),
            ),
        ],
    )
    assert create_repair_response.status_code == 201
    repair = create_repair_response.json()

    add_message_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair/messages",
        headers=headers,
        data={"text": "Добавлен чек по ремонту."},
        files=[
            (
                "files",
                (
                    "repair-check.pdf",
                    b"fake-check-payload",
                    "application/pdf",
                ),
            ),
        ],
    )
    assert add_message_response.status_code == 201

    update_repair_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        json={
            "arrived_to_destination_at": "2026-03-21",
            "sent_from_repair_at": "2026-03-25",
            "sent_from_irkutsk_at": "2026-03-26",
            "arrived_to_lensk_at": "2026-03-28",
            "actually_received_at": "2026-03-29",
            "incoming_control_at": "2026-03-30",
            "paid_at": "2026-04-01",
            "custom_stages": with_last_process_stage_date(repair, "2026-04-01"),
        },
    )
    assert update_repair_response.status_code == 200

    close_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair/close",
        headers=headers,
    )
    assert close_response.status_code == 200
    assert close_response.json()["closed_at"] == date.today().isoformat()

    history_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/repair/history",
        headers=headers,
    )
    assert history_response.status_code == 200
    history = history_response.json()
    assert len(history) == 1
    assert history[0]["repair_id"] == repair["id"]
    assert history[0]["current_stage_label"] == "Ремонт завершен"
    assert history[0]["closed_at"] == date.today().isoformat()

    archive_response = await client.get(
        f"/api/v1/equipment/repairs/{repair['id']}/archive.zip",
        headers=headers,
    )
    assert archive_response.status_code == 200

    archive = ZipFile(BytesIO(archive_response.content))
    names = archive.namelist()
    assert "dialog.txt" in names
    assert any(name.startswith("files/") and name.endswith("packing-photo.jpg") for name in names)
    assert any(name.startswith("files/") and name.endswith("repair-check.pdf") for name in names)

    dialog_text = archive.read("dialog.txt").decode("utf-8")
    assert "Прибор упакован и отправлен в ремонт." in dialog_text
    assert "Добавлен чек по ремонту." in dialog_text


@pytest.mark.anyio
async def test_operator_can_delete_archived_repair_and_verification_records_but_customer_cannot(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    admin_headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=admin_headers,
        json={"name": "Удаление архивов процессов"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    create_mkair_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Archive",
            "last_name": "Operator",
            "email": "archive-operator@example.com",
            "role": "MKAIR",
            "is_active": True,
            "allowed_folder_ids": [folder["id"]],
        },
    )
    assert create_mkair_response.status_code == 201
    mkair_password = create_mkair_response.json()["temporary_password"]
    mkair = await login_user(
        client,
        email="archive-operator@example.com",
        password=mkair_password,
    )
    mkair_headers = {"Authorization": f"Bearer {mkair['access_token']}"}

    create_customer_response = await client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={
            "first_name": "Archive",
            "last_name": "Customer",
            "email": "archive-customer@example.com",
            "role": "CUSTOMER",
            "is_active": True,
            "allowed_folder_ids": [folder["id"]],
        },
    )
    assert create_customer_response.status_code == 201
    customer_password = create_customer_response.json()["temporary_password"]
    customer = await login_user(
        client,
        email="archive-customer@example.com",
        password=customer_password,
    )
    customer_headers = {"Authorization": f"Bearer {customer['access_token']}"}

    repair_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=admin_headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "OTHER",
            "name": "Архив ремонта",
            "serial_number": "ARCH-R-1",
            "status": "IN_WORK",
        },
    )
    assert repair_equipment_response.status_code == 201
    repair_equipment = repair_equipment_response.json()

    create_repair_response = await client.post(
        f"/api/v1/equipment/{repair_equipment['id']}/repair",
        headers=admin_headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Тюмень",
            "sent_to_repair_at": "2026-03-20",
        },
    )
    assert create_repair_response.status_code == 201
    repair = create_repair_response.json()

    update_repair_response = await client.patch(
        f"/api/v1/equipment/{repair_equipment['id']}/repair",
        headers=admin_headers,
        json={
            "arrived_to_destination_at": "2026-03-21",
            "sent_from_repair_at": "2026-03-25",
            "sent_from_irkutsk_at": "2026-03-26",
            "arrived_to_lensk_at": "2026-03-28",
            "actually_received_at": "2026-03-29",
            "incoming_control_at": "2026-03-30",
            "paid_at": "2026-04-01",
            "custom_stages": with_last_process_stage_date(repair, "2026-04-01"),
        },
    )
    assert update_repair_response.status_code == 200

    close_repair_response = await client.post(
        f"/api/v1/equipment/{repair_equipment['id']}/repair/close",
        headers=admin_headers,
    )
    assert close_repair_response.status_code == 200

    forbidden_repair_delete_response = await client.delete(
        f"/api/v1/equipment/repairs/{repair['id']}",
        headers=customer_headers,
    )
    assert forbidden_repair_delete_response.status_code == 403

    delete_repair_response = await client.delete(
        f"/api/v1/equipment/repairs/{repair['id']}",
        headers=mkair_headers,
    )
    assert delete_repair_response.status_code == 204

    repair_history_response = await client.get(
        f"/api/v1/equipment/{repair_equipment['id']}/repair/history",
        headers=admin_headers,
    )
    assert repair_history_response.status_code == 200
    assert repair_history_response.json() == []

    repair_archive_response = await client.get(
        f"/api/v1/equipment/repairs/{repair['id']}/archive.zip",
        headers=admin_headers,
    )
    assert repair_archive_response.status_code == 404

    verification_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=admin_headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "SI",
            "name": "Архив поверки",
            "serial_number": "ARCH-V-1",
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "archive-delete-vri-1",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/archive-delete-vri-1",
                "mit_number": "70000-01",
                "mit_title": "Поверочный прибор",
                "mit_notation": "VP-1",
                "mi_number": "VP-ARCH-1",
                "result_docnum": "CERT-ARCH-1",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "70000-01",
                            "mitypeTitle": "Поверочный прибор",
                            "mitypeType": "VP-1",
                            "manufactureNum": "VP-ARCH-1",
                            "manufactureYear": 2024,
                            "modification": "серия V",
                        }
                    }
                },
            },
        },
    )
    assert verification_equipment_response.status_code == 201
    verification_equipment = verification_equipment_response.json()

    create_verification_response = await client.post(
        f"/api/v1/equipment/{verification_equipment['id']}/verification",
        headers=admin_headers,
        data={
            "route_city": "Ленск",
            "route_destination": "ЦСМ",
            "sent_to_verification_at": "2026-03-20",
        },
    )
    assert create_verification_response.status_code == 201
    verification = create_verification_response.json()

    close_verification_response = await client.post(
        f"/api/v1/equipment/{verification_equipment['id']}/verification/close",
        headers=admin_headers,
    )
    assert close_verification_response.status_code == 200

    forbidden_verification_delete_response = await client.delete(
        f"/api/v1/equipment/verifications/{verification['id']}",
        headers=customer_headers,
    )
    assert forbidden_verification_delete_response.status_code == 403

    delete_verification_response = await client.delete(
        f"/api/v1/equipment/verifications/{verification['id']}",
        headers=mkair_headers,
    )
    assert delete_verification_response.status_code == 204

    verification_history_response = await client.get(
        f"/api/v1/equipment/{verification_equipment['id']}/verification/history",
        headers=admin_headers,
    )
    assert verification_history_response.status_code == 200
    assert verification_history_response.json() == []

    verification_archive_response = await client.get(
        f"/api/v1/equipment/verifications/{verification['id']}/archive.zip",
        headers=admin_headers,
    )
    assert verification_archive_response.status_code == 404


@pytest.mark.anyio
async def test_si_can_have_independent_active_verification_with_its_own_dialog(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Поверочная папка"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "SI",
            "name": "Манометр",
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "vri-verification-1",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/vri-verification-1",
                "mit_number": "10000-01",
                "mit_title": "Манометр",
                "mit_notation": "DM2005",
                "mi_number": "SN-VER-001",
                "result_docnum": "CERT-VER-001",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "10000-01",
                            "mitypeTitle": "Манометр",
                            "mitypeType": "DM2005",
                            "manufactureNum": "SN-VER-001",
                            "manufactureYear": 2024,
                            "modification": "серия А",
                        }
                    }
                },
            },
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    repair_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        data={
            "route_city": "Тюмень",
            "route_destination": "Ремонтный участок",
            "sent_to_repair_at": "2026-03-19",
        },
    )
    assert repair_response.status_code == 201

    create_verification_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/verification",
        headers=headers,
        data={
            "route_city": "Тюмень",
            "route_destination": "Поверочная лаборатория",
            "sent_to_verification_at": "2026-03-20",
            "initial_message_text": "Прибор подготовлен к поверке.",
        },
        files=[
            (
                "files",
                (
                    "verification-photo.jpg",
                    b"fake-verification-image",
                    "image/jpeg",
                ),
            ),
        ],
    )
    assert create_verification_response.status_code == 201
    verification = create_verification_response.json()
    assert verification["route_city"] == "Тюмень"
    assert verification["route_destination"] == "Поверочная лаборатория"
    assert verification["sent_to_verification_at"] == "2026-03-20"

    verification_messages_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/verification/messages",
        headers=headers,
    )
    assert verification_messages_response.status_code == 200
    verification_messages = verification_messages_response.json()
    assert len(verification_messages) == 1
    assert verification_messages[0]["text"] == "Прибор подготовлен к поверке."
    assert len(verification_messages[0]["attachments"]) == 1
    assert verification_messages[0]["attachments"][0]["file_name"] == "verification-photo.jpg"

    add_verification_message_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/verification/messages",
        headers=headers,
        data={"text": "Добавлен акт передачи в поверку."},
        files=[
            (
                "files",
                (
                    "verification-act.pdf",
                    b"fake-verification-act",
                    "application/pdf",
                ),
            ),
        ],
    )
    assert add_verification_message_response.status_code == 201
    second_message = add_verification_message_response.json()
    assert second_message["text"] == "Добавлен акт передачи в поверку."
    assert len(second_message["attachments"]) == 1
    assert second_message["attachments"][0]["file_name"] == "verification-act.pdf"

    update_milestones_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}/verification",
        headers=headers,
        json={
            "received_at_destination_at": "2026-03-21",
            "handed_to_csm_at": "2026-03-22",
        },
    )
    assert update_milestones_response.status_code == 200
    updated_verification = update_milestones_response.json()
    assert updated_verification["received_at_destination_at"] == "2026-03-21"
    assert updated_verification["handed_to_csm_at"] == "2026-03-22"

    equipment_detail_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
    )
    assert equipment_detail_response.status_code == 200
    equipment_detail = equipment_detail_response.json()
    assert equipment_detail["status"] == "IN_REPAIR"
    assert equipment_detail["active_repair"] is not None
    assert equipment_detail["active_verification"] is not None
    assert equipment_detail["active_verification"]["route_destination"] == "Поверочная лаборатория"
    assert equipment_detail["active_verification"]["received_at_destination_at"] == "2026-03-21"
    assert equipment_detail["active_verification"]["handed_to_csm_at"] == "2026-03-22"

    verification_messages_after_update_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}/verification/messages",
        headers=headers,
    )
    assert verification_messages_after_update_response.status_code == 200
    verification_messages_after_update = verification_messages_after_update_response.json()
    assert len(verification_messages_after_update) == 4
    assert "Получение в пункте назначения" in verification_messages_after_update[2]["text"]
    assert "Передано в ЦСМ" in verification_messages_after_update[3]["text"]

    duplicate_verification_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/verification",
        headers=headers,
        data={
            "route_city": "Екатеринбург",
            "route_destination": "Вторая поверка",
            "sent_to_verification_at": "2026-03-21",
        },
    )
    assert duplicate_verification_response.status_code == 409
    assert (
        duplicate_verification_response.json()["detail"]
        == "Для этого прибора уже есть активная поверка."
    )

    close_verification_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/verification/close",
        headers=headers,
    )
    assert close_verification_response.status_code == 200

    equipment_detail_after_close_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
    )
    assert equipment_detail_after_close_response.status_code == 200
    equipment_detail_after_close = equipment_detail_after_close_response.json()
    assert equipment_detail_after_close["status"] == "IN_REPAIR"
    assert equipment_detail_after_close["active_repair"] is not None
    assert equipment_detail_after_close["active_verification"] is None


@pytest.mark.anyio
async def test_closing_verification_restores_equipment_status_to_in_work(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Закрытие поверки"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "SI",
            "name": "Термометр",
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "vri-close-verification-1",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/vri-close-verification-1",
                "mit_number": "30000-01",
                "mit_title": "Термометр",
                "mit_notation": "TM-100",
                "mi_number": "THERM-001",
                "result_docnum": "CERT-CLOSE-001",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "30000-01",
                            "mitypeTitle": "Термометр",
                            "mitypeType": "TM-100",
                            "manufactureNum": "THERM-001",
                            "manufactureYear": 2024,
                            "modification": "серия T",
                        }
                    }
                },
            },
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    create_verification_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/verification",
        headers=headers,
        data={
            "route_city": "Тюмень",
            "route_destination": "ЦСМ",
            "sent_to_verification_at": "2026-03-20",
        },
    )
    assert create_verification_response.status_code == 201

    close_verification_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/verification/close",
        headers=headers,
    )
    assert close_verification_response.status_code == 200

    equipment_detail_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
    )
    assert equipment_detail_response.status_code == 200
    equipment_detail = equipment_detail_response.json()
    assert equipment_detail["status"] == "IN_WORK"
    assert equipment_detail["active_repair"] is None
    assert equipment_detail["active_verification"] is None


@pytest.mark.anyio
async def test_verification_queue_lists_active_si_verifications(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Очередь поверки"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "ХАЛ",
            "equipment_type": "SI",
            "name": "Скоба",
            "modification": "серии 523",
            "serial_number": "00024605",
            "manufacture_year": 2020,
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "vri-queue-1",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/vri-queue-1",
                "mit_number": "60026-15",
                "mit_title": "Скобы с отсчетным устройством",
                "mit_notation": "201, 523",
                "mi_number": "00024605",
                "result_docnum": "С-АСГ/07-03-2026/509468383",
                "verification_date": "2026-03-07T00:00:00",
                "valid_date": "2027-03-06T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "60026-15",
                            "mitypeTitle": "Скобы с отсчетным устройством",
                            "mitypeType": "201, 523",
                            "manufactureNum": "00024605",
                            "manufactureYear": 2020,
                            "modification": "серии 523",
                        }
                    }
                },
            },
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    repair_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/repair",
        headers=headers,
        data={
            "route_city": "Тюмень",
            "route_destination": "Ремонтный участок",
            "sent_to_repair_at": "2026-03-19",
        },
    )
    assert repair_response.status_code == 201

    verification_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/verification",
        headers=headers,
        data={
            "route_city": "Арзамас",
            "route_destination": "Поверочная лаборатория",
            "sent_to_verification_at": "2026-03-20",
        },
    )
    assert verification_response.status_code == 201

    queue_response = await client.get(
        "/api/v1/equipment/verifications",
        headers=headers,
        params={
            "lifecycle_status": "active",
            "query": "509468383",
        },
    )
    assert queue_response.status_code == 200
    payload = queue_response.json()
    assert len(payload) == 1
    assert payload[0]["equipment_id"] == equipment["id"]
    assert payload[0]["equipment_name"] == "Скоба"
    assert payload[0]["route_city"] == "Арзамас"
    assert payload[0]["route_destination"] == "Поверочная лаборатория"
    assert payload[0]["result_docnum"] == "С-АСГ/07-03-2026/509468383"
    assert payload[0]["has_active_repair"] is True


@pytest.mark.anyio
async def test_verification_queue_can_be_filtered_by_folder(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    first_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Поверка папка 1"},
    )
    second_folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Поверка папка 2"},
    )
    assert first_folder_response.status_code == 201
    assert second_folder_response.status_code == 201
    first_folder_id = first_folder_response.json()["id"]
    second_folder_id = second_folder_response.json()["id"]

    first_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": first_folder_id,
            "object_name": "ХАЛ",
            "equipment_type": "SI",
            "name": "Манометр 1",
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "verification-folder-1",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/verification-folder-1",
                "mit_number": "10000-01",
                "mit_title": "Манометр",
                "mit_notation": "DM-1",
                "mi_number": "VF-001",
                "result_docnum": "CERT-VF-001",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {"miInfo": {"singleMI": {"manufactureYear": 2024}}},
            },
        },
    )
    second_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": second_folder_id,
            "object_name": "ХАЛ",
            "equipment_type": "SI",
            "name": "Манометр 2",
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "verification-folder-2",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/verification-folder-2",
                "mit_number": "10000-02",
                "mit_title": "Манометр",
                "mit_notation": "DM-2",
                "mi_number": "VF-002",
                "result_docnum": "CERT-VF-002",
                "verification_date": "2026-03-02T00:00:00",
                "valid_date": "2027-03-02T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {"miInfo": {"singleMI": {"manufactureYear": 2025}}},
            },
        },
    )
    assert first_equipment_response.status_code == 201
    assert second_equipment_response.status_code == 201

    first_verification_response = await client.post(
        f"/api/v1/equipment/{first_equipment_response.json()['id']}/verification",
        headers=headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Иркутск",
            "sent_to_verification_at": "2026-03-20",
        },
    )
    second_verification_response = await client.post(
        f"/api/v1/equipment/{second_equipment_response.json()['id']}/verification",
        headers=headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Тюмень",
            "sent_to_verification_at": "2026-03-21",
        },
    )
    assert first_verification_response.status_code == 201
    assert second_verification_response.status_code == 201

    filtered_response = await client.get(
        f"/api/v1/equipment/verifications?lifecycle_status=active&folder_id={first_folder_id}",
        headers=headers,
    )
    assert filtered_response.status_code == 200
    filtered_items = filtered_response.json()
    assert len(filtered_items) == 1
    assert filtered_items[0]["folder_id"] == first_folder_id
    assert filtered_items[0]["equipment_name"] == "Манометр 1"


@pytest.mark.anyio
async def test_verification_milestones_reject_invalid_stage_order(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Валидация поверки"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Комната СИ",
            "equipment_type": "SI",
            "name": "Манометр",
            "serial_number": "V-ORDER-1",
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "verification-order-si-1",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/verification-order-si-1",
                "mit_number": "20000-99",
                "mit_title": "Манометр",
                "mit_notation": "M-10",
                "mi_number": "V-ORDER-1",
                "result_docnum": "CERT-V-ORDER-1",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {"miInfo": {"singleMI": {"manufactureYear": 2025}}},
            },
        },
    )
    assert equipment_response.status_code == 201
    equipment = equipment_response.json()

    create_verification_response = await client.post(
        f"/api/v1/equipment/{equipment['id']}/verification",
        headers=headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Иркутск",
            "sent_to_verification_at": "2026-03-20",
        },
    )
    assert create_verification_response.status_code == 201

    invalid_update_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}/verification",
        headers=headers,
        json={
            "handed_to_csm_at": "2026-03-21",
            "received_at_destination_at": None,
        },
    )
    assert invalid_update_response.status_code == 422
    assert (
        invalid_update_response.json()["detail"]
        == "Этап «Передано в ЦСМ» нельзя указать раньше, чем этап «Получение в пункте назначения»."
    )


@pytest.mark.anyio
async def test_verification_queue_page_paginates_by_groups_without_splitting_batch(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Пагинация поверок"},
    )
    assert folder_response.status_code == 201
    folder_id = folder_response.json()["id"]

    batch_equipment_ids: list[int] = []
    for index in range(2):
        equipment_response = await client.post(
            "/api/v1/equipment",
            headers=headers,
            json={
                "folder_id": folder_id,
                "object_name": "Комната СИ",
                "equipment_type": "SI",
                "name": f"Манометр партии #{index + 1}",
                "status": "IN_WORK",
                "si_verification": {
                    "vri_id": f"verification-page-batch-{index + 1}",
                    "arshin_url": (
                        "https://fgis.gost.ru/fundmetrology/cm/results/"
                        f"verification-page-batch-{index + 1}"
                    ),
                    "mit_number": "30000-01",
                    "mit_title": "Манометр",
                    "mit_notation": "M-20",
                    "mi_number": f"VP-BATCH-00{index + 1}",
                    "result_docnum": f"CERT-VP-BATCH-00{index + 1}",
                    "verification_date": "2026-03-01T00:00:00",
                    "valid_date": "2027-03-01T00:00:00",
                    "raw_payload_json": {"source": "test"},
                    "detail_payload_json": {"miInfo": {"singleMI": {"manufactureYear": 2025}}},
                },
            },
        )
        assert equipment_response.status_code == 201
        batch_equipment_ids.append(equipment_response.json()["id"])

    single_equipment_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder_id,
            "object_name": "Комната СИ",
            "equipment_type": "SI",
            "name": "Одиночная поверка",
            "status": "IN_WORK",
            "si_verification": {
                "vri_id": "verification-page-single",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/verification-page-single",
                "mit_number": "30000-01",
                "mit_title": "Манометр",
                "mit_notation": "M-20",
                "mi_number": "VP-SINGLE-001",
                "result_docnum": "CERT-VP-SINGLE-001",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": {"source": "test"},
                "detail_payload_json": {"miInfo": {"singleMI": {"manufactureYear": 2025}}},
            },
        },
    )
    assert single_equipment_response.status_code == 201
    single_equipment_id = single_equipment_response.json()["id"]

    batch_response = await client.post(
        "/api/v1/equipment/verifications/bulk",
        headers=headers,
        files=[
            *[("equipment_ids", (None, str(equipment_id))) for equipment_id in batch_equipment_ids],
            ("batch_name", (None, "Партия поверки")),
            ("route_city", (None, "Ленск")),
            ("route_destination", (None, "Иркутск")),
            ("sent_to_verification_at", (None, "2026-03-21")),
        ],
    )
    assert batch_response.status_code == 201
    batch_payload = batch_response.json()
    assert len(batch_payload) == 2

    single_verification_response = await client.post(
        f"/api/v1/equipment/{single_equipment_id}/verification",
        headers=headers,
        data={
            "route_city": "Ленск",
            "route_destination": "Тюмень",
            "sent_to_verification_at": "2026-03-20",
        },
    )
    assert single_verification_response.status_code == 201

    first_page_response = await client.get(
        "/api/v1/equipment/verifications/page",
        headers=headers,
        params={"lifecycle_status": "active", "limit": 1, "offset": 0},
    )
    assert first_page_response.status_code == 200
    first_page = first_page_response.json()
    assert first_page["total_groups"] == 2
    assert first_page["total_items"] == 3
    assert len(first_page["items"]) == 2
    assert {item["batch_key"] for item in first_page["items"]} == {batch_payload[0]["batch_key"]}

    second_page_response = await client.get(
        "/api/v1/equipment/verifications/page",
        headers=headers,
        params={"lifecycle_status": "active", "limit": 1, "offset": 1},
    )
    assert second_page_response.status_code == 200
    second_page = second_page_response.json()
    assert second_page["total_groups"] == 2
    assert second_page["total_items"] == 3
    assert len(second_page["items"]) == 1
    assert second_page["items"][0]["batch_key"] is None
    assert second_page["items"][0]["equipment_name"] == "Одиночная поверка"


@pytest.mark.anyio
async def test_bulk_verification_creates_grouped_records(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Групповая поверка"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_ids: list[int] = []
    for index in range(2):
        equipment_response = await client.post(
            "/api/v1/equipment",
            headers=headers,
            json={
                "folder_id": folder["id"],
                "object_name": "Комната подготовки воды",
                "equipment_type": "SI",
                "name": f"Манометр #{index + 1}",
                "status": "IN_WORK",
                "si_verification": {
                    "vri_id": f"bulk-vri-{index + 1}",
                    "arshin_url": (
                        f"https://fgis.gost.ru/fundmetrology/cm/results/bulk-vri-{index + 1}"
                    ),
                    "mit_number": "10000-01",
                    "mit_title": "Манометр",
                    "mit_notation": "DM2005",
                    "mi_number": f"SN-BULK-00{index + 1}",
                    "result_docnum": f"CERT-BULK-00{index + 1}",
                    "verification_date": "2026-03-01T00:00:00",
                    "valid_date": "2027-03-01T00:00:00",
                    "raw_payload_json": {"source": "test"},
                    "detail_payload_json": {"miInfo": {"singleMI": {"manufactureYear": 2024}}},
                },
            },
        )
        assert equipment_response.status_code == 201
        equipment_ids.append(equipment_response.json()["id"])

    bulk_response = await client.post(
        "/api/v1/equipment/verifications/bulk",
        headers=headers,
        files=[
            *[("equipment_ids", (None, str(equipment_id))) for equipment_id in equipment_ids],
            ("batch_name", (None, "Комната подготовки воды / март")),
            ("route_city", (None, "Ленск")),
            ("route_destination", (None, "Иркутск")),
            ("sent_to_verification_at", (None, "2026-03-20")),
            ("initial_message_text", (None, "Ящик с приборами отправлен в поверку.")),
            (
                "files",
                (
                    "verification-batch-photo.jpg",
                    b"fake-verification-batch-image",
                    "image/jpeg",
                ),
            ),
        ],
    )
    assert bulk_response.status_code == 201
    payload = bulk_response.json()
    assert len(payload) == 2
    assert payload[0]["batch_name"] == "Комната подготовки воды / март"
    assert payload[0]["batch_key"] is not None
    assert payload[1]["batch_key"] == payload[0]["batch_key"]

    queue_response = await client.get(
        "/api/v1/equipment/verifications",
        headers=headers,
        params={"lifecycle_status": "active", "query": "Комната подготовки воды / март"},
    )
    assert queue_response.status_code == 200
    queue_payload = queue_response.json()
    assert len(queue_payload) == 2
    assert all(row["batch_name"] == "Комната подготовки воды / март" for row in queue_payload)

    first_messages_response = await client.get(
        f"/api/v1/equipment/{equipment_ids[0]}/verification/messages",
        headers=headers,
    )
    assert first_messages_response.status_code == 200
    first_messages = first_messages_response.json()
    assert len(first_messages) == 1
    assert first_messages[0]["text"] == "Ящик с приборами отправлен в поверку."
    assert len(first_messages[0]["attachments"]) == 1
    assert first_messages[0]["attachments"][0]["file_name"] == "verification-batch-photo.jpg"

    second_messages_response = await client.get(
        f"/api/v1/equipment/{equipment_ids[1]}/verification/messages",
        headers=headers,
    )
    assert second_messages_response.status_code == 200
    second_messages = second_messages_response.json()
    assert len(second_messages) == 1
    assert second_messages[0]["text"] == "Ящик с приборами отправлен в поверку."

    add_group_message_response = await client.post(
        f"/api/v1/equipment/{equipment_ids[1]}/verification/messages",
        headers=headers,
        data={"text": "Группа получена в Иркутске."},
    )
    assert add_group_message_response.status_code == 201

    messages_from_first_after_update = await client.get(
        f"/api/v1/equipment/{equipment_ids[0]}/verification/messages",
        headers=headers,
    )
    assert messages_from_first_after_update.status_code == 200
    shared_messages = messages_from_first_after_update.json()
    assert len(shared_messages) == 2
    assert shared_messages[1]["text"] == "Группа получена в Иркутске."

    update_batch_response = await client.patch(
        f"/api/v1/equipment/verifications/batch/{payload[0]['batch_key']}",
        headers=headers,
        json={"received_at_destination_at": "2026-03-21"},
    )
    assert update_batch_response.status_code == 200
    updated_batch = update_batch_response.json()
    assert len(updated_batch) == 2
    assert all(item["received_at_destination_at"] == "2026-03-21" for item in updated_batch)


@pytest.mark.anyio
async def test_operator_can_add_and_remove_repair_batch_items(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Редактирование группы ремонта"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_ids: list[int] = []
    for index in range(3):
        equipment_response = await client.post(
            "/api/v1/equipment",
            headers=headers,
            json={
                "folder_id": folder["id"],
                "object_name": "Подготовка воды",
                "equipment_type": "OTHER",
                "name": f"Партия ремонта #{index + 1}",
                "serial_number": f"R-BATCH-{index + 1}",
                "status": "IN_WORK",
            },
        )
        assert equipment_response.status_code == 201
        equipment_ids.append(equipment_response.json()["id"])

    batch_response = await client.post(
        "/api/v1/equipment/repairs/bulk",
        headers=headers,
        files=[
            *[("equipment_ids", (None, str(equipment_id))) for equipment_id in equipment_ids[:2]],
            ("batch_name", (None, "Партия ремонта / апрель")),
            ("route_city", (None, "Ленск")),
            ("route_destination", (None, "Тюмень")),
            ("sent_to_repair_at", (None, "2026-03-20")),
            ("initial_message_text", (None, "Партия приборов отправлена в ремонт.")),
        ],
    )
    assert batch_response.status_code == 201
    batch_key = batch_response.json()[0]["batch_key"]
    assert batch_key is not None

    update_batch_response = await client.patch(
        f"/api/v1/equipment/repairs/batch/{batch_key}",
        headers=headers,
        json={"arrived_to_destination_at": "2026-03-21"},
    )
    assert update_batch_response.status_code == 200

    add_item_response = await client.patch(
        f"/api/v1/equipment/repairs/batch/{batch_key}/items",
        headers=headers,
        json={"add_equipment_ids": [equipment_ids[2]]},
    )
    assert add_item_response.status_code == 200
    added_batch = add_item_response.json()
    assert len(added_batch) == 3
    assert all(item["batch_key"] == batch_key for item in added_batch)
    assert all(item["arrived_to_destination_at"] == "2026-03-21" for item in added_batch)

    third_detail_response = await client.get(
        f"/api/v1/equipment/{equipment_ids[2]}",
        headers=headers,
    )
    assert third_detail_response.status_code == 200
    third_detail = third_detail_response.json()
    assert third_detail["active_repair"]["batch_key"] == batch_key
    assert third_detail["active_repair"]["arrived_to_destination_at"] == "2026-03-21"

    third_messages_response = await client.get(
        f"/api/v1/equipment/{equipment_ids[2]}/repair/messages",
        headers=headers,
    )
    assert third_messages_response.status_code == 200
    third_texts = [message["text"] for message in third_messages_response.json() if message["text"]]
    assert third_texts[0] == "Партия приборов отправлена в ремонт."
    assert any("Партия ремонта #3 (зав. № R-BATCH-3)." in text for text in third_texts)

    remove_item_response = await client.patch(
        f"/api/v1/equipment/repairs/batch/{batch_key}/items",
        headers=headers,
        json={"remove_equipment_ids": [equipment_ids[1]]},
    )
    assert remove_item_response.status_code == 200
    remaining_batch = remove_item_response.json()
    assert len(remaining_batch) == 2
    assert {item["equipment_id"] for item in remaining_batch} == {
        equipment_ids[0],
        equipment_ids[2],
    }

    detached_detail_response = await client.get(
        f"/api/v1/equipment/{equipment_ids[1]}",
        headers=headers,
    )
    assert detached_detail_response.status_code == 200
    detached_detail = detached_detail_response.json()
    assert detached_detail["active_repair"] is not None
    assert detached_detail["active_repair"]["batch_key"] is None
    assert detached_detail["active_repair"]["batch_name"] is None

    detached_messages_response = await client.get(
        f"/api/v1/equipment/{equipment_ids[1]}/repair/messages",
        headers=headers,
    )
    assert detached_messages_response.status_code == 200
    detached_texts = [
        message["text"] for message in detached_messages_response.json() if message["text"]
    ]
    assert "Партия приборов отправлена в ремонт." in detached_texts
    assert any("Партия ремонта #2 (зав. № R-BATCH-2)." in text for text in detached_texts)
    assert any("Прибор выведен из группы" in text for text in detached_texts)


@pytest.mark.anyio
async def test_operator_can_add_and_remove_verification_batch_items(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Редактирование группы поверки"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    equipment_ids: list[int] = []
    for index in range(3):
        equipment_response = await client.post(
            "/api/v1/equipment",
            headers=headers,
            json={
                "folder_id": folder["id"],
                "object_name": "Подготовка воды",
                "equipment_type": "SI",
                "name": f"Партия поверки #{index + 1}",
                "serial_number": f"V-BATCH-{index + 1}",
                "status": "IN_WORK",
                "si_verification": {
                    "vri_id": f"batch-edit-vri-{index + 1}",
                    "arshin_url": (
                        f"https://fgis.gost.ru/fundmetrology/cm/results/batch-edit-vri-{index + 1}"
                    ),
                    "mit_number": "10000-01",
                    "mit_title": "Манометр",
                    "mit_notation": "DM2005",
                    "mi_number": f"SN-BATCH-EDIT-{index + 1}",
                    "result_docnum": f"CERT-BATCH-EDIT-{index + 1}",
                    "verification_date": "2026-03-01T00:00:00",
                    "valid_date": "2027-03-01T00:00:00",
                    "raw_payload_json": {"source": "test"},
                    "detail_payload_json": {"miInfo": {"singleMI": {"manufactureYear": 2024}}},
                },
            },
        )
        assert equipment_response.status_code == 201
        equipment_ids.append(equipment_response.json()["id"])

    batch_response = await client.post(
        "/api/v1/equipment/verifications/bulk",
        headers=headers,
        files=[
            *[("equipment_ids", (None, str(equipment_id))) for equipment_id in equipment_ids[:2]],
            ("batch_name", (None, "Партия поверки / апрель")),
            ("route_city", (None, "Ленск")),
            ("route_destination", (None, "Иркутск")),
            ("sent_to_verification_at", (None, "2026-03-20")),
            ("initial_message_text", (None, "Партия приборов отправлена в поверку.")),
        ],
    )
    assert batch_response.status_code == 201
    batch_key = batch_response.json()[0]["batch_key"]
    assert batch_key is not None

    update_batch_response = await client.patch(
        f"/api/v1/equipment/verifications/batch/{batch_key}",
        headers=headers,
        json={"received_at_destination_at": "2026-03-21"},
    )
    assert update_batch_response.status_code == 200

    add_item_response = await client.patch(
        f"/api/v1/equipment/verifications/batch/{batch_key}/items",
        headers=headers,
        json={"add_equipment_ids": [equipment_ids[2]]},
    )
    assert add_item_response.status_code == 200
    added_batch = add_item_response.json()
    assert len(added_batch) == 3
    assert all(item["batch_key"] == batch_key for item in added_batch)
    assert all(item["received_at_destination_at"] == "2026-03-21" for item in added_batch)

    third_detail_response = await client.get(
        f"/api/v1/equipment/{equipment_ids[2]}",
        headers=headers,
    )
    assert third_detail_response.status_code == 200
    third_detail = third_detail_response.json()
    assert third_detail["active_verification"]["batch_key"] == batch_key
    assert third_detail["active_verification"]["received_at_destination_at"] == "2026-03-21"

    third_messages_response = await client.get(
        f"/api/v1/equipment/{equipment_ids[2]}/verification/messages",
        headers=headers,
    )
    assert third_messages_response.status_code == 200
    third_texts = [message["text"] for message in third_messages_response.json() if message["text"]]
    assert third_texts[0] == "Партия приборов отправлена в поверку."
    assert any("Партия поверки #3 (зав. № V-BATCH-3)." in text for text in third_texts)

    remove_item_response = await client.patch(
        f"/api/v1/equipment/verifications/batch/{batch_key}/items",
        headers=headers,
        json={"remove_equipment_ids": [equipment_ids[1]]},
    )
    assert remove_item_response.status_code == 200
    remaining_batch = remove_item_response.json()
    assert len(remaining_batch) == 2
    assert {item["equipment_id"] for item in remaining_batch} == {
        equipment_ids[0],
        equipment_ids[2],
    }

    detached_detail_response = await client.get(
        f"/api/v1/equipment/{equipment_ids[1]}",
        headers=headers,
    )
    assert detached_detail_response.status_code == 200
    detached_detail = detached_detail_response.json()
    assert detached_detail["active_verification"] is not None
    assert detached_detail["active_verification"]["batch_key"] is None
    assert detached_detail["active_verification"]["batch_name"] is None


@pytest.mark.anyio
async def test_deleting_archived_repair_and_verification_batch_removes_whole_group(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Удаление архивных групп"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    repair_equipment_ids: list[int] = []
    for index in range(2):
        equipment_response = await client.post(
            "/api/v1/equipment",
            headers=headers,
            json={
                "folder_id": folder["id"],
                "object_name": "ХАЛ",
                "equipment_type": "OTHER",
                "name": f"Группа ремонта #{index + 1}",
                "serial_number": f"DEL-R-BATCH-{index + 1}",
                "status": "IN_WORK",
            },
        )
        assert equipment_response.status_code == 201
        repair_equipment_ids.append(equipment_response.json()["id"])

    create_repair_batch_response = await client.post(
        "/api/v1/equipment/repairs/bulk",
        headers=headers,
        files=[
            *[
                ("equipment_ids", (None, str(equipment_id)))
                for equipment_id in repair_equipment_ids
            ],
            ("batch_name", (None, "Архив группы ремонта")),
            ("route_city", (None, "Ленск")),
            ("route_destination", (None, "Тюмень")),
            ("sent_to_repair_at", (None, "2026-03-20")),
            ("initial_message_text", (None, "Групповой архив ремонта.")),
        ],
    )
    assert create_repair_batch_response.status_code == 201
    repair_batch = create_repair_batch_response.json()
    repair_batch_key = repair_batch[0]["batch_key"]
    assert repair_batch_key is not None

    update_repair_batch_response = await client.patch(
        f"/api/v1/equipment/repairs/batch/{repair_batch_key}",
        headers=headers,
        json={
            "arrived_to_destination_at": "2026-03-21",
            "sent_from_repair_at": "2026-03-25",
            "sent_from_irkutsk_at": "2026-03-26",
            "arrived_to_lensk_at": "2026-03-28",
            "actually_received_at": "2026-03-29",
            "incoming_control_at": "2026-03-30",
            "paid_at": "2026-04-01",
            "custom_stages": with_last_process_stage_date(repair_batch[0], "2026-04-01"),
        },
    )
    assert update_repair_batch_response.status_code == 200

    close_repair_batch_response = await client.post(
        f"/api/v1/equipment/repairs/batch/{repair_batch_key}/close",
        headers=headers,
    )
    assert close_repair_batch_response.status_code == 200

    delete_repair_batch_response = await client.delete(
        f"/api/v1/equipment/repairs/{repair_batch[0]['id']}",
        headers=headers,
    )
    assert delete_repair_batch_response.status_code == 204

    for equipment_id in repair_equipment_ids:
        repair_history_response = await client.get(
            f"/api/v1/equipment/{equipment_id}/repair/history",
            headers=headers,
        )
        assert repair_history_response.status_code == 200
        assert repair_history_response.json() == []

    repair_archive_response = await client.get(
        f"/api/v1/equipment/repairs/{repair_batch[0]['id']}/archive.zip",
        headers=headers,
    )
    assert repair_archive_response.status_code == 404

    verification_equipment_ids: list[int] = []
    for index in range(2):
        equipment_response = await client.post(
            "/api/v1/equipment",
            headers=headers,
            json={
                "folder_id": folder["id"],
                "object_name": "ХАЛ",
                "equipment_type": "SI",
                "name": f"Группа поверки #{index + 1}",
                "serial_number": f"DEL-V-BATCH-{index + 1}",
                "status": "IN_WORK",
                "si_verification": {
                    "vri_id": f"delete-batch-vri-{index + 1}",
                    "arshin_url": (
                        "https://fgis.gost.ru/fundmetrology/cm/results/"
                        f"delete-batch-vri-{index + 1}"
                    ),
                    "mit_number": "70000-01",
                    "mit_title": "Поверочный прибор",
                    "mit_notation": "VP-1",
                    "mi_number": f"VP-DEL-BATCH-{index + 1}",
                    "result_docnum": f"CERT-DEL-BATCH-{index + 1}",
                    "verification_date": "2026-03-01T00:00:00",
                    "valid_date": "2027-03-01T00:00:00",
                    "raw_payload_json": {"source": "test"},
                    "detail_payload_json": {
                        "miInfo": {
                            "singleMI": {
                                "mitypeNumber": "70000-01",
                                "mitypeTitle": "Поверочный прибор",
                                "mitypeType": "VP-1",
                                "manufactureNum": f"VP-DEL-BATCH-{index + 1}",
                                "manufactureYear": 2024,
                                "modification": "серия V",
                            }
                        }
                    },
                },
            },
        )
        assert equipment_response.status_code == 201
        verification_equipment_ids.append(equipment_response.json()["id"])

    create_verification_batch_response = await client.post(
        "/api/v1/equipment/verifications/bulk",
        headers=headers,
        files=[
            *[
                ("equipment_ids", (None, str(equipment_id)))
                for equipment_id in verification_equipment_ids
            ],
            ("batch_name", (None, "Архив группы поверки")),
            ("route_city", (None, "Ленск")),
            ("route_destination", (None, "Иркутск")),
            ("sent_to_verification_at", (None, "2026-03-20")),
            ("initial_message_text", (None, "Групповой архив поверки.")),
        ],
    )
    assert create_verification_batch_response.status_code == 201
    verification_batch = create_verification_batch_response.json()
    verification_batch_key = verification_batch[0]["batch_key"]
    assert verification_batch_key is not None

    close_verification_batch_response = await client.post(
        f"/api/v1/equipment/verifications/batch/{verification_batch_key}/close",
        headers=headers,
    )
    assert close_verification_batch_response.status_code == 200

    delete_verification_batch_response = await client.delete(
        f"/api/v1/equipment/verifications/{verification_batch[0]['id']}",
        headers=headers,
    )
    assert delete_verification_batch_response.status_code == 204

    for equipment_id in verification_equipment_ids:
        verification_history_response = await client.get(
            f"/api/v1/equipment/{equipment_id}/verification/history",
            headers=headers,
        )
        assert verification_history_response.status_code == 200
        assert verification_history_response.json() == []

    verification_archive_response = await client.get(
        f"/api/v1/equipment/verifications/{verification_batch[0]['id']}/archive.zip",
        headers=headers,
    )
    assert verification_archive_response.status_code == 404

    detached_messages_response = await client.get(
        f"/api/v1/equipment/{verification_equipment_ids[1]}/verification/messages",
        headers=headers,
    )
    assert detached_messages_response.status_code == 404


@pytest.mark.anyio
async def test_operator_can_create_manual_si_without_arshin(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Ручные СИ"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    create_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Узел учета",
            "equipment_type": "SI",
            "name": "Манометр",
            "modification": "МП-01",
            "serial_number": "MAN-001",
            "status": "IN_WORK",
            "created_manually": True,
            "exclude_from_arshin_refresh": True,
            "si_verification": {
                "vri_id": None,
                "arshin_url": None,
                "org_title": None,
                "mit_number": None,
                "mit_title": "Манометр",
                "mit_notation": "МП-01",
                "mi_number": "MAN-001",
                "certificate_number": "MAN-CERT-001",
                "result_docnum": "MAN-CERT-001",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": None,
                "detail_payload_json": None,
            },
        },
    )
    assert create_response.status_code == 201
    equipment = create_response.json()

    assert equipment["created_manually"] is True
    assert equipment["exclude_from_arshin_refresh"] is True
    assert equipment["si_verification"]["certificate_number"] == "MAN-CERT-001"
    assert equipment["si_verification"]["result_docnum"] == "MAN-CERT-001"
    assert equipment["si_verification"]["vri_id"].startswith("manual:si:")

    update_response = await client.patch(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
        json={
            "exclude_from_arshin_refresh": False,
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["exclude_from_arshin_refresh"] is False


@pytest.mark.anyio
async def test_operator_can_create_manual_esi_without_arshin(
    client: AsyncClient,
    db_engine,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Ручные ЭСИ"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    create_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Эталонный пост",
            "equipment_type": "ESI",
            "name": "Эталон давления",
            "modification": "ЭСИ-100",
            "serial_number": "ESI-001",
            "status": "IN_WORK",
            "created_manually": True,
            "exclude_from_arshin_refresh": False,
            "si_verification": {
                "vri_id": None,
                "arshin_url": None,
                "org_title": None,
                "mit_number": None,
                "mit_title": "Эталон давления",
                "mit_notation": "ЭСИ-100",
                "mi_number": "ESI-001",
                "certificate_number": "ESI-CERT-001",
                "result_docnum": "REG-ESI-001",
                "verification_date": "2026-02-01T00:00:00",
                "valid_date": "2027-02-01T00:00:00",
                "raw_payload_json": None,
                "detail_payload_json": None,
            },
        },
    )
    assert create_response.status_code == 201
    equipment = create_response.json()

    assert equipment["created_manually"] is True
    assert equipment["exclude_from_arshin_refresh"] is False
    assert equipment["si_verification"]["certificate_number"] == "ESI-CERT-001"
    assert equipment["si_verification"]["result_docnum"] == "REG-ESI-001"
    assert equipment["si_verification"]["vri_id"].startswith("manual:esi:")


@pytest.mark.anyio
async def test_folder_refresh_marks_manual_si_as_updated_and_clears_flags_after_apply(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Папка ручного refresh"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    create_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Узел учета",
            "equipment_type": "SI",
            "name": "Манометр",
            "modification": "МП-02",
            "serial_number": "MAN-REFRESH-001",
            "status": "IN_WORK",
            "created_manually": True,
            "exclude_from_arshin_refresh": False,
            "si_verification": {
                "vri_id": None,
                "arshin_url": None,
                "org_title": None,
                "mit_number": None,
                "mit_title": "Манометр",
                "mit_notation": "МП-02",
                "mi_number": "MAN-REFRESH-001",
                "certificate_number": "MAN-CERT-REFRESH-001",
                "result_docnum": "MAN-CERT-REFRESH-001",
                "verification_date": "2026-03-01T00:00:00",
                "valid_date": "2027-03-01T00:00:00",
                "raw_payload_json": None,
                "detail_payload_json": None,
            },
        },
    )
    assert create_response.status_code == 201
    equipment = create_response.json()

    async def fake_match_si(
        self: FolderRefreshMatcher,
        *,
        current_certificate_number: str,
        current_verification_date,
        current_valid_date,
    ) -> FolderRefreshMatchResult:
        assert current_certificate_number == "MAN-CERT-REFRESH-001"
        assert current_verification_date is not None
        assert current_valid_date is not None
        return FolderRefreshMatchResult(
            found=True,
            certificate_updated=False,
            uncertain_update=False,
            stage2_successful=False,
            modification_relaxed=False,
            notation_relaxed=False,
            current_certificate_number=current_certificate_number,
            matched_certificate_number="ARSHIN-CERT-777",
            matched_registry_number=None,
            matched_vri_id="ARSHIN-VRI-777",
            matched_arshin_url="https://fgis.gost.ru/fundmetrology/cm/results/ARSHIN-VRI-777",
            matched_verification_date=datetime.fromisoformat("2026-04-01T00:00:00"),
            matched_valid_date=datetime.fromisoformat("2027-04-01T00:00:00"),
            payload=SIVerificationCreateRequest(
                vri_id="ARSHIN-VRI-777",
                arshin_url="https://fgis.gost.ru/fundmetrology/cm/results/ARSHIN-VRI-777",
                org_title='ФБУ "Тест"',
                mit_number="60026-15",
                mit_title="Манометр",
                mit_notation="МП-02",
                mi_number="MAN-REFRESH-001",
                certificate_number="ARSHIN-CERT-777",
                result_docnum="ARSHIN-CERT-777",
                verification_date=datetime.fromisoformat("2026-04-01T00:00:00"),
                valid_date=datetime.fromisoformat("2027-04-01T00:00:00"),
                raw_payload_json={
                    "vriInfo": {
                        "applicable": {
                            "certNum": "ARSHIN-CERT-777",
                        },
                        "organization": 'ФБУ "Тест"',
                        "vrfDate": "2026-04-01",
                        "validDate": "2027-04-01",
                    }
                },
                detail_payload_json={
                    "miInfo": {
                        "singleMI": {
                            "mitypeNumber": "60026-15",
                            "mitypeTitle": "Манометр",
                            "mitypeType": "МП-02",
                            "manufactureNum": "MAN-REFRESH-001",
                            "manufactureYear": 2024,
                            "modification": "МП-02",
                        }
                    },
                    "vriInfo": {
                        "applicable": {
                            "certNum": "ARSHIN-CERT-777",
                        },
                        "organization": 'ФБУ "Тест"',
                        "vrfDate": "2026-04-01",
                        "validDate": "2027-04-01",
                    },
                },
            ),
            notes="Найдена актуальная запись Аршина.",
        )

    monkeypatch.setattr(FolderRefreshMatcher, "match_si", fake_match_si)

    task_id = create_folder_refresh_task(
        db_engine,
        folder_id=folder["id"],
        user_email=admin_email,
    )
    await process_folder_refresh_task(db_engine, task_id=task_id)

    details_response = await client.get(
        f"/api/v1/equipment/folders/{folder['id']}/refresh-tasks/{task_id}",
        headers=headers,
    )
    assert details_response.status_code == 200
    details = details_response.json()
    assert details["task"]["status"] == "COMPLETED"
    assert details["task"]["total_rows"] == 1
    assert len(details["rows"]) == 1

    row = details["rows"][0]
    assert row["equipment_id"] == equipment["id"]
    assert row["status"] == "UPDATED"
    assert row["matched_certificate_number"] == "ARSHIN-CERT-777"
    assert row["notes"].startswith("Ручная запись сопоставлена с Аршином.")

    apply_response = await client.post(
        f"/api/v1/equipment/folders/{folder['id']}/refresh-tasks/{task_id}/apply",
        headers=headers,
        json={"row_ids": [row["id"]]},
    )
    assert apply_response.status_code == 200
    apply_payload = apply_response.json()
    assert apply_payload["applied_count"] == 1
    assert apply_payload["failed_count"] == 0
    assert apply_payload["results"][0]["applied"] is True

    equipment_details_response = await client.get(
        f"/api/v1/equipment/{equipment['id']}",
        headers=headers,
    )
    assert equipment_details_response.status_code == 200
    refreshed_equipment = equipment_details_response.json()
    assert refreshed_equipment["created_manually"] is False
    assert refreshed_equipment["exclude_from_arshin_refresh"] is False
    assert refreshed_equipment["si_verification"]["vri_id"] == "ARSHIN-VRI-777"
    assert refreshed_equipment["si_verification"]["certificate_number"] == "ARSHIN-CERT-777"
    assert refreshed_equipment["si_verification"]["result_docnum"] == "ARSHIN-CERT-777"


@pytest.mark.anyio
async def test_folder_refresh_retries_target_on_transient_arshin_error(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "folder_refresh_retry_base_seconds", 0.0)
    monkeypatch.setattr(settings, "folder_refresh_max_attempts", 3)

    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Папка retry refresh"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    create_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Узел учета",
            "equipment_type": "SI",
            "name": "Манометр",
            "modification": "МП-03",
            "serial_number": "RETRY-001",
            "status": "IN_WORK",
            "created_manually": True,
            "si_verification": {
                "vri_id": "vri-old-retry",
                "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/vri-old-retry",
                "mit_number": "14061-15",
                "mit_title": "Манометр",
                "mit_notation": "МП-03",
                "mi_number": "RETRY-001",
                "certificate_number": "RETRY-OLD-CERT",
                "result_docnum": "RETRY-OLD-CERT",
                "verification_date": "2025-06-18T00:00:00",
                "valid_date": "2030-06-17T00:00:00",
            },
        },
    )
    assert create_response.status_code == 201, create_response.text

    calls = {"count": 0}

    async def flaky_match_si(
        self: FolderRefreshMatcher,
        *,
        current_certificate_number: str,
        current_verification_date,
        current_valid_date,
    ) -> FolderRefreshMatchResult:
        calls["count"] += 1
        if calls["count"] == 1:
            raise httpx.ConnectError("Arshin temporarily unavailable")
        return FolderRefreshMatchResult(
            found=True,
            certificate_updated=True,
            uncertain_update=False,
            stage2_successful=True,
            modification_relaxed=False,
            notation_relaxed=False,
            current_certificate_number=current_certificate_number,
            matched_certificate_number="RETRY-NEW-CERT",
            matched_registry_number=None,
            matched_vri_id="vri-new-retry",
            matched_arshin_url="https://fgis.gost.ru/fundmetrology/cm/results/vri-new-retry",
            matched_verification_date=datetime.fromisoformat("2026-06-09T00:00:00"),
            matched_valid_date=datetime.fromisoformat("2031-06-08T00:00:00"),
            payload=SIVerificationCreateRequest(
                vri_id="vri-new-retry",
                arshin_url="https://fgis.gost.ru/fundmetrology/cm/results/vri-new-retry",
                org_title='ФБУ "Тест"',
                mit_number="14061-15",
                mit_title="Манометр",
                mit_notation="МП-03",
                mi_number="RETRY-001",
                certificate_number="RETRY-NEW-CERT",
                result_docnum="RETRY-NEW-CERT",
                verification_date=datetime.fromisoformat("2026-06-09T00:00:00"),
                valid_date=datetime.fromisoformat("2031-06-08T00:00:00"),
            ),
            notes="Найдено новое свидетельство о поверке.",
        )

    monkeypatch.setattr(FolderRefreshMatcher, "match_si", flaky_match_si)

    task_id = create_folder_refresh_task(
        db_engine,
        folder_id=folder["id"],
        user_email=admin_email,
    )
    await process_folder_refresh_task(db_engine, task_id=task_id)

    details_response = await client.get(
        f"/api/v1/equipment/folders/{folder['id']}/refresh-tasks/{task_id}",
        headers=headers,
    )
    assert details_response.status_code == 200
    details = details_response.json()
    assert details["task"]["status"] == "COMPLETED"

    row = details["rows"][0]
    assert calls["count"] == 2
    assert row["status"] == "UPDATED"
    assert row["matched_certificate_number"] == "RETRY-NEW-CERT"


@pytest.mark.anyio
async def test_folder_refresh_skips_manual_entries_excluded_from_arshin_refresh(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    folder_response = await client.post(
        "/api/v1/equipment/folders",
        headers=headers,
        json={"name": "Исключенные ручные СИ"},
    )
    assert folder_response.status_code == 201
    folder = folder_response.json()

    create_response = await client.post(
        "/api/v1/equipment",
        headers=headers,
        json={
            "folder_id": folder["id"],
            "object_name": "Архив",
            "equipment_type": "SI",
            "name": "Термометр",
            "modification": "Т-01",
            "serial_number": "SKIP-001",
            "status": "IN_WORK",
            "created_manually": True,
            "exclude_from_arshin_refresh": True,
            "si_verification": {
                "vri_id": None,
                "arshin_url": None,
                "org_title": None,
                "mit_number": None,
                "mit_title": "Термометр",
                "mit_notation": "Т-01",
                "mi_number": "SKIP-001",
                "certificate_number": "SKIP-CERT-001",
                "result_docnum": "SKIP-CERT-001",
                "verification_date": "2020-03-01T00:00:00",
                "valid_date": "2021-03-01T00:00:00",
                "raw_payload_json": None,
                "detail_payload_json": None,
            },
        },
    )
    assert create_response.status_code == 201

    async def fail_match_si(
        self: FolderRefreshMatcher,
        *,
        current_certificate_number: str,
        current_verification_date,
        current_valid_date,
    ) -> FolderRefreshMatchResult:
        pytest.fail(
            "Folder refresh should skip excluded manual SI, "
            f"but tried to match {current_certificate_number}.",
        )

    monkeypatch.setattr(FolderRefreshMatcher, "match_si", fail_match_si)

    task_id = create_folder_refresh_task(
        db_engine,
        folder_id=folder["id"],
        user_email=admin_email,
    )
    await process_folder_refresh_task(db_engine, task_id=task_id)

    details_response = await client.get(
        f"/api/v1/equipment/folders/{folder['id']}/refresh-tasks/{task_id}",
        headers=headers,
    )
    assert details_response.status_code == 200
    details = details_response.json()
    assert details["task"]["status"] == "COMPLETED"
    assert details["task"]["total_rows"] == 0
    assert details["rows"] == []
