"""Схемы эндпоинтов статистики."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

EquipmentStatsGroupBy = Literal["status", "equipment_type", "folder_id"]
VerificationStatsGroupBy = Literal["status"]


class StatsSummaryRead(BaseModel):
    """Сводка по реестру в пределах доступных пользователю папок."""

    equipment_total: int = Field(description="Количество приборов в доступных папках.")
    folders_total: int = Field(description="Количество доступных пользователю папок.")
    groups_total: int = Field(description="Количество групп в доступных папках.")
    active_verifications_total: int = Field(
        description="Количество незакрытых поверок (closed_at IS NULL).",
    )
    active_repairs_total: int = Field(
        description="Количество незакрытых ремонтов (closed_at IS NULL).",
    )
    users_total: int = Field(
        description=(
            "Количество активных пользователей в зоне видимости: без ограничения по папкам — "
            "все, с ограничением — только те, кто видит хотя бы одну из доступных папок."
        ),
    )


class StatsGroupItemRead(BaseModel):
    """Одна строка группировки."""

    key: str | int | None = Field(
        description=(
            "Значение группировки: код статуса/типа (строка) или id папки (число); "
            "null — записи без папки."
        ),
        examples=["IN_REPAIR"],
    )
    label: str | None = Field(
        default=None,
        description="Человекочитаемая подпись значения (человеческое название статуса/папки).",
        examples=["В ремонте"],
    )
    count: int = Field(description="Количество записей в этой группе.")


class StatsGroupRead(BaseModel):
    """Ответ группировки: строки по убыванию количества и общий итог."""

    group_by: str = Field(description="Поле группировки, по которому построен ответ.")
    total: int = Field(description="Сумма count по всем строкам.")
    items: list[StatsGroupItemRead] = Field(
        description="Строки группировки, отсортированные по count по убыванию.",
    )
