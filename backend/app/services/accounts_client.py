"""Thin client for the unified account registry (metroAccounts).

When ``ACCOUNTS_ENABLED`` is on, metroLog stops verifying passwords itself and asks
the registry instead; the registry is the single source of truth for credentials,
service access flags and roles.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings


@dataclass(frozen=True)
class Grant:
    """One service's grant in the registry, as the registry stamps it."""

    role: str | None
    is_active: bool | None
    role_updated_at: str | None


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


def _request(method: str, path: str, *, json: dict[str, Any] | None = None) -> Any:
    """One call to the registry; returns whatever JSON came back (object or list)."""

    url = f"{settings.accounts_url.rstrip('/')}/api/v1{path}"
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


def list_accounts() -> list[dict[str, Any]]:
    """Every account with its grants — the list the local role copy mirrors from.

    Read at user-list time so a role changed in the console (here or in another service)
    shows up without waiting for that person to sign in.
    """

    payload = _request("GET", "/internal/accounts")
    return list(payload) if isinstance(payload, list) else []


def set_service(
    *,
    email: str,
    role: str | None,
    is_active: bool | None = None,
    if_unmodified_since: datetime | None = None,
) -> Grant:
    """Write the role into the registry and return the grant it put in force.

    The registry owns the role, so a change made here is written there first and the local copy
    follows this answer. `if_unmodified_since` is the stamp the local copy was built from: when
    the registry has moved on since, it answers 409 and the caller must leave the local row (and
    its stamp) alone — that is the whole point of sending it rather than writing blind.

    `is_active=None` says nothing about the flag: a write that only moves the role must not turn
    access back on.

    A 409 (someone changed the role while this page was open) and a 503 (registry down) both come
    back as HTTPException.
    """

    payload = _request(
        "PATCH",
        f"/internal/accounts/{email}/services/{settings.accounts_service_name}",
        json={
            "is_active": is_active,
            "role": role,
            "if_unmodified_since": _stamp_for_wire(if_unmodified_since),
        },
    )
    for entry in payload.get("services") or []:
        if entry.get("service") == settings.accounts_service_name:
            return Grant(
                role=entry.get("role"),
                is_active=entry.get("is_active"),
                role_updated_at=entry.get("role_updated_at"),
            )
    return Grant(role=role, is_active=is_active, role_updated_at=None)


def _stamp_for_wire(value: datetime | None) -> str | None:
    """Always send an explicit offset.

    A stamp that comes back from the database without a timezone is UTC — that is how this app
    stores and reads every other timestamp — and saying so on the wire keeps the registry's
    comparison honest whatever the backend handed us.
    """

    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.isoformat()


def change_password(*, email: str, current_password: str, new_password: str) -> None:
    _request(
        "POST",
        f"/internal/accounts/{email}/password",
        json={"current_password": current_password, "new_password": new_password},
    )
