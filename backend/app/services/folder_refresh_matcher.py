from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.core.config import settings
from app.integrations.arshin_client import ArshinClient
from app.schemas.arshin import (
    ArshinESIDetailRequest,
    ArshinRegistryKind,
    ArshinSearchRequest,
    ArshinSearchResultRead,
    ArshinVriDetailRead,
)
from app.schemas.equipment import SIVerificationCreateRequest
from app.services.arshin_service import ArshinService


@dataclass(slots=True)
class FolderRefreshMatchResult:
    found: bool
    certificate_updated: bool
    uncertain_update: bool
    stage2_successful: bool | None
    modification_relaxed: bool | None
    notation_relaxed: bool | None
    current_certificate_number: str
    matched_certificate_number: str | None
    matched_registry_number: str | None
    matched_vri_id: str | None
    matched_arshin_url: str | None
    matched_verification_date: datetime | None
    matched_valid_date: datetime | None
    payload: SIVerificationCreateRequest | None
    notes: str | None = None


class FolderRefreshMatcher:
    def __init__(self, *, client: ArshinClient | None = None) -> None:
        self.client = client or ArshinClient()
        self.arshin = ArshinService(client=self.client)

    async def match_si(
        self,
        *,
        current_certificate_number: str,
        current_verification_date: datetime | None,
        current_valid_date: datetime | None,
    ) -> FolderRefreshMatchResult:
        stage1_record, stage1_result = await self._resolve_latest_vri_candidate(
            certificate_number=current_certificate_number,
            current_verification_date=current_verification_date,
            current_valid_date=current_valid_date,
        )
        if stage1_record is None or stage1_result is None:
            return FolderRefreshMatchResult(
                found=False,
                certificate_updated=False,
                uncertain_update=False,
                stage2_successful=None,
                modification_relaxed=None,
                notation_relaxed=None,
                current_certificate_number=current_certificate_number,
                matched_certificate_number=None,
                matched_registry_number=None,
                matched_vri_id=None,
                matched_arshin_url=None,
                matched_verification_date=None,
                matched_valid_date=None,
                payload=None,
                notes="По текущему свидетельству запись Аршина не найдена.",
            )

        detail = await self.arshin.get_vri_detail(vri_id=stage1_result.vri_id)
        payload = _build_si_payload(search_result=stage1_result, detail=detail)
        matched_certificate_number = _normalize_certificate_number(
            detail.certificate_number or stage1_result.result_docnum
        )
        return FolderRefreshMatchResult(
            found=True,
            certificate_updated=(
                matched_certificate_number
                != _normalize_certificate_number(current_certificate_number)
            ),
            uncertain_update=bool(
                stage1_record["certificate_updated"]
                and (stage1_record["modification_relaxed"] or stage1_record["notation_relaxed"])
            ),
            stage2_successful=stage1_record["stage2_successful"],
            modification_relaxed=stage1_record["modification_relaxed"],
            notation_relaxed=stage1_record["notation_relaxed"],
            current_certificate_number=current_certificate_number,
            matched_certificate_number=matched_certificate_number,
            matched_registry_number=None,
            matched_vri_id=detail.vri_id,
            matched_arshin_url=detail.arshin_url,
            matched_verification_date=_coerce_datetime_string(detail.verification_date),
            matched_valid_date=_coerce_datetime_string(detail.valid_until),
            payload=payload,
            notes=_build_match_note(stage1_record),
        )

    async def match_esi(
        self,
        *,
        current_certificate_number: str,
        current_registry_number: str | None,
        current_verification_date: datetime | None,
        current_valid_date: datetime | None,
    ) -> FolderRefreshMatchResult:
        matched_record, matched_vri_result = await self._resolve_latest_vri_candidate(
            certificate_number=current_certificate_number,
            current_verification_date=current_verification_date,
            current_valid_date=current_valid_date,
        )
        if matched_record is None or matched_vri_result is None:
            return FolderRefreshMatchResult(
                found=False,
                certificate_updated=False,
                uncertain_update=False,
                stage2_successful=None,
                modification_relaxed=None,
                notation_relaxed=None,
                current_certificate_number=current_certificate_number,
                matched_certificate_number=None,
                matched_registry_number=None,
                matched_vri_id=None,
                matched_arshin_url=None,
                matched_verification_date=None,
                matched_valid_date=None,
                payload=None,
                notes="По текущему свидетельству эталонная запись Аршина не найдена.",
            )

        verification_year = _extract_record_year(matched_vri_result.verification_date)
        esi_results = await self.arshin.search(
            payload=ArshinSearchRequest(
                registry_kind=ArshinRegistryKind.ESI,
                certificate_number=matched_vri_result.result_docnum,
                year=verification_year,
            )
        )
        matched_esi_result = _select_esi_result(
            results=esi_results,
            registry_number=current_registry_number,
            fallback_vri_id=matched_vri_result.vri_id,
        )
        if matched_esi_result is None:
            return FolderRefreshMatchResult(
                found=False,
                certificate_updated=False,
                uncertain_update=False,
                stage2_successful=matched_record["stage2_successful"],
                modification_relaxed=matched_record["modification_relaxed"],
                notation_relaxed=matched_record["notation_relaxed"],
                current_certificate_number=current_certificate_number,
                matched_certificate_number=None,
                matched_registry_number=None,
                matched_vri_id=None,
                matched_arshin_url=None,
                matched_verification_date=None,
                matched_valid_date=None,
                payload=None,
                notes="Аршин не вернул эталонную карточку по найденному свидетельству.",
            )

        detail = await self.arshin.get_esi_detail(
            payload=ArshinESIDetailRequest(
                vri_id=matched_esi_result.vri_id,
                org_title=matched_esi_result.org_title,
                mit_number=matched_esi_result.mit_number,
                mit_title=matched_esi_result.mit_title,
                mit_notation=matched_esi_result.mit_notation,
                mi_modification=matched_esi_result.mi_modification,
                mi_number=matched_esi_result.mi_number,
                result_docnum=matched_esi_result.result_docnum,
                applicability=matched_esi_result.applicability,
                verification_date=matched_esi_result.verification_date,
                valid_date=matched_esi_result.valid_date,
                raw_payload_json=matched_esi_result.raw_payload_json,
            )
        )
        payload = _build_si_payload(search_result=matched_esi_result, detail=detail)
        matched_certificate_number = _normalize_certificate_number(
            detail.certificate_number or _extract_certificate_from_raw(detail.raw_payload_json)
        )
        return FolderRefreshMatchResult(
            found=True,
            certificate_updated=(
                matched_certificate_number
                != _normalize_certificate_number(current_certificate_number)
            ),
            uncertain_update=bool(
                matched_record["certificate_updated"]
                and (matched_record["modification_relaxed"] or matched_record["notation_relaxed"])
            ),
            stage2_successful=matched_record["stage2_successful"],
            modification_relaxed=matched_record["modification_relaxed"],
            notation_relaxed=matched_record["notation_relaxed"],
            current_certificate_number=current_certificate_number,
            matched_certificate_number=matched_certificate_number,
            matched_registry_number=matched_esi_result.result_docnum,
            matched_vri_id=detail.vri_id,
            matched_arshin_url=detail.arshin_url,
            matched_verification_date=_coerce_datetime_string(detail.verification_date),
            matched_valid_date=_coerce_datetime_string(detail.valid_until),
            payload=payload,
            notes=_build_match_note(matched_record),
        )

    async def _resolve_latest_vri_candidate(
        self,
        *,
        certificate_number: str,
        current_verification_date: datetime | None,
        current_valid_date: datetime | None,
    ) -> tuple[dict[str, Any] | None, ArshinSearchResultRead | None]:
        normalized_certificate = _normalize_certificate_number(certificate_number)
        if not normalized_certificate:
            return None, None

        verification_year = current_verification_date.year if current_verification_date else None
        valid_until_year = current_valid_date.year if current_valid_date else None
        if verification_year is None and valid_until_year is not None:
            verification_year = max(valid_until_year - 1, 1900)
        if verification_year is None:
            verification_year = datetime.now(tz=UTC).year

        stage1_records = await self._run_stage1_lookup_sequence(
            certificate_number=normalized_certificate,
            stage1_year=verification_year,
            requested_year=current_verification_date.year if current_verification_date else None,
            valid_until_year=valid_until_year,
        )
        if not stage1_records:
            return None, None

        selected_stage1_record = _select_most_recent_record(stage1_records)
        if selected_stage1_record is None:
            return None, None

        selected_stage1_docnum = _normalize_certificate_number(
            _normalize_value(selected_stage1_record.get("result_docnum"))
        )
        target_year = _determine_stage2_year(
            stage1_year=verification_year,
            requested_year=current_verification_date.year if current_verification_date else None,
            valid_until_year=valid_until_year,
            selected_record=selected_stage1_record,
        )

        mit_number = _normalize_value(selected_stage1_record.get("mit_number"))
        mit_title = _normalize_value(selected_stage1_record.get("mit_title"))
        mit_notation = _normalize_value(selected_stage1_record.get("mit_notation"))
        mi_modification = _normalize_value(selected_stage1_record.get("mi_modification"))
        mi_number = _normalize_value(selected_stage1_record.get("mi_number"))
        has_modification = bool(mi_modification)
        has_notation = bool(mit_notation)

        chosen_record = selected_stage1_record
        stage2_successful = False
        include_modification_flag = True
        include_notation_flag = True

        for candidate_year, include_modification, include_notation in _build_stage2_attempts(
            target_year
        ):
            attempt_records = await self._search_by_instrument_params(
                mit_number=mit_number,
                mit_title=mit_title,
                mit_notation=mit_notation if include_notation else None,
                mi_modification=mi_modification if include_modification else None,
                mi_number=mi_number,
                year=candidate_year,
            )
            if not attempt_records:
                continue

            stage2_successful = True
            updated_candidates = [
                record
                for record in attempt_records
                if _normalize_certificate_number(_normalize_value(record.get("result_docnum")))
                != selected_stage1_docnum
            ]
            prioritized_pool = updated_candidates or attempt_records
            selected_candidate = _select_most_recent_record(prioritized_pool)
            if selected_candidate is None:
                continue
            chosen_record = selected_candidate
            include_modification_flag = include_modification
            include_notation_flag = include_notation
            if updated_candidates:
                break

        modification_relaxed = bool(has_modification and not include_modification_flag)
        notation_relaxed = bool(has_notation and not include_notation_flag)
        final_result = _map_vri_search_result(chosen_record)
        if final_result is None:
            return None, None

        return (
            {
                "certificate_updated": _normalize_certificate_number(final_result.result_docnum)
                != normalized_certificate,
                "stage2_successful": stage2_successful,
                "modification_relaxed": modification_relaxed,
                "notation_relaxed": notation_relaxed,
            },
            final_result,
        )

    async def _run_stage1_lookup_sequence(
        self,
        *,
        certificate_number: str,
        stage1_year: int,
        requested_year: int | None,
        valid_until_year: int | None,
    ) -> list[dict[str, Any]]:
        attempted_years: list[int] = []
        stage1_records: list[dict[str, Any]] = []
        candidate_years = [stage1_year]
        if requested_year is not None and requested_year not in candidate_years:
            candidate_years.append(requested_year)
        if valid_until_year is not None:
            fallback_year = max(valid_until_year - 1, 1900)
            if fallback_year not in candidate_years:
                candidate_years.append(fallback_year)

        for candidate_year in candidate_years:
            attempted_years.append(candidate_year)
            results = await self._search_by_certificate_and_year(
                certificate_number=certificate_number,
                year=candidate_year,
            )
            if results:
                stage1_records = results
                break

        return stage1_records

    async def _search_by_certificate_and_year(
        self,
        *,
        certificate_number: str,
        year: int,
    ) -> list[dict[str, Any]]:
        return await self.client.search_records(
            params={"result_docnum": certificate_number, "year": str(year)},
            registry_kind=ArshinRegistryKind.SI,
            max_results=20,
        )

    async def _search_by_instrument_params(
        self,
        *,
        mit_number: str | None,
        mit_title: str | None,
        mit_notation: str | None,
        mi_modification: str | None,
        mi_number: str | None,
        year: int | None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {}
        if mit_number:
            params["mit_number"] = mit_number
        if mit_title:
            params["mit_title"] = mit_title
        if mit_notation:
            params["mit_notation"] = mit_notation
        if mi_modification:
            params["mi_modification"] = mi_modification
        if mi_number:
            params["mi_number"] = mi_number
        if year is not None:
            params["year"] = str(year)
        if not params:
            return []

        return await self.client.search_records(
            params=params,
            registry_kind=ArshinRegistryKind.SI,
            max_results=50,
        )


def _map_vri_search_result(record: dict[str, Any]) -> ArshinSearchResultRead | None:
    vri_id = _normalize_value(record.get("vri_id") or record.get("id"))
    if not vri_id:
        return None
    return ArshinSearchResultRead(
        vri_id=vri_id,
        arshin_url=f"{settings.arshin_public_results_base_url}{vri_id}",
        org_title=_normalize_value(record.get("org_title")),
        mit_number=_normalize_value(record.get("mit_number")),
        mit_title=_normalize_value(record.get("mit_title")),
        mit_notation=_normalize_value(record.get("mit_notation")),
        mi_modification=_normalize_value(record.get("mi_modification")),
        mi_number=_normalize_value(record.get("mi_number")),
        result_docnum=_normalize_value(record.get("result_docnum")),
        applicability=_extract_applicability(record.get("applicability")),
        verification_date=_coerce_datetime(
            record.get("verification_date") or record.get("verif_date")
        ),
        valid_date=_coerce_datetime(record.get("valid_date") or record.get("validity_date")),
        raw_payload_json=record,
    )


def _build_si_payload(
    *,
    search_result: ArshinSearchResultRead,
    detail: ArshinVriDetailRead,
) -> SIVerificationCreateRequest:
    return SIVerificationCreateRequest(
        vri_id=search_result.vri_id,
        arshin_url=detail.arshin_url or search_result.arshin_url,
        org_title=detail.organization or search_result.org_title,
        mit_number=detail.reg_number or search_result.mit_number,
        mit_title=detail.type_name or search_result.mit_title,
        mit_notation=detail.type_designation or search_result.mit_notation,
        mi_number=detail.serial_number or search_result.mi_number,
        certificate_number=(
            detail.certificate_number
            or _extract_certificate_from_raw(detail.raw_payload_json)
            or search_result.result_docnum
        ),
        result_docnum=(
            _extract_registry_number_from_raw(detail.raw_payload_json)
            if _looks_like_esi_detail(detail.raw_payload_json)
            else (detail.certificate_number or search_result.result_docnum)
        ),
        verification_date=(
            _coerce_datetime_string(detail.verification_date) or search_result.verification_date
        ),
        valid_date=_coerce_datetime_string(detail.valid_until) or search_result.valid_date,
        raw_payload_json=search_result.raw_payload_json,
        detail_payload_json=detail.raw_payload_json,
    )


def _select_esi_result(
    *,
    results: list[ArshinSearchResultRead],
    registry_number: str | None,
    fallback_vri_id: str | None,
) -> ArshinSearchResultRead | None:
    if registry_number:
        normalized_registry = registry_number.strip()
        for item in results:
            if (item.result_docnum or "").strip() == normalized_registry:
                return item
    if fallback_vri_id:
        for item in results:
            if item.vri_id == fallback_vri_id:
                return item
    return results[0] if results else None


def _determine_stage2_year(
    *,
    stage1_year: int | None,
    requested_year: int | None,
    valid_until_year: int | None,
    selected_record: dict[str, Any],
) -> int | None:
    candidate_dates = [
        _coerce_datetime(selected_record.get("valid_date")),
        _coerce_datetime(selected_record.get("validity_date")),
        _coerce_datetime(selected_record.get("valid_until")),
        _coerce_datetime(selected_record.get("verification_date")),
    ]
    for candidate in candidate_dates:
        if candidate is not None:
            return candidate.year
    if valid_until_year is not None:
        return valid_until_year
    if requested_year is not None:
        return requested_year
    return stage1_year


def _build_stage2_attempts(
    target_year: int | None,
) -> list[tuple[int | None, bool, bool]]:
    if target_year is None:
        return [(None, True, True), (None, False, False)]
    return [(target_year, True, True), (target_year, False, False)]


def _select_most_recent_record(records: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not records:
        return None

    def sort_key(record: dict[str, Any]) -> tuple[datetime, str]:
        record_date = (
            _coerce_datetime(record.get("verification_date"))
            or _coerce_datetime(record.get("valid_date"))
            or _coerce_datetime(record.get("validity_date"))
            or _extract_date_from_docnum(_normalize_value(record.get("result_docnum")))
            or datetime.min.replace(tzinfo=UTC)
        )
        return (
            record_date,
            _normalize_certificate_number(_normalize_value(record.get("result_docnum"))),
        )

    return max(records, key=sort_key)


def _extract_date_from_docnum(value: str | None) -> datetime | None:
    if not value:
        return None
    for pattern in (
        re.compile(r"(\d{2})-(\d{2})-(\d{4})"),
        re.compile(r"(\d{4})-(\d{2})-(\d{2})"),
    ):
        match = pattern.search(value)
        if not match:
            continue
        first, second, third = match.groups()
        try:
            if len(first) == 4:
                return datetime(int(first), int(second), int(third), tzinfo=UTC)
            return datetime(int(third), int(second), int(first), tzinfo=UTC)
        except ValueError:
            continue
    return None


def _normalize_value(value: Any) -> str | None:
    if isinstance(value, str):
        normalized = value.replace("\xa0", " ").strip()
        return normalized or None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    return None


def _normalize_certificate_number(value: str | None) -> str:
    if not value:
        return ""
    normalized = value.replace("\xa0", " ").strip()
    normalized = re.sub(r"^(?:\s*(?:№|#)\s*)+", "", normalized)
    normalized = re.sub(r"\s*/\s*", "/", normalized)
    normalized = re.sub(r"\s*-\s*", "-", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized.strip()


def _coerce_datetime(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return None
        candidate = candidate.replace("Z", "+00:00")
        for parser in (
            lambda text: datetime.fromisoformat(text),
            lambda text: datetime.strptime(text, "%d.%m.%Y"),
            lambda text: datetime.strptime(text, "%Y-%m-%d"),
        ):
            try:
                parsed = parser(candidate)
                return parsed.astimezone(UTC) if parsed.tzinfo else parsed.replace(tzinfo=UTC)
            except ValueError:
                continue
    return None


def _coerce_datetime_string(value: str | None) -> datetime | None:
    return _coerce_datetime(value)


def _extract_applicability(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, dict):
        nested = value.get("applicable")
        if isinstance(nested, bool):
            return nested
        cert_num = _normalize_value(value.get("certNum") or value.get("certificateNumber"))
        if cert_num:
            return True
    return None


def _extract_record_year(value: datetime | None) -> int | None:
    return value.year if value else None


def _build_match_note(result: dict[str, Any]) -> str | None:
    if result["certificate_updated"]:
        if result["modification_relaxed"] or result["notation_relaxed"]:
            return "Найдено обновление после ослабления части фильтров. Нужна ручная проверка."
        return "Найдено новое свидетельство о поверке."
    if result["stage2_successful"] is False:
        return "Новая запись не найдена, сохранена текущая версия свидетельства."
    return "Актуальная запись подтверждена."


def _looks_like_esi_detail(raw_payload: dict[str, Any] | None) -> bool:
    if not isinstance(raw_payload, dict):
        return False
    return bool(
        raw_payload.get("number")
        or raw_payload.get("metrolog_related_esi_profiles")
        or raw_payload.get("metrolog_related_esi_verification_records")
    )


def _extract_registry_number_from_raw(raw_payload: dict[str, Any] | None) -> str | None:
    if not isinstance(raw_payload, dict):
        return None
    return _normalize_value(raw_payload.get("number"))


def _extract_certificate_from_raw(raw_payload: dict[str, Any] | None) -> str | None:
    if not isinstance(raw_payload, dict):
        return None
    vri_info = raw_payload.get("vriInfo")
    if isinstance(vri_info, dict):
        applicable = vri_info.get("applicable")
        if isinstance(applicable, dict):
            return _normalize_value(
                applicable.get("certNum") or applicable.get("certificateNumber")
            )
        return _normalize_value(vri_info.get("certNum"))
    return _normalize_value(raw_payload.get("certificate_number"))
