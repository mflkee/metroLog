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

SERIAL_MATCH_EXACT = "exact"
SERIAL_MATCH_CONFIDENT = "confident"
SERIAL_MATCH_DIGITS_ONLY = "digits_only"
SERIAL_MATCH_NONE = "none"

# Short digit strings collide far too easily ("12" against "A12"), so a digit-only
# serial match is only considered from four digits up.
MIN_SERIAL_DIGITS = 4

# One page is enough to see that a serial is shared: the probe only asks whether more than one
# instrument carries it, not which one is the newest.
SERIAL_INSTRUMENT_PROBE_MAX_RESULTS = 100

# Latin and Cyrillic letters that are visually identical. A serial typed in the wrong
# alphabet is the same serial — see the `C133358228` / `С133358228` case.
_CYRILLIC_TO_LATIN = {
    "А": "A",
    "В": "B",
    "Е": "E",
    "К": "K",
    "М": "M",
    "Н": "H",
    "О": "O",
    "Р": "P",
    "С": "C",
    "Т": "T",
    "У": "Y",
    "Х": "X",
}
_LATIN_TO_CYRILLIC = {latin: cyrillic for cyrillic, latin in _CYRILLIC_TO_LATIN.items()}
_CYRILLIC_TO_LATIN_TABLE = str.maketrans(_CYRILLIC_TO_LATIN)
_LATIN_TO_CYRILLIC_TABLE = str.maketrans(_LATIN_TO_CYRILLIC)

# Exact equality (or equality after folding punctuation and spaces) is the same written
# serial; equality of the digits alone only means "maybe the same instrument" and is
# surfaced for review.
_CERTAIN_SERIAL_MATCHES = frozenset({SERIAL_MATCH_EXACT, SERIAL_MATCH_CONFIDENT})


