"""Московское время для отображения: всё показываем в МСК с пометкой (МСК)."""

from __future__ import annotations

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

MSK = ZoneInfo("Europe/Moscow")

TIME_FMT = "%d.%m.%Y %H:%M"


def msk_now() -> datetime:
    return datetime.now(MSK)


def to_msk(value: datetime) -> datetime:
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(MSK)


def fmt_msk(value: datetime | None, fmt: str = TIME_FMT) -> str:
    if value is None:
        return "—"
    return f"{to_msk(value).strftime(fmt)} (МСК)"


def msk_today() -> date:
    return msk_now().date()
