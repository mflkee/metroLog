from __future__ import annotations

import httpx
import pytest

from app.integrations.arshin_client import ArshinClient
from app.schemas.arshin import (
    ArshinESIDetailRequest,
    ArshinRegistryKind,
    ArshinSearchRequest,
    ArshinSearchResultRead,
)
from app.services.arshin_service import ArshinService


@pytest.mark.anyio
async def test_esi_search_falls_back_to_vri_when_mieta_is_forbidden(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[ArshinRegistryKind, dict[str, str]]] = []

    async def fake_search_records(
        self: ArshinClient,
        *,
        params: dict[str, str],
        registry_kind: ArshinRegistryKind = ArshinRegistryKind.SI,
        max_results: int = 200,
    ) -> list[dict[str, str]]:
        calls.append((registry_kind, params))
        if registry_kind == ArshinRegistryKind.ESI:
            request = httpx.Request("GET", "https://fgis.gost.ru/fundmetrology/eapi/mieta")
            response = httpx.Response(status_code=403, request=request)
            raise httpx.HTTPStatusError("Forbidden", request=request, response=response)

        assert registry_kind == ArshinRegistryKind.SI
        assert params["mit_number"] == "73828-19"
        assert max_results == 200

        return [
            {
                "vri_id": "1-503716224",
                "org_title": 'ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                "mit_number": "73828-19",
                "mit_title": "Калибраторы многофункциональные",
                "mit_notation": "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                "mi_modification": "нет модификации",
                "mi_number": "0050",
                "verification_date": "2026-02-05T00:00:00Z",
                "valid_date": "2027-02-04T00:00:00Z",
                "result_docnum": "С-ВЯ/05-02-2026/503716224",
                "applicability": True,
            },
            {
                "vri_id": "1-503716225",
                "org_title": 'ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                "mit_number": "73828-19",
                "mit_title": "Калибраторы многофункциональные",
                "mit_notation": "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                "mi_modification": "ЭЛМЕТРО-Паскаль-03-0,005",
                "mi_number": "0050",
                "verification_date": "2026-02-05T00:00:00Z",
                "valid_date": "2027-02-04T00:00:00Z",
                "result_docnum": "С-ВЯ/05-02-2026/503716225",
                "applicability": True,
            },
        ]

    async def fake_fetch_vri_detail(
        self: ArshinClient,
        *,
        vri_id: str,
    ) -> dict[str, object]:
        if vri_id == "1-503716224":
            return {
                "miInfo": {
                    "etaMI": {
                        "regNumber": "99999.19.3Р.00000001",
                        "mitypeNumber": "73828-19",
                        "mitypeTitle": "Калибраторы многофункциональные",
                        "mitypeType": "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                        "modification": "нет модификации",
                        "manufactureNum": "0050",
                        "manufactureYear": 2020,
                        "rankCode": "3Р",
                        "rankTitle": "Эталон 3-го разряда",
                    }
                },
                "vriInfo": {
                    "organization": 'ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                    "vrfDate": "2026-02-05",
                    "validDate": "2027-02-04",
                    "applicable": {"certNum": "С-ВЯ/05-02-2026/503716224"},
                },
            }

        return {
            "miInfo": {
                "etaMI": {
                    "regNumber": "73828.19.3Р.01021102",
                    "mitypeNumber": "73828-19",
                    "mitypeTitle": "Калибраторы многофункциональные",
                    "mitypeType": "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                    "modification": "ЭЛМЕТРО-Паскаль-03-0,005",
                    "manufactureNum": "0050",
                    "manufactureYear": 2020,
                    "rankCode": "3Р",
                    "rankTitle": "Эталон 3-го разряда",
                    "schemaTitle": "приказ Росстандарта от 28 июля 2023 года №1520",
                }
            },
            "vriInfo": {
                "organization": 'ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                "vrfDate": "2026-02-05",
                "validDate": "2027-02-04",
                "applicable": {"certNum": "С-ВЯ/05-02-2026/503716225"},
            },
        }

    monkeypatch.setattr(ArshinClient, "search_records", fake_search_records)
    monkeypatch.setattr(ArshinClient, "fetch_vri_detail", fake_fetch_vri_detail)

    service = ArshinService()
    results = await service.search(
        payload=ArshinSearchRequest(
            registry_kind=ArshinRegistryKind.ESI,
            number="73828.19.3Р.01021102",
        )
    )

    assert len(results) == 1
    assert calls[0][0] == ArshinRegistryKind.ESI
    assert calls[1][0] == ArshinRegistryKind.SI
    assert results[0].vri_id == "1-503716225"
    assert results[0].result_docnum == "73828.19.3Р.01021102"
    assert results[0].mit_number == "73828-19"
    assert results[0].mi_number == "0050"
    assert results[0].arshin_url is not None
    assert results[0].raw_payload_json is not None
    assert results[0].raw_payload_json["number"] == "73828.19.3Р.01021102"
    assert results[0].raw_payload_json["miInfo"]["etaMI"]["regNumber"] == "73828.19.3Р.01021102"


