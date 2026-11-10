"""Статистика по реестру с учётом прав пользователя на папки."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.equipment import EquipmentStatus, EquipmentType
from app.models.user import User
from app.repositories.equipment_repository import EquipmentFolderRepository
from app.repositories.stats_repository import StatsRepository
from app.repositories.user_repository import UserRepository
from app.schemas.stats import (
    EquipmentStatsGroupBy,
    StatsGroupItemRead,
    StatsGroupRead,
    StatsSummaryRead,
    VerificationStatsGroupBy,
)
from app.services.user_service import get_user_allowed_folder_ids

EQUIPMENT_STATUS_LABELS: dict[str, str] = {
    EquipmentStatus.IN_WORK: "В работе",
    EquipmentStatus.IN_VERIFICATION: "В поверке",
    EquipmentStatus.IN_REPAIR: "В ремонте",
    EquipmentStatus.REPAIRED: "Отремонтировано",
    EquipmentStatus.NOT_REPAIRABLE: "Неремонтопригодно",
    EquipmentStatus.ARCHIVED: "Архив",
}

EQUIPMENT_TYPE_LABELS: dict[str, str] = {
    EquipmentType.SI: "СИ",
    EquipmentType.ESI: "ЭСИ",
    EquipmentType.IO: "ИО",
    EquipmentType.VO: "ВО",
    EquipmentType.OTHER: "Др.",
}

VERIFICATION_STATUS_LABELS: dict[str, str] = {
    "ACTIVE": "Активные",
    "CLOSED": "Завершённые",
}

NO_FOLDER_LABEL = "Без папки"


class StatsService:
    def __init__(self, session: Session, *, access_user: User | None = None) -> None:
        self.session = session
        self.access_user = access_user
        self.stats = StatsRepository(session)
        self.folders = EquipmentFolderRepository(session)
        self.users = UserRepository(session)

    def _allowed_folder_ids(self) -> set[int] | None:
        """Та же область видимости, что у списков реестра (``None`` = ограничений нет)."""

        return get_user_allowed_folder_ids(self.access_user)

    def summary(self) -> StatsSummaryRead:
        allowed_folder_ids = self._allowed_folder_ids()
        return StatsSummaryRead(
            equipment_total=self.stats.count_equipment(
                allowed_folder_ids=allowed_folder_ids,
            ),
            folders_total=self.stats.count_folders(allowed_folder_ids=allowed_folder_ids),
            groups_total=self.stats.count_groups(allowed_folder_ids=allowed_folder_ids),
            active_verifications_total=self.stats.count_active_verifications(
                allowed_folder_ids=allowed_folder_ids,
            ),
            active_repairs_total=self.stats.count_active_repairs(
                allowed_folder_ids=allowed_folder_ids,
            ),
            users_total=self._count_visible_users(allowed_folder_ids),
        )

    def _count_visible_users(self, allowed_folder_ids: set[int] | None) -> int:
        active_users = [user for user in self.users.list_all() if user.is_active]
        if allowed_folder_ids is None:
            return len(active_users)

        visible = 0
        for user in active_users:
            user_folder_ids = get_user_allowed_folder_ids(user)
            # Пользователи без ограничения (администраторы, разработчики) видны всем: они
            # курируют все папки — та же логика, что у списка упоминаний.
            if user_folder_ids is None or user_folder_ids & allowed_folder_ids:
                visible += 1
        return visible

    def equipment_stats(self, *, group_by: EquipmentStatsGroupBy) -> StatsGroupRead:
        allowed_folder_ids = self._allowed_folder_ids()
        rows = self.stats.equipment_group_counts(
            group_by=group_by,
            allowed_folder_ids=allowed_folder_ids,
        )
        folder_names = self._folder_names() if group_by == "folder_id" else {}
        items = [
            StatsGroupItemRead(
                key=_normalize_key(key),
                label=_equipment_label(
                    group_by=group_by,
                    key=key,
                    folder_names=folder_names,
                ),
                count=count,
            )
            for key, count in rows
        ]
        return StatsGroupRead(
            group_by=group_by,
            total=sum(item.count for item in items),
            items=items,
        )

    def verification_stats(
        self,
        *,
        group_by: VerificationStatsGroupBy = "status",
    ) -> StatsGroupRead:
        rows = self.stats.verification_group_counts(
            allowed_folder_ids=self._allowed_folder_ids(),
        )
        items = [
            StatsGroupItemRead(
                key=key,
                label=VERIFICATION_STATUS_LABELS.get(key),
                count=count,
            )
            for key, count in rows
        ]
        return StatsGroupRead(
            group_by=group_by,
            total=sum(item.count for item in items),
            items=items,
        )

    def _folder_names(self) -> dict[int, str]:
        return {folder.id: folder.name for folder in self.folders.list_all()}


def _normalize_key(key: object) -> str | int | None:
    if key is None or isinstance(key, int):
        return key
    return str(key)


def _equipment_label(
    *,
    group_by: EquipmentStatsGroupBy,
    key: object,
    folder_names: dict[int, str],
) -> str | None:
    if group_by == "status":
        return EQUIPMENT_STATUS_LABELS.get(str(key))
    if group_by == "equipment_type":
        return EQUIPMENT_TYPE_LABELS.get(str(key))
    if key is None:
        return NO_FOLDER_LABEL
    if isinstance(key, int):
        return folder_names.get(key)
    return None