@dataclass(slots=True, frozen=True)
class _Stage2Attempt:
    """One stage-2 query. ``None`` in a filter field means "do not send it"."""

    year: int | None
    serial: str | None
    modification: str | None
    notation: str | None
    # A variant is a different spelling of the serial recorded in the current verification
    # (spacing or alphabet), not the recorded value itself.
    serial_is_variant: bool = False

    @property
    def filtered_by_serial(self) -> bool:
        return self.serial is not None


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
    # The matched record spells the serial differently from the current one, and whether
    # that difference is only in the digits (which needs a human to confirm). A serial that
    # Arshin carries for several instruments of different types cannot identify one at all.
    serial_relaxed: bool = False
    serial_requires_review: bool = False
    serial_candidates: int = 0
    serial_ambiguous: bool = False
    ambiguous_instruments: tuple[str, ...] = ()


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
            # A serial carried by several instruments is a question in itself, even when the
            # refresh found nothing newer: the stored certificate may be someone else's.
            uncertain_update=bool(
                stage1_record["serial_ambiguous"]
                or (
                    stage1_record["certificate_updated"]
                    and (
                        stage1_record["modification_relaxed"]
                        or stage1_record["notation_relaxed"]
                        or stage1_record["serial_requires_review"]
                    )
                )
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
            serial_relaxed=bool(stage1_record["serial_relaxed"]),
            serial_requires_review=bool(stage1_record["serial_requires_review"]),
            serial_candidates=int(stage1_record["serial_candidates"]),
            serial_ambiguous=bool(stage1_record["serial_ambiguous"]),
            ambiguous_instruments=tuple(stage1_record["ambiguous_instruments"]),
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
            # A serial carried by several instruments is a question in itself, even when the
            # refresh found nothing newer: the stored certificate may be someone else's.
            uncertain_update=bool(
                matched_record["serial_ambiguous"]
                or (
                    matched_record["certificate_updated"]
                    and (
                        matched_record["modification_relaxed"]
                        or matched_record["notation_relaxed"]
                        or matched_record["serial_requires_review"]
                    )
                )
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
            serial_relaxed=bool(matched_record["serial_relaxed"]),
            serial_requires_review=bool(matched_record["serial_requires_review"]),
            serial_candidates=int(matched_record["serial_candidates"]),
            serial_ambiguous=bool(matched_record["serial_ambiguous"]),
            ambiguous_instruments=tuple(matched_record["ambiguous_instruments"]),
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

        current_reference_date = (
            _coerce_datetime(current_verification_date)
            or _coerce_datetime(current_valid_date)
            or _extract_record_date(selected_stage1_record)
        )

        chosen_record = selected_stage1_record
        stage2_successful = False
        include_modification_flag = True
        include_notation_flag = True
        chosen_serial_match = SERIAL_MATCH_EXACT
        serial_candidates = 0

        for attempt in _build_stage2_attempts(
            target_year=target_year,
            mi_number=mi_number,
            mi_modification=mi_modification,
            mit_notation=mit_notation,
        ):
            attempt_records = await self._search_by_instrument_params(
                mit_number=mit_number,
                mit_title=mit_title,
                mit_notation=attempt.notation,
                mi_modification=attempt.modification,
                mi_number=attempt.serial,
                year=attempt.year,
            )
            if not attempt_records:
                continue

            stage2_successful = True
            updated_candidates = _without_current_and_older_records(
                attempt_records,
                current_docnum=selected_stage1_docnum,
                reference_date=current_reference_date,
            )
            if not updated_candidates:
                continue

            # Arshin filters the serial itself when the attempt carries one; when it does
            # not, the records of the whole instrument type come back and the serial has to
            # be checked here (see `_classify_serial_match`).
            accepted = _accept_serial_candidates(
                records=updated_candidates,
                current_serial=mi_number,
                filtered_by_serial=attempt.filtered_by_serial,
            )
            if not accepted:
                continue

            selected_candidate = _select_best_serial_candidate(accepted)
            if selected_candidate is None:
                continue
            chosen_record, chosen_serial_match, serial_candidates = selected_candidate
            # Dropping a filter is what makes a match uncertain. A spelling variant of the
            # serial is the exception: the instrument is identified by its serial there, and
            # the modification and notation are dropped only because they drift the same way.
            include_modification_flag = (
                attempt.modification is not None or attempt.serial_is_variant
            )
            include_notation_flag = attempt.notation is not None or attempt.serial_is_variant
            break

        ambiguous_instruments = await self._describe_serial_instruments(
            serial=mi_number,
            matched_serial=_normalize_value(chosen_record.get("mi_number")),
        )

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
                "serial_relaxed": _serial_spelling_drifted(
                    current_serial=mi_number,
                    matched_serial=_normalize_value(chosen_record.get("mi_number")),
                ),
                "serial_requires_review": chosen_serial_match == SERIAL_MATCH_DIGITS_ONLY,
                "serial_candidates": serial_candidates,
                "serial_ambiguous": bool(ambiguous_instruments),
                "ambiguous_instruments": ambiguous_instruments,
                "current_serial": mi_number,
                "matched_serial": _normalize_value(chosen_record.get("mi_number")),
            },
            final_result,
        )

    async def _describe_serial_instruments(
        self,
        *,
        serial: str | None,
        matched_serial: str | None,
    ) -> list[str]:
        """Which instruments Arshin carries for this serial.

        A short serial (``45549``, ``201003``) belongs to many instruments of different types, so
        the serial alone cannot say that a verification is the one on the card. Every distinct
        instrument found here turns the match into a question for the operator.
        """
        spellings: list[str] = []
        for value in (matched_serial, serial):
            if value and value not in spellings:
                spellings.append(value)
        if not spellings:
            return []

        signatures: dict[tuple[str, str], str] = {}
        for spelling in spellings:
            records = await self.client.search_records(
                params={"mi_number": spelling},
                registry_kind=ArshinRegistryKind.SI,
                max_results=SERIAL_INSTRUMENT_PROBE_MAX_RESULTS,
            )
            for record in records:
                if (
                    _classify_serial_match(
                        current=serial or matched_serial,
                        candidate=_normalize_value(record.get("mi_number")),
                    )
                    == SERIAL_MATCH_NONE
                ):
                    continue
                mit_number = _normalize_value(record.get("mit_number")) or ""
                modification = _normalize_value(record.get("mi_modification")) or ""
                signature = (mit_number, modification)
                if signature in signatures:
                    continue
                title = _normalize_value(record.get("mit_title")) or ""
                parts = (mit_number, title)
                signatures[signature] = " ".join(part for part in parts if part).strip()

        if len(signatures) <= 1:
            return []
        return [signatures[key] for key in signatures]

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
    *,
    target_year: int | None,
    mi_number: str | None,
    mi_modification: str | None,
    mit_notation: str | None,
) -> list[_Stage2Attempt]:
    # The order encodes precision: the serial as recorded, then exact-query spellings of it,
    # then serial-free queries whose records are validated locally. A yearless
    # instrument-parameter search makes Arshin return the latest applicable verification
    # record for the instrument, so it still finds a new certificate when the instrument was
    # re-verified well before the previous certificate expired (досрочная поверка); the
    # year-scoped attempts are kept from the previous behaviour as a fallback.
    attempts: list[_Stage2Attempt] = [
        _Stage2Attempt(
            year=None, serial=mi_number, modification=mi_modification, notation=mit_notation
        ),
        _Stage2Attempt(year=None, serial=mi_number, modification=None, notation=None),
    ]
    if target_year is not None:
        attempts.append(
            _Stage2Attempt(
                year=target_year,
                serial=mi_number,
                modification=mi_modification,
                notation=mit_notation,
            )
        )
        attempts.append(
            _Stage2Attempt(year=target_year, serial=mi_number, modification=None, notation=None)
        )

    if not mi_number:
        return _dedupe_stage2_attempts(attempts)

    # A serial drifts between verifications in two structured ways: the spacing around its
    # separators and the alphabet of its look-alike letters. Each variant is still an exact
    # query, so a hit is the same instrument and needs no review. The variant is searched
    # without the other filters: the modification drifts the same way, and narrowing with it
    # would empty the query.
    for variant in _serial_variants(mi_number):
        attempts.append(
            _Stage2Attempt(
                year=None,
                serial=variant,
                modification=None,
                notation=None,
                serial_is_variant=True,
            )
        )

    # A letter added to a serial cannot be derived from the old spelling (`418007` vs
    # `L418007`), so the serial has to be dropped and the returned records checked locally.
    # The modification narrows a heavy instrument type to a handful of records — 3 and 23 in
    # the measured cases — which is what makes these levels usable. Its own spelling variants
    # are tried because the spacing drifts there too; the notation is kept, because a spelling
    # variant is not a relaxation of a filter and dropping it would flag every row for review.
    for modification_variant in (mi_modification, *_spacing_variants(mi_modification or "")):
        attempts.append(
            _Stage2Attempt(
                year=target_year,
                serial=None,
                modification=modification_variant,
                notation=mit_notation,
            )
        )
        attempts.append(
            _Stage2Attempt(
                year=None, serial=None, modification=modification_variant, notation=mit_notation
            )
        )
    attempts.append(_Stage2Attempt(year=target_year, serial=None, modification=None, notation=None))
    attempts.append(_Stage2Attempt(year=None, serial=None, modification=None, notation=None))
    return _dedupe_stage2_attempts(attempts)