@pytest.mark.anyio
async def test_esi_search_treats_registry_number_in_general_search_as_number_filter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured_params: list[dict[str, str]] = []

    async def fake_search_records(
        self: ArshinClient,
        *,
        params: dict[str, str],
        registry_kind: ArshinRegistryKind = ArshinRegistryKind.SI,
        max_results: int = 200,
    ) -> list[dict[str, str]]:
        captured_params.append(params)
        if registry_kind == ArshinRegistryKind.ESI:
            request = httpx.Request("GET", "https://fgis.gost.ru/fundmetrology/eapi/mieta")
            response = httpx.Response(status_code=403, request=request)
            raise httpx.HTTPStatusError("Forbidden", request=request, response=response)
        return []

    async def fake_fetch_vri_detail(
        self: ArshinClient,
        *,
        vri_id: str,
    ) -> dict[str, object]:
        return {}

    monkeypatch.setattr(ArshinClient, "search_records", fake_search_records)
    monkeypatch.setattr(ArshinClient, "fetch_vri_detail", fake_fetch_vri_detail)

    service = ArshinService()
    await service.search(
        payload=ArshinSearchRequest(
            registry_kind=ArshinRegistryKind.ESI,
            search="73828.19.3Р.01021102",
        )
    )

    assert captured_params[0]["number"] == "73828.19.3Р.01021102"
    assert "search" not in captured_params[0]


@pytest.mark.anyio
async def test_esi_exact_registry_number_ignores_year_mismatch_in_vri_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_search_records(
        self: ArshinClient,
        *,
        params: dict[str, str],
        registry_kind: ArshinRegistryKind = ArshinRegistryKind.SI,
        max_results: int = 200,
    ) -> list[dict[str, str]]:
        if registry_kind == ArshinRegistryKind.ESI:
            request = httpx.Request("GET", "https://fgis.gost.ru/fundmetrology/eapi/mieta")
            response = httpx.Response(status_code=403, request=request)
            raise httpx.HTTPStatusError("Forbidden", request=request, response=response)

        return [
            {
                "vri_id": "1-503716225",
                "org_title": 'ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                "mit_number": "73828-19",
                "mit_title": "Калибраторы многофункциональные",
                "mi_number": "0050",
                "verification_date": "2026-02-05T00:00:00Z",
                "valid_date": "2027-02-04T00:00:00Z",
                "result_docnum": "С-ВЯ/05-02-2026/503716225",
                "applicability": True,
            }
        ]

    async def fake_fetch_vri_detail(
        self: ArshinClient,
        *,
        vri_id: str,
    ) -> dict[str, object]:
        assert vri_id == "1-503716225"
        return {
            "miInfo": {
                "etaMI": {
                    "regNumber": "73828.19.3Р.01021102",
                    "mitypeNumber": "73828-19",
                    "mitypeTitle": "Калибраторы многофункциональные",
                    "manufactureNum": "0050",
                    "manufactureYear": 2020,
                }
            },
            "vriInfo": {
                "organization": 'ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                "vrfDate": "2026-02-05",
                "validDate": "2027-02-04",
                "applicable": {"certNum": "С-ВЯ/05-02-2026/503716225"},
            },
        }

    monkeypatch.setattr(ArshinClient, "search_records", fake_search_records)
    monkeypatch.setattr(ArshinClient, "fetch_vri_detail", fake_fetch_vri_detail)

    service = ArshinService()
    results = await service.search(
        payload=ArshinSearchRequest(
            registry_kind=ArshinRegistryKind.ESI,
            number="73828.19.3Р.01021102",
            year=2026,
        )
    )

    assert len(results) == 1
    assert results[0].result_docnum == "73828.19.3Р.01021102"


