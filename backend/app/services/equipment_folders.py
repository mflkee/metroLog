"""Equipment-folders mixin for the equipment service."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import HTTPException, status

from app.models.equipment import EquipmentFolder, EquipmentGroup, FolderProcessSubscription
from app.models.event import EventCategory
from app.models.user import User, UserRole
from app.schemas.equipment import (
    EquipmentFolderCreateRequest,
    EquipmentFolderSuggestionsRead,
    EquipmentFolderUpdateRequest,
    FolderProcessSubscriptionRead,
    FolderProcessSubscriptionUpdateRequest,
    FolderProcessSubscriptionUserRead,
)
from app.services.equipment_process_templates import (
    _build_deadline_preset_snapshot,
    _normalize_required_text,
)
from app.services.equipment_text import (
    _build_named_detail,
    _build_nonempty_description,
    _normalize_optional_text,
)
from app.services.user_service import get_user_allowed_folder_ids

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.equipment import DeadlinePreset, Equipment, EquipmentFolder
    from app.repositories.equipment_repository import (
        EquipmentFolderRepository,
        EquipmentGroupRepository,
        EquipmentProcessSubscriptionRepository,
        EquipmentRepository,
        FolderProcessSubscriptionRepository,
        RepairRepository,
        VerificationRepository,
    )
    from app.repositories.user_repository import UserRepository
    from app.services.equipment_process_templates import RepairDeadlineSettings


def _format_user_display_name(user: User) -> str:
    parts = [user.last_name.strip(), user.first_name.strip()]
    if user.patronymic and user.patronymic.strip():
        parts.append(user.patronymic.strip())
    return " ".join(part for part in parts if part)


def _is_folder_visible_to_user(*, user: User, folder_id: int) -> bool:
    allowed_folder_ids = get_user_allowed_folder_ids(user)
    if allowed_folder_ids is None:
        return True
    return folder_id in allowed_folder_ids


class EquipmentFoldersMixin:
    """Mixed into ``EquipmentService``."""

    if TYPE_CHECKING:
        # Provided by EquipmentService through the MRO.
        session: Session
        folders: EquipmentFolderRepository
        groups: EquipmentGroupRepository
        equipment: EquipmentRepository
        process_subscriptions: EquipmentProcessSubscriptionRepository
        folder_process_subscriptions: FolderProcessSubscriptionRepository
        repairs: RepairRepository
        verifications: VerificationRepository
        users: UserRepository
        access_user: User | None
        _deadline_settings_by_folder_id: dict[int | None, RepairDeadlineSettings]

        def _record_event(
            self,
            *,
            category: EventCategory,
            action: str,
            user: User | None,
            title: str,
            description: str | None = None,
            equipment: Equipment | None = None,
            equipment_id: int | None = None,
            equipment_name: str | None = None,
            equipment_modification: str | None = None,
            equipment_serial_number: str | None = None,
            folder_id: int | None = None,
            folder_name: str | None = None,
            notification_equipment_ids: list[int] | None = None,
            batch_key: str | None = None,
        ) -> None: ...

        def _ensure_default_deadline_preset(self) -> DeadlinePreset: ...

        def _resolve_deadline_preset_for_folder(
            self,
            *,
            preset_id: int | None,
            current_folder: EquipmentFolder | None,
        ) -> DeadlinePreset: ...

    def list_folders(self) -> list[EquipmentFolder]:
        self._ensure_default_deadline_preset()
        folders = self.folders.list_all()
        allowed_folder_ids = self._get_accessible_folder_ids()
        if allowed_folder_ids is None:
            return folders
        return [folder for folder in folders if folder.id in allowed_folder_ids]

    def create_folder(
        self,
        payload: EquipmentFolderCreateRequest,
        *,
        current_user: User,
    ) -> EquipmentFolder:
        self._ensure_default_deadline_preset()
        name = _normalize_required_text(payload.name, field_label="Folder name")
        description = _normalize_optional_text(payload.description)
        if self.folders.get_by_name(name) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A folder with this name already exists.",
            )
        deadline_preset = self._resolve_deadline_preset_for_folder(
            preset_id=payload.deadline_preset_id,
            current_folder=None,
        )

        folder = EquipmentFolder(
            name=name,
            description=description,
            sort_order=payload.sort_order,
            deadline_preset_id=deadline_preset.id,
            deadline_preset_name=deadline_preset.name,
            deadline_preset_snapshot_json=_build_deadline_preset_snapshot(deadline_preset),
        )
        self.folders.add(folder)
        self._grant_created_folder_access_to_mkair(current_user=current_user, folder_id=folder.id)
        self._record_event(
            category=EventCategory.EQUIPMENT,
            action="folder_created",
            user=current_user,
            title=f"Создана папка «{folder.name}»",
            description=_build_nonempty_description(
                [
                    _build_named_detail("Описание", folder.description),
                    _build_named_detail("Пресет дедлайнов", folder.deadline_preset_name),
                ]
            ),
            folder_id=folder.id,
            folder_name=folder.name,
        )
        self.session.commit()
        self.session.refresh(folder)
        return folder

    def update_folder(
        self,
        *,
        folder_id: int,
        payload: EquipmentFolderUpdateRequest,
        current_user: User,
    ) -> EquipmentFolder:
        folder = self._get_folder(folder_id)
        changed_fields: list[str] = []

        if "name" in payload.model_fields_set:
            name = _normalize_required_text(payload.name, field_label="Folder name")
            existing = self.folders.get_by_name(name)
            if existing is not None and existing.id != folder.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A folder with this name already exists.",
                )
            folder.name = name
            changed_fields.append("название")

        if "description" in payload.model_fields_set:
            folder.description = _normalize_optional_text(payload.description)
            changed_fields.append("описание")

        if "sort_order" in payload.model_fields_set:
            folder.sort_order = payload.sort_order
            changed_fields.append("порядок")

        if "deadline_preset_id" in payload.model_fields_set:
            deadline_preset = self._resolve_deadline_preset_for_folder(
                preset_id=payload.deadline_preset_id,
                current_folder=folder,
            )
            next_snapshot = _build_deadline_preset_snapshot(deadline_preset)
            if (
                folder.deadline_preset_id != deadline_preset.id
                or folder.deadline_preset_name != deadline_preset.name
                or folder.deadline_preset_snapshot_json != next_snapshot
            ):
                folder.deadline_preset_id = deadline_preset.id
                folder.deadline_preset_name = deadline_preset.name
                folder.deadline_preset_snapshot_json = next_snapshot
                self._deadline_settings_by_folder_id.pop(folder.id, None)
                changed_fields.append("пресет дедлайнов")

        if changed_fields:
            self._record_event(
                category=EventCategory.EQUIPMENT,
                action="folder_updated",
                user=current_user,
                title=f"Обновлена папка «{folder.name}»",
                description="Изменено: " + ", ".join(changed_fields) + ".",
                folder_id=folder.id,
                folder_name=folder.name,
            )

        self.session.commit()
        self.session.refresh(folder)
        return folder

    def delete_folder(self, *, folder_id: int, current_user: User) -> None:
        folder = self._get_folder(folder_id)
        self._record_event(
            category=EventCategory.EQUIPMENT,
            action="folder_deleted",
            user=current_user,
            title=f"Удалена папка «{folder.name}»",
            folder_id=folder.id,
            folder_name=folder.name,
        )
        self.process_subscriptions.delete_by_folder_id(folder_id=folder.id)
        self.folder_process_subscriptions.delete_by_folder_id(folder_id=folder.id)
        self.equipment.delete_by_folder_id(folder_id=folder.id)
        self.folders.delete(folder)
        self.session.commit()

    def list_groups(self, *, folder_id: int | None = None) -> list[EquipmentGroup]:
        if folder_id is not None:
            self._get_folder(folder_id)
        groups = self.groups.list_by_folder(folder_id=folder_id)
        allowed_folder_ids = self._get_accessible_folder_ids()
        if allowed_folder_ids is None:
            return groups
        return [group for group in groups if group.folder_id in allowed_folder_ids]

    def get_folder_suggestions(self, *, folder_id: int) -> EquipmentFolderSuggestionsRead:
        self._get_folder(folder_id)
        process_batch_names = sorted(
            {
                *self.repairs.list_distinct_batch_names(folder_id=folder_id),
                *self.verifications.list_distinct_batch_names(folder_id=folder_id),
            }
        )
        return EquipmentFolderSuggestionsRead(
            object_names=self.equipment.list_distinct_object_names(folder_id=folder_id),
            current_locations=self.equipment.list_distinct_locations(folder_id=folder_id),
            measurement_units=self.equipment.list_distinct_measurement_units(folder_id=folder_id),
            repair_route_cities=self.repairs.list_distinct_route_cities(folder_id=folder_id),
            repair_route_destinations=self.repairs.list_distinct_route_destinations(
                folder_id=folder_id
            ),
            process_batch_names=process_batch_names,
        )

    def get_folder_process_subscriptions(
        self,
        *,
        folder_id: int,
    ) -> FolderProcessSubscriptionRead:
        folder = self._get_folder(folder_id)
        subscribed_user_ids = (
            self.folder_process_subscriptions.list_subscribed_user_ids_by_folder_id(
                folder_id=folder.id
            )
        )
        users = [
            user
            for user in self.users.list_active()
            if _is_folder_visible_to_user(user=user, folder_id=folder.id)
        ]
        return FolderProcessSubscriptionRead(
            folder_id=folder.id,
            users=[
                FolderProcessSubscriptionUserRead(
                    user_id=user.id,
                    display_name=_format_user_display_name(user),
                    email=user.email,
                    role=user.role,
                    organization=user.organization,
                    position=user.position,
                    facility=user.facility,
                    enabled=user.id in subscribed_user_ids,
                )
                for user in users
            ],
        )

    def update_folder_process_subscriptions(
        self,
        *,
        folder_id: int,
        payload: FolderProcessSubscriptionUpdateRequest,
        current_user: User,
    ) -> FolderProcessSubscriptionRead:
        folder = self._get_folder(folder_id)
        target_user_ids = {int(user_id) for user_id in payload.user_ids}
        visible_users = [
            user
            for user in self.users.list_active()
            if _is_folder_visible_to_user(user=user, folder_id=folder.id)
        ]
        users_by_id = {user.id: user for user in visible_users}
        unknown_user_ids = sorted(target_user_ids.difference(users_by_id))
        if unknown_user_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Some selected users do not have access to this folder.",
            )

        existing_subscriptions = self.folder_process_subscriptions.list_by_folder_id(
            folder_id=folder.id
        )
        existing_by_user_id = {
            subscription.user_id: subscription for subscription in existing_subscriptions
        }

        for user_id in target_user_ids.difference(existing_by_user_id):
            self.folder_process_subscriptions.add(
                FolderProcessSubscription(
                    folder_id=folder.id,
                    user_id=user_id,
                )
            )

        for user_id, subscription in existing_by_user_id.items():
            if user_id not in target_user_ids:
                self.folder_process_subscriptions.delete(subscription)

        recipient_names = [
            users_by_id[user_id].email
            for user_id in sorted(target_user_ids)
            if user_id in users_by_id
        ]
        self._record_event(
            category=EventCategory.EQUIPMENT,
            action="folder_process_subscriptions_updated",
            user=current_user,
            title=f"Обновлена email-рассылка по папке «{folder.name}»",
            description=(
                "Получатели: " + ", ".join(recipient_names) + "."
                if recipient_names
                else "Рассылка по папке отключена."
            ),
            folder_id=folder.id,
            folder_name=folder.name,
        )
        self.session.commit()
        return self.get_folder_process_subscriptions(folder_id=folder.id)

    def _get_folder(self, folder_id: int) -> EquipmentFolder:
        folder = self.folders.get_by_id(folder_id)
        if folder is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Folder not found.",
            )
        self._assert_folder_access(folder.id, detail="Folder not found.")
        return folder

    def _get_group(self, group_id: int) -> EquipmentGroup:
        group = self.groups.get_by_id(group_id)
        if group is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Group not found.",
            )
        self._assert_folder_access(group.folder_id, detail="Group not found.")
        return group

    def _get_accessible_folder_ids(self) -> set[int] | None:
        return get_user_allowed_folder_ids(self.access_user)

    def _assert_folder_access(self, folder_id: int | None, *, detail: str) -> None:
        allowed_folder_ids = self._get_accessible_folder_ids()
        if allowed_folder_ids is None:
            return
        if folder_id is None or folder_id not in allowed_folder_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=detail,
            )

    def _grant_created_folder_access_to_mkair(
        self,
        *,
        current_user: User,
        folder_id: int,
    ) -> None:
        if current_user.role != UserRole.MKAIR:
            return

        scoped_user = self.users.get_by_id_for_update(current_user.id)
        if scoped_user is None:
            return

        allowed_folder_ids = get_user_allowed_folder_ids(scoped_user) or set()
        if folder_id in allowed_folder_ids:
            return

        scoped_user.allowed_folder_ids = [*sorted(allowed_folder_ids), folder_id]
