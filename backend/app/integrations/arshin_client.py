from __future__ import annotations

import asyncio
import random
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any

import httpx

from app.core.config import settings
from app.schemas.arshin import ArshinRegistryKind

DEFAULT_ARSHIN_ROWS = 100
DEFAULT_ARSHIN_MAX_RESULTS = 200

# Arshin throttles aggressive clients (HTTP 429) and occasionally returns
# transient 5xx responses, so those (plus transport errors) are retried with an
# exponential backoff. This keeps long-running folder refresh tasks going
# instead of marking individual instruments as errored.
RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})


def _parse_retry_after(value: str | None) -> float | None:
    if not value:
        return None
    candidate = value.strip()
    if not candidate:
        return None

    try:
        return max(0.0, float(candidate))
    except ValueError:
        pass

    try:
        parsed = parsedate_to_datetime(candidate)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return max(0.0, (parsed - datetime.now(tz=UTC)).total_seconds())


def _retry_delay_seconds(attempt: int, response: httpx.Response | None = None) -> float:
    base = max(0.0, settings.arshin_api_retry_base_seconds)
    max_delay = max(base, settings.arshin_api_retry_max_seconds)

    if response is not None:
        retry_after = _parse_retry_after(response.headers.get("retry-after"))
        if retry_after is not None:
            return min(retry_after, max_delay)

    delay = min(base * (2**attempt), max_delay)
    if delay <= 0:
        return 0.0
    return delay + random.uniform(0, delay * 0.25)


class ArshinClient:
    async def check_availability(self) -> None:
        await self._get_json(
            "/vri",
            params={
                "rows": "1",
                "start": "0",
                "year": str(datetime.now().year),
            },
        )

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

                payload = await self._get_json(
                    f"/{_get_registry_path(registry_kind)}",
                    params=page_params,
                    client=client,
                )

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
        payload = await self._get_json(f"/vri/{vri_id}")
        if isinstance(payload, dict) and isinstance(payload.get("result"), dict):
            return payload["result"]
        return {}

    async def _get_json(
        self,
        path: str,
        params: dict[str, str] | None = None,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> Any:
        url = f"{settings.arshin_api_base_url}{path}"
        owns_client = client is None
        if client is None:
            client = httpx.AsyncClient(timeout=httpx.Timeout(settings.arshin_api_timeout_seconds))

        max_attempts = max(1, settings.arshin_api_max_retries)
        try:
            for attempt in range(max_attempts):
                try:
                    response = await client.get(url, params=params)
                except httpx.TransportError:
                    if attempt == max_attempts - 1:
                        raise
                    await asyncio.sleep(_retry_delay_seconds(attempt))
                    continue

                if response.status_code in RETRYABLE_STATUS_CODES and attempt < max_attempts - 1:
                    await asyncio.sleep(_retry_delay_seconds(attempt, response))
                    continue

                response.raise_for_status()
                return response.json()
        finally:
            if owns_client:
                await client.aclose()

        raise httpx.HTTPError("Arshin request failed after retries")


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
