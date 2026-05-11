from __future__ import annotations

import asyncio
import json
import re
from collections.abc import Mapping
from datetime import datetime
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.integrations.arshin_client import ArshinClient
from app.schemas.arshin import (
    ArshinESIDetailRequest,
    ArshinRegistryKind,
    ArshinSearchRequest,
    ArshinSearchResultRead,
    ArshinStatusRead,
    ArshinVriDetailRead,
)

ARSHIN_UNAVAILABLE_USER_MESSAGE = (
    "В данный момент Аршин недоступен по техническим причинам. "
    "Поиск, просмотр и добавление СИ/ЭСИ временно недоступны."
)


class ArshinService:
    def __init__(self, client: ArshinClient | None = None) -> None:
        self.client = client or ArshinClient()

    async def get_status(self) -> ArshinStatusRead:
        try:
            await self.client.check_availability()
        except (httpx.HTTPStatusError, httpx.HTTPError):
            return ArshinStatusRead(
                available=False,
                message=ARSHIN_UNAVAILABLE_USER_MESSAGE,
            )
        return ArshinStatusRead(available=True, message=None)

    async def search(self, *, payload: ArshinSearchRequest) -> list[ArshinSearchResultRead]:
        if payload.year is not None and (payload.year < 1900 or payload.year > 2100):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Year must be between 1900 and 2100.",
            )

        search_params = _build_search_params(payload)
        if payload.registry_kind == ArshinRegistryKind.ESI:
            if not search_params and _resolve_esi_certificate_number(payload) is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="At least one Arshin search filter must be provided.",
                )
            return await self._search_esi(payload=payload, search_params=search_params)

        if not search_params:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="At least one Arshin search filter must be provided.",
            )

        candidate_years = _build_year_candidates(
            registry_kind=payload.registry_kind,
            explicit_year=payload.year,
            certificate_number=search_params.get("result_docnum"),
            include_yearless_fallback=payload.year is None,
        )

        try:
            all_records: list[dict[str, Any]] = []
            for candidate_year in candidate_years:
                request_params = dict(search_params)
                if candidate_year is not None:
                    request_params["year"] = str(candidate_year)
                all_records.extend(
                    await self.client.search_records(
                        params=request_params,
                        registry_kind=payload.registry_kind,
                    )
                )
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Arshin search is temporarily unavailable.",
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to reach Arshin service.",
            ) from exc

        deduplicated_records = _deduplicate_records(all_records)
        mapped_records: list[ArshinSearchResultRead] = []
        for record in deduplicated_records:
            mapped = self._map_search_record(record, registry_kind=payload.registry_kind)
            if mapped is not None:
                mapped_records.append(mapped)

        mapped_records.sort(key=_search_result_sort_key, reverse=True)
        return mapped_records

    async def _search_esi(
        self,
        *,
        payload: ArshinSearchRequest,
        search_params: dict[str, str],
    ) -> list[ArshinSearchResultRead]:
        certificate_number = _resolve_esi_certificate_number(payload)
        if certificate_number is not None:
            return await self._search_esi_by_certificate(
                payload=payload,
                certificate_number=certificate_number,
            )

        try:
            records = await self.client.search_records(
                params=search_params,
                registry_kind=ArshinRegistryKind.ESI,
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in {400, 403, 404}:
                return await self._search_esi_via_vri(payload=payload)
            raise

        mapped_records: list[ArshinSearchResultRead] = []
        for record in _deduplicate_records(records):
            mapped = self._map_search_record(record, registry_kind=payload.registry_kind)
            if mapped is not None:
                mapped_records.append(mapped)

        if mapped_records:
            mapped_records.sort(key=_search_result_sort_key, reverse=True)
            return mapped_records

        return await self._search_esi_via_vri(payload=payload)

    async def _search_esi_by_certificate(
        self,
        *,
        payload: ArshinSearchRequest,
        certificate_number: str,
    ) -> list[ArshinSearchResultRead]:
        candidate_years = _build_year_candidates(
            registry_kind=ArshinRegistryKind.SI,
            explicit_year=payload.year,
            certificate_number=certificate_number,
            include_yearless_fallback=payload.year is None,
        )

        try:
            candidate_records: list[dict[str, Any]] = []
            for candidate_year in candidate_years:
                request_params = {"result_docnum": certificate_number}
                if candidate_year is not None:
                    request_params["year"] = str(candidate_year)
                candidate_records.extend(
                    await self.client.search_records(
                        params=request_params,
                        registry_kind=ArshinRegistryKind.SI,
                    )
                )
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Arshin search is temporarily unavailable.",
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to reach Arshin service.",
            ) from exc

        prioritized_candidates = _prioritize_esi_vri_candidates(
            _deduplicate_records(candidate_records),
            payload=payload,
        )
        if not prioritized_candidates:
            return []

        mapped_records: list[ArshinSearchResultRead] = []
        saw_rate_limit = False
        for record in prioritized_candidates:
            detail, rate_limited = await _fetch_vri_detail_with_retry(
                self.client,
                vri_id=_normalize_value(record.get("vri_id") or record.get("id")),
            )
            saw_rate_limit = saw_rate_limit or rate_limited
            if not detail:
                continue

            mapped = _map_esi_vri_detail_record(record, detail, payload=payload)
            if mapped is not None:
                mapped_records.append(mapped)

        deduplicated_results = _deduplicate_esi_results(mapped_records)
        deduplicated_results.sort(key=_search_result_sort_key, reverse=True)
        if deduplicated_results:
            return deduplicated_results

        if saw_rate_limit:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Arshin search is temporarily unavailable.",
            )

        return []

    async def _search_esi_via_vri(
        self,
        *,
        payload: ArshinSearchRequest,
    ) -> list[ArshinSearchResultRead]:
        vri_search_params = _build_esi_vri_search_params(payload)
        if not vri_search_params:
            return []

        candidate_records = await self.client.search_records(
            params=vri_search_params,
            registry_kind=ArshinRegistryKind.SI,
        )
        candidate_records = _prioritize_esi_vri_candidates(
            _deduplicate_records(candidate_records),
            payload=payload,
        )
        if not candidate_records:
            return []

        registry_number = _resolve_esi_registry_number(payload)
        mapped_records: list[ArshinSearchResultRead] = []
        saw_rate_limit = False

        for record in candidate_records:
            detail, rate_limited = await _fetch_vri_detail_with_retry(
                self.client,
                vri_id=_normalize_value(record.get("vri_id") or record.get("id")),
            )
            saw_rate_limit = saw_rate_limit or rate_limited
            if not detail:
                continue

            mapped = _map_esi_vri_detail_record(record, detail, payload=payload)
            if mapped is not None:
                mapped_records.append(mapped)
                if registry_number:
                    break

        deduplicated_results = _deduplicate_esi_results(mapped_records)
        deduplicated_results.sort(key=_search_result_sort_key, reverse=True)
        if deduplicated_results:
            return deduplicated_results

        if saw_rate_limit:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Arshin search is temporarily unavailable.",
            )

        return deduplicated_results

    async def search_by_certificate(
        self,
        *,
        certificate_number: str,
        year: int | None = None,
    ) -> list[ArshinSearchResultRead]:
        normalized_certificate = certificate_number.strip()
        if not normalized_certificate:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Certificate number must not be empty.",
            )

        if year is not None and (year < 1900 or year > 2100):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Year must be between 1900 and 2100.",
            )

        return await self.search(
            payload=ArshinSearchRequest(
                certificate_number=normalized_certificate,
                year=year,
            )
        )

    async def get_vri_detail(self, *, vri_id: str) -> ArshinVriDetailRead:
        normalized_vri_id = vri_id.strip()
        if not normalized_vri_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="vri_id must not be empty.",
            )

        try:
            detail = await self.client.fetch_vri_detail(vri_id=normalized_vri_id)
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Arshin detail request is temporarily unavailable.",
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to reach Arshin service.",
            ) from exc

        return _map_detail_record(normalized_vri_id, detail)

    async def get_esi_detail(
        self,
        *,
        payload: ArshinESIDetailRequest,
    ) -> ArshinVriDetailRead:
        normalized_vri_id = payload.vri_id.strip()
        if _looks_like_vri_identifier(normalized_vri_id):
            try:
                direct_detail_payload = await self.client.fetch_vri_detail(vri_id=normalized_vri_id)
            except httpx.HTTPStatusError:
                direct_detail_payload = None
            except httpx.HTTPError:
                direct_detail_payload = None
            else:
                merged_raw_payload = _merge_esi_detail_payloads(
                    direct_detail_payload,
                    payload.raw_payload_json,
                )
                enriched_raw_payload = await self._enrich_esi_detail_payload(
                    detail_payload=merged_raw_payload,
                    selected_vri_id=normalized_vri_id,
                )
                detail = _map_detail_record(normalized_vri_id, enriched_raw_payload)
                public_esi_id = _extract_esi_public_id(payload.raw_payload_json or {})
                if public_esi_id:
                    detail = detail.model_copy(
                        update={
                            "arshin_url": (
                                f"{settings.arshin_public_etalons_base_url}{public_esi_id}"
                            )
                        }
                    )
                return detail

        search_payload = _build_esi_detail_search_request(payload)
        try:
            resolved_results = await self._search_esi_via_vri(payload=search_payload)
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Arshin ESI detail request is temporarily unavailable.",
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Unable to reach Arshin service.",
            ) from exc
        if not resolved_results:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Arshin did not return a detailed ESI record for this registry number.",
            )

        matched_result = _select_esi_detail_candidate(
            number=_resolve_esi_registry_number(search_payload),
            results=resolved_results,
        )
        if matched_result is None or not isinstance(matched_result.raw_payload_json, dict):
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Arshin ESI detail response is incomplete.",
            )

        merged_raw_payload = _merge_esi_detail_payloads(
            matched_result.raw_payload_json,
            payload.raw_payload_json,
        )
        enriched_raw_payload = await self._enrich_esi_detail_payload(
            detail_payload=merged_raw_payload,
            selected_vri_id=matched_result.vri_id,
        )
        return _map_detail_record(matched_result.vri_id, enriched_raw_payload)

    async def _enrich_esi_detail_payload(
        self,
        *,
        detail_payload: dict[str, Any],
        selected_vri_id: str,
    ) -> dict[str, Any]:
        enriched_payload = dict(detail_payload)

        related_profiles = await self._load_related_esi_profiles(
            detail_payload=detail_payload,
        )

        related_verification_records = await self._load_related_esi_verification_records(
            detail_payload=detail_payload,
            selected_vri_id=selected_vri_id,
        )
        if related_profiles:
            (
                related_profiles,
                related_verification_records,
            ) = await self._backfill_related_esi_profile_verification_data(
                related_profiles=related_profiles,
                related_verification_records=related_verification_records,
                verification_year=_resolve_esi_verification_year(
                    detail_payload,
                    _safe_get_mapping(detail_payload, ["vriInfo"]),
                ),
            )
        if related_profiles:
            enriched_payload["metrolog_related_esi_profiles"] = related_profiles
        if related_verification_records:
            enriched_payload["metrolog_related_esi_verification_records"] = (
                related_verification_records
            )

        return enriched_payload

    async def _backfill_related_esi_profile_verification_data(
        self,
        *,
        related_profiles: list[dict[str, Any]],
        related_verification_records: list[dict[str, Any]],
        verification_year: int | None,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        verification_by_registry = {
            _normalize_value(item.get("eta_number")): item
            for item in related_verification_records
            if _normalize_value(item.get("eta_number")) is not None
        }
        updated_profiles = [dict(item) for item in related_profiles]
        appended_verification_records = list(related_verification_records)

        for profile in updated_profiles:
            registry_number = _normalize_value(profile.get("number"))
            if not registry_number or registry_number in verification_by_registry:
                continue

            vri_id = _normalize_value(profile.get("vri_id"))
            if not vri_id:
                continue

            detail, _ = await _fetch_vri_detail_with_retry(self.client, vri_id=vri_id)
            if not detail:
                continue

            detail_mi = _extract_primary_mi(detail)
            if _normalize_value(detail_mi.get("regNumber")) != registry_number:
                continue

            detail_vri = _safe_get_mapping(detail, ["vriInfo"])
            verification_row = _map_related_esi_detail_verification_row(
                registry_number=registry_number,
                vri_id=vri_id,
                detail_mi=detail_mi,
                detail_vri=detail_vri,
            )
            if verification_year is not None and not _row_matches_verification_year(
                verification_row,
                verification_year=verification_year,
            ):
                continue

            verification_by_registry[registry_number] = verification_row
            appended_verification_records.append(verification_row)
            for key in ("verification_date", "valid_date", "certificate_number"):
                if verification_row.get(key) not in (None, ""):
                    profile[key] = verification_row.get(key)

        return (
            sorted(updated_profiles, key=_related_esi_profile_sort_key, reverse=True),
            sorted(
                appended_verification_records,
                key=_related_esi_verification_sort_key,
                reverse=True,
            ),
        )

    async def _load_related_esi_profiles(
        self,
        *,
        detail_payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        detail_mi = _extract_primary_mi(detail_payload)
        detail_vri = _safe_get_mapping(detail_payload, ["vriInfo"])
        verification_year = _resolve_esi_verification_year(detail_payload, detail_vri)

        mit_number = _first_nonempty(
            _normalize_value(detail_mi.get("mitypeNumber")),
            _normalize_value(detail_payload.get("mitype_num")),
        )
        factory_number = _first_nonempty(
            _normalize_value(detail_mi.get("manufactureNum")),
            _normalize_value(detail_payload.get("factory_num")),
        )

        if not mit_number or not factory_number:
            return []

        selected_number = _first_nonempty(
            _normalize_value(detail_mi.get("regNumber")),
            _normalize_value(detail_payload.get("number")),
        )

        try:
            records = await self.client.search_records(
                params={
                    "mitype_num": mit_number,
                    "factory_num": factory_number,
                },
                registry_kind=ArshinRegistryKind.ESI,
                max_results=50,
            )
        except httpx.HTTPError:
            records = []

        profile_rows = [
            _map_related_esi_profile_record(
                record,
                selected_number=selected_number,
            )
            for record in _deduplicate_records(records)
        ]
        profile_rows = [row for row in profile_rows if row is not None]
        if verification_year is not None:
            profile_rows = [
                row
                for row in profile_rows
                if _profile_row_matches_verification_year(
                    row,
                    verification_year=verification_year,
                )
            ]

        selected_profile = _build_selected_esi_profile_row(
            detail_payload=detail_payload,
            certificate_number=_extract_certificate_number(detail_vri),
            selected_number=selected_number,
        )
        if selected_profile is not None:
            profile_rows = _upsert_related_esi_profile_row(profile_rows, selected_profile)

        return sorted(profile_rows, key=_related_esi_profile_sort_key, reverse=True)

    async def _load_related_esi_verification_records(
        self,
        *,
        detail_payload: dict[str, Any],
        selected_vri_id: str,
    ) -> list[dict[str, Any]]:
        detail_mi = _extract_primary_mi(detail_payload)
        detail_vri = _safe_get_mapping(detail_payload, ["vriInfo"])
        verification_year = _resolve_esi_verification_year(detail_payload, detail_vri)

        mit_number = _first_nonempty(
            _normalize_value(detail_mi.get("mitypeNumber")),
            _normalize_value(detail_payload.get("mitype_num")),
        )
        factory_number = _first_nonempty(
            _normalize_value(detail_mi.get("manufactureNum")),
            _normalize_value(detail_payload.get("factory_num")),
        )
        selected_certificate = _extract_certificate_number(detail_vri)

        if not mit_number or not factory_number:
            return []

        try:
            records = await self.client.search_records(
                params={
                    "mit_number": mit_number,
                    "mi_number": factory_number,
                },
                registry_kind=ArshinRegistryKind.SI,
                max_results=30,
            )
        except httpx.HTTPError:
            return []

        related_records = await _fetch_related_vri_details(
            self.client,
            _deduplicate_records(records)[:20],
        )
        verification_rows = [
            _map_related_esi_verification_row(
                record=record,
                detail=detail,
                selected_vri_id=selected_vri_id,
                selected_certificate=selected_certificate,
            )
            for record, detail in related_records
        ]
        verification_rows = [row for row in verification_rows if row is not None]
        if verification_year is not None:
            verification_rows = [
                row
                for row in verification_rows
                if _row_matches_verification_year(row, verification_year=verification_year)
            ]
        return sorted(verification_rows, key=_related_esi_verification_sort_key, reverse=True)

    def _map_search_record(
        self,
        record: dict[str, Any],
        *,
        registry_kind: ArshinRegistryKind,
    ) -> ArshinSearchResultRead | None:
        if registry_kind == ArshinRegistryKind.ESI:
            return _map_esi_search_record(record)

        vri_id = _normalize_value(record.get("vri_id") or record.get("id"))
        if not vri_id:
            return None

        return ArshinSearchResultRead(
            vri_id=vri_id,
            arshin_url=f"{settings.arshin_public_results_base_url}{vri_id}",
            org_title=_normalize_value(record.get("org_title")),
            mit_number=_normalize_value(record.get("mit_number")),
            mit_title=_normalize_value(record.get("mit_title")),
            mit_notation=_normalize_notation_value(record.get("mit_notation")),
            mi_modification=_normalize_value(record.get("mi_modification")),
            mi_number=_normalize_value(record.get("mi_number")),
            result_docnum=_normalize_value(record.get("result_docnum")),
            applicability=_extract_applicability(record.get("applicability")),
            verification_date=_parse_datetime(
                record.get("verification_date") or record.get("verif_date")
            ),
            valid_date=_parse_datetime(record.get("valid_date") or record.get("validity_date")),
            raw_payload_json=record,
        )


def _build_search_params(payload: ArshinSearchRequest) -> dict[str, str]:
    if payload.registry_kind == ArshinRegistryKind.ESI:
        return _build_esi_search_params(payload)

    params: dict[str, str] = {}

    if search_value := _normalize_value(payload.search):
        params["search"] = _normalize_search_value(search_value)
    if org_title := _normalize_value(payload.org_title):
        params["org_title"] = org_title
    if mit_number := _normalize_value(payload.mit_number):
        params["mit_number"] = mit_number
    if mit_title := _normalize_value(payload.mit_title):
        params["mit_title"] = mit_title
    if mit_notation := _normalize_value(payload.mit_notation):
        params["mit_notation"] = mit_notation
    if mi_modification := _normalize_value(payload.mi_modification):
        params["mi_modification"] = mi_modification
    if mi_number := _normalize_value(payload.mi_number):
        params["mi_number"] = mi_number

    result_docnum = _first_nonempty(
        _normalize_value(payload.result_docnum),
        _normalize_value(payload.certificate_number),
    )
    if result_docnum:
        params["result_docnum"] = result_docnum

    if payload.applicability is not None:
        params["applicability"] = "true" if payload.applicability else "false"
    if payload.verification_date is not None:
        params["verification_date"] = payload.verification_date.isoformat()
    if payload.valid_date is not None:
        params["valid_date"] = payload.valid_date.isoformat()

    return params


def _build_esi_search_params(payload: ArshinSearchRequest) -> dict[str, str]:
    params: dict[str, str] = {}

    registry_number = _resolve_esi_registry_number(payload)
    certificate_number = _resolve_esi_certificate_number(payload)

    if search_value := _normalize_value(payload.search):
        if registry_number is None and certificate_number is None:
            params["search"] = _normalize_search_value(search_value)
    if org_title := _normalize_value(payload.org_title):
        params["organization"] = org_title
    if mit_number := _normalize_value(payload.mit_number):
        params["mitype_num"] = mit_number
    if mit_title := _normalize_value(payload.mit_title):
        params["mitype"] = mit_title
    if mit_notation := _normalize_value(payload.mit_notation):
        params["minotation"] = mit_notation
    if mi_modification := _normalize_value(payload.mi_modification):
        params["modification"] = mi_modification
    if mi_number := _normalize_value(payload.mi_number):
        params["factory_num"] = mi_number
    if npe_number := _normalize_value(payload.npe_number):
        params["npenumber"] = npe_number
    if rank := _normalize_value(payload.rank):
        normalized_rank = rank.upper()
        if re.fullmatch(r"\d+[A-ZА-ЯЁ]+", normalized_rank):
            params["rankcode"] = normalized_rank
        else:
            params["rankclass"] = rank

    if registry_number:
        params["number"] = registry_number

    if payload.applicability is not None:
        params["applicability"] = "true" if payload.applicability else "false"
    if payload.verification_date is not None:
        params["verification_date"] = payload.verification_date.isoformat()
    if payload.valid_date is not None:
        params["valid_date"] = payload.valid_date.isoformat()
    if payload.year is not None:
        params["year"] = str(payload.year)

    return params


def _build_esi_detail_search_request(payload: ArshinESIDetailRequest) -> ArshinSearchRequest:
    raw_payload = payload.raw_payload_json or {}
    year = _parse_int(raw_payload.get("year")) if isinstance(raw_payload, Mapping) else None
    verification_date = payload.verification_date.date() if payload.verification_date else None
    valid_date = payload.valid_date.date() if payload.valid_date else None

    return ArshinSearchRequest(
        registry_kind=ArshinRegistryKind.ESI,
        mit_number=payload.mit_number,
        mi_number=payload.mi_number,
        number=_first_nonempty(
            _normalize_value(payload.result_docnum),
            (
                _normalize_value(raw_payload.get("number"))
                if isinstance(raw_payload, Mapping)
                else None
            ),
        ),
        applicability=payload.applicability,
        verification_date=verification_date,
        valid_date=valid_date,
        year=year,
    )


def _build_esi_vri_search_params(payload: ArshinSearchRequest) -> dict[str, str]:
    params: dict[str, str] = {}
    registry_number = _resolve_esi_registry_number(payload)

    if search_value := _normalize_value(payload.search):
        if registry_number is None:
            params["search"] = _normalize_search_value(search_value)
    if org_title := _normalize_value(payload.org_title):
        params["org_title"] = org_title

    resolved_mit_number = _first_nonempty(
        _normalize_value(payload.mit_number),
        _extract_mit_number_from_esi_registry_number(registry_number),
    )
    if resolved_mit_number:
        params["mit_number"] = resolved_mit_number

    if mit_title := _normalize_value(payload.mit_title):
        params["mit_title"] = mit_title
    if mit_notation := _normalize_value(payload.mit_notation):
        params["mit_notation"] = mit_notation
    if mi_modification := _normalize_value(payload.mi_modification):
        params["mi_modification"] = mi_modification
    if mi_number := _normalize_value(payload.mi_number):
        params["mi_number"] = mi_number
    if payload.applicability is not None:
        params["applicability"] = "true" if payload.applicability else "false"
    if payload.verification_date is not None:
        params["verification_date"] = payload.verification_date.isoformat()
    if payload.valid_date is not None:
        params["valid_date"] = payload.valid_date.isoformat()

    return params


def _resolve_esi_registry_number(payload: ArshinSearchRequest) -> str | None:
    explicit_registry_number = _first_nonempty(
        _normalize_value(payload.number),
        (
            _normalize_value(payload.result_docnum)
            if _looks_like_esi_registry_number(_normalize_value(payload.result_docnum) or "")
            else None
        ),
    )
    if explicit_registry_number:
        return explicit_registry_number

    search_value = _normalize_value(payload.search)
    if search_value and _looks_like_esi_registry_number(search_value):
        return search_value

    return None


def _resolve_esi_certificate_number(payload: ArshinSearchRequest) -> str | None:
    explicit_certificate = _first_nonempty(
        _normalize_value(payload.certificate_number),
        (
            _normalize_value(payload.result_docnum)
            if _looks_like_certificate_number(_normalize_value(payload.result_docnum) or "")
            else None
        ),
    )
    if explicit_certificate:
        return explicit_certificate

    search_value = _normalize_value(payload.search)
    if search_value and _looks_like_certificate_number(search_value):
        return search_value

    return None


def _looks_like_esi_registry_number(value: str) -> bool:
    return bool(re.fullmatch(r"\d+\.\d+\.[^.]+\.\d+", value))


def _looks_like_certificate_number(value: str) -> bool:
    normalized = value.strip()
    if not normalized:
        return False
    return bool(re.search(r"/\d{2}-\d{2}-\d{4}/", normalized))


def _looks_like_vri_identifier(value: str) -> bool:
    normalized = value.strip()
    if not normalized:
        return False
    return bool(re.fullmatch(r"\d+-\d+", normalized))


def _build_year_candidates(
    *,
    registry_kind: ArshinRegistryKind,
    explicit_year: int | None,
    certificate_number: str | None,
    include_yearless_fallback: bool,
) -> list[int | None]:
    candidates: list[int | None] = []
    seen: set[int | None] = set()

    def push(value: int | None) -> None:
        if value in seen:
            return
        seen.add(value)
        candidates.append(value)

    if explicit_year is not None:
        push(explicit_year)

    if registry_kind == ArshinRegistryKind.SI:
        guessed_year = _guess_year_from_certificate(certificate_number or "")
        if guessed_year is not None:
            push(guessed_year)

    if include_yearless_fallback or not candidates:
        push(None)
    return candidates


def _extract_mit_number_from_esi_registry_number(value: str | None) -> str | None:
    normalized = _normalize_value(value)
    if not normalized:
        return None

    parts = normalized.split(".")
    if len(parts) < 2 or not parts[0].isdigit() or not parts[1].isdigit():
        return None

    return f"{parts[0]}-{parts[1]}"


def _guess_year_from_certificate(certificate_number: str) -> int | None:
    match = re.search(r"/(\d{2})-(\d{2})-(\d{4})/", certificate_number)
    if not match:
        return None
    return int(match.group(3))


def _deduplicate_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduplicated: list[dict[str, Any]] = []
    seen_vri_ids: set[str] = set()

    for record in records:
        vri_id = _normalize_value(
            record.get("vri_id")
            or record.get("rmieta_id")
            or record.get("id")
            or record.get("number")
        )
        if not vri_id or vri_id in seen_vri_ids:
            continue
        seen_vri_ids.add(vri_id)
        deduplicated.append(record)

    return deduplicated


def _map_esi_search_record(record: dict[str, Any]) -> ArshinSearchResultRead | None:
    record_id = _extract_esi_public_id(record)
    vri_id = _extract_esi_primary_vri_id(record) or record_id
    if not vri_id:
        return None

    return ArshinSearchResultRead(
        vri_id=vri_id,
        arshin_url=(f"{settings.arshin_public_etalons_base_url}{record_id}" if record_id else None),
        org_title=_normalize_value(record.get("organization")),
        mit_number=_normalize_value(record.get("mitype_num")),
        mit_title=_normalize_value(record.get("mitype")),
        mit_notation=_normalize_notation_value(record.get("minotation")),
        mi_modification=_normalize_value(record.get("modification")),
        mi_number=_normalize_value(record.get("factory_num")),
        result_docnum=_normalize_value(record.get("number")),
        applicability=_extract_applicability(record.get("applicability")),
        verification_date=_parse_datetime(record.get("verification_date")),
        valid_date=_parse_datetime(record.get("valid_date") or record.get("validity_date")),
        raw_payload_json=record,
    )


def _map_esi_vri_detail_record(
    record: dict[str, Any],
    detail: dict[str, Any],
    *,
    payload: ArshinSearchRequest,
) -> ArshinSearchResultRead | None:
    detail_mi = _extract_primary_mi(detail)
    detail_vri = _safe_get_mapping(detail, ["vriInfo"])
    registry_number = _normalize_value(detail_mi.get("regNumber"))
    if not registry_number:
        return None

    if not _matches_esi_vri_detail(payload=payload, detail_mi=detail_mi, detail_vri=detail_vri):
        return None

    vri_id = _normalize_value(record.get("vri_id") or record.get("id"))
    if not vri_id:
        return None

    raw_payload = _build_esi_raw_payload_from_vri_detail(detail, detail_mi, detail_vri)
    public_esi_id = _extract_esi_public_id(raw_payload)

    return ArshinSearchResultRead(
        vri_id=vri_id,
        arshin_url=(
            f"{settings.arshin_public_etalons_base_url}{public_esi_id}" if public_esi_id else None
        ),
        org_title=_first_nonempty(
            _normalize_value(detail_vri.get("organization")),
            _normalize_value(record.get("org_title")),
        ),
        mit_number=_first_nonempty(
            _normalize_value(detail_mi.get("mitypeNumber")),
            _normalize_value(record.get("mit_number")),
        ),
        mit_title=_first_nonempty(
            _normalize_value(detail_mi.get("mitypeTitle")),
            _normalize_value(record.get("mit_title")),
        ),
        mit_notation=_first_nonempty(
            _normalize_value(detail_mi.get("mitypeType")),
            _normalize_value(record.get("mit_notation")),
        ),
        mi_modification=_first_nonempty(
            _normalize_value(detail_mi.get("modification")),
            _normalize_value(record.get("mi_modification")),
        ),
        mi_number=_first_nonempty(
            _normalize_value(detail_mi.get("manufactureNum")),
            _normalize_value(record.get("mi_number")),
        ),
        result_docnum=registry_number,
        applicability=_extract_applicability(detail_vri.get("applicable")),
        verification_date=_first_nonempty_datetime(
            _parse_datetime(detail_vri.get("vrfDate")),
            _parse_datetime(record.get("verification_date")),
        ),
        valid_date=_first_nonempty_datetime(
            _parse_datetime(detail_vri.get("validDate")),
            _parse_datetime(record.get("valid_date")),
        ),
        raw_payload_json=raw_payload,
    )


def _matches_esi_vri_detail(
    *,
    payload: ArshinSearchRequest,
    detail_mi: Mapping[str, Any],
    detail_vri: Mapping[str, Any],
) -> bool:
    registry_number = _resolve_esi_registry_number(payload)
    if registry_number and _normalize_value(detail_mi.get("regNumber")) != registry_number:
        return False

    if (
        payload.year is not None
        and registry_number is None
        and not _matches_esi_year_filter(
            detail_mi=detail_mi,
            detail_vri=detail_vri,
            year=payload.year,
        )
    ):
        return False

    if not _matches_text_filter(detail_vri.get("organization"), payload.org_title):
        return False
    if not _matches_text_filter(detail_mi.get("mitypeNumber"), payload.mit_number):
        return False
    if not _matches_text_filter(detail_mi.get("mitypeTitle"), payload.mit_title):
        return False
    if not _matches_text_filter(detail_mi.get("mitypeType"), payload.mit_notation):
        return False
    if not _matches_text_filter(detail_mi.get("modification"), payload.mi_modification):
        return False
    if not _matches_text_filter(detail_mi.get("manufactureNum"), payload.mi_number):
        return False
    if not _matches_text_filter(detail_mi.get("npeNumber"), payload.npe_number):
        return False

    rank_filter = _normalize_value(payload.rank)
    if rank_filter:
        normalized_rank_filter = rank_filter.casefold()
        rank_candidates = {
            candidate.casefold()
            for candidate in (
                _normalize_value(detail_mi.get("rankCode")),
                _normalize_value(detail_mi.get("rankTitle")),
            )
            if candidate
        }
        if not any(normalized_rank_filter in candidate for candidate in rank_candidates):
            return False

    if payload.applicability is not None:
        if _extract_applicability(detail_vri.get("applicable")) != payload.applicability:
            return False

    if payload.verification_date is not None:
        verification_date = _parse_datetime(detail_vri.get("vrfDate"))
        if verification_date is None or verification_date.date() != payload.verification_date:
            return False

    if payload.valid_date is not None:
        valid_date = _parse_datetime(detail_vri.get("validDate"))
        if valid_date is None or valid_date.date() != payload.valid_date:
            return False

    return True


def _matches_text_filter(actual: Any, expected: str | None) -> bool:
    normalized_expected = _normalize_value(expected)
    if not normalized_expected:
        return True

    normalized_actual = _normalize_value(actual)
    if not normalized_actual:
        return False

    return normalized_expected.casefold() in normalized_actual.casefold()


async def _fetch_vri_detail_with_retry(
    client: ArshinClient,
    *,
    vri_id: str | None,
) -> tuple[dict[str, Any] | None, bool]:
    if not vri_id:
        return None, False

    retry_delays_seconds = (0.25, 0.75, 1.5)

    for retry_delay in (*retry_delays_seconds, None):
        try:
            return await client.fetch_vri_detail(vri_id=vri_id), False
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 404:
                return None, False
            if exc.response.status_code == 429 and retry_delay is None:
                return None, True
            if exc.response.status_code != 429:
                raise
            await asyncio.sleep(retry_delay)
        except httpx.HTTPError:
            if retry_delay is None:
                raise
            await asyncio.sleep(retry_delay)

    return None, False


def _prioritize_esi_vri_candidates(
    records: list[dict[str, Any]],
    *,
    payload: ArshinSearchRequest,
) -> list[dict[str, Any]]:
    explicit_year = payload.year

    def sort_key(record: dict[str, Any]) -> tuple[int, int, datetime, datetime, str]:
        verification_date = _parse_datetime(
            record.get("verification_date") or record.get("verif_date")
        )
        valid_date = _parse_datetime(record.get("valid_date") or record.get("validity_date"))
        year_match = 0
        if explicit_year is not None and verification_date is not None:
            year_match = 1 if verification_date.year == explicit_year else 0

        applicability_match = 1 if _extract_applicability(record.get("applicability")) else 0
        vri_id = _normalize_value(record.get("vri_id") or record.get("id")) or ""

        return (
            year_match,
            applicability_match,
            verification_date or datetime.min,
            valid_date or datetime.min,
            vri_id,
        )

    return sorted(records, key=sort_key, reverse=True)


def _matches_esi_year_filter(
    *,
    detail_mi: Mapping[str, Any],
    detail_vri: Mapping[str, Any],
    year: int,
) -> bool:
    manufacture_year = _parse_int(detail_mi.get("manufactureYear"))
    verification_date = _parse_datetime(detail_vri.get("vrfDate"))
    valid_date = _parse_datetime(detail_vri.get("validDate"))

    return any(
        candidate_year == year
        for candidate_year in (
            manufacture_year,
            verification_date.year if verification_date is not None else None,
            valid_date.year if valid_date is not None else None,
        )
    )


def _build_esi_raw_payload_from_vri_detail(
    detail: dict[str, Any],
    detail_mi: Mapping[str, Any],
    detail_vri: Mapping[str, Any],
) -> dict[str, Any]:
    raw_payload = dict(detail)
    raw_payload["number"] = _normalize_value(detail_mi.get("regNumber"))
    raw_payload["mitype_num"] = _normalize_value(detail_mi.get("mitypeNumber"))
    raw_payload["mitype"] = _normalize_value(detail_mi.get("mitypeTitle"))
    raw_payload["minotation"] = _normalize_value(detail_mi.get("mitypeType"))
    raw_payload["modification"] = _normalize_value(detail_mi.get("modification"))
    raw_payload["factory_num"] = _normalize_value(detail_mi.get("manufactureNum"))
    raw_payload["year"] = _parse_int(detail_mi.get("manufactureYear"))
    raw_payload["npenumber"] = _normalize_value(detail_mi.get("npeNumber"))
    raw_payload["organization"] = _normalize_value(detail_vri.get("organization"))
    raw_payload["rankcode"] = _normalize_value(detail_mi.get("rankCode"))
    raw_payload["rankclass"] = _normalize_value(detail_mi.get("rankTitle"))
    raw_payload["schematitle"] = _normalize_value(detail_mi.get("schemaTitle"))
    raw_payload["verification_date"] = _normalize_value(detail_vri.get("vrfDate"))
    raw_payload["valid_date"] = _normalize_value(detail_vri.get("validDate"))
    raw_payload["applicability"] = _extract_applicability(detail_vri.get("applicable"))
    raw_payload["rmieta_id"] = _extract_esi_public_id(raw_payload)
    return raw_payload


def _deduplicate_esi_results(
    results: list[ArshinSearchResultRead],
) -> list[ArshinSearchResultRead]:
    deduplicated: dict[str, ArshinSearchResultRead] = {}

    for item in results:
        key = item.result_docnum or item.vri_id
        existing = deduplicated.get(key)
        if existing is None or _search_result_sort_key(item) > _search_result_sort_key(existing):
            deduplicated[key] = item

    return list(deduplicated.values())


def _select_esi_detail_candidate(
    *,
    number: str | None,
    results: list[ArshinSearchResultRead],
) -> ArshinSearchResultRead | None:
    if not results:
        return None

    normalized_number = _normalize_value(number)
    if normalized_number:
        for result in results:
            if _normalize_value(result.result_docnum) == normalized_number:
                return result

    return results[0]


def _merge_esi_detail_payloads(
    resolved_raw_payload: dict[str, Any],
    original_raw_payload: dict[str, Any] | None,
) -> dict[str, Any]:
    merged = dict(resolved_raw_payload)
    if not isinstance(original_raw_payload, Mapping):
        return merged

    for key, value in original_raw_payload.items():
        if key in {"miInfo", "vriInfo", "means", "info", "publication"}:
            continue
        merged[key] = value

    return merged


def _map_related_esi_profile_record(
    record: dict[str, Any],
    *,
    selected_number: str | None,
) -> dict[str, Any] | None:
    profile_id = _extract_esi_public_id(record)
    number = _normalize_value(record.get("number"))
    if not number:
        return None

    return {
        "rmieta_id": profile_id,
        "vri_id": _extract_esi_primary_vri_id(record),
        "number": number,
        "arshin_url": (
            f"{settings.arshin_public_etalons_base_url}{profile_id}" if profile_id else None
        ),
        "organization": _normalize_value(record.get("organization")),
        "mitype_num": _normalize_value(record.get("mitype_num")),
        "mitype": _normalize_value(record.get("mitype")),
        "minotation": _normalize_notation_value(record.get("minotation")),
        "modification": _normalize_value(record.get("modification")),
        "factory_num": _normalize_value(record.get("factory_num")),
        "year": _parse_int(record.get("year")),
        "npenumber": _normalize_value(record.get("npenumber")),
        "rankcode": _normalize_value(record.get("rankcode")),
        "rankclass": _normalize_value(record.get("rankclass")),
        "schematitle": _normalize_value(record.get("schematitle")),
        "verification_date": _format_date(record.get("verification_date")),
        "valid_date": _format_date(record.get("valid_date") or record.get("validity_date")),
        "certificate_number": None,
        "selected": number == selected_number,
    }


def _build_selected_esi_profile_row(
    *,
    detail_payload: dict[str, Any],
    certificate_number: str | None,
    selected_number: str | None,
) -> dict[str, Any] | None:
    detail_mi = _extract_primary_mi(detail_payload)
    detail_vri = _safe_get_mapping(detail_payload, ["vriInfo"])

    number = _first_nonempty(
        _normalize_value(detail_mi.get("regNumber")),
        _normalize_value(detail_payload.get("number")),
        selected_number,
    )
    if not number:
        return None

    profile_id = _extract_esi_public_id(detail_payload)
    return {
        "rmieta_id": profile_id,
        "number": number,
        "arshin_url": (
            f"{settings.arshin_public_etalons_base_url}{profile_id}" if profile_id else None
        ),
        "organization": _first_nonempty(
            _normalize_value(detail_vri.get("organization")),
            _normalize_value(detail_payload.get("organization")),
        ),
        "mitype_num": _first_nonempty(
            _normalize_value(detail_mi.get("mitypeNumber")),
            _normalize_value(detail_payload.get("mitype_num")),
        ),
        "mitype": _first_nonempty(
            _normalize_value(detail_mi.get("mitypeTitle")),
            _normalize_value(detail_payload.get("mitype")),
        ),
        "minotation": _first_nonempty(
            _normalize_value(detail_mi.get("mitypeType")),
            _normalize_notation_value(detail_payload.get("minotation")),
        ),
        "modification": _first_nonempty(
            _normalize_value(detail_mi.get("modification")),
            _normalize_value(detail_payload.get("modification")),
        ),
        "factory_num": _first_nonempty(
            _normalize_value(detail_mi.get("manufactureNum")),
            _normalize_value(detail_payload.get("factory_num")),
        ),
        "year": _parse_int(detail_mi.get("manufactureYear"))
        or _parse_int(detail_payload.get("year")),
        "npenumber": _normalize_value(detail_payload.get("npenumber")),
        "rankcode": _first_nonempty(
            _normalize_value(detail_mi.get("rankCode")),
            _normalize_value(detail_payload.get("rankcode")),
        ),
        "rankclass": _first_nonempty(
            _normalize_value(detail_mi.get("rankTitle")),
            _normalize_value(detail_payload.get("rankclass")),
        ),
        "schematitle": _first_nonempty(
            _normalize_value(detail_mi.get("schemaTitle")),
            _normalize_value(detail_payload.get("schematitle")),
        ),
        "verification_date": _first_nonempty(
            _format_date(detail_vri.get("vrfDate")),
            _format_date(detail_payload.get("verification_date")),
        ),
        "valid_date": _first_nonempty(
            _format_date(detail_vri.get("validDate")),
            _format_date(detail_payload.get("valid_date")),
        ),
        "certificate_number": certificate_number,
        "selected": True,
    }


def _upsert_related_esi_profile_row(
    rows: list[dict[str, Any]],
    selected_row: dict[str, Any],
) -> list[dict[str, Any]]:
    selected_number = _normalize_value(selected_row.get("number"))
    if not selected_number:
        return rows

    updated_rows: list[dict[str, Any]] = []
    replaced = False
    for row in rows:
        if _normalize_value(row.get("number")) != selected_number:
            updated_rows.append(row)
            continue

        merged_row = dict(row)
        for key, value in selected_row.items():
            if value not in (None, "", False):
                merged_row[key] = value
        merged_row["selected"] = True
        updated_rows.append(merged_row)
        replaced = True

    if not replaced:
        updated_rows.append(selected_row)

    return updated_rows


def _related_esi_profile_sort_key(row: dict[str, Any]) -> tuple[int, datetime, str]:
    return (
        1 if row.get("selected") else 0,
        _parse_datetime(row.get("verification_date")) or datetime.min,
        _normalize_value(row.get("number")) or "",
    )


async def _fetch_related_vri_details(
    client: ArshinClient,
    records: list[dict[str, Any]],
) -> list[tuple[dict[str, Any], dict[str, Any] | None]]:
    semaphore = asyncio.Semaphore(5)

    async def resolve(record: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any] | None]:
        vri_id = _normalize_value(record.get("vri_id") or record.get("id"))
        if not vri_id:
            return record, None

        async with semaphore:
            try:
                detail, _ = await _fetch_vri_detail_with_retry(client, vri_id=vri_id)
            except httpx.HTTPError:
                detail = None
        return record, detail

    return list(await asyncio.gather(*(resolve(record) for record in records)))


def _map_related_esi_verification_row(
    *,
    record: dict[str, Any],
    detail: dict[str, Any] | None,
    selected_vri_id: str,
    selected_certificate: str | None,
) -> dict[str, Any] | None:
    vri_id = _normalize_value(record.get("vri_id") or record.get("id"))
    if not vri_id:
        return None

    detail_mi = _extract_primary_mi(detail or {})
    detail_vri = _safe_get_mapping(detail or {}, ["vriInfo"])
    certificate_number = _first_nonempty(
        _extract_certificate_number(detail_vri),
        _normalize_value(record.get("result_docnum")),
    )

    return {
        "vri_id": vri_id,
        "arshin_url": f"{settings.arshin_public_results_base_url}{vri_id}",
        "organization": _first_nonempty(
            _normalize_value(detail_vri.get("organization")),
            _normalize_value(record.get("org_title")),
        ),
        "certificate_number": certificate_number,
        "eta_number": _normalize_value(detail_mi.get("regNumber")),
        "verification_date": _first_nonempty(
            _format_date(detail_vri.get("vrfDate")),
            _format_date(record.get("verification_date")),
        ),
        "valid_date": _first_nonempty(
            _format_date(detail_vri.get("validDate")),
            _format_date(record.get("valid_date")),
        ),
        "applicability": _extract_applicability(
            detail_vri.get("applicable") or record.get("applicability")
        ),
        "mi_modification": _first_nonempty(
            _normalize_value(detail_mi.get("modification")),
            _normalize_value(record.get("mi_modification")),
        ),
        "document_title": _first_nonempty(
            _normalize_value(detail_vri.get("docTitle")),
            _normalize_value(record.get("doc_title")),
        ),
        "selected": (
            vri_id == selected_vri_id
            or (
                selected_certificate is not None
                and certificate_number is not None
                and certificate_number == selected_certificate
            )
        ),
    }


def _map_related_esi_detail_verification_row(
    *,
    registry_number: str,
    vri_id: str,
    detail_mi: Mapping[str, Any],
    detail_vri: Mapping[str, Any],
) -> dict[str, Any]:
    return {
        "vri_id": vri_id,
        "arshin_url": f"{settings.arshin_public_results_base_url}{vri_id}",
        "organization": _normalize_value(detail_vri.get("organization")),
        "certificate_number": _extract_certificate_number(detail_vri),
        "eta_number": registry_number,
        "verification_date": _format_date(detail_vri.get("vrfDate")),
        "valid_date": _format_date(detail_vri.get("validDate")),
        "applicability": _extract_applicability(detail_vri.get("applicable")),
        "mi_modification": _normalize_value(detail_mi.get("modification")),
        "document_title": _normalize_value(detail_vri.get("docTitle")),
        "selected": False,
    }


def _related_esi_verification_sort_key(row: dict[str, Any]) -> tuple[int, datetime, str]:
    return (
        1 if row.get("selected") else 0,
        _parse_datetime(row.get("verification_date")) or datetime.min,
        _normalize_value(row.get("certificate_number")) or "",
    )


def _resolve_esi_verification_year(
    detail_payload: dict[str, Any],
    detail_vri: Mapping[str, Any],
) -> int | None:
    verification_date = _first_nonempty_datetime(
        _parse_datetime(detail_vri.get("vrfDate")),
        _parse_datetime(detail_payload.get("verification_date")),
    )
    return verification_date.year if verification_date is not None else None


def _row_matches_verification_year(
    row: Mapping[str, Any],
    *,
    verification_year: int,
) -> bool:
    if row.get("selected"):
        return True

    verification_date = _parse_datetime(row.get("verification_date"))
    if verification_date is None:
        return False
    return verification_date.year == verification_year


def _profile_row_matches_verification_year(
    row: Mapping[str, Any],
    *,
    verification_year: int,
) -> bool:
    if row.get("selected"):
        return True

    verification_date = _parse_datetime(row.get("verification_date"))
    if verification_date is None:
        return True
    return verification_date.year == verification_year


def _search_result_sort_key(item: ArshinSearchResultRead) -> tuple[datetime, datetime, str]:
    return (
        item.verification_date or datetime.min,
        item.valid_date or datetime.min,
        item.vri_id,
    )


def _map_detail_record(vri_id: str, detail: dict[str, Any]) -> ArshinVriDetailRead:
    mi_single = _extract_primary_mi(detail)
    vri_info = _safe_get_mapping(detail, ["vriInfo"])
    info = _safe_get_mapping(detail, ["info"])

    return ArshinVriDetailRead(
        vri_id=vri_id,
        arshin_url=f"{settings.arshin_public_results_base_url}{vri_id}",
        certificate_number=_extract_certificate_number(vri_info),
        organization=_first_nonempty(
            _normalize_value(vri_info.get("organization")),
            _normalize_value(vri_info.get("orgTitle")),
        ),
        reg_number=_normalize_value(mi_single.get("mitypeNumber")),
        type_designation=_normalize_value(mi_single.get("mitypeType")),
        type_name=_normalize_value(mi_single.get("mitypeTitle")),
        serial_number=_normalize_value(mi_single.get("manufactureNum")),
        manufacture_year=_parse_int(mi_single.get("manufactureYear")),
        modification=_first_nonempty(
            _normalize_value(mi_single.get("modification")),
            _normalize_value(mi_single.get("miModification")),
        ),
        owner_name=_first_nonempty(
            _normalize_value(vri_info.get("miOwner")),
            _normalize_value(vri_info.get("owner")),
            _normalize_value(vri_info.get("ownerName")),
        ),
        verification_mark_cipher=_first_nonempty(
            _normalize_value(vri_info.get("signCipher")),
            _normalize_value(vri_info.get("markCipher")),
        ),
        verification_type=_first_nonempty(
            _normalize_value(vri_info.get("verificationType")),
            _normalize_value(vri_info.get("typeTitle")),
            _normalize_value(vri_info.get("verificationTitle")),
        ),
        verification_date=_format_date(vri_info.get("vrfDate")),
        valid_until=_format_date(vri_info.get("validDate")),
        document_title=_first_nonempty(
            _normalize_value(vri_info.get("docTitle")),
            _normalize_value(info.get("docTitle")),
            _normalize_value(info.get("doc_title")),
        ),
        is_usable=_extract_applicability(vri_info.get("applicable")),
        passport_mark=_extract_bool(
            vri_info.get("signPass")
            or vri_info.get("signInPassport")
            or info.get("signPass")
            or info.get("signInPassport")
        ),
        device_mark=_extract_bool(
            vri_info.get("signMi")
            or vri_info.get("signOnMi")
            or info.get("signMi")
            or info.get("signOnMi")
        ),
        reduced_scope=_extract_bool(
            vri_info.get("shortScope")
            or vri_info.get("reducedScope")
            or info.get("shortScope")
            or info.get("reducedScope")
        ),
        etalon_lines=_extract_etalon_lines(detail),
        means_lines=_extract_verification_means_lines(detail),
        raw_payload_json=detail,
    )


def _extract_primary_mi(detail: Mapping[str, Any]) -> Mapping[str, Any]:
    mi_info = _safe_get_mapping(detail, ["miInfo"])
    for key in ("singleMI", "mi", "etaMI"):
        candidate = mi_info.get(key)
        if isinstance(candidate, Mapping):
            return candidate
    return {}


def _extract_certificate_number(vri_info: Mapping[str, Any]) -> str | None:
    applicable = vri_info.get("applicable")
    if isinstance(applicable, Mapping):
        return _first_nonempty(
            _normalize_value(applicable.get("certNum")),
            _normalize_value(applicable.get("certificateNumber")),
        )
    return _normalize_value(vri_info.get("certNum"))


def _extract_esi_primary_vri_id(record: Mapping[str, Any]) -> str | None:
    cresults = record.get("cresults")
    if isinstance(cresults, list):
        for entry in cresults:
            if not isinstance(entry, Mapping):
                continue
            vri_id = _normalize_value(entry.get("vri_id") or entry.get("id"))
            if vri_id:
                return vri_id
    return None


def _extract_esi_public_id(record: Mapping[str, Any]) -> str | None:
    explicit_id = _normalize_value(record.get("rmieta_id") or record.get("id"))
    if explicit_id:
        return explicit_id

    registry_number = _normalize_value(record.get("number") or record.get("regNumber"))
    if not registry_number:
        return None

    numeric_tail = registry_number.rsplit(".", 1)[-1]
    if not numeric_tail.isdigit():
        return None

    normalized_tail = numeric_tail.lstrip("0")
    return normalized_tail or "0"


def _extract_etalon_lines(detail: Mapping[str, Any]) -> list[str]:
    means = _safe_get_mapping(detail, ["means"])
    lines: list[str] = []

    for entry in means.get("mieta") or []:
        if not isinstance(entry, Mapping):
            continue
        line = _join_known_values(
            entry,
            [
                "regNumber",
                "mitypeNumber",
                "mitypeTitle",
                "notation",
                "modification",
                "manufactureNum",
                "manufactureYear",
                "rankCode",
                "rankTitle",
                "schemaTitle",
            ],
        )
        if line:
            lines.append(line)

    return lines


def _extract_verification_means_lines(detail: Mapping[str, Any]) -> list[str]:
    means = _safe_get_mapping(detail, ["means"])
    lines: list[str] = []

    for key, value in means.items():
        if key == "mieta" or not isinstance(value, list):
            continue
        for entry in value:
            if not isinstance(entry, Mapping):
                continue
            line = _join_known_values(
                entry,
                [
                    "mitypeNumber",
                    "mitypeTitle",
                    "notation",
                    "modification",
                    "manufactureNum",
                    "manufactureYear",
                    "number",
                    "title",
                    "name",
                ],
            )
            if not line:
                line = _join_all_scalar_values(entry)
            if line:
                lines.append(line)

    return lines


def _join_known_values(entry: Mapping[str, Any], keys: list[str]) -> str:
    parts = [
        normalized for key in keys if (normalized := _normalize_value(entry.get(key))) is not None
    ]
    return "; ".join(parts)


def _join_all_scalar_values(entry: Mapping[str, Any]) -> str:
    parts: list[str] = []
    for value in entry.values():
        if isinstance(value, Mapping | list | tuple | set):
            continue
        normalized = _normalize_value(value)
        if normalized is not None:
            parts.append(normalized)
    return "; ".join(parts)


def _safe_get_mapping(data: Mapping[str, Any], path: list[str]) -> Mapping[str, Any]:
    current: Any = data
    for key in path:
        if not isinstance(current, Mapping):
            return {}
        current = current.get(key)
    if isinstance(current, Mapping):
        return current
    return {}


def _normalize_value(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _normalize_notation_value(value: Any) -> str | None:
    normalized = _normalize_value(value)
    if not normalized:
        return None

    if normalized.startswith("[") and normalized.endswith("]"):
        try:
            parsed = json.loads(normalized)
        except json.JSONDecodeError:
            return normalized
        if isinstance(parsed, list):
            items = [item.strip() for item in parsed if isinstance(item, str) and item.strip()]
            if items:
                return ", ".join(items)

    return normalized


def _normalize_search_value(value: str) -> str:
    if "*" in value or "?" in value:
        return value
    return f"*{value}*"


def _parse_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_datetime(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value

    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value)
        except (OSError, OverflowError, ValueError):
            return None

    if not isinstance(value, str):
        return None

    candidate = value.strip()
    if not candidate:
        return None

    candidate = candidate.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(candidate)
    except ValueError:
        for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%Y-%m-%dT%H:%M:%S", "%d.%m.%Y %H:%M:%S"):
            try:
                return datetime.strptime(candidate, fmt)
            except ValueError:
                continue
    return None


def _first_nonempty_datetime(*values: datetime | None) -> datetime | None:
    for value in values:
        if value is not None:
            return value
    return None


def _format_date(value: Any) -> str | None:
    parsed = _parse_datetime(value)
    if parsed is None:
        normalized = _normalize_value(value)
        return normalized
    return parsed.strftime("%d.%m.%Y")


def _extract_applicability(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, Mapping):
        cert_num = _normalize_value(value.get("certNum") or value.get("certificateNumber"))
        if cert_num is not None:
            return True
        boolean_flag = value.get("applicable")
        if isinstance(boolean_flag, bool):
            return boolean_flag
    return _extract_bool(value)


def _extract_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if value is None:
        return None
    normalized = str(value).strip().lower()
    if normalized in {"да", "yes", "true", "1"}:
        return True
    if normalized in {"нет", "no", "false", "0"}:
        return False
    return None


def _first_nonempty(*values: str | None) -> str | None:
    for value in values:
        if value:
            return value
    return None
