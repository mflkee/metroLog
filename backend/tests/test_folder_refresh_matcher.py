from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from app.integrations.arshin_client import ArshinClient
from app.schemas.arshin import ArshinRegistryKind
from app.services.folder_refresh_matcher import FolderRefreshMatcher

OLD_CERT = "С-АС/18-06-2025/445185804"
NEW_CERT = "С-АС/09-06-2026/532624130"
MIT_NUMBER = "14061-15"
MIT_TITLE = "Преобразователи давления измерительные"
MIT_NOTATION = "3051"
MI_MODIFICATION = "мод. 3051TG3A2B21BB4EMM5S5WR3A1056"
MI_NUMBER = "4081591"
ORG_TITLE = 'ФБУ "ЯКУТСКИЙ ЦСМ"'


def _old_record() -> dict[str, Any]:
    return {
        "vri_id": "1-445185804",
        "org_title": ORG_TITLE,
        "mit_number": MIT_NUMBER,
        "mit_title": MIT_TITLE,
        "mit_notation": MIT_NOTATION,
        "mi_modification": MI_MODIFICATION,
        "mi_number": MI_NUMBER,
        "verification_date": "18.06.2025",
        "valid_date": "17.06.2030",
        "result_docnum": OLD_CERT,
        "applicability": True,
    }


def _new_record() -> dict[str, Any]:
    return {
        "vri_id": "1-532624130",
        "org_title": ORG_TITLE,
        "mit_number": MIT_NUMBER,
        "mit_title": MIT_TITLE,
        "mit_notation": MIT_NOTATION,
        "mi_modification": MI_MODIFICATION,
        "mi_number": MI_NUMBER,
        "verification_date": "09.06.2026",
        "valid_date": "08.06.2031",
        "result_docnum": NEW_CERT,
        "applicability": True,
    }


def _detail(vri_id: str, certificate_number: str, vrf_date: str, valid_date: str) -> dict[str, Any]:
    return {
        "miInfo": {
            "singleMI": {
                "mitypeNumber": MIT_NUMBER,
                "mitypeTitle": MIT_TITLE,
                "mitypeType": MIT_NOTATION,
                "manufactureNum": MI_NUMBER,
                "modification": MI_MODIFICATION,
            }
        },
        "vriInfo": {
            "organization": ORG_TITLE,
            "vrfDate": vrf_date,
            "validDate": valid_date,
            "applicable": {"certNum": certificate_number},
        },
    }


def _install_fake_arshin(monkeypatch: pytest.MonkeyPatch) -> None:
    """Emulate Arshin: the certificate lookup is year-scoped, while the
    instrument-parameter lookup without a year returns the latest applicable
    record (which may be a re-verification done long before expiry)."""

    async def fake_search_records(
        self: ArshinClient,
        *,
        params: dict[str, str],
        registry_kind: ArshinRegistryKind = ArshinRegistryKind.SI,
        max_results: int = 200,
    ) -> list[dict[str, Any]]:
        assert registry_kind == ArshinRegistryKind.SI

        if params.get("result_docnum") == OLD_CERT:
            return [_old_record()] if params.get("year") == "2025" else []

        if params.get("mi_number") == MI_NUMBER:
            year = params.get("year")
            if year is None:
                return [_new_record()]
            return [_new_record()] if year == "2026" else []

        return []

    async def fake_fetch_vri_detail(
        self: ArshinClient,
        *,
        vri_id: str,
    ) -> dict[str, Any]:
        if vri_id == "1-532624130":
            return _detail(vri_id, NEW_CERT, "2026-06-09", "2031-06-08")
        if vri_id == "1-445185804":
            return _detail(vri_id, OLD_CERT, "2025-06-18", "2030-06-17")
        raise AssertionError(f"unexpected vri_id: {vri_id}")

    monkeypatch.setattr(ArshinClient, "search_records", fake_search_records)
    monkeypatch.setattr(ArshinClient, "fetch_vri_detail", fake_fetch_vri_detail)


@pytest.mark.anyio
async def test_match_si_finds_early_reverification(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_arshin(monkeypatch)

    result = await FolderRefreshMatcher().match_si(
        current_certificate_number=OLD_CERT,
        current_verification_date=datetime(2025, 6, 18, tzinfo=UTC),
        current_valid_date=datetime(2030, 6, 17, tzinfo=UTC),
    )

    assert result.found is True
    assert result.certificate_updated is True
    assert result.uncertain_update is False
    assert result.stage2_successful is True
    assert result.modification_relaxed is False
    assert result.notation_relaxed is False
    assert result.matched_certificate_number == NEW_CERT
    assert result.matched_vri_id == "1-532624130"
    assert result.matched_verification_date == datetime(2026, 6, 9, tzinfo=UTC)
    assert result.matched_valid_date == datetime(2031, 6, 8, tzinfo=UTC)


@pytest.mark.anyio
async def test_match_si_keeps_current_certificate_when_no_newer_exists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_search_records(
        self: ArshinClient,
        *,
        params: dict[str, str],
        registry_kind: ArshinRegistryKind = ArshinRegistryKind.SI,
        max_results: int = 200,
    ) -> list[dict[str, Any]]:
        if params.get("result_docnum") == OLD_CERT and params.get("year") == "2025":
            return [_old_record()]
        if params.get("mi_number") == MI_NUMBER:
            return [_old_record()]
        return []

    async def fake_fetch_vri_detail(
        self: ArshinClient,
        *,
        vri_id: str,
    ) -> dict[str, Any]:
        return _detail(vri_id, OLD_CERT, "2025-06-18", "2030-06-17")

    monkeypatch.setattr(ArshinClient, "search_records", fake_search_records)
    monkeypatch.setattr(ArshinClient, "fetch_vri_detail", fake_fetch_vri_detail)

    result = await FolderRefreshMatcher().match_si(
        current_certificate_number=OLD_CERT,
        current_verification_date=datetime(2025, 6, 18, tzinfo=UTC),
        current_valid_date=datetime(2030, 6, 17, tzinfo=UTC),
    )

    assert result.found is True
    assert result.certificate_updated is False
    assert result.matched_certificate_number == OLD_CERT
    assert result.notes == "Актуальная запись подтверждена."
