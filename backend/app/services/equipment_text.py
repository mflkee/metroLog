"""Small text helpers shared by the equipment service mixins."""

from __future__ import annotations

from fastapi import HTTPException, status


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > 255:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Field is too long. Maximum length is 255 characters.",
        )
    return normalized


def _build_named_detail(label: str, value: object | None) -> str | None:
    if value is None:
        return None
    rendered = str(value).strip()
    if not rendered:
        return None
    return f"{label}: {rendered}"


def _build_nonempty_description(parts: list[str | None]) -> str | None:
    filtered = [part for part in parts if part]
    return " • ".join(filtered) if filtered else None
