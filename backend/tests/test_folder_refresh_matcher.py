from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest

from app.integrations.arshin_client import ArshinClient
from app.schemas.arshin import ArshinRegistryKind, ArshinSearchResultRead
from app.services.folder_refresh_matcher import (
    SERIAL_MATCH_CONFIDENT,
    SERIAL_MATCH_DIGITS_ONLY,
    SERIAL_MATCH_EXACT,
    SERIAL_MATCH_NONE,
    FolderRefreshMatcher,
    _classify_serial_match,
)

OLD_CERT = "С-АС/18-06-2025/445185804"
NEW_CERT = "С-АС/09-06-2026/532624130"
MIT_NUMBER = "14061-15"
MIT_TITLE = "Преобразователи давления измерительные"
MIT_NOTATION = "3051"
MI_MODIFICATION = "мод. 3051TG3A2B21BB4EMM5S5WR3A1056"
MI_NUMBER = "4081591"
ORG_TITLE = 'ФБУ "ЯКУТСКИЙ ЦСМ"'


def _make_record(
    *,
    vri_id: str,
    result_docnum: str,
    verification_date: str,
    valid_date: str,
    mi_number: str = MI_NUMBER,
    mi_modification: str = MI_MODIFICATION,
    mit_number: str = MIT_NUMBER,
    mit_title: str = MIT_TITLE,
    mit_notation: str = MIT_NOTATION,
) -> dict[str, Any]:
    return {
        "vri_id": vri_id,
        "org_title": ORG_TITLE,
        "mit_number": mit_number,
        "mit_title": mit_title,
        "mit_notation": mit_notation,
        "mi_modification": mi_modification,
        "mi_number": mi_number,
        "verification_date": verification_date,
        "valid_date": valid_date,
        "result_docnum": result_docnum,
        "applicability": True,
    }


def _old_record(mi_number: str = MI_NUMBER) -> dict[str, Any]:
    return _make_record(
        vri_id="1-445185804",
        result_docnum=OLD_CERT,
        verification_date="18.06.2025",
        valid_date="17.06.2030",
        mi_number=mi_number,
    )


def _new_record(mi_number: str = MI_NUMBER) -> dict[str, Any]:
    return _make_record(
        vri_id="1-532624130",
        result_docnum=NEW_CERT,
        verification_date="09.06.2026",
        valid_date="08.06.2031",
        mi_number=mi_number,
    )


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


def _iso(value: str) -> str:
    day, month, year = value.split(".")
    return f"{year}-{month}-{day}"


def _install_drift_arshin(
    monkeypatch: pytest.MonkeyPatch,
    *,
    current_serial: str,
    serial_records: dict[str, list[dict[str, Any]]],
    serial_free_records: list[dict[str, Any]],
) -> None:
    """Emulate Arshin's exact ``mi_number`` filter plus a serial-free lookup.

    ``serial_records`` answers queries that carry a serial (the stored spelling and any
    variant), ``serial_free_records`` answers the queries that carry none.
    """

    all_records = [record for records in serial_records.values() for record in records]
    all_records.extend(serial_free_records)

    async def fake_search_records(
        self: ArshinClient,
        *,
        params: dict[str, str],
        registry_kind: ArshinRegistryKind = ArshinRegistryKind.SI,
        max_results: int = 200,
    ) -> list[dict[str, Any]]:
        assert registry_kind == ArshinRegistryKind.SI
        if params.get("result_docnum") == OLD_CERT:
            return [_old_record(mi_number=current_serial)]
        serial = params.get("mi_number")
        if serial is not None:
            return list(serial_records.get(serial, []))
        return list(serial_free_records)

    async def fake_fetch_vri_detail(
        self: ArshinClient,
        *,
        vri_id: str,
    ) -> dict[str, Any]:
        if vri_id == "1-445185804":
            return _detail(vri_id, OLD_CERT, "2025-06-18", "2030-06-17")
        for record in all_records:
            if record["vri_id"] == vri_id:
                return _detail(
                    vri_id,
                    record["result_docnum"],
                    _iso(record["verification_date"]),
                    _iso(record["valid_date"]),
                )
        raise AssertionError(f"unexpected vri_id: {vri_id}")

    monkeypatch.setattr(ArshinClient, "search_records", fake_search_records)
    monkeypatch.setattr(ArshinClient, "fetch_vri_detail", fake_fetch_vri_detail)