def _dedupe_stage2_attempts(attempts: list[_Stage2Attempt]) -> list[_Stage2Attempt]:
    seen: set[tuple[int | None, str | None, str | None, str | None]] = set()
    unique: list[_Stage2Attempt] = []
    for attempt in attempts:
        key = (attempt.year, attempt.serial, attempt.modification, attempt.notation)
        if key in seen:
            continue
        seen.add(key)
        unique.append(attempt)
    return unique


def _serial_variants(serial: str) -> list[str]:
    variants: list[str] = []
    for candidate in (*_spacing_variants(serial), *_homoglyph_variants(serial)):
        if candidate not in variants:
            variants.append(candidate)
    return variants


def _spacing_variants(value: str) -> list[str]:
    """Spellings of one value that differ only in spacing.

    Arshin stores what the operator typed, so `21202377-19011936` and
    `21202377 - 19011936` are two spellings of the same serial.
    """
    if not value:
        return []
    spaced = re.sub(r"\s*([-/])\s*", r" \1 ", value)
    spaced = re.sub(r"\s+", " ", spaced).strip()
    compact = re.sub(r"\s+", "", value)
    variants: list[str] = []
    for candidate in (spaced, compact):
        if candidate and candidate != value and candidate not in variants:
            variants.append(candidate)
    return variants