@pytest.mark.anyio
async def test_esi_search_uses_direct_mieta_results_when_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_search_records(
        self: ArshinClient,
        *,
        params: dict[str, str],
        registry_kind: ArshinRegistryKind = ArshinRegistryKind.SI,
        max_results: int = 200,
    ) -> list[dict[str, object]]:
        assert registry_kind == ArshinRegistryKind.ESI
        assert params["number"] == "73828.19.3Р.01021102"
        return [
            {
                "rmieta_id": "1021102",
                "number": "73828.19.3Р.01021102",
                "cresults": [{"vri_id": "1-503716225"}],
                "organization": 'ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                "mitype_num": "73828-19",
                "mitype": "Калибраторы многофункциональные",
                "minotation": "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                "modification": "ЭЛМЕТРО-Паскаль-03-0,005",
                "factory_num": "0050",
                "year": 2020,
                "npenumber": "гэт13-2023",
                "rankcode": "3Р",
                "verification_date": "05.02.2026",
                "applicability": True,
            }
        ]

    async def fail_fetch_vri_detail(
        self: ArshinClient,
        *,
        vri_id: str,
    ) -> dict[str, object]:
        raise AssertionError("VRI fallback should not be used when mieta returns a direct result")

    monkeypatch.setattr(ArshinClient, "search_records", fake_search_records)
    monkeypatch.setattr(ArshinClient, "fetch_vri_detail", fail_fetch_vri_detail)

    service = ArshinService()
    results = await service.search(
        payload=ArshinSearchRequest(
            registry_kind=ArshinRegistryKind.ESI,
            number="73828.19.3Р.01021102",
        )
    )

    assert len(results) == 1
    assert results[0].vri_id == "1-503716225"
    assert results[0].arshin_url == "https://fgis.gost.ru/fundmetrology/cm/etalons/1021102"
    assert results[0].result_docnum == "73828.19.3Р.01021102"
    assert results[0].mit_number == "73828-19"
    assert results[0].mi_number == "0050"
    assert results[0].org_title == 'ФБУ "ТЮМЕНСКИЙ ЦСМ"'