async def _match_si() -> Any:
    return await FolderRefreshMatcher().match_si(
        current_certificate_number=OLD_CERT,
        current_verification_date=datetime(2025, 6, 18, tzinfo=UTC),
        current_valid_date=datetime(2030, 6, 17, tzinfo=UTC),
    )


def test_serial_match_classification() -> None:
    cases = [
        # The same serial with different spacing is the same serial.
        ("21202377-19011936", "21202377 - 19011936", SERIAL_MATCH_EXACT),
        ("21192723-19011902", "2119272319011902", SERIAL_MATCH_EXACT),
        # The same serial typed in the other alphabet is the same serial.
        ("C133358228", "С133358228", SERIAL_MATCH_CONFIDENT),
        ("C133358228", "c133358228", SERIAL_MATCH_EXACT),
        # Only the digits agree — the serial may belong to another instrument.
        ("418007", "L418007", SERIAL_MATCH_DIGITS_ONLY),
        ("418007", "Р418007", SERIAL_MATCH_DIGITS_ONLY),
        ("1234", "A1234", SERIAL_MATCH_DIGITS_ONLY),
        # Different numbers, and numbers that are too short to be trusted.
        ("418007", "191919", SERIAL_MATCH_NONE),
        ("AB1234", "CD1234", SERIAL_MATCH_NONE),
        ("12", "A12", SERIAL_MATCH_NONE),
        ("1", "01", SERIAL_MATCH_NONE),
        ("418007", "", SERIAL_MATCH_NONE),
    ]
    for current, candidate, expected in cases:
        assert _classify_serial_match(current=current, candidate=candidate) == expected, (
            current,
            candidate,
        )


