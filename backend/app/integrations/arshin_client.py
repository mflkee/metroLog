from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx

from app.core.config import settings
from app.schemas.arshin import ArshinRegistryKind

DEFAULT_ARSHIN_ROWS = 100
DEFAULT_ARSHIN_MAX_RESULTS = 200


class ArshinClient:
    async def check_availability(self) -> None:
        timeout = httpx.Timeout(settings.arshin_api_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                f"{settings.arshin_api_base_url}/vri",
                params={
                    "rows": "1",
                    "start": "0",
                    "year": str(datetime.now().year),
                },
            )
            response.raise_for_status()

    async def search_records(
        self,
        *,
        params: dict[str, str],
        registry_kind: ArshinRegistryKind = ArshinRegistryKind.SI,
        max_results: int = DEFAULT_ARSHIN_MAX_RESULTS,
    ) -> list[dict[str, Any]]:
        timeout = httpx.Timeout(settings.arshin_api_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            page_size = max(1, min(DEFAULT_ARSHIN_ROWS, max_results))
            start = 0
            items: list[dict[str, Any]] = []

            while True:
                page_params = dict(params)
                page_params["rows"] = str(page_size)
                page_params["start"] = str(start)

                response = await client.get(
                    f"{settings.arshin_api_base_url}/{_get_registry_path(registry_kind)}",
                    params=page_params,
                )
                response.raise_for_status()
                payload = response.json()

                page_items = _extract_items(payload)
                if not page_items:
                    break

                items.extend(page_items)
                if len(items) >= max_results:
                    break

                total = _extract_total(payload)
                start += page_size
                if total is None or start >= total:
                    break

        return items[:max_results]

    async def search_by_certificate(
        self,
        *,
        certificate_number: str,
        year: int | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {"result_docnum": certificate_number}
        if year is not None:
            params["year"] = str(year)

        return await self.search_records(params=params)

    async def fetch_vri_detail(self, *, vri_id: str) -> dict[str, Any]:
        timeout = httpx.Timeout(settings.arshin_api_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(f"{settings.arshin_api_base_url}/vri/{vri_id}")
            response.raise_for_status()
            payload = response.json()
        if isinstance(payload, dict) and isinstance(payload.get("result"), dict):
            return payload["result"]
        return {}


def _extract_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    for key in ("result", "items", "data", "content", "results"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
        if isinstance(value, dict):
            nested = _extract_items(value)
            if nested:
                return nested

    return []


def _get_registry_path(registry_kind: ArshinRegistryKind) -> str:
    if registry_kind == ArshinRegistryKind.ESI:
        return "mieta"
    return "vri"


def _extract_total(payload: Any) -> int | None:
    if not isinstance(payload, dict):
        return None

    for key in ("result", "data", "content"):
        value = payload.get(key)
        if isinstance(value, dict):
            total = value.get("count") or value.get("total")
            if isinstance(total, int):
                return total

    total = payload.get("count") or payload.get("total")
    if isinstance(total, int):
        return total

    return None