def _homoglyph_variants(value: str) -> list[str]:
    """The same value with its letters written in the other alphabet."""
    if not value:
        return []
    variants: list[str] = []
    for candidate in (
        value.translate(_LATIN_TO_CYRILLIC_TABLE),
        value.translate(_CYRILLIC_TO_LATIN_TABLE),
    ):
        if candidate != value and candidate not in variants:
            variants.append(candidate)
    return variants


def _serial_key(value: str) -> str:
    """A serial reduced to letters and digits, case folded, punctuation dropped."""
    return re.sub(r"[^0-9A-Za-zА-Яа-яЁё]", "", value or "").upper()


def _serial_folded(value: str) -> str:
    """A serial written in one alphabet: look-alike letters folded to Latin."""
    return _serial_key(value).translate(_CYRILLIC_TO_LATIN_TABLE)


def _serial_digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def _classify_serial_match(*, current: str | None, candidate: str | None) -> str:
    """How a record's serial relates to the serial of the current verification.

    ``exact`` means the same written serial; ``confident`` means the same serial with its
    letters written in the other alphabet; ``digits_only`` means the digits agree while the
    letters differ — the serial may belong to another instrument, so a human has to confirm.
    """
    if not current or not candidate:
        return SERIAL_MATCH_NONE
    if _serial_key(current) == _serial_key(candidate):
        return SERIAL_MATCH_EXACT
    if _serial_folded(current) == _serial_folded(candidate):
        return SERIAL_MATCH_CONFIDENT

    current_digits = _serial_digits(current)
    candidate_digits = _serial_digits(candidate)
    if len(current_digits) < MIN_SERIAL_DIGITS or current_digits != candidate_digits:
        return SERIAL_MATCH_NONE

    # Digits alone are too weak, so the shorter serial has to be the other one minus a
    # leading or trailing letter (`418007` vs `L418007`), not a different number.
    folded_current = _serial_folded(current)
    folded_candidate = _serial_folded(candidate)
    if (
        folded_current.startswith(folded_candidate)
        or folded_candidate.startswith(folded_current)
        or folded_current.endswith(folded_candidate)
        or folded_candidate.endswith(folded_current)
    ):
        return SERIAL_MATCH_DIGITS_ONLY
    return SERIAL_MATCH_NONE


def _serial_spelling_drifted(*, current_serial: str | None, matched_serial: str | None) -> bool:
    if not current_serial or not matched_serial:
        return False
    return _collapse_spaces(current_serial) != _collapse_spaces(matched_serial)


def _collapse_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _serial_match_rank(match: str) -> int:
    return 0 if match in _CERTAIN_SERIAL_MATCHES else 1


