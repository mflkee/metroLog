from __future__ import annotations

import pytest
from httpx import AsyncClient
from openpyxl import Workbook, load_workbook
from sqlalchemy.orm import sessionmaker

from app.core.config import settings
from app.schemas.arshin import ArshinSearchResultRead, ArshinVriDetailRead
from app.services.arshin_service import ArshinService
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
        "Серийный номер",
        "Год выпуска",
        "Объект",
        "Локация",
        "Номер свидетельства",
        "Действительно до",
    )
    assert len(rows) == 2
    assert rows[1][0] == "Экспорт реестра"
    assert rows[1][1] == "SI"
    assert rows[1][3] == "Весы лабораторные"
    assert rows[1][9] == "AA 001234"


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
async def test_operator_can_search_arshin_and_si_requires_profile(
    client: AsyncClient,
    db_engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin_email, admin_password = bootstrap_admin(db_engine)
    admin = await login_user(client, email=admin_email, password=admin_password)
    headers = {"Authorization": f"Bearer {admin['access_token']}"}

    async def fake_search_by_certificate(
        self: ArshinService,
        *,
        certificate_number: str,
        year: int | None = None,
    ):
        assert certificate_number == "AA 001234"
        return [
            ArshinSearchResultRead(
                vri_id="1-SI-SEARCH",
                arshin_url="https://fgis.gost.ru/fundmetrology/cm/results/1-SI-SEARCH",
                mit_title="Манометр",
                mit_notation="DM2005",
                mi_modification="серия 5",
                mi_number="SN-7788",
                result_docnum="AA 001234",
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

    monkeypatch.setattr(ArshinService, "search_by_certificate", fake_search_by_certificate)
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
        == "SI equipment must be created from an Arshin search result."
    )


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
        assert "attachment; filename=\"passport.pdf\"" in (
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
        duplicate_repair_response.json()["detail"]
        == "Для этого прибора уже есть активный ремонт."
    )


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
