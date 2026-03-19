from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import datetime
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.integrations.arshin_client import ArshinClient
from app.schemas.arshin import ArshinSearchResultRead, ArshinVriDetailRead


class ArshinService:
    def __init__(self, client: ArshinClient | None = None) -> None:
        self.client = client or ArshinClient()

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

        candidate_years = _build_year_candidates(
            explicit_year=year,
            certificate_number=normalized_certificate,
        )

        try:
            all_records: list[dict[str, Any]] = []
            for candidate_year in candidate_years:
                all_records.extend(
                    await self.client.search_by_certificate(
                        certificate_number=normalized_certificate,
                        year=candidate_year,
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
            mapped = self._map_search_record(record)
            if mapped is not None:
                mapped_records.append(mapped)
        return mapped_records

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

    def _map_search_record(self, record: dict[str, Any]) -> ArshinSearchResultRead | None:
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
            verification_date=_parse_datetime(
                record.get("verification_date") or record.get("verif_date")
            ),
            valid_date=_parse_datetime(record.get("valid_date") or record.get("validity_date")),
            raw_payload_json=record,
        )


def _build_year_candidates(
    *,
    explicit_year: int | None,
    certificate_number: str,
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

    guessed_year = _guess_year_from_certificate(certificate_number)
    if guessed_year is not None:
        push(guessed_year)

    push(None)
    return candidates


def _guess_year_from_certificate(certificate_number: str) -> int | None:
    match = re.search(r"/(\d{2})-(\d{2})-(\d{4})/", certificate_number)
    if not match:
        return None
    return int(match.group(3))


def _deduplicate_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduplicated: list[dict[str, Any]] = []
    seen_vri_ids: set[str] = set()

    for record in records:
        vri_id = _normalize_value(record.get("vri_id") or record.get("id"))
        if not vri_id or vri_id in seen_vri_ids:
            continue
        seen_vri_ids.add(vri_id)
        deduplicated.append(record)

    return deduplicated


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
            _normalize_value(vri_info.get("stickerNum")),
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
        normalized
        for key in keys
        if (normalized := _normalize_value(entry.get(key))) is not None
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
