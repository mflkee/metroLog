from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings


class ArshinClient:
    async def search_by_certificate(
        self,
        *,
        certificate_number: str,
        year: int | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, str] = {"result_docnum": certificate_number}
        if year is not None:
            params["year"] = str(year)

        timeout = httpx.Timeout(settings.arshin_api_timeout_seconds)
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(
                f"{settings.arshin_api_base_url}/vri",
                params=params,
            )
            response.raise_for_status()
            payload = response.json()
        return _extract_items(payload)

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