@pytest.mark.anyio
async def test_match_si_matches_record_with_spaced_serial(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    spaced_serial = "21202377 - 19011936"
    _install_drift_arshin(
        monkeypatch,
        current_serial="21202377-19011936",
        serial_records={spaced_serial: [_new_record(mi_number=spaced_serial)]},
        serial_free_records=[],
    )

    result = await _match_si()

    assert result.found is True
    assert result.certificate_updated is True
    assert result.uncertain_update is False
    assert result.serial_relaxed is True
    assert result.serial_requires_review is False
    assert result.matched_certificate_number == NEW_CERT
    assert "записан иначе" in (result.notes or "")
    assert spaced_serial in (result.notes or "")


@pytest.mark.anyio
async def test_match_si_matches_record_with_look_alike_letters(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cyrillic_serial = "С133358228"
    _install_drift_arshin(
        monkeypatch,
        current_serial="C133358228",
        serial_records={cyrillic_serial: [_new_record(mi_number=cyrillic_serial)]},
        serial_free_records=[],
    )

    result = await _match_si()

    assert result.certificate_updated is True
    assert result.serial_relaxed is True
    assert result.serial_requires_review is False
    assert result.uncertain_update is False


@pytest.mark.anyio
async def test_match_si_prefers_the_confident_match_over_a_newer_digit_match(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A digits-only record may belong to another instrument, so it never outranks
    a confident one."""
    spaced_serial = "21202377 - 19011936"
    confident = _new_record(mi_number=spaced_serial)
    digits_only = _make_record(
        vri_id="1-560000003",
        result_docnum="С-ВЯ/07-10-2026/563833175",
        verification_date="07.10.2026",
        valid_date="06.10.2027",
        mi_number="Р2120237719011936",
    )
    assert digits_only["verification_date"] == "07.10.2026"
    _install_drift_arshin(
        monkeypatch,
        current_serial="21202377-19011936",
        serial_records={spaced_serial: [confident, digits_only]},
        serial_free_records=[],
    )

    result = await _match_si()

    assert result.matched_vri_id == confident["vri_id"]
    assert result.serial_requires_review is False
    assert result.serial_candidates == 1


@pytest.mark.anyio
async def test_match_si_requires_review_when_a_letter_is_added(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_drift_arshin(
        monkeypatch,
        current_serial="418007",
        serial_records={},
        serial_free_records=[
            _new_record(mi_number="L418007"),
            _make_record(
                vri_id="1-560000001",
                result_docnum="С-ВЯ/06-10-2026/563833174",
                verification_date="06.10.2026",
                valid_date="05.10.2027",
                mi_number="Н381-008",
            ),
        ],
    )

    result = await _match_si()

    assert result.certificate_updated is True
    assert result.serial_relaxed is True
    assert result.serial_requires_review is True
    assert result.uncertain_update is True
    assert result.serial_candidates == 1
    assert result.matched_vri_id == "1-532624130"
    assert "нужна ручная проверка" in (result.notes or "").lower()


@pytest.mark.anyio
async def test_match_si_reports_several_digit_only_candidates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_drift_arshin(
        monkeypatch,
        current_serial="418007",
        serial_records={},
        serial_free_records=[
            _new_record(mi_number="L418007"),
            _make_record(
                vri_id="1-560000002",
                result_docnum="С-ВЯ/07-10-2026/563833175",
                verification_date="07.10.2026",
                valid_date="06.10.2027",
                mi_number="Р418007",
            ),
        ],
    )

    result = await _match_si()

    assert result.serial_requires_review is True
    assert result.serial_candidates == 2
    assert "несколько (2)" in (result.notes or "")


@pytest.mark.anyio
async def test_match_si_ignores_records_of_other_instruments(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_drift_arshin(
        monkeypatch,
        current_serial="418007",
        serial_records={},
        serial_free_records=[
            _make_record(
                vri_id="1-560000001",
                result_docnum="С-ВЯ/06-10-2026/563833174",
                verification_date="06.10.2026",
                valid_date="05.10.2027",
                mi_number="Н381-008",
            )
        ],
    )

    result = await _match_si()

    assert result.found is True
    assert result.certificate_updated is False
    assert result.serial_relaxed is False
    assert result.notes == "Актуальная запись подтверждена."


@pytest.mark.anyio
async def test_match_si_does_not_accept_a_short_digit_serial(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _install_drift_arshin(
        monkeypatch,
        current_serial="12",
        serial_records={},
        serial_free_records=[_new_record(mi_number="A12")],
    )

    result = await _match_si()

    assert result.certificate_updated is False
    assert result.serial_requires_review is False


@pytest.mark.anyio
async def test_match_esi_matches_module_with_drifted_serial(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.schemas.arshin import ArshinESIDetailRequest, ArshinSearchRequest, ArshinVriDetailRead
    from app.services.arshin_service import ArshinService

    spaced_serial = "21202377 - 19011936"
    _install_drift_arshin(
        monkeypatch,
        current_serial="21202377-19011936",
        serial_records={spaced_serial: [_new_record(mi_number=spaced_serial)]},
        serial_free_records=[],
    )

    async def fake_search(
        self: ArshinService,
        *,
        payload: ArshinSearchRequest,
    ) -> list[Any]:
        assert payload.registry_kind == ArshinRegistryKind.ESI
        return [ArshinSearchResultRead(vri_id="1-532624130", result_docnum=NEW_CERT)]

    async def fake_get_esi_detail(
        self: ArshinService,
        *,
        payload: ArshinESIDetailRequest,
    ) -> ArshinVriDetailRead:
        assert payload.vri_id == "1-532624130"
        return ArshinVriDetailRead(
            vri_id="1-532624130",
            arshin_url="https://fgis.gost.ru/fundmetrology/cm/results/1-532624130",
            certificate_number=NEW_CERT,
            organization=ORG_TITLE,
            reg_number=MIT_NUMBER,
            type_designation=MIT_NOTATION,
            type_name=MIT_TITLE,
            serial_number=spaced_serial,
            modification=MI_MODIFICATION,
            verification_date="2026-06-09",
            valid_until="2031-06-08",
            raw_payload_json={"number": "36068.07.1Р.00735900"},
        )

    monkeypatch.setattr(ArshinService, "search", fake_search)
    monkeypatch.setattr(ArshinService, "get_esi_detail", fake_get_esi_detail)

    result = await FolderRefreshMatcher().match_esi(
        current_certificate_number=OLD_CERT,
        current_registry_number=None,
        current_verification_date=datetime(2025, 6, 18, tzinfo=UTC),
        current_valid_date=datetime(2030, 6, 17, tzinfo=UTC),
    )

    assert result.found is True
    assert result.certificate_updated is True
    assert result.serial_relaxed is True
    assert result.serial_requires_review is False
    assert result.matched_certificate_number == NEW_CERT


@pytest.mark.anyio
async def test_match_si_requires_review_when_several_instruments_share_the_serial(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A short serial belongs to several instruments, so the serial alone cannot confirm a match."""
    other_instrument = _make_record(
        vri_id="1-508809244",
        result_docnum="С-ВУ/27-02-2026/508809244",
        verification_date="27.02.2026",
        valid_date="26.02.2028",
        mi_number=MI_NUMBER,
        mit_number="56431-14",
        mit_title="Манометры, вакуумметры и мановакуумметры",
        mi_modification="МКУ",
    )
    _install_drift_arshin(
        monkeypatch,
        current_serial=MI_NUMBER,
        serial_records={MI_NUMBER: [_new_record(), other_instrument]},
        serial_free_records=[],
    )

    result = await _match_si()

    assert result.found is True
    assert result.serial_ambiguous is True
    assert result.uncertain_update is True
    assert result.ambiguous_instruments == (
        "14061-15 Преобразователи давления измерительные",
        "56431-14 Манометры, вакуумметры и мановакуумметры",
    )
    note = result.notes or ""
    # Примечание говорит, сколько приборов носят номер, и не вываливает их типы.
    assert "у 2 приборов" in note
    assert "56431-14" not in note

    candidates = {candidate["vri_id"]: candidate for candidate in result.candidates}
    assert set(candidates) == {"1-532624130", "1-508809244"}
    assert candidates["1-508809244"]["certificate_number"] == "С-ВУ/27-02-2026/508809244"
    assert candidates["1-508809244"]["org_title"] == ORG_TITLE
    assert candidates["1-508809244"]["verification_date"] == "2026-02-27"
    assert candidates["1-532624130"]["certificate_number"] == NEW_CERT


@pytest.mark.anyio
async def test_materialize_candidate_takes_exactly_the_picked_record(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Выбранная запись тянется по своему ``vri_id``, а не «последняя по свидетельству»."""
    _install_drift_arshin(
        monkeypatch,
        current_serial=MI_NUMBER,
        serial_records={MI_NUMBER: [_new_record()]},
        serial_free_records=[],
    )
    matcher = FolderRefreshMatcher()

    payload = await matcher.materialize_candidate(
        candidate={
            "vri_id": "1-532624130",
            "certificate_number": NEW_CERT,
            "mit_number": MIT_NUMBER,
            "mit_title": MIT_TITLE,
            "mit_notation": MIT_NOTATION,
            "mi_modification": MI_MODIFICATION,
            "mi_number": MI_NUMBER,
            "org_title": ORG_TITLE,
            "verification_date": "2026-06-09",
            "valid_date": "2031-06-08",
            "arshin_url": "https://fgis.gost.ru/fundmetrology/cm/results/1-532624130",
        }
    )

    assert payload is not None
    assert payload.vri_id == "1-532624130"
    assert payload.certificate_number == NEW_CERT
    assert payload.mi_number == MI_NUMBER
    assert payload.detail_payload_json is not None


@pytest.mark.anyio
async def test_match_si_asks_for_review_even_when_nothing_is_newer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A stored certificate of an ambiguous serial must not read as «актуальная запись»."""
    # Запись чужого прибора старше текущей поверки: обновлять нечего, но зав. № всё равно
    # принадлежит нескольким приборам.
    other_instrument = _make_record(
        vri_id="1-508809244",
        result_docnum="С-ВУ/10-01-2025/508809244",
        verification_date="10.01.2025",
        valid_date="09.01.2026",
        mi_number=MI_NUMBER,
        mit_number="56431-14",
        mit_title="Манометры, вакуумметры и мановакуумметры",
        mi_modification="МКУ",
    )
    _install_drift_arshin(
        monkeypatch,
        current_serial=MI_NUMBER,
        serial_records={MI_NUMBER: [_old_record(), other_instrument]},
        serial_free_records=[],
    )

    result = await _match_si()

    assert result.certificate_updated is False
    assert result.serial_ambiguous is True
    assert result.uncertain_update is True
    assert "выберите нужный" in (result.notes or "")


@pytest.mark.anyio
async def test_match_si_keeps_a_unique_serial_confident(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_drift_arshin(
        monkeypatch,
        current_serial=MI_NUMBER,
        serial_records={MI_NUMBER: [_new_record()]},
        serial_free_records=[],
    )

    result = await _match_si()

    assert result.certificate_updated is True
    assert result.serial_ambiguous is False
    assert result.uncertain_update is False


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