@pytest.mark.anyio
async def test_esi_search_can_resolve_by_certificate_number(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_search_records(
        self: ArshinClient,
        *,
        params: dict[str, str],
        registry_kind: ArshinRegistryKind = ArshinRegistryKind.SI,
        max_results: int = 200,
    ) -> list[dict[str, object]]:
        assert registry_kind == ArshinRegistryKind.SI
        assert params["result_docnum"] == "С-ВЯ/05-02-2026/503716225"
        return [
            {
                "vri_id": "1-503716225",
                "org_title": 'ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                "mit_number": "73828-19",
                "mit_title": "Калибраторы многофункциональные",
                "mit_notation": "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                "mi_modification": "ЭЛМЕТРО-Паскаль-03-0,005",
                "mi_number": "0050",
                "verification_date": "2026-02-05T00:00:00Z",
                "valid_date": "2027-02-04T00:00:00Z",
                "result_docnum": "С-ВЯ/05-02-2026/503716225",
                "applicability": True,
            }
        ]

    async def fake_fetch_vri_detail(
        self: ArshinClient,
        *,
        vri_id: str,
    ) -> dict[str, object]:
        assert vri_id == "1-503716225"
        return {
            "miInfo": {
                "etaMI": {
                    "regNumber": "73828.19.3Р.01021102",
                    "mitypeNumber": "73828-19",
                    "mitypeTitle": "Калибраторы многофункциональные",
                    "mitypeType": "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                    "modification": "ЭЛМЕТРО-Паскаль-03-0,005",
                    "manufactureNum": "0050",
                    "manufactureYear": 2020,
                    "rankCode": "3Р",
                    "rankTitle": "Эталон 3-го разряда",
                }
            },
            "vriInfo": {
                "organization": 'ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                "vrfDate": "2026-02-05",
                "validDate": "2027-02-04",
                "applicable": {"certNum": "С-ВЯ/05-02-2026/503716225"},
            },
        }

    monkeypatch.setattr(ArshinClient, "search_records", fake_search_records)
    monkeypatch.setattr(ArshinClient, "fetch_vri_detail", fake_fetch_vri_detail)

    service = ArshinService()
    results = await service.search(
        payload=ArshinSearchRequest(
            registry_kind=ArshinRegistryKind.ESI,
            certificate_number="С-ВЯ/05-02-2026/503716225",
        )
    )

    assert len(results) == 1
    assert results[0].vri_id == "1-503716225"
    assert results[0].result_docnum == "73828.19.3Р.01021102"
    assert results[0].verification_date is not None
    assert results[0].valid_date is not None


@pytest.mark.anyio
async def test_get_esi_detail_merges_vri_detail_with_mieta_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_search_esi_via_vri(
        self: ArshinService,
        *,
        payload: ArshinSearchRequest,
    ) -> list[ArshinSearchResultRead]:
        assert payload.number == "25984.08.1Р.00103847"
        return [
            ArshinSearchResultRead(
                vri_id="1-503716111",
                arshin_url="https://fgis.gost.ru/fundmetrology/cm/results/1-503716111",
                org_title='ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                mit_number="25984-08",
                mit_title="Мультиметры цифровые прецизионные",
                mit_notation="8508A, 8508A/01",
                mi_modification="8508A/01",
                mi_number="194564378",
                result_docnum="25984.08.1Р.00103847",
                applicability=True,
                verification_date="2026-02-05T00:00:00",
                valid_date="2027-02-04T00:00:00",
                raw_payload_json={
                    "miInfo": {
                        "etaMI": {
                            "regNumber": "25984.08.1Р.00103847",
                            "mitypeNumber": "25984-08",
                            "mitypeTitle": "Мультиметры цифровые прецизионные",
                            "mitypeType": "8508A, 8508A/01",
                            "modification": "8508A/01",
                            "manufactureNum": "194564378",
                            "manufactureYear": 2012,
                            "rankCode": "1Р",
                            "rankTitle": "Эталон 1-го разряда",
                            "schemaTitle": "приказ Росстандарта №2091 от 01 октября 2018 г;",
                        }
                    },
                    "vriInfo": {
                        "organization": 'ФБУ "ТЮМЕНСКИЙ ЦСМ"',
                        "miOwner": "МКАИР ООО",
                        "vrfDate": "2026-02-05",
                        "validDate": "2027-02-04",
                        "docTitle": "Методика поверки",
                        "applicable": {"certNum": "С-ВЯ/05-02-2026/503716111"},
                    },
                    "means": {
                        "mieta": [
                            {
                                "regNumber": "30447.05.2Р.00947809",
                                "mitypeNumber": "30447-05",
                                "mitypeTitle": "Калибраторы многофункциональные с усилителем",
                            }
                        ]
                    },
                    "number": "25984.08.1Р.00103847",
                },
            )
        ]

    monkeypatch.setattr(ArshinService, "_search_esi_via_vri", fake_search_esi_via_vri)

    async def fake_search_records(
        self: ArshinClient,
        *,
        params: dict[str, str],
        registry_kind: ArshinRegistryKind = ArshinRegistryKind.SI,
        max_results: int = 200,
    ) -> list[dict[str, object]]:
        if registry_kind == ArshinRegistryKind.ESI:
            assert params["mitype_num"] == "25984-08"
            assert params["factory_num"] == "194564378"
            return [
                {
                    "rmieta_id": "103847",
                    "number": "25984.08.1Р.00103847",
                    "mitype_num": "25984-08",
                    "mitype": "Мультиметры цифровые прецизионные",
                    "modification": "8508A/01",
                    "factory_num": "194564378",
                    "year": 2012,
                    "rankcode": "1Р",
                    "verification_date": "05.02.2026",
                },
                {
                    "rmieta_id": "103700",
                    "number": "25984.08.1Р.00103700",
                    "mitype_num": "25984-08",
                    "mitype": "Мультиметры цифровые прецизионные",
                    "modification": "8508A/01",
                    "factory_num": "194564378",
                    "year": 2012,
                    "rankcode": "1Р",
                    "verification_date": "12.01.2023",
                },
            ]

        assert params["mit_number"] == "25984-08"
        assert params["mi_number"] == "194564378"
        return [
            {
                "vri_id": "1-503716111",
                "mi_modification": "8508A/01",
                "verification_date": "2026-02-05T00:00:00Z",
                "valid_date": "2027-02-04T00:00:00Z",
                "result_docnum": "С-ВЯ/05-02-2026/503716111",
                "applicability": True,
            },
            {
                "vri_id": "1-400000000",
                "mi_modification": "8508A/01",
                "verification_date": "2023-01-12T00:00:00Z",
                "valid_date": "2024-01-11T00:00:00Z",
                "result_docnum": "С-СТАР/12-01-2023/400000000",
                "applicability": True,
            },
        ]

    async def fake_fetch_vri_detail(
        self: ArshinClient,
        *,
        vri_id: str,
    ) -> dict[str, object]:
        if vri_id == "1-400000000":
            return {
                "miInfo": {
                    "etaMI": {
                        "regNumber": "25984.08.1Р.00103700",
                        "modification": "8508A/01",
                    }
                },
                "vriInfo": {
                    "vrfDate": "2023-01-12",
                    "validDate": "2024-01-11",
                    "docTitle": "Старая методика поверки",
                    "applicable": {"certNum": "С-СТАР/12-01-2023/400000000"},
                },
            }

        assert vri_id == "1-503716111"
        return {
            "miInfo": {
                "etaMI": {
                    "regNumber": "25984.08.1Р.00103847",
                    "modification": "8508A/01",
                }
            },
            "vriInfo": {
                "vrfDate": "2026-02-05",
                "validDate": "2027-02-04",
                "docTitle": "Методика поверки",
                "applicable": {"certNum": "С-ВЯ/05-02-2026/503716111"},
            },
        }

    monkeypatch.setattr(ArshinClient, "search_records", fake_search_records)
    monkeypatch.setattr(ArshinClient, "fetch_vri_detail", fake_fetch_vri_detail)
    service = ArshinService()
    detail = await service.get_esi_detail(
        payload=ArshinESIDetailRequest(
            vri_id="1021102",
            org_title='ФБУ "ТЮМЕНСКИЙ ЦСМ"',
            mit_number="25984-08",
            mit_title="Мультиметры цифровые прецизионные",
            mit_notation="8508A, 8508A/01",
            mi_modification="8508A/01",
            mi_number="194564378",
            result_docnum="25984.08.1Р.00103847",
            applicability=True,
            verification_date="2026-02-05T00:00:00",
            valid_date="2027-02-04T00:00:00",
            raw_payload_json={
                "number": "25984.08.1Р.00103847",
                "npenumber": "гэт4-91",
                "rankcode": "1Р",
                "rankclass": "Эталон 1-го разряда",
                "schematype": "ГПС",
                "schematitle": "приказ Росстандарта №2091 от 01 октября 2018 г;",
            },
        )
    )

    assert detail.vri_id == "1-503716111"
    assert detail.organization == 'ФБУ "ТЮМЕНСКИЙ ЦСМ"'
    assert detail.owner_name == "МКАИР ООО"
    assert detail.certificate_number == "С-ВЯ/05-02-2026/503716111"
    assert detail.raw_payload_json is not None
    assert detail.raw_payload_json["npenumber"] == "гэт4-91"
    assert detail.raw_payload_json["rankcode"] == "1Р"
    assert detail.raw_payload_json["schematype"] == "ГПС"
    assert (
        detail.raw_payload_json["metrolog_related_esi_profiles"][0]["number"]
        == "25984.08.1Р.00103847"
    )
    assert len(detail.raw_payload_json["metrolog_related_esi_profiles"]) == 1
    assert (
        detail.raw_payload_json["metrolog_related_esi_verification_records"][0][
            "certificate_number"
        ]
        == "С-ВЯ/05-02-2026/503716111"
    )
    assert len(detail.raw_payload_json["metrolog_related_esi_verification_records"]) == 1


@pytest.mark.anyio
async def test_get_esi_detail_keeps_related_profile_without_verification_record(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_search_esi_via_vri(
        self: ArshinService,
        *,
        payload: ArshinSearchRequest,
    ) -> list[ArshinSearchResultRead]:
        assert payload.certificate_number == "С-ГА/04-03-2025/415504034"
        return [
            ArshinSearchResultRead(
                vri_id="1-415504034",
                arshin_url="https://fgis.gost.ru/fundmetrology/cm/results/1-415504034",
                org_title='ФБУ "КАЛУЖСКИЙ ЦСМ"',
                mit_number="73828-19",
                mit_title="Калибраторы многофункциональные",
                mit_notation="ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                mi_modification="ЭЛМЕТРО-Паскаль-03-0,005",
                mi_number="0414",
                result_docnum="73828.19.3Р.01262789",
                applicability=True,
                verification_date="2025-03-04T00:00:00",
                valid_date="2026-03-03T00:00:00",
                raw_payload_json={
                    "number": "73828.19.3Р.01262789",
                    "rankcode": "3Р",
                },
            )
        ]

    monkeypatch.setattr(ArshinService, "_search_esi_via_vri", fake_search_esi_via_vri)

    async def fake_search_records(
        self: ArshinClient,
        *,
        params: dict[str, str],
        registry_kind: ArshinRegistryKind = ArshinRegistryKind.SI,
        max_results: int = 200,
    ) -> list[dict[str, object]]:
        if registry_kind == ArshinRegistryKind.ESI:
            assert params["mitype_num"] == "73828-19"
            assert params["factory_num"] == "0414"
            return [
                {
                    "rmieta_id": "1262789",
                    "number": "73828.19.3Р.01262789",
                    "mitype_num": "73828-19",
                    "mitype": "Калибраторы многофункциональные",
                    "modification": "ЭЛМЕТРО-Паскаль-03-0,005",
                    "factory_num": "0414",
                    "year": 2024,
                    "rankcode": "3Р",
                    "verification_date": "04.03.2025",
                },
                {
                    "rmieta_id": "1262800",
                    "number": "73828.19.1Р.01262800",
                    "mitype_num": "73828-19",
                    "mitype": "Калибраторы многофункциональные",
                    "modification": "нет модификации",
                    "factory_num": "0414",
                    "year": 2024,
                    "rankcode": "1Р",
                    "cresults": [{"vri_id": "1-415504031"}],
                },
            ]

        assert params["mit_number"] == "73828-19"
        assert params["mi_number"] == "0414"
        return [
            {
                "vri_id": "1-415504034",
                "mi_modification": "ЭЛМЕТРО-Паскаль-03-0,005",
                "verification_date": "2025-03-04T00:00:00Z",
                "valid_date": "2026-03-03T00:00:00Z",
                "result_docnum": "С-ГА/04-03-2025/415504034",
                "applicability": True,
            },
        ]

    async def fake_fetch_vri_detail(
        self: ArshinClient,
        *,
        vri_id: str,
    ) -> dict[str, object]:
        if vri_id == "1-415504031":
            return {
                "miInfo": {
                    "etaMI": {
                        "regNumber": "73828.19.1Р.01262800",
                        "mitypeNumber": "73828-19",
                        "mitypeTitle": "Калибраторы многофункциональные",
                        "mitypeType": "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                        "modification": "исполнение ЭЛМЕТРО-Паскаль-03-0,005",
                        "manufactureNum": "0414",
                        "manufactureYear": 2025,
                        "rankCode": "1Р",
                        "rankTitle": "Эталон 1-го разряда",
                    }
                },
                "vriInfo": {
                    "organization": 'ФБУ "ЧЕЛЯБИНСКИЙ ЦСМ"',
                    "miOwner": 'ООО "МКАИР"',
                    "vrfDate": "2025-03-04",
                    "validDate": "2026-03-03",
                    "docTitle": "Методика поверки",
                    "applicable": {"certNum": "С-ГА/04-03-2025/415504031"},
                },
                "number": "73828.19.1Р.01262800",
            }
        assert vri_id == "1-415504034"
        return {
            "miInfo": {
                "etaMI": {
                    "regNumber": "73828.19.3Р.01262789",
                    "mitypeNumber": "73828-19",
                    "mitypeTitle": "Калибраторы многофункциональные",
                    "mitypeType": "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
                    "modification": "ЭЛМЕТРО-Паскаль-03-0,005",
                    "manufactureNum": "0414",
                    "manufactureYear": 2024,
                    "rankCode": "3Р",
                    "rankTitle": "Эталон 3-го разряда",
                }
            },
            "vriInfo": {
                "organization": 'ФБУ "КАЛУЖСКИЙ ЦСМ"',
                "miOwner": 'ООО "МКАИР"',
                "vrfDate": "2025-03-04",
                "validDate": "2026-03-03",
                "docTitle": "Методика поверки",
                "applicable": {"certNum": "С-ГА/04-03-2025/415504034"},
            },
            "number": "73828.19.3Р.01262789",
        }

    monkeypatch.setattr(ArshinClient, "search_records", fake_search_records)
    monkeypatch.setattr(ArshinClient, "fetch_vri_detail", fake_fetch_vri_detail)

    service = ArshinService()
    detail = await service.get_esi_detail(
        payload=ArshinESIDetailRequest(
            vri_id="1-415504034",
            org_title='ФБУ "КАЛУЖСКИЙ ЦСМ"',
            mit_number="73828-19",
            mit_title="Калибраторы многофункциональные",
            mit_notation="ЭЛМЕТРО-Паскаль-03, Паскаль-03",
            mi_modification="ЭЛМЕТРО-Паскаль-03-0,005",
            mi_number="0414",
            result_docnum="73828.19.3Р.01262789",
            applicability=True,
            verification_date="2025-03-04T00:00:00",
            valid_date="2026-03-03T00:00:00",
            raw_payload_json={
                "number": "73828.19.3Р.01262789",
                "rankcode": "3Р",
                "rankclass": "Эталон 3-го разряда",
            },
        )
    )

    related_profiles = detail.raw_payload_json["metrolog_related_esi_profiles"]
    assert [item["number"] for item in related_profiles] == [
        "73828.19.3Р.01262789",
        "73828.19.1Р.01262800",
    ]
    assert related_profiles[1]["certificate_number"] == "С-ГА/04-03-2025/415504031"
    assert related_profiles[1]["valid_date"] == "03.03.2026"
    related_verifications = detail.raw_payload_json["metrolog_related_esi_verification_records"]
    assert len(related_verifications) == 2
    assert {item["certificate_number"] for item in related_verifications} == {
        "С-ГА/04-03-2025/415504034",
        "С-ГА/04-03-2025/415504031",
    }


@pytest.mark.anyio
async def test_get_esi_detail_uses_direct_vri_detail_when_vri_id_is_available(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fail_search_esi_via_vri(
        self: ArshinService,
        *,
        payload: ArshinSearchRequest,
    ) -> list[ArshinSearchResultRead]:
        raise AssertionError("Fallback ESI VRI search should not be used for direct vri_id flow")

    async def fake_fetch_vri_detail(
        self: ArshinClient,
        *,
        vri_id: str,
    ) -> dict[str, object]:
        assert vri_id == "1-503716186"
        return {
            "miInfo": {
                "etaMI": {
                    "regNumber": "58668.14.4Р.01074568",
                    "mitypeNumber": "58668-14",
                    "mitypeTitle": "Преобразователи давления эталонные",
                    "mitypeType": "ПДЭ-020, ПДЭ-020И",
                    "modification": "ПДЭ-020И, модель 190",
                    "manufactureNum": "3071944",
                    "manufactureYear": 2022,
                    "npeNumber": "гэт23-2010",
                    "rankCode": "4Р",
                    "rankTitle": "Эталон 4-го разряда",
                }
            },
            "vriInfo": {
                "organization": 'ФБУ "КРАСНОЯРСКИЙ ЦСМ"',
                "vrfDate": "2026-04-02",
                "validDate": "2028-04-01",
                "docTitle": "Приказ ФАТР №2653 от 20 октября 2022",
                "applicable": {"certNum": "С-АШ/02-04-2026/516213999"},
            },
        }

    async def fake_search_records(
        self: ArshinClient,
        *,
        params: dict[str, str],
        registry_kind: ArshinRegistryKind = ArshinRegistryKind.SI,
        max_results: int = 200,
    ) -> list[dict[str, object]]:
        if registry_kind == ArshinRegistryKind.ESI:
            return [
                {
                    "rmieta_id": "1074568",
                    "number": "58668.14.4Р.01074568",
                    "mitype_num": "58668-14",
                    "mitype": "Преобразователи давления эталонные",
                    "modification": "ПДЭ-020И, модель 190",
                    "factory_num": "3071944",
                    "year": 2022,
                    "rankcode": "4Р",
                    "verification_date": "02.04.2026",
                }
            ]

        return [
            {
                "vri_id": "1-503716186",
                "org_title": 'ФБУ "КРАСНОЯРСКИЙ ЦСМ"',
                "mit_number": "58668-14",
                "mi_number": "3071944",
                "verification_date": "2026-04-02T00:00:00Z",
                "valid_date": "2028-04-01T00:00:00Z",
                "result_docnum": "С-АШ/02-04-2026/516213999",
                "applicability": True,
            }
        ]

    monkeypatch.setattr(ArshinService, "_search_esi_via_vri", fail_search_esi_via_vri)
    monkeypatch.setattr(ArshinClient, "fetch_vri_detail", fake_fetch_vri_detail)
    monkeypatch.setattr(ArshinClient, "search_records", fake_search_records)

    service = ArshinService()
    detail = await service.get_esi_detail(
        payload=ArshinESIDetailRequest(
            vri_id="1-503716186",
            result_docnum="58668.14.4Р.01074568",
            raw_payload_json={
                "rmieta_id": "1074568",
                "number": "58668.14.4Р.01074568",
                "rankcode": "4Р",
                "rankclass": "Эталон 4-го разряда",
                "schematype": "ГПС",
                "schematitle": "Приказ ФАТР №2653 от 20 октября 2022",
            },
        )
    )

    assert detail.vri_id == "1-503716186"
    assert detail.arshin_url == "https://fgis.gost.ru/fundmetrology/cm/etalons/1074568"
    assert detail.certificate_number == "С-АШ/02-04-2026/516213999"
    assert detail.raw_payload_json is not None
    assert detail.raw_payload_json["number"] == "58668.14.4Р.01074568"