def _without_current_and_older_records(
    records: list[dict[str, Any]],
    *,
    current_docnum: str,
    reference_date: datetime | None,
) -> list[dict[str, Any]]:
    updated: list[dict[str, Any]] = []
    for record in records:
        record_docnum = _normalize_certificate_number(_normalize_value(record.get("result_docnum")))
        if record_docnum == current_docnum:
            continue
        record_date = _extract_record_date(record)
        if reference_date is not None and record_date is not None and record_date < reference_date:
            continue
        updated.append(record)
    return updated


def _accept_serial_candidates(
    *,
    records: list[dict[str, Any]],
    current_serial: str | None,
    filtered_by_serial: bool,
) -> list[tuple[dict[str, Any], str]]:
    """Keep the records of *this* instrument and say how each one's serial relates to it.

    An attempt that carries a serial is filtered by Arshin already, so nothing is dropped
    there (the classification only describes the match). An attempt that carries none
    returns the records of the whole instrument type, and only a compatible serial passes.
    """
    accepted: list[tuple[dict[str, Any], str]] = []
    for record in records:
        match = _classify_serial_match(
            current=current_serial,
            candidate=_normalize_value(record.get("mi_number")),
        )
        if match == SERIAL_MATCH_NONE and (filtered_by_serial or not current_serial):
            # Nothing to compare: Arshin matched the serial itself, or the instrument has
            # no serial to compare against (the pre-drift behaviour).
            match = SERIAL_MATCH_EXACT
        if match == SERIAL_MATCH_NONE:
            continue
        accepted.append((record, match))
    return accepted


def _select_best_serial_candidate(
    accepted: list[tuple[dict[str, Any], str]],
) -> tuple[dict[str, Any], str, int] | None:
    """The most precise match wins; recency only decides inside one match class."""
    if not accepted:
        return None
    best_rank = min(_serial_match_rank(match) for _, match in accepted)
    tier = [record for record, match in accepted if _serial_match_rank(match) == best_rank]
    chosen = _select_most_recent_record(tier)
    if chosen is None:
        return None
    chosen_match = next(match for record, match in accepted if record is chosen)
    return chosen, chosen_match, len(tier)


def _select_most_recent_record(records: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not records:
        return None

    def sort_key(record: dict[str, Any]) -> tuple[datetime, str]:
        record_date = _extract_record_date(record) or datetime.min.replace(tzinfo=UTC)
        return (
            record_date,
            _normalize_certificate_number(_normalize_value(record.get("result_docnum"))),
        )

    return max(records, key=sort_key)


def _extract_record_date(record: dict[str, Any]) -> datetime | None:
    return (
        _coerce_datetime(record.get("verification_date"))
        or _coerce_datetime(record.get("valid_date"))
        or _coerce_datetime(record.get("validity_date"))
        or _extract_date_from_docnum(_normalize_value(record.get("result_docnum")))
    )


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
            note = "Найдено обновление после ослабления части фильтров. Нужна ручная проверка."
        elif result.get("serial_requires_review"):
            note = "Найдено новое свидетельство о поверке. Нужна ручная проверка."
        else:
            note = "Найдено новое свидетельство о поверке."
    elif result["stage2_successful"] is False:
        note = "Новая запись не найдена, сохранена текущая версия свидетельства."
    else:
        note = "Актуальная запись подтверждена."

    sentences = [note]
    if result.get("serial_ambiguous"):
        instruments = ", ".join(result.get("ambiguous_instruments") or ())
        sentences.append(
            f"Заводской номер в Аршине есть у нескольких приборов ({instruments}) — "
            "проверьте, чей это сертификат."
        )
    if result.get("serial_relaxed"):
        sentences.append(
            "Заводской номер в Аршине записан иначе: "
            f"«{result.get('matched_serial')}» вместо «{result.get('current_serial')}»."
        )
    if (result.get("serial_candidates") or 0) > 1:
        sentences.append(
            f"Подходящих записей несколько ({result['serial_candidates']}) — "
            "выберите нужную вручную."
        )
    return " ".join(sentences)


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
