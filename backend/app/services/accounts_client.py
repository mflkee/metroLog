"""Thin client for the unified account registry (metroAccounts).

When ``ACCOUNTS_ENABLED`` is on, metroLog stops verifying passwords itself and asks
the registry instead; the registry is the single source of truth for credentials,
service access flags and roles.
"""

from __future__ import annotations

from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings


class AccountsUnavailable(HTTPException):
    def __init__(self, message: str = "Сервис учётных записей недоступен.") -> None:
        super().__init__(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=message)


def is_enabled() -> bool:
    return bool(
        settings.accounts_enabled and settings.accounts_url and settings.accounts_service_token
    )


def _headers() -> dict[str, str]:
    return {
        "X-Service-Name": settings.accounts_service_name,
        "X-Service-Token": settings.accounts_service_token or "",
    }


def _request(method: str, path: str, *, json: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{settings.accounts_url.rstrip('/')}{path}"
    try:
        response = httpx.request(
            method,
            url,
            json=json,
            headers=_headers(),
            timeout=settings.accounts_timeout_seconds,
        )
    except httpx.HTTPError as exc:
        raise AccountsUnavailable() from exc

    if response.status_code >= 500:
        raise AccountsUnavailable()
    if response.status_code >= 400:
        detail = "Ошибка сервиса учётных записей."
        try:
            payload = response.json()
            if isinstance(payload.get("detail"), str):
                detail = payload["detail"]
        except ValueError:
            pass
        raise HTTPException(status_code=response.status_code, detail=detail)
    try:
        return response.json()
    except ValueError as exc:
        raise AccountsUnavailable() from exc


def verify(*, email: str, password: str) -> dict[str, Any]:
    """Return the registry account + role, or raise 401/403 like a local login would."""

    payload = _request(
        "POST",
        "/internal/verify",
        json={"email": email, "password": password, "service": settings.accounts_service_name},
    )
    account = payload.get("account") or {}
    return {
        "email": account.get("email", email),
        "first_name": account.get("first_name", ""),
        "last_name": account.get("last_name", ""),
        "patronymic": account.get("patronymic"),
        "is_active": account.get("is_active", True),
        "role": payload.get("role"),
    }


def create_account(
    *,
    email: str,
    first_name: str,
    last_name: str,
    patronymic: str | None,
    role: str | None,
) -> None:
    _request(
        "POST",
        "/internal/accounts",
        json={
            "email": email,
            "first_name": first_name,
            "last_name": last_name,
            "patronymic": patronymic,
            "service": settings.accounts_service_name,
            "role": role,
            "send_invite": True,
        },
    )


def send_invite(*, email: str) -> None:
    _request("POST", f"/internal/accounts/{email}/invite")


def change_password(*, email: str, current_password: str, new_password: str) -> None:
    _request(
        "POST",
        f"/internal/accounts/{email}/password",
        json={"current_password": current_password, "new_password": new_password},
    )
