"""Агрегаты для эндпоинтов статистики.

Все запросы принимают ``allowed_folder_ids`` — ту же область видимости, что используют списки
реестра (``None`` = ограничений нет). Поэтому агрегаты никогда не считают скрытые папки.
"""

from __future__ import annotations

from sqlalchemy import ColumnElement, Select, case, false, func, select
from sqlalchemy.orm import Session

from app.models.equipment import (
    Equipment,
    EquipmentFolder,
    EquipmentGroup,
    Repair,
    Verification,
)


def _folder_scope(
    column: ColumnElement[int],
    allowed_folder_ids: set[int] | None,
) -> ColumnElement[bool] | None:
    if allowed_folder_ids is None:
        return None
    if not allowed_folder_ids:
        # Область видимости пуста: пользователь не должен увидеть ничего.
        return false()
    return column.in_(sorted(allowed_folder_ids))


class StatsRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    # --- сводка -----------------------------------------------------------------------------

    def _count(self, statement: Select) -> int:
        return int(self.session.scalar(statement) or 0)

    def count_equipment(self, *, allowed_folder_ids: set[int] | None = None) -> int:
        statement = select(func.count()).select_from(Equipment)
        condition = _folder_scope(Equipment.folder_id, allowed_folder_ids)
        if condition is not None:
            statement = statement.where(condition)
        return self._count(statement)

    def count_folders(self, *, allowed_folder_ids: set[int] | None = None) -> int:
        statement = select(func.count()).select_from(EquipmentFolder)
        condition = _folder_scope(EquipmentFolder.id, allowed_folder_ids)
        if condition is not None:
            statement = statement.where(condition)
        return self._count(statement)

    def count_groups(self, *, allowed_folder_ids: set[int] | None = None) -> int:
        statement = select(func.count()).select_from(EquipmentGroup)
        condition = _folder_scope(EquipmentGroup.folder_id, allowed_folder_ids)
        if condition is not None:
            statement = statement.where(condition)
        return self._count(statement)

    def _count_processes(
        self,
        model: type[Verification] | type[Repair],
        *,
        allowed_folder_ids: set[int] | None,
    ) -> int:
        statement = (
            select(func.count(func.distinct(model.id)))
            .select_from(model)
            .join(Equipment, Equipment.id == model.equipment_id)
            .where(model.closed_at.is_(None))
        )
        condition = _folder_scope(Equipment.folder_id, allowed_folder_ids)
        if condition is not None:
            statement = statement.where(condition)
        return self._count(statement)

    def count_active_verifications(self, *, allowed_folder_ids: set[int] | None = None) -> int:
        return self._count_processes(Verification, allowed_folder_ids=allowed_folder_ids)

    def count_active_repairs(self, *, allowed_folder_ids: set[int] | None = None) -> int:
        return self._count_processes(Repair, allowed_folder_ids=allowed_folder_ids)

    # --- группировки ------------------------------------------------------------------------

    def equipment_group_counts(
        self,
        *,
        group_by: str,
        allowed_folder_ids: set[int] | None = None,
    ) -> list[tuple[object, int]]:
        columns = {
            "status": Equipment.status,
            "equipment_type": Equipment.equipment_type,
            "folder_id": Equipment.folder_id,
        }
        column = columns[group_by]
        count_expression = func.count(Equipment.id)
        statement = (
            select(column, count_expression)
            .select_from(Equipment)
            .group_by(column)
            .order_by(count_expression.desc(), column.asc())
        )
        condition = _folder_scope(Equipment.folder_id, allowed_folder_ids)
        if condition is not None:
            statement = statement.where(condition)
        return [(row[0], int(row[1])) for row in self.session.execute(statement).all()]

    def verification_group_counts(
        self,
        *,
        allowed_folder_ids: set[int] | None = None,
    ) -> list[tuple[str, int]]:
        """Поверки по жизненному циклу: ``ACTIVE`` (не закрыта) и ``CLOSED``."""

        lifecycle = case((Verification.closed_at.is_(None), "ACTIVE"), else_="CLOSED")
        count_expression = func.count(Verification.id)
        statement = (
            select(lifecycle.label("lifecycle_status"), count_expression)
            .select_from(Verification)
            .join(Equipment, Equipment.id == Verification.equipment_id)
            .group_by(lifecycle)
            .order_by(count_expression.desc(), lifecycle.asc())
        )
        condition = _folder_scope(Equipment.folder_id, allowed_folder_ids)
        if condition is not None:
            statement = statement.where(condition)
        return [(str(row[0]), int(row[1])) for row in self.session.execute(statement).all()]
