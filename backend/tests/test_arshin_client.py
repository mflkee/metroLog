from __future__ import annotations

from typing import Any

import httpx
import pytest

from app.core.config import settings
from app.integrations import arshin_client as arshin_client_module
from app.integrations.arshin_client import ArshinClient

URL = "https://fgis.gost.ru/fundmetrology/eapi/vri"


class _FakeResponse:
    def __init__(
        self,
        status_code: int,
        payload: Any = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.status_code = status_code
        self._payload = payload if payload is not None else {}
        self.headers = headers or {}

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            request = httpx.Request("GET", URL)
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError("error", request=request, response=response)

    def json(self) -> Any:
        return self._payload


def _disable_delay(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        arshin_client_module,
        "_retry_delay_seconds",
        lambda attempt, response=None: 0.0,
    )


@pytest.mark.anyio
async def test_search_records_retries_on_429(monkeypatch: pytest.MonkeyPatch) -> None:
    responses = [
        _FakeResponse(429, headers={"retry-after": "1"}),
        _FakeResponse(
            200,
            {"result": {"count": 1, "items": [{"vri_id": "1-1", "result_docnum": "CERT"}]}},
        ),
    ]
    calls = {"count": 0}

    async def fake_get(self, url, params=None):
        index = min(calls["count"], len(responses) - 1)
        calls["count"] += 1
        return responses[index]

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    _disable_delay(monkeypatch)

    items = await ArshinClient().search_records(params={"result_docnum": "CERT"})

    assert calls["count"] == 2
    assert [item["vri_id"] for item in items] == ["1-1"]


@pytest.mark.anyio
async def test_search_records_retries_on_408(monkeypatch: pytest.MonkeyPatch) -> None:
    responses = [
        _FakeResponse(408),
        _FakeResponse(
            200,
            {"result": {"count": 1, "items": [{"vri_id": "1-1", "result_docnum": "CERT"}]}},
        ),
    ]
    calls = {"count": 0}

    async def fake_get(self, url, params=None):
        index = min(calls["count"], len(responses) - 1)
        calls["count"] += 1
        return responses[index]

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    _disable_delay(monkeypatch)

    items = await ArshinClient().search_records(params={"result_docnum": "CERT"})

    assert calls["count"] == 2
    assert [item["vri_id"] for item in items] == ["1-1"]


@pytest.mark.anyio
async def test_search_records_raises_after_exhausting_retries(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "arshin_api_max_retries", 3)
    calls = {"count": 0}

    async def fake_get(self, url, params=None):
        calls["count"] += 1
        return _FakeResponse(429)

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    _disable_delay(monkeypatch)

    with pytest.raises(httpx.HTTPStatusError):
        await ArshinClient().search_records(params={"result_docnum": "CERT"})

    assert calls["count"] == 3


@pytest.mark.anyio
async def test_fetch_vri_detail_retries_on_transport_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    responses: list[Any] = [
        httpx.ConnectError("boom"),
        _FakeResponse(200, {"result": {"vri_id": "1-1"}}),
    ]
    calls = {"count": 0}

    async def fake_get(self, url, params=None):
        index = min(calls["count"], len(responses) - 1)
        calls["count"] += 1
        result = responses[index]
        if isinstance(result, Exception):
            raise result
        return result

    monkeypatch.setattr(httpx.AsyncClient, "get", fake_get)
    _disable_delay(monkeypatch)

    detail = await ArshinClient().fetch_vri_detail(vri_id="1-1")

    assert calls["count"] == 2
    assert detail == {"vri_id": "1-1"}


def test_retry_delay_honours_retry_after_header() -> None:
    request = httpx.Request("GET", URL)
    response = httpx.Response(429, headers={"retry-after": "7"}, request=request)

    delay = arshin_client_module._retry_delay_seconds(0, response)

    assert delay == 7.0
