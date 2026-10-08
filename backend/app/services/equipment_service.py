from __future__ import annotations

import asyncio
import csv
import json
import random
import re
import shutil
import unicodedata
from calendar import monthrange
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

import httpx
from fastapi import HTTPException, status
from openpyxl import Workbook, load_workbook
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.arshin_client import RETRYABLE_STATUS_CODES
from app.models.equipment import (
    DeadlinePreset,
    Equipment,
    EquipmentAttachment,
    EquipmentComment,
    EquipmentCommentAttachment,
    EquipmentESICompositionEntry,
    EquipmentFolder,
    EquipmentFolderRefreshRow,
    EquipmentFolderRefreshRowStatus,
    EquipmentFolderRefreshTargetKind,
    EquipmentFolderRefreshTask,
    EquipmentFolderRefreshTaskStatus,
    EquipmentGroup,
    EquipmentProcessSubscription,
    EquipmentStatus,
    EquipmentType,
    ESIModuleKind,
    FolderProcessSubscription,
    Repair,
    RepairMessage,
    RepairMessageAttachment,
    SIVerification,
    Verification,
    VerificationFlowMode,
    VerificationMessage,
    VerificationMessageAttachment,
)
from app.models.event import EventCategory, EventLog
from app.models.user import User, UserRole
from app.repositories.equipment_repository import (
    DeadlinePresetRepository,
    EquipmentAttachmentRepository,
    EquipmentCommentAttachmentRepository,
    EquipmentCommentRepository,
    EquipmentESICompositionRepository,
    EquipmentFolderRefreshRowRepository,
    EquipmentFolderRefreshTaskRepository,
    EquipmentFolderRepository,
    EquipmentGroupRepository,
    EquipmentProcessSubscriptionRepository,
    EquipmentRepository,
    FolderProcessSubscriptionRepository,
    RepairMessageAttachmentRepository,
    RepairMessageRepository,
    RepairRepository,
    SIVerificationRepository,
    VerificationMessageAttachmentRepository,
    VerificationMessageRepository,
    VerificationRepository,
)
from app.repositories.event_repository import EventLogRepository
from app.repositories.user_repository import UserRepository
from app.schemas.arshin import ArshinSearchResultRead, ArshinVriDetailRead
from app.schemas.equipment import (
    EquipmentAttachmentRead,
    EquipmentCommentCreateRequest,
    EquipmentCommentRead,
    EquipmentCommentUpdateRequest,
    EquipmentCreateRequest,
    EquipmentDetailsRead,
    EquipmentESICompositionEntryCreateRequest,
    EquipmentESICompositionEntryRead,
    EquipmentESICompositionEntryUpdateRequest,
    EquipmentFolderCreateRequest,
    EquipmentFolderRefreshApplyRequest,
    EquipmentFolderRefreshApplyResultRead,
    EquipmentFolderRefreshApplyRowResultRead,
    EquipmentFolderRefreshRowRead,
    EquipmentFolderRefreshTaskDetailsRead,
    EquipmentFolderRefreshTaskRead,
    EquipmentFolderSuggestionsRead,
    EquipmentFolderUpdateRequest,
    EquipmentPageRead,
    EquipmentRead,
    EquipmentShareRecipientRead,
    EquipmentShareRecipientsRead,
    EquipmentShareRequest,
    EquipmentShareResultRead,
    EquipmentSIBulkImportResultRead,
    EquipmentSIBulkImportRowRead,
    EquipmentSIRefreshRequest,
    EquipmentSortDirection,
    EquipmentSortKey,
    EquipmentUpdateRequest,
    ESIEquipmentMonitoringItemRead,
    ESIEquipmentMonitoringModuleRead,
    ESIInternalModuleMeasurementRequest,
    FolderProcessSubscriptionRead,
    FolderProcessSubscriptionUpdateRequest,
    FolderProcessSubscriptionUserRead,
    ProcessBatchMembershipUpdateRequest,
    RepairBulkCreateRequest,
    RepairCreateRequest,
    RepairMessageCreateRequest,
    RepairMessageUpdateRequest,
    RepairMilestonesUpdateRequest,
    RepairQueueItemRead,
    RepairQueuePageRead,
    SIVerificationCreateRequest,
    VerificationBulkCreateRequest,
    VerificationCreateRequest,
    VerificationMessageCreateRequest,
    VerificationMessageUpdateRequest,
    VerificationMilestonesUpdateRequest,
    VerificationQueueItemRead,
    VerificationQueuePageRead,
)
from app.services.arshin_service import ArshinService
from app.services.equipment_process_templates import (
    DEFAULT_REPAIR_DEADLINE_SETTINGS,
    EquipmentProcessTemplatesMixin,
    RepairDeadlineSettings,
    _build_deadline_preset_snapshot,
    _build_default_repair_stage_template_variants,
    _build_default_repair_stage_templates,
    _build_default_verification_stage_template_variants,
    _build_default_verification_stage_templates,
    _build_process_custom_stages_from_variant,
    _build_repair_deadline_settings,
    _build_stage_template_from_process_variant,
    _calculate_control_deadline_at,
    _calculate_payment_deadline_at,
    _calculate_registration_deadline_at,
    _clone_process_custom_stages,
    _coerce_repair_deadline_settings,
    _coerce_repair_stage_template_variants,
    _coerce_repair_stage_templates,
    _coerce_verification_stage_template_variants,
    _coerce_verification_stage_templates,
    _extract_process_template_variant_id,
    _get_enabled_stage_template_items,
    _get_stage_template_labels,
    _get_verification_stage_template_key,
    _is_process_template_variants_payload,
    _merge_process_template_variant_meta,
    _normalize_process_custom_stages_for_read,
    _normalize_process_custom_stages_for_write,
    _normalize_required_text,
    _select_process_template_variant,
)
from app.services.equipment_text import (
    _build_named_detail,
    _build_nonempty_description,
    _normalize_optional_text,
)
from app.services.folder_refresh_matcher import FolderRefreshMatcher, FolderRefreshMatchResult
from app.services.notification_service import (
    NotificationConfigurationError,
    NotificationDeliveryError,
    NotificationService,
)
from app.services.user_service import (
    build_user_mention_keys,
    get_user_allowed_folder_ids,
    has_admin_access,
    has_operator_access,
)
from app.tasks.notifications import enqueue_mention_email, enqueue_process_update_email

FOLDER_REFRESH_TASK_STALE_TIMEOUT = timedelta(minutes=10)
COMMENT_ATTACHMENT_UPLOAD_STAGING_TTL = timedelta(hours=24)
COMMENT_ATTACHMENT_UPLOAD_TOKEN_PATTERN = re.compile(r"^[a-f0-9]{32}$")


@dataclass(slots=True)
class FolderRefreshTarget:
    sort_order: int
    target_kind: EquipmentFolderRefreshTargetKind
    equipment: Equipment
    composition_entry: EquipmentESICompositionEntry | None
    module_kind: ESIModuleKind | None
    equipment_name: str
    equipment_modification: str | None
    equipment_serial_number: str | None
    target_title: str | None
    target_serial_number: str | None
    target_registry_number: str | None
    measurement_limit: str | None
    current_certificate_number: str | None
    current_verification_date: datetime | None
    current_valid_date: datetime | None


EDITABLE_EQUIPMENT_TYPE_TRANSITIONS: dict[EquipmentType, frozenset[EquipmentType]] = {
    EquipmentType.OTHER: frozenset(
        {
            EquipmentType.SI,
            EquipmentType.IO,
            EquipmentType.VO,
        }
    ),
}


class EquipmentService(EquipmentProcessTemplatesMixin):
    def __init__(self, session: Session, *, access_user: User | None = None) -> None:
        self.session = session
        self.access_user = access_user
        self.deadline_presets = DeadlinePresetRepository(session)
        self.folders = EquipmentFolderRepository(session)
        self.folder_refresh_tasks = EquipmentFolderRefreshTaskRepository(session)
        self.folder_refresh_rows = EquipmentFolderRefreshRowRepository(session)
        self.groups = EquipmentGroupRepository(session)
        self.equipment = EquipmentRepository(session)
        self.process_subscriptions = EquipmentProcessSubscriptionRepository(session)
        self.folder_process_subscriptions = FolderProcessSubscriptionRepository(session)
        self.attachments = EquipmentAttachmentRepository(session)
        self.comments = EquipmentCommentRepository(session)
        self.comment_attachments = EquipmentCommentAttachmentRepository(session)
        self.repairs = RepairRepository(session)
        self.repair_messages = RepairMessageRepository(session)
        self.repair_message_attachments = RepairMessageAttachmentRepository(session)
        self.verifications = VerificationRepository(session)
        self.verification_messages = VerificationMessageRepository(session)
        self.verification_message_attachments = VerificationMessageAttachmentRepository(session)
        self.si_verifications = SIVerificationRepository(session)
        self.esi_composition_entries = EquipmentESICompositionRepository(session)
        self.events = EventLogRepository(session)
        self.users = UserRepository(session)
        self.folder_refresh_matcher = FolderRefreshMatcher()
        self._pending_process_notifications: list[PendingProcessNotification] = []
        self._deadline_settings_by_folder_id: dict[int | None, RepairDeadlineSettings] = {}

    def _can_view_private_notes(self) -> bool:
        return self.access_user is None or self.access_user.role != UserRole.CUSTOMER

    def _assert_private_note_creation_allowed(
        self,
        *,
        is_private: bool,
        current_user: User,
    ) -> None:
        if not is_private:
            return
        if current_user.role == UserRole.CUSTOMER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Приватные комментарии доступны только администраторам и МКАИР.",
            )

    def _assert_private_note_visible(self, *, is_private: bool, detail: str) -> None:
        if is_private and not self._can_view_private_notes():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=detail,
            )

    def _filter_private_mention_recipients(self, users: list[User]) -> list[User]:
        return [user for user in users if user.role != UserRole.CUSTOMER]

    def _commit_comment_visibility_change(self, *, is_private: bool) -> None:
        if is_private:
            self.session.commit()
            return
        self._commit_and_flush_process_notifications()

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

    def get_equipment_share_recipients(
        self,
        *,
        equipment_id: int,
    ) -> EquipmentShareRecipientsRead:
        equipment = self.get_equipment(equipment_id=equipment_id)
        if equipment.folder_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Прибор не привязан к папке.",
            )

        users = [
            user
            for user in self.users.list_active()
            if _is_folder_visible_to_user(user=user, folder_id=equipment.folder_id)
        ]
        return EquipmentShareRecipientsRead(
            equipment_id=equipment.id,
            folder_id=equipment.folder_id,
            users=[
                EquipmentShareRecipientRead(
                    user_id=user.id,
                    display_name=_format_user_display_name(user),
                    email=user.email,
                    role=user.role,
                    organization=user.organization,
                    position=user.position,
                    facility=user.facility,
                )
                for user in users
            ],
        )

    def share_equipment(
        self,
        *,
        equipment_id: int,
        payload: EquipmentShareRequest,
        current_user: User,
    ) -> EquipmentShareResultRead:
        equipment = self.get_equipment(equipment_id=equipment_id)
        if equipment.folder_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Прибор не привязан к папке.",
            )

        target_user_ids = {int(user_id) for user_id in payload.user_ids}
        if not target_user_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Выбери хотя бы одного получателя.",
            )

        visible_users = [
            user
            for user in self.users.list_active()
            if _is_folder_visible_to_user(user=user, folder_id=equipment.folder_id)
        ]
        users_by_id = {user.id: user for user in visible_users}
        unknown_user_ids = sorted(target_user_ids.difference(users_by_id))
        if unknown_user_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Some selected users do not have access to this folder.",
            )

        folder = self.folders.get_by_id(equipment.folder_id)
        notification_service = NotificationService()
        try:
            notification_service.ensure_configured()
        except (NotificationConfigurationError, NotificationDeliveryError) as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc
        equipment_url = f"{settings.frontend_app_url}/equipment/{equipment.id}"
        sender_name = _format_user_display_name(current_user)

        for user_id in sorted(target_user_ids):
            recipient = users_by_id[user_id]
            try:
                notification_service.send_equipment_share_email(
                    recipient_email=recipient.email,
                    recipient_name=_format_user_display_name(recipient),
                    sender_name=sender_name,
                    equipment_name=equipment.name,
                    equipment_modification=equipment.modification,
                    equipment_serial_number=equipment.serial_number,
                    folder_name=folder.name if folder is not None else None,
                    target_url=equipment_url,
                )
            except (NotificationConfigurationError, NotificationDeliveryError) as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=str(exc),
                ) from exc

        recipient_names = [
            _format_user_display_name(users_by_id[user_id]) for user_id in sorted(target_user_ids)
        ]
        self._record_equipment_event(
            action="shared",
            user=current_user,
            equipment=equipment,
            title=f"Отправлена ссылка на прибор «{equipment.name}»",
            description="Получатели: " + ", ".join(recipient_names) + ".",
        )
        self.session.commit()
        return EquipmentShareResultRead(
            message=(
                f"Ссылка на прибор отправлена {len(target_user_ids)} "
                f"{_pluralize_recipient_dative(len(target_user_ids))}."
            ),
            recipient_count=len(target_user_ids),
        )

    def create_folder_refresh_task(
        self,
        *,
        folder_id: int,
        current_user: User,
    ) -> EquipmentFolderRefreshTaskRead:
        folder = self._get_folder(folder_id)
        latest_tasks = self.folder_refresh_tasks.list_latest_by_folder_id(
            folder_id=folder.id,
            limit=1,
        )
        if latest_tasks and latest_tasks[0].status in {
            EquipmentFolderRefreshTaskStatus.PENDING,
            EquipmentFolderRefreshTaskStatus.PROCESSING,
        }:
            active_task = latest_tasks[0]
            if not self._finalize_stale_folder_refresh_task(active_task):
                return EquipmentFolderRefreshTaskRead.model_validate(active_task)

        task = self.folder_refresh_tasks.add(
            EquipmentFolderRefreshTask(
                folder_id=folder.id,
                created_by_user_id=current_user.id,
                status=EquipmentFolderRefreshTaskStatus.PENDING,
                progress=0,
                total_rows=0,
                processed_rows=0,
                summary_json=None,
                error_message=None,
                started_at=None,
                completed_at=None,
            )
        )
        self.session.commit()
        self.session.refresh(task)
        return EquipmentFolderRefreshTaskRead.model_validate(task)

    def get_folder_refresh_task_details(
        self,
        *,
        folder_id: int,
        task_id: int,
    ) -> EquipmentFolderRefreshTaskDetailsRead:
        task = self._get_folder_refresh_task(folder_id=folder_id, task_id=task_id)
        self._finalize_stale_folder_refresh_task(task)
        self.session.refresh(task)
        rows = self.folder_refresh_rows.list_by_task_id(task_id=task.id)
        return EquipmentFolderRefreshTaskDetailsRead(
            task=EquipmentFolderRefreshTaskRead.model_validate(task),
            rows=[EquipmentFolderRefreshRowRead.model_validate(row) for row in rows],
        )

    async def process_folder_refresh_task(
        self,
        *,
        task_id: int,
        equipment_ids: list[int] | None = None,
    ) -> None:
        task = self.folder_refresh_tasks.get_by_id(task_id=task_id)
        if task is None:
            return

        try:
            task.status = EquipmentFolderRefreshTaskStatus.PROCESSING
            task.progress = 0
            task.total_rows = 0
            task.processed_rows = 0
            task.summary_json = None
            task.error_message = None
            task.started_at = datetime.now(tz=UTC)
            task.completed_at = None
            self.folder_refresh_rows.delete_by_task_id(task_id=task.id)
            self.session.commit()

            targets = self._build_folder_refresh_targets(
                folder_id=task.folder_id,
                equipment_ids=equipment_ids,
            )
            task.total_rows = len(targets)
            self.session.commit()

            created_rows: list[EquipmentFolderRefreshRow] = []
            if not targets:
                task.status = EquipmentFolderRefreshTaskStatus.COMPLETED
                task.progress = 100
                task.summary_json = self._build_folder_refresh_summary(rows=created_rows)
                task.completed_at = datetime.now(tz=UTC)
                self.session.commit()
                return

            for index, target in enumerate(targets, start=1):
                row = await self._build_folder_refresh_row(task_id=task.id, target=target)
                self.folder_refresh_rows.add(row)
                created_rows.append(row)
                task.processed_rows = index
                task.progress = min(100, round(index * 100 / len(targets)))
                self.session.commit()

            task.status = EquipmentFolderRefreshTaskStatus.COMPLETED
            task.progress = 100
            task.summary_json = self._build_folder_refresh_summary(rows=created_rows)
            task.completed_at = datetime.now(tz=UTC)
            self.session.commit()
        except Exception as exc:
            task = self.folder_refresh_tasks.get_by_id(task_id=task_id)
            if task is not None:
                task.status = EquipmentFolderRefreshTaskStatus.FAILED
                task.error_message = str(exc)
                task.completed_at = datetime.now(tz=UTC)
                self.session.commit()
            raise

    def apply_folder_refresh_rows(
        self,
        *,
        folder_id: int,
        task_id: int,
        payload: EquipmentFolderRefreshApplyRequest,
        current_user: User,
    ) -> EquipmentFolderRefreshApplyResultRead:
        task = self._get_folder_refresh_task(folder_id=folder_id, task_id=task_id)
        if task.status in {
            EquipmentFolderRefreshTaskStatus.PENDING,
            EquipmentFolderRefreshTaskStatus.PROCESSING,
        }:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Поиск обновлений еще не завершен.",
            )

        rows = self.folder_refresh_rows.list_by_task_id_and_ids(
            task_id=task.id,
            row_ids=payload.row_ids,
        )
        results: list[EquipmentFolderRefreshApplyRowResultRead] = []
        applied_count = 0
        failed_count = 0

        for row in rows:
            try:
                result = self._apply_folder_refresh_row(row=row, current_user=current_user)
            except HTTPException as exc:
                result = EquipmentFolderRefreshApplyRowResultRead(
                    row_id=row.id,
                    equipment_id=row.equipment_id,
                    composition_entry_id=row.composition_entry_id,
                    applied=False,
                    message=str(exc.detail),
                )
            except Exception as exc:
                result = EquipmentFolderRefreshApplyRowResultRead(
                    row_id=row.id,
                    equipment_id=row.equipment_id,
                    composition_entry_id=row.composition_entry_id,
                    applied=False,
                    message=str(exc),
                )

            results.append(result)
            if result.applied:
                applied_count += 1
            else:
                failed_count += 1

        return EquipmentFolderRefreshApplyResultRead(
            applied_count=applied_count,
            failed_count=failed_count,
            results=results,
        )

    def list_equipment(
        self,
        *,
        folder_id: int | None = None,
        group_id: int | None = None,
        equipment_ids: list[int] | None = None,
        query: str | None = None,
        object_name: str | None = None,
        current_location_manual: str | None = None,
        status: EquipmentStatus | None = None,
        equipment_type: EquipmentType | None = None,
    ) -> list[Equipment]:
        if folder_id is not None:
            self._get_folder(folder_id)
        if group_id is not None:
            self._get_group(group_id)
        return self.equipment.list_all(
            folder_id=folder_id,
            group_id=group_id,
            equipment_ids=equipment_ids,
            query=query.strip() if query else None,
            object_name=object_name.strip() if object_name else None,
            current_location_manual=(
                current_location_manual.strip() if current_location_manual else None
            ),
            status=status,
            equipment_type=equipment_type,
            allowed_folder_ids=self._get_accessible_folder_ids(),
        )

    def list_equipment_page(
        self,
        *,
        folder_id: int | None = None,
        group_id: int | None = None,
        equipment_ids: list[int] | None = None,
        query: str | None = None,
        object_name: str | None = None,
        current_location_manual: str | None = None,
        status: EquipmentStatus | None = None,
        equipment_type: EquipmentType | None = None,
        limit: int = 100,
        offset: int = 0,
        sort_key: EquipmentSortKey | None = None,
        sort_direction: EquipmentSortDirection = "asc",
    ) -> EquipmentPageRead:
        if folder_id is not None:
            self._get_folder(folder_id)
        if group_id is not None:
            self._get_group(group_id)
        items, total = self.equipment.list_page(
            folder_id=folder_id,
            group_id=group_id,
            equipment_ids=equipment_ids,
            query=query.strip() if query else None,
            object_name=object_name.strip() if object_name else None,
            current_location_manual=(
                current_location_manual.strip() if current_location_manual else None
            ),
            status=status,
            equipment_type=equipment_type,
            allowed_folder_ids=self._get_accessible_folder_ids(),
            limit=limit,
            offset=offset,
            sort_key=sort_key,
            sort_direction=sort_direction,
        )
        return EquipmentPageRead(
            items=[
                EquipmentRead.model_validate(self._enrich_equipment_processes(item))
                for item in items
            ],
            total=total,
            limit=limit,
            offset=offset,
        )

    def list_verification_queue(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
        folder_id: int | None = None,
        target_id: int | None = None,
        target_batch_key: str | None = None,
        target_equipment_id: int | None = None,
    ) -> list[VerificationQueueItemRead]:
        normalized_lifecycle_status = lifecycle_status.strip().lower()
        if normalized_lifecycle_status not in {"active", "archived"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Verification lifecycle status must be active or archived.",
            )
        if folder_id is not None:
            self._get_folder(folder_id)

        rows = self.verifications.list_queue_items(
            lifecycle_status=normalized_lifecycle_status,
            query=query.strip() if query else None,
            folder_id=folder_id,
            allowed_folder_ids=self._get_accessible_folder_ids(),
            target_id=target_id,
            target_batch_key=target_batch_key,
            target_equipment_id=target_equipment_id,
        )
        return [
            self._build_verification_queue_item(
                verification=verification,
                equipment=equipment,
                si_verification=si_verification,
                has_active_repair=has_active_repair,
            )
            for verification, equipment, si_verification, has_active_repair in rows
        ]

    def list_verification_queue_page(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
        folder_id: int | None = None,
        limit: int,
        offset: int,
    ) -> VerificationQueuePageRead:
        normalized_lifecycle_status = lifecycle_status.strip().lower()
        if normalized_lifecycle_status not in {"active", "archived"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Verification lifecycle status must be active or archived.",
            )
        if folder_id is not None:
            self._get_folder(folder_id)

        rows, total_groups, total_items = self.verifications.list_queue_page_items(
            lifecycle_status=normalized_lifecycle_status,
            query=query.strip() if query else None,
            folder_id=folder_id,
            allowed_folder_ids=self._get_accessible_folder_ids(),
            limit=limit,
            offset=offset,
        )
        return VerificationQueuePageRead(
            items=[
                self._build_verification_queue_item(
                    verification=verification,
                    equipment=equipment,
                    si_verification=si_verification,
                    has_active_repair=has_active_repair,
                )
                for verification, equipment, si_verification, has_active_repair in rows
            ],
            total_groups=total_groups,
            total_items=total_items,
            limit=limit,
            offset=offset,
        )

    def list_repair_queue(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
        folder_id: int | None = None,
        target_id: int | None = None,
        target_batch_key: str | None = None,
        target_equipment_id: int | None = None,
    ) -> list[RepairQueueItemRead]:
        normalized_lifecycle_status = lifecycle_status.strip().lower()
        if normalized_lifecycle_status not in {"active", "archived"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Repair lifecycle status must be active or archived.",
            )
        if folder_id is not None:
            self._get_folder(folder_id)

        rows = self.repairs.list_queue_items(
            lifecycle_status=normalized_lifecycle_status,
            query=query.strip() if query else None,
            folder_id=folder_id,
            allowed_folder_ids=self._get_accessible_folder_ids(),
            target_id=target_id,
            target_batch_key=target_batch_key,
            target_equipment_id=target_equipment_id,
        )
        return [
            self._build_repair_queue_item(
                repair=repair,
                equipment=equipment,
                si_verification=si_verification,
                has_active_verification=has_active_verification,
            )
            for repair, equipment, si_verification, has_active_verification in rows
        ]

    def list_repair_queue_page(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
        folder_id: int | None = None,
        limit: int,
        offset: int,
    ) -> RepairQueuePageRead:
        normalized_lifecycle_status = lifecycle_status.strip().lower()
        if normalized_lifecycle_status not in {"active", "archived"}:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Repair lifecycle status must be active or archived.",
            )
        if folder_id is not None:
            self._get_folder(folder_id)

        rows, total_groups, total_items = self.repairs.list_queue_page_items(
            lifecycle_status=normalized_lifecycle_status,
            query=query.strip() if query else None,
            folder_id=folder_id,
            allowed_folder_ids=self._get_accessible_folder_ids(),
            limit=limit,
            offset=offset,
        )
        return RepairQueuePageRead(
            items=[
                self._build_repair_queue_item(
                    repair=repair,
                    equipment=equipment,
                    si_verification=si_verification,
                    has_active_verification=has_active_verification,
                )
                for repair, equipment, si_verification, has_active_verification in rows
            ],
            total_groups=total_groups,
            total_items=total_items,
            limit=limit,
            offset=offset,
        )

    def list_equipment_verification_history(
        self,
        *,
        equipment_id: int,
    ) -> list[VerificationQueueItemRead]:
        self.get_equipment(equipment_id=equipment_id)
        rows = self.verifications.list_archived_by_equipment_id(equipment_id=equipment_id)
        return [
            self._build_verification_queue_item(
                verification=verification,
                equipment=equipment,
                si_verification=si_verification,
                has_active_repair=has_active_repair,
            )
            for verification, equipment, si_verification, has_active_repair in rows
        ]

    def list_equipment_repair_history(
        self,
        *,
        equipment_id: int,
    ) -> list[RepairQueueItemRead]:
        self.get_equipment(equipment_id=equipment_id)
        rows = self.repairs.list_archived_by_equipment_id(equipment_id=equipment_id)
        return [
            self._build_repair_queue_item(
                repair=repair,
                equipment=equipment,
                si_verification=si_verification,
                has_active_verification=has_active_verification,
            )
            for repair, equipment, si_verification, has_active_verification in rows
        ]

    def get_equipment_details(self, *, equipment_id: int) -> EquipmentDetailsRead:
        equipment = self.get_equipment(equipment_id=equipment_id)
        include_private_notes = self._can_view_private_notes()
        esi_composition_entries: list[EquipmentESICompositionEntry] = []
        if equipment.equipment_type == EquipmentType.ESI:
            esi_composition_entries = self.esi_composition_entries.list_by_equipment_id(
                equipment_id=equipment.id
            )
        attachments = self.attachments.list_by_equipment(equipment_id=equipment.id)
        comments = self.comments.list_by_equipment(
            equipment_id=equipment.id,
            include_private=include_private_notes,
        )
        active_repair_message_count = 0
        if equipment.active_repair is not None:
            if equipment.active_repair.batch_key:
                active_repair_message_count = self.repair_messages.count_by_batch_key(
                    batch_key=equipment.active_repair.batch_key,
                    include_private=include_private_notes,
                )
            else:
                active_repair_message_count = self.repair_messages.count_by_repair(
                    repair_id=equipment.active_repair.id,
                    include_private=include_private_notes,
                )

        repair_history_rows = self.repairs.list_archived_by_equipment_id(equipment_id=equipment.id)
        repair_history = [
            self._build_repair_queue_item(
                repair=repair,
                equipment=repair_equipment,
                si_verification=si_verification,
                has_active_verification=has_active_verification,
            )
            for (
                repair,
                repair_equipment,
                si_verification,
                has_active_verification,
            ) in repair_history_rows
        ]

        active_verification_message_count = 0
        verification_history: list[VerificationQueueItemRead] = []
        if _supports_verification(equipment.equipment_type):
            if equipment.active_verification is not None:
                if equipment.active_verification.batch_key:
                    active_verification_message_count = (
                        self.verification_messages.count_by_batch_key(
                            batch_key=equipment.active_verification.batch_key,
                            include_private=include_private_notes,
                        )
                    )
                else:
                    active_verification_message_count = (
                        self.verification_messages.count_by_verification(
                            verification_id=equipment.active_verification.id,
                            include_private=include_private_notes,
                        )
                    )
            verification_history_rows = self.verifications.list_archived_by_equipment_id(
                equipment_id=equipment.id
            )
            verification_history = [
                self._build_verification_queue_item(
                    verification=verification,
                    equipment=verification_equipment,
                    si_verification=si_verification,
                    has_active_repair=has_active_repair,
                )
                for (
                    verification,
                    verification_equipment,
                    si_verification,
                    has_active_repair,
                ) in verification_history_rows
            ]

        process_subscription_enabled = bool(
            self.access_user is not None
            and self.process_subscriptions.is_enabled(
                equipment_id=equipment.id,
                user_id=self.access_user.id,
            )
        )

        return EquipmentDetailsRead(
            equipment=EquipmentRead.model_validate(equipment),
            process_subscription_enabled=process_subscription_enabled,
            active_repair_message_count=active_repair_message_count,
            active_verification_message_count=active_verification_message_count,
            esi_composition_entries=[
                EquipmentESICompositionEntryRead.model_validate(item)
                for item in esi_composition_entries
            ],
            attachments=[EquipmentAttachmentRead.model_validate(item) for item in attachments],
            comments=[EquipmentCommentRead.model_validate(item) for item in comments],
            repair_history=repair_history,
            verification_history=verification_history,
        )

    def get_equipment(self, *, equipment_id: int) -> Equipment:
        equipment = self.equipment.get_by_id(equipment_id)
        if equipment is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Equipment not found.",
            )
        self._assert_folder_access(equipment.folder_id, detail="Equipment not found.")
        return self._enrich_equipment_processes(equipment)

    def get_equipment_process_subscription(
        self,
        *,
        equipment_id: int,
        user: User,
    ) -> bool:
        equipment = self.get_equipment(equipment_id=equipment_id)
        return self.process_subscriptions.is_enabled(
            equipment_id=equipment.id,
            user_id=user.id,
        )

    def set_equipment_process_subscription(
        self,
        *,
        equipment_id: int,
        enabled: bool,
        current_user: User,
    ) -> bool:
        equipment = self.get_equipment(equipment_id=equipment_id)
        subscription = self.process_subscriptions.get_by_equipment_and_user(
            equipment_id=equipment.id,
            user_id=current_user.id,
        )

        if enabled and subscription is None:
            self.process_subscriptions.add(
                EquipmentProcessSubscription(
                    equipment_id=equipment.id,
                    user_id=current_user.id,
                )
            )
            self._record_equipment_event(
                action="process_subscription_enabled",
                user=current_user,
                equipment=equipment,
                title=f"Включена email-подписка по прибору «{equipment.name}»",
                description=f"Получатель: {current_user.email}.",
            )
        elif not enabled and subscription is not None:
            self.process_subscriptions.delete(subscription)
            self._record_equipment_event(
                action="process_subscription_disabled",
                user=current_user,
                equipment=equipment,
                title=f"Выключена email-подписка по прибору «{equipment.name}»",
                description=f"Получатель: {current_user.email}.",
            )

        self._commit_and_flush_process_notifications()
        return enabled

    def create_equipment(
        self,
        payload: EquipmentCreateRequest,
        *,
        current_user: User | None = None,
    ) -> Equipment:
        self._assert_create_equipment_access(payload=payload, current_user=current_user)
        folder = self._get_folder(payload.folder_id)
        group = self._get_group(payload.group_id) if payload.group_id is not None else None
        if group is not None and group.folder_id != folder.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Group does not belong to the selected folder.",
            )
        self._validate_si_payload_for_create(payload)

        equipment = Equipment(
            folder_id=folder.id,
            group_id=payload.group_id,
            object_name=_normalize_required_text(payload.object_name, field_label="Object name"),
            equipment_type=payload.equipment_type,
            name=_normalize_required_text(payload.name, field_label="Equipment name"),
            modification=_normalize_optional_text(payload.modification),
            serial_number=_normalize_optional_text(payload.serial_number),
            manufacture_year=_validate_manufacture_year(payload.manufacture_year),
            measurement_range_start=(
                _normalize_optional_text(payload.measurement_range_start)
                if payload.equipment_type == EquipmentType.SI
                else None
            ),
            measurement_range_end=(
                _normalize_optional_text(payload.measurement_range_end)
                if payload.equipment_type == EquipmentType.SI
                else None
            ),
            measurement_unit=(
                _normalize_measurement_unit(payload.measurement_unit)
                if payload.equipment_type == EquipmentType.SI
                else None
            ),
            status=payload.status,
            created_manually=(
                payload.created_manually
                if _is_arshin_equipment_type(payload.equipment_type)
                else False
            ),
            exclude_from_arshin_refresh=(
                payload.exclude_from_arshin_refresh
                if _is_arshin_equipment_type(payload.equipment_type) and payload.created_manually
                else False
            ),
            current_location_manual=_normalize_optional_text(payload.current_location_manual),
            compliance_date=_normalize_equipment_compliance_date(
                payload.equipment_type,
                payload.compliance_date,
            ),
            compliance_interval_months=_normalize_equipment_compliance_interval_months(
                payload.equipment_type,
                payload.compliance_interval_months,
            ),
            manual_verification_interval_months=(
                _normalize_equipment_manual_verification_interval_months(
                    payload.equipment_type,
                    payload.manual_verification_interval_months,
                )
            ),
        )
        self.equipment.add(equipment)
        if payload.si_verification is not None:
            normalized_vri_id = _normalize_optional_text(payload.si_verification.vri_id)
            if payload.created_manually and normalized_vri_id is None:
                normalized_vri_id = _build_manual_vri_id(payload.equipment_type)
            certificate_number = _resolve_si_certificate_number(
                payload.si_verification,
                equipment_type=payload.equipment_type,
            )
            self.si_verifications.add(
                SIVerification(
                    equipment_id=equipment.id,
                    vri_id=_normalize_required_text(
                        normalized_vri_id,
                        field_label="SI vri_id",
                    ),
                    arshin_url=_normalize_long_optional_text(payload.si_verification.arshin_url),
                    org_title=_normalize_optional_text(payload.si_verification.org_title),
                    mit_number=_normalize_optional_text(payload.si_verification.mit_number),
                    mit_title=_normalize_optional_text(payload.si_verification.mit_title),
                    mit_notation=_normalize_optional_text(payload.si_verification.mit_notation),
                    mi_number=_normalize_optional_text(payload.si_verification.mi_number),
                    certificate_number=certificate_number,
                    result_docnum=_resolve_si_result_docnum(
                        payload.si_verification,
                        equipment_type=payload.equipment_type,
                        certificate_number=certificate_number,
                    ),
                    verification_date=payload.si_verification.verification_date,
                    valid_date=_resolve_equipment_si_valid_date(
                        manual_interval_months=equipment.manual_verification_interval_months,
                        verification_date=payload.si_verification.verification_date,
                        fallback_valid_date=payload.si_verification.valid_date,
                    ),
                    raw_payload_json=payload.si_verification.raw_payload_json,
                    detail_payload_json=payload.si_verification.detail_payload_json,
                )
            )
            if payload.equipment_type == EquipmentType.ESI:
                self._sync_internal_esi_modules(
                    equipment=equipment,
                    si_verification_payload=payload.si_verification,
                    requested_modules=payload.esi_internal_modules,
                )
        if current_user is not None:
            self._record_equipment_event(
                action="equipment_created",
                user=current_user,
                equipment=equipment,
                title=f"Создан прибор «{equipment.name}»",
                description=_build_nonempty_description(
                    [
                        _build_named_detail("Объект", equipment.object_name),
                        _build_named_detail("Категория", equipment.equipment_type.value),
                        _build_named_detail("Заводской номер", equipment.serial_number),
                    ]
                ),
            )
        self.session.commit()
        self.session.refresh(equipment)
        return equipment

    def update_equipment(
        self,
        *,
        equipment_id: int,
        payload: EquipmentUpdateRequest,
        current_user: User | None = None,
    ) -> Equipment:
        equipment = self.get_equipment(equipment_id=equipment_id)
        next_folder_id = equipment.folder_id
        next_group_id = equipment.group_id
        changed_fields: list[str] = []

        if "folder_id" in payload.model_fields_set:
            if payload.folder_id is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Equipment folder_id must not be empty.",
                )
            self._get_folder(payload.folder_id)
            next_folder_id = payload.folder_id

        if "group_id" in payload.model_fields_set:
            if payload.group_id is not None:
                self._get_group(payload.group_id)
            next_group_id = payload.group_id

        if next_group_id is not None:
            next_group = self._get_group(next_group_id)
            if next_folder_id is None:
                next_folder_id = next_group.folder_id
            if next_group.folder_id != next_folder_id:
                folder_changed = "folder_id" in payload.model_fields_set
                group_changed = "group_id" in payload.model_fields_set
                if folder_changed and not group_changed:
                    next_group_id = None
                else:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Group does not belong to the selected folder.",
                    )

        equipment.folder_id = next_folder_id
        equipment.group_id = next_group_id
        if {"folder_id", "group_id"} & payload.model_fields_set:
            changed_fields.append("папка/группа")

        if "object_name" in payload.model_fields_set:
            equipment.object_name = _normalize_required_text(
                payload.object_name,
                field_label="Object name",
            )
            changed_fields.append("объект")

        if "equipment_type" in payload.model_fields_set:
            next_equipment_type = payload.equipment_type
            if next_equipment_type is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Equipment type must not be empty.",
                )
            _assert_equipment_type_transition_allowed(
                current_type=equipment.equipment_type,
                next_type=next_equipment_type,
            )
            if next_equipment_type != equipment.equipment_type:
                equipment.equipment_type = next_equipment_type
                changed_fields.append("категория")
                if equipment.equipment_type != EquipmentType.SI:
                    equipment.measurement_range_start = None
                    equipment.measurement_range_end = None
                    equipment.measurement_unit = None
                if equipment.equipment_type not in {EquipmentType.IO, EquipmentType.VO}:
                    equipment.compliance_date = None
                    equipment.compliance_interval_months = None
                if equipment.equipment_type != EquipmentType.SI:
                    equipment.manual_verification_interval_months = None
                if not _is_arshin_equipment_type(equipment.equipment_type):
                    equipment.exclude_from_arshin_refresh = False

        if "name" in payload.model_fields_set:
            equipment.name = _normalize_required_text(payload.name, field_label="Equipment name")
            changed_fields.append("наименование")

        if "modification" in payload.model_fields_set:
            equipment.modification = _normalize_optional_text(payload.modification)
            changed_fields.append("модификация")

        if "serial_number" in payload.model_fields_set:
            equipment.serial_number = _normalize_optional_text(payload.serial_number)
            changed_fields.append("заводской номер")

        if "manufacture_year" in payload.model_fields_set:
            equipment.manufacture_year = _validate_manufacture_year(payload.manufacture_year)
            changed_fields.append("год выпуска")

        if "measurement_range_start" in payload.model_fields_set:
            if equipment.equipment_type == EquipmentType.SI:
                equipment.measurement_range_start = _normalize_optional_text(
                    payload.measurement_range_start
                )
                changed_fields.append("диапазон измерения от")
            else:
                equipment.measurement_range_start = None

        if "measurement_range_end" in payload.model_fields_set:
            if equipment.equipment_type == EquipmentType.SI:
                equipment.measurement_range_end = _normalize_optional_text(
                    payload.measurement_range_end
                )
                changed_fields.append("диапазон измерения до")
            else:
                equipment.measurement_range_end = None

        if "measurement_unit" in payload.model_fields_set:
            if equipment.equipment_type == EquipmentType.SI:
                equipment.measurement_unit = _normalize_measurement_unit(payload.measurement_unit)
                changed_fields.append("единица измерения")
            else:
                equipment.measurement_unit = None

        if "status" in payload.model_fields_set:
            equipment.status = payload.status
            changed_fields.append("статус")

        if "exclude_from_arshin_refresh" in payload.model_fields_set:
            next_exclude_from_arshin_refresh = bool(payload.exclude_from_arshin_refresh)
            if equipment.equipment_type not in {EquipmentType.SI, EquipmentType.ESI}:
                if next_exclude_from_arshin_refresh:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Only SI and ESI equipment can be excluded from Arshin refresh.",
                    )
                equipment.exclude_from_arshin_refresh = False
            else:
                equipment.exclude_from_arshin_refresh = next_exclude_from_arshin_refresh
            changed_fields.append("исключение из проверки Аршина")

        if "current_location_manual" in payload.model_fields_set:
            equipment.current_location_manual = _normalize_optional_text(
                payload.current_location_manual
            )
            changed_fields.append("местонахождение")

        if "compliance_date" in payload.model_fields_set:
            equipment.compliance_date = _normalize_equipment_compliance_date(
                equipment.equipment_type,
                payload.compliance_date,
            )
            changed_fields.append(
                _get_equipment_compliance_date_field_label(equipment.equipment_type)
            )

        if "compliance_interval_months" in payload.model_fields_set:
            equipment.compliance_interval_months = _normalize_equipment_compliance_interval_months(
                equipment.equipment_type,
                payload.compliance_interval_months,
            )
            changed_fields.append(
                _get_equipment_compliance_interval_field_label(equipment.equipment_type)
            )

        if "manual_verification_interval_months" in payload.model_fields_set:
            equipment.manual_verification_interval_months = (
                _normalize_equipment_manual_verification_interval_months(
                    equipment.equipment_type,
                    payload.manual_verification_interval_months,
                )
            )
            changed_fields.append("ручной межповерочный интервал")

        if (
            equipment.equipment_type == EquipmentType.SI
            and equipment.si_verification is not None
            and (
                "manual_verification_interval_months" in payload.model_fields_set
                or "equipment_type" in payload.model_fields_set
            )
        ):
            _sync_equipment_si_valid_date(equipment)

        if current_user is not None and changed_fields:
            self._record_equipment_event(
                action="equipment_updated",
                user=current_user,
                equipment=equipment,
                title=f"Обновлен прибор «{equipment.name}»",
                description="Изменено: " + ", ".join(changed_fields) + ".",
            )

        self._commit_and_flush_process_notifications()
        self.session.refresh(equipment)
        return equipment

    def refresh_si_verification(
        self,
        *,
        equipment_id: int,
        payload: EquipmentSIRefreshRequest,
        current_user: User | None = None,
    ) -> Equipment:
        equipment = self.get_equipment(equipment_id=equipment_id)
        if not _is_arshin_equipment_type(equipment.equipment_type):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Only SI and ESI equipment support Arshin refresh.",
            )

        si_payload = payload.si_verification
        if equipment.equipment_type == EquipmentType.SI and si_payload.detail_payload_json is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="SI refresh requires Arshin detail payload.",
            )

        normalized_vri_id = _normalize_required_text(
            si_payload.vri_id,
            field_label="SI vri_id",
        )
        existing = self.si_verifications.get_by_vri_id(vri_id=normalized_vri_id)
        if existing is not None and existing.equipment_id != equipment.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=self._build_existing_si_message(
                    existing,
                    prefix=(
                        "Запись Аршина с этим номером в перечне уже привязана"
                        if equipment.equipment_type == EquipmentType.ESI
                        else "Запись Аршина с этим свидетельством уже привязана"
                    ),
                ),
            )

        detail = si_payload.detail_payload_json or si_payload.raw_payload_json or {}
        detail_mi = _extract_si_detail_single_mi(detail)
        detail_vri = _extract_si_detail_vri_info(detail)

        equipment.name = _normalize_required_text(
            _first_nonempty_str(
                detail_mi.get("mitypeTitle"),
                detail.get("mitype"),
                si_payload.mit_title,
                equipment.name,
            ),
            field_label="Equipment name",
        )
        equipment.modification = _normalize_optional_text(
            _first_nonempty_str(
                detail_mi.get("modification"),
                detail.get("modification"),
                equipment.modification,
            )
        )
        equipment.serial_number = _normalize_optional_text(
            _first_nonempty_str(
                detail_mi.get("manufactureNum"),
                detail.get("factory_num"),
                si_payload.mi_number,
                equipment.serial_number,
            )
        )
        equipment.manufacture_year = _validate_manufacture_year(
            _first_nonempty_int(
                detail_mi.get("manufactureYear"),
                detail.get("year"),
                equipment.manufacture_year,
            )
        )

        si_verification = self.si_verifications.get_by_equipment_id(equipment_id=equipment.id)
        if si_verification is None:
            si_verification = SIVerification(equipment_id=equipment.id, vri_id="")
            self.si_verifications.add(si_verification)

        si_verification.vri_id = normalized_vri_id
        si_verification.arshin_url = _normalize_long_optional_text(si_payload.arshin_url)
        si_verification.org_title = _normalize_optional_text(
            _first_nonempty_str(
                detail_vri.get("organization"),
                detail.get("organization"),
                si_payload.org_title,
            )
        )
        si_verification.mit_number = _normalize_optional_text(
            _first_nonempty_str(
                detail_mi.get("mitypeNumber"),
                detail.get("mitype_num"),
                si_payload.mit_number,
            )
        )
        si_verification.mit_title = _normalize_optional_text(
            _first_nonempty_str(
                detail_mi.get("mitypeTitle"),
                detail.get("mitype"),
                si_payload.mit_title,
            )
        )
        si_verification.mit_notation = _normalize_optional_text(
            _first_nonempty_str(
                detail_mi.get("mitypeType"),
                detail.get("minotation"),
                si_payload.mit_notation,
            )
        )
        si_verification.mi_number = _normalize_optional_text(
            _first_nonempty_str(
                detail_mi.get("manufactureNum"),
                detail.get("factory_num"),
                si_payload.mi_number,
            )
        )
        si_verification.certificate_number = _resolve_si_certificate_number(
            si_payload,
            equipment_type=equipment.equipment_type,
        )
        si_verification.result_docnum = _normalize_optional_text(
            _first_nonempty_str(
                _normalize_optional_text(detail.get("number"))
                if equipment.equipment_type == EquipmentType.ESI
                else _extract_cert_num_from_detail(detail_vri),
                si_payload.result_docnum,
            )
        )
        si_verification.verification_date = _first_nonempty_datetime(
            _parse_date_to_datetime(detail_vri.get("vrfDate")),
            _parse_date_to_datetime(detail.get("verification_date")),
            si_payload.verification_date,
        )
        si_verification.valid_date = _resolve_equipment_si_valid_date(
            manual_interval_months=equipment.manual_verification_interval_months,
            verification_date=si_verification.verification_date,
            fallback_valid_date=_first_nonempty_datetime(
                _parse_date_to_datetime(detail_vri.get("validDate")),
                _parse_date_to_datetime(detail.get("valid_date")),
                si_payload.valid_date,
            ),
        )
        si_verification.raw_payload_json = si_payload.raw_payload_json
        si_verification.detail_payload_json = si_payload.detail_payload_json
        equipment.created_manually = False
        equipment.exclude_from_arshin_refresh = False

        if equipment.equipment_type == EquipmentType.ESI:
            equipment.measurement_range_start = None
            equipment.measurement_range_end = None
            equipment.measurement_unit = None
            self._sync_internal_esi_modules(
                equipment=equipment,
                si_verification_payload=si_payload,
                requested_modules=None,
            )

        if current_user is not None:
            self._record_equipment_event(
                action="si_refreshed",
                user=current_user,
                equipment=equipment,
                title=(
                    f"Обновлены данные ЭСИ «{equipment.name}» из Аршина"
                    if equipment.equipment_type == EquipmentType.ESI
                    else f"Обновлены данные СИ «{equipment.name}» из Аршина"
                ),
                description=_build_nonempty_description(
                    [
                        _build_named_detail(
                            _get_arshin_document_label(equipment.equipment_type),
                            si_verification.result_docnum,
                        ),
                        _build_named_detail(
                            "Действительно до",
                            self._format_sheet_date(si_verification.valid_date),
                        ),
                    ]
                ),
            )

        self._commit_and_flush_process_notifications()
        self.session.refresh(equipment)
        return equipment

    def add_esi_composition_entry(
        self,
        *,
        equipment_id: int,
        payload: EquipmentESICompositionEntryCreateRequest,
        current_user: User | None = None,
    ) -> EquipmentESICompositionEntry:
        equipment = self.get_equipment(equipment_id=equipment_id)
        if equipment.equipment_type != EquipmentType.ESI:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="ESI composition is available only for ESI equipment.",
            )

        si_payload = payload.si_verification
        normalized_vri_id = _normalize_required_text(
            si_payload.vri_id,
            field_label="ESI composition vri_id",
        )
        if si_payload.detail_payload_json is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="ESI composition entry requires Arshin detail payload.",
            )

        if (
            equipment.si_verification is not None
            and equipment.si_verification.vri_id == normalized_vri_id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Эта запись Аршина уже используется как основная карточка ЭСИ.",
            )

        existing_entry = self.esi_composition_entries.get_by_equipment_and_vri_id(
            equipment_id=equipment.id,
            vri_id=normalized_vri_id,
        )
        if existing_entry is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Эта запись Аршина уже добавлена в состав ЭСИ.",
            )

        entry = self.esi_composition_entries.add(
            EquipmentESICompositionEntry(
                equipment_id=equipment.id,
                module_kind=payload.module_kind,
                vri_id=normalized_vri_id,
                measurement_limit=_normalize_measurement_limit(payload.measurement_limit),
                sort_order=self._get_next_esi_module_sort_order(
                    equipment_id=equipment.id,
                    module_kind=payload.module_kind,
                ),
                arshin_url=_normalize_long_optional_text(si_payload.arshin_url),
                org_title=_normalize_optional_text(si_payload.org_title),
                mit_number=_normalize_optional_text(si_payload.mit_number),
                mit_title=_normalize_optional_text(si_payload.mit_title),
                mit_notation=_normalize_optional_text(si_payload.mit_notation),
                mi_number=_normalize_optional_text(si_payload.mi_number),
                result_docnum=_normalize_optional_text(si_payload.result_docnum),
                verification_date=si_payload.verification_date,
                valid_date=si_payload.valid_date,
                raw_payload_json=si_payload.raw_payload_json,
                detail_payload_json=si_payload.detail_payload_json,
            )
        )

        if current_user is not None:
            entry_label = _normalize_optional_text(
                _first_nonempty_str(
                    si_payload.mit_title,
                    si_payload.mit_notation,
                    si_payload.mi_number,
                    si_payload.result_docnum,
                )
            )
            self._record_equipment_event(
                action="esi_composition_entry_added",
                user=current_user,
                equipment=equipment,
                title=f"В состав ЭСИ «{equipment.name}» добавлен модуль",
                description=_build_nonempty_description(
                    [
                        _build_named_detail(
                            "Тип модуля",
                            _get_esi_module_kind_label(payload.module_kind),
                        ),
                        _build_named_detail("Запись Аршина", si_payload.result_docnum),
                        _build_named_detail("Наименование", entry_label),
                        _build_named_detail(
                            "Предел измерения",
                            _normalize_measurement_limit(payload.measurement_limit),
                        ),
                        _build_named_detail(
                            _get_arshin_document_label(EquipmentType.SI),
                            _extract_cert_num_from_detail(si_payload.detail_payload_json),
                        ),
                    ]
                ),
            )

        self._commit_and_flush_process_notifications()
        self.session.refresh(entry)
        return entry

    def update_esi_composition_entry(
        self,
        *,
        equipment_id: int,
        entry_id: int,
        payload: EquipmentESICompositionEntryUpdateRequest,
        current_user: User | None = None,
    ) -> EquipmentESICompositionEntry:
        equipment = self.get_equipment(equipment_id=equipment_id)
        if equipment.equipment_type != EquipmentType.ESI:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="ESI composition is available only for ESI equipment.",
            )
        entry = self._get_esi_composition_entry(
            equipment_id=equipment.id,
            entry_id=entry_id,
        )
        if "measurement_limit" in payload.model_fields_set:
            entry.measurement_limit = _normalize_measurement_limit(payload.measurement_limit)

        if current_user is not None:
            self._record_equipment_event(
                action="esi_composition_entry_updated",
                user=current_user,
                equipment=equipment,
                title=f"Обновлен модуль в составе ЭСИ «{equipment.name}»",
                description=_build_nonempty_description(
                    [
                        _build_named_detail("Запись Аршина", entry.result_docnum),
                        _build_named_detail(
                            "Тип модуля",
                            _get_esi_module_kind_label(entry.module_kind),
                        ),
                        _build_named_detail("Предел измерения", entry.measurement_limit),
                    ]
                ),
            )

        self._commit_and_flush_process_notifications()
        self.session.refresh(entry)
        return entry

    def delete_esi_composition_entry(
        self,
        *,
        equipment_id: int,
        entry_id: int,
        current_user: User | None = None,
    ) -> None:
        equipment = self.get_equipment(equipment_id=equipment_id)
        if equipment.equipment_type != EquipmentType.ESI:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="ESI composition is available only for ESI equipment.",
            )
        entry = self._get_esi_composition_entry(
            equipment_id=equipment.id,
            entry_id=entry_id,
        )
        if entry.module_kind == ESIModuleKind.INTERNAL:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Internal ESI modules are updated from the main Arshin profile "
                    "and cannot be removed manually."
                ),
            )

        if current_user is not None:
            self._record_equipment_event(
                action="esi_composition_entry_deleted",
                user=current_user,
                equipment=equipment,
                title=f"Из состава ЭСИ «{equipment.name}» удален модуль",
                description=_build_nonempty_description(
                    [
                        _build_named_detail("Запись Аршина", entry.result_docnum),
                        _build_named_detail("Предел измерения", entry.measurement_limit),
                    ]
                ),
            )

        self.esi_composition_entries.delete(entry)
        self._commit_and_flush_process_notifications()

    def _get_folder_refresh_task(
        self,
        *,
        folder_id: int,
        task_id: int,
    ) -> EquipmentFolderRefreshTask:
        self._get_folder(folder_id)
        task = self.folder_refresh_tasks.get_by_id(task_id=task_id)
        if task is None or task.folder_id != folder_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Задача обновления по папке не найдена.",
            )
        return task

    def _finalize_stale_folder_refresh_task(
        self,
        task: EquipmentFolderRefreshTask,
    ) -> bool:
        if task.status not in {
            EquipmentFolderRefreshTaskStatus.PENDING,
            EquipmentFolderRefreshTaskStatus.PROCESSING,
        }:
            return False

        reference_timestamp = task.updated_at or task.created_at
        if datetime.now(tz=UTC) - reference_timestamp < FOLDER_REFRESH_TASK_STALE_TIMEOUT:
            return False

        task.status = EquipmentFolderRefreshTaskStatus.FAILED
        task.completed_at = datetime.now(tz=UTC)
        task.error_message = (
            "Предыдущая задача обновления была прервана и закрыта автоматически. "
            "Запусти проверку еще раз."
        )
        self.session.commit()
        return True

    def _build_folder_refresh_targets(
        self,
        *,
        folder_id: int,
        equipment_ids: list[int] | None = None,
    ) -> list[FolderRefreshTarget]:
        items = self.list_equipment(
            folder_id=folder_id,
            equipment_ids=equipment_ids,
        )
        targets: list[FolderRefreshTarget] = []
        sort_order = 0

        for equipment in items:
            if equipment.equipment_type not in {EquipmentType.SI, EquipmentType.ESI}:
                continue
            if equipment.exclude_from_arshin_refresh:
                continue
            if equipment.si_verification is None:
                continue

            if equipment.equipment_type == EquipmentType.SI:
                targets.append(
                    FolderRefreshTarget(
                        sort_order=sort_order,
                        target_kind=EquipmentFolderRefreshTargetKind.SI,
                        equipment=equipment,
                        composition_entry=None,
                        module_kind=None,
                        equipment_name=equipment.name,
                        equipment_modification=equipment.modification,
                        equipment_serial_number=equipment.serial_number,
                        target_title=equipment.name,
                        target_serial_number=equipment.serial_number,
                        target_registry_number=None,
                        measurement_limit=None,
                        current_certificate_number=_resolve_stored_si_certificate_number(
                            equipment.si_verification,
                            equipment_type=equipment.equipment_type,
                        ),
                        current_verification_date=equipment.si_verification.verification_date,
                        current_valid_date=equipment.si_verification.valid_date,
                    )
                )
                sort_order += 1
                continue

            targets.append(
                FolderRefreshTarget(
                    sort_order=sort_order,
                    target_kind=EquipmentFolderRefreshTargetKind.ESI,
                    equipment=equipment,
                    composition_entry=None,
                    module_kind=None,
                    equipment_name=equipment.name,
                    equipment_modification=equipment.modification,
                    equipment_serial_number=equipment.serial_number,
                    target_title=equipment.name,
                    target_serial_number=equipment.serial_number,
                    target_registry_number=_normalize_optional_text(
                        equipment.si_verification.result_docnum
                    ),
                    measurement_limit=None,
                    current_certificate_number=_extract_root_esi_certificate_number(equipment),
                    current_verification_date=equipment.si_verification.verification_date,
                    current_valid_date=equipment.si_verification.valid_date,
                )
            )
            sort_order += 1

            for entry in self.esi_composition_entries.list_by_equipment_id(
                equipment_id=equipment.id
            ):
                targets.append(
                    FolderRefreshTarget(
                        sort_order=sort_order,
                        target_kind=(
                            EquipmentFolderRefreshTargetKind.ESI_INTERNAL
                            if entry.module_kind == ESIModuleKind.INTERNAL
                            else EquipmentFolderRefreshTargetKind.ESI_EXTERNAL
                        ),
                        equipment=equipment,
                        composition_entry=entry,
                        module_kind=entry.module_kind,
                        equipment_name=equipment.name,
                        equipment_modification=equipment.modification,
                        equipment_serial_number=equipment.serial_number,
                        target_title=_normalize_optional_text(
                            _first_nonempty_str(entry.mit_title, entry.mit_notation)
                        ),
                        target_serial_number=entry.mi_number,
                        target_registry_number=entry.result_docnum,
                        measurement_limit=entry.measurement_limit,
                        current_certificate_number=_extract_esi_module_certificate_number(entry),
                        current_verification_date=entry.verification_date,
                        current_valid_date=entry.valid_date,
                    )
                )
                sort_order += 1

        return targets

    async def _build_folder_refresh_row(
        self,
        *,
        task_id: int,
        target: FolderRefreshTarget,
    ) -> EquipmentFolderRefreshRow:
        row = EquipmentFolderRefreshRow(
            task_id=task_id,
            equipment_id=target.equipment.id,
            composition_entry_id=target.composition_entry.id if target.composition_entry else None,
            sort_order=target.sort_order,
            target_kind=target.target_kind,
            module_kind=target.module_kind,
            equipment_name=target.equipment_name,
            equipment_modification=target.equipment_modification,
            equipment_serial_number=target.equipment_serial_number,
            target_title=target.target_title,
            target_serial_number=target.target_serial_number,
            target_registry_number=target.target_registry_number,
            measurement_limit=target.measurement_limit,
            current_certificate_number=target.current_certificate_number,
            current_verification_date=target.current_verification_date,
            current_valid_date=target.current_valid_date,
            status=EquipmentFolderRefreshRowStatus.ERROR,
            uncertain_update=False,
            notes=None,
            matched_vri_id=None,
            matched_arshin_url=None,
            matched_registry_number=None,
            matched_certificate_number=None,
            matched_verification_date=None,
            matched_valid_date=None,
            matched_payload_json=None,
        )

        if target.current_certificate_number is None:
            row.notes = "У текущей записи не заполнен номер свидетельства."
            return row

        try:
            match = await self._match_folder_refresh_target_with_retry(target=target)
        except HTTPException as exc:
            row.notes = str(exc.detail)
            return row
        except Exception as exc:
            row.notes = str(exc)
            return row

        row.uncertain_update = match.uncertain_update
        row.stage2_successful = match.stage2_successful
        row.modification_relaxed = match.modification_relaxed
        row.notation_relaxed = match.notation_relaxed
        row.notes = match.notes
        row.matched_vri_id = match.matched_vri_id
        row.matched_arshin_url = _normalize_long_optional_text(match.matched_arshin_url)
        row.matched_registry_number = _normalize_optional_text(
            match.matched_registry_number
            or (match.payload.result_docnum if match.payload is not None else None)
        )
        row.matched_certificate_number = _normalize_optional_text(match.matched_certificate_number)
        row.matched_verification_date = match.matched_verification_date
        row.matched_valid_date = _resolve_equipment_si_valid_date(
            manual_interval_months=target.equipment.manual_verification_interval_months,
            verification_date=match.matched_verification_date,
            fallback_valid_date=match.matched_valid_date,
        )
        row.matched_payload_json = (
            match.payload.model_dump(mode="json") if match.payload is not None else None
        )
        row.status = _map_folder_refresh_row_status(
            match=match,
            created_manually=(
                target.equipment.created_manually
                and target.target_kind
                in {
                    EquipmentFolderRefreshTargetKind.SI,
                    EquipmentFolderRefreshTargetKind.ESI,
                }
            ),
        )
        if target.equipment.created_manually and match.found and not match.certificate_updated:
            manual_note = "Ручная запись сопоставлена с Аршином."
            row.notes = f"{manual_note} {row.notes}" if row.notes else manual_note
        return row

    async def _match_folder_refresh_target(
        self,
        *,
        target: FolderRefreshTarget,
    ) -> FolderRefreshMatchResult:
        if target.target_kind == EquipmentFolderRefreshTargetKind.SI:
            return await self.folder_refresh_matcher.match_si(
                current_certificate_number=target.current_certificate_number or "",
                current_verification_date=target.current_verification_date,
                current_valid_date=target.current_valid_date,
            )

        return await self.folder_refresh_matcher.match_esi(
            current_certificate_number=target.current_certificate_number or "",
            current_registry_number=target.target_registry_number,
            current_verification_date=target.current_verification_date,
            current_valid_date=target.current_valid_date,
        )

    async def _match_folder_refresh_target_with_retry(
        self,
        *,
        target: FolderRefreshTarget,
    ) -> FolderRefreshMatchResult:
        attempts = max(1, settings.folder_refresh_max_attempts)
        last_exception: Exception | None = None

        for attempt in range(attempts):
            try:
                return await self._match_folder_refresh_target(target=target)
            except Exception as exc:
                if attempt == attempts - 1 or not _is_retryable_arshin_exception(exc):
                    raise
                last_exception = exc
                await asyncio.sleep(_folder_refresh_retry_delay(attempt))

        raise last_exception or RuntimeError("Folder refresh matching failed.")

    def _apply_folder_refresh_row(
        self,
        *,
        row: EquipmentFolderRefreshRow,
        current_user: User,
    ) -> EquipmentFolderRefreshApplyRowResultRead:
        if row.status not in {
            EquipmentFolderRefreshRowStatus.UPDATED,
            EquipmentFolderRefreshRowStatus.UPDATED_UNCERTAIN,
        }:
            return EquipmentFolderRefreshApplyRowResultRead(
                row_id=row.id,
                equipment_id=row.equipment_id,
                composition_entry_id=row.composition_entry_id,
                applied=False,
                message="Эта запись не требует обновления.",
            )

        if not isinstance(row.matched_payload_json, dict):
            return EquipmentFolderRefreshApplyRowResultRead(
                row_id=row.id,
                equipment_id=row.equipment_id,
                composition_entry_id=row.composition_entry_id,
                applied=False,
                message="Для этой строки нет данных обновления.",
            )

        si_payload = SIVerificationCreateRequest.model_validate(row.matched_payload_json)
        if row.target_kind in {
            EquipmentFolderRefreshTargetKind.SI,
            EquipmentFolderRefreshTargetKind.ESI,
        }:
            self.refresh_si_verification(
                equipment_id=row.equipment_id,
                payload=EquipmentSIRefreshRequest(si_verification=si_payload),
                current_user=current_user,
            )
        else:
            if row.composition_entry_id is None:
                return EquipmentFolderRefreshApplyRowResultRead(
                    row_id=row.id,
                    equipment_id=row.equipment_id,
                    composition_entry_id=row.composition_entry_id,
                    applied=False,
                    message="У строки нет связанного модуля ЭСИ.",
                )
            self._refresh_esi_composition_entry_from_payload(
                equipment_id=row.equipment_id,
                entry_id=row.composition_entry_id,
                si_payload=si_payload,
                current_user=current_user,
            )

        row.current_certificate_number = row.matched_certificate_number
        row.current_verification_date = row.matched_verification_date
        row.current_valid_date = row.matched_valid_date
        row.status = EquipmentFolderRefreshRowStatus.UNCHANGED
        row.uncertain_update = False
        row.notes = "Обновление применено."
        self.session.commit()

        return EquipmentFolderRefreshApplyRowResultRead(
            row_id=row.id,
            equipment_id=row.equipment_id,
            composition_entry_id=row.composition_entry_id,
            applied=True,
            message="Обновление применено.",
        )

    def _refresh_esi_composition_entry_from_payload(
        self,
        *,
        equipment_id: int,
        entry_id: int,
        si_payload: SIVerificationCreateRequest,
        current_user: User | None = None,
    ) -> EquipmentESICompositionEntry:
        equipment = self.get_equipment(equipment_id=equipment_id)
        if equipment.equipment_type != EquipmentType.ESI:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="ESI composition is available only for ESI equipment.",
            )
        entry = self._get_esi_composition_entry(
            equipment_id=equipment.id,
            entry_id=entry_id,
        )
        if si_payload.detail_payload_json is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Обновление модуля ЭСИ требует детальной карточки Аршина.",
            )

        normalized_vri_id = _normalize_required_text(
            si_payload.vri_id,
            field_label="ESI composition vri_id",
        )
        existing_entry = self.esi_composition_entries.get_by_equipment_and_vri_id(
            equipment_id=equipment.id,
            vri_id=normalized_vri_id,
        )
        if existing_entry is not None and existing_entry.id != entry.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Эта запись Аршина уже используется другим модулем ЭСИ.",
            )
        if (
            equipment.si_verification is not None
            and equipment.si_verification.vri_id == normalized_vri_id
            and entry.vri_id != normalized_vri_id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Эта запись Аршина уже используется как основная карточка ЭСИ.",
            )

        detail = si_payload.detail_payload_json or si_payload.raw_payload_json or {}
        detail_mi = _extract_si_detail_single_mi(detail)
        detail_vri = _extract_si_detail_vri_info(detail)

        entry.vri_id = normalized_vri_id
        entry.arshin_url = _normalize_long_optional_text(si_payload.arshin_url)
        entry.org_title = _normalize_optional_text(
            _first_nonempty_str(
                detail_vri.get("organization"),
                detail.get("organization"),
                si_payload.org_title,
            )
        )
        entry.mit_number = _normalize_optional_text(
            _first_nonempty_str(
                detail_mi.get("mitypeNumber"),
                detail.get("mitype_num"),
                si_payload.mit_number,
            )
        )
        entry.mit_title = _normalize_optional_text(
            _first_nonempty_str(
                detail_mi.get("mitypeTitle"),
                detail.get("mitype"),
                si_payload.mit_title,
            )
        )
        entry.mit_notation = _normalize_optional_text(
            _first_nonempty_str(
                detail_mi.get("mitypeType"),
                detail.get("minotation"),
                si_payload.mit_notation,
            )
        )
        entry.mi_number = _normalize_optional_text(
            _first_nonempty_str(
                detail_mi.get("manufactureNum"),
                detail.get("factory_num"),
                si_payload.mi_number,
            )
        )
        entry.result_docnum = _normalize_optional_text(
            _first_nonempty_str(
                detail_mi.get("regNumber"),
                detail.get("number"),
                si_payload.result_docnum,
            )
        )
        entry.verification_date = _first_nonempty_datetime(
            _parse_date_to_datetime(detail_vri.get("vrfDate")),
            _parse_date_to_datetime(detail.get("verification_date")),
            si_payload.verification_date,
        )
        entry.valid_date = _first_nonempty_datetime(
            _parse_date_to_datetime(detail_vri.get("validDate")),
            _parse_date_to_datetime(detail.get("valid_date")),
            si_payload.valid_date,
        )
        entry.raw_payload_json = si_payload.raw_payload_json
        entry.detail_payload_json = si_payload.detail_payload_json

        if current_user is not None:
            self._record_equipment_event(
                action="esi_composition_entry_refreshed",
                user=current_user,
                equipment=equipment,
                title=f"Обновлен модуль в составе ЭСИ «{equipment.name}»",
                description=_build_nonempty_description(
                    [
                        _build_named_detail("Запись Аршина", entry.result_docnum),
                        _build_named_detail(
                            _get_arshin_document_label(EquipmentType.SI),
                            _extract_esi_module_certificate_number(entry),
                        ),
                        _build_named_detail("Предел измерения", entry.measurement_limit),
                    ]
                ),
            )

        self._commit_and_flush_process_notifications()
        self.session.refresh(entry)
        return entry

    def _build_folder_refresh_summary(
        self,
        *,
        rows: list[EquipmentFolderRefreshRow],
    ) -> dict[str, int]:
        summary = {
            "total": len(rows),
            "updated": 0,
            "updatedUncertain": 0,
            "unchanged": 0,
            "notFound": 0,
            "error": 0,
        }
        for row in rows:
            if row.status == EquipmentFolderRefreshRowStatus.UPDATED:
                summary["updated"] += 1
            elif row.status == EquipmentFolderRefreshRowStatus.UPDATED_UNCERTAIN:
                summary["updatedUncertain"] += 1
            elif row.status == EquipmentFolderRefreshRowStatus.UNCHANGED:
                summary["unchanged"] += 1
            elif row.status == EquipmentFolderRefreshRowStatus.NOT_FOUND:
                summary["notFound"] += 1
            elif row.status == EquipmentFolderRefreshRowStatus.ERROR:
                summary["error"] += 1
        return summary

    def list_folder_esi_monitoring(
        self,
        *,
        folder_id: int,
    ) -> list[ESIEquipmentMonitoringItemRead]:
        folder = self._get_folder(folder_id)
        items = self.list_equipment(
            folder_id=folder.id,
            equipment_type=EquipmentType.ESI,
        )
        monitoring_items: list[ESIEquipmentMonitoringItemRead] = []
        for equipment in items:
            entries = self.esi_composition_entries.list_by_equipment_id(equipment_id=equipment.id)
            modules = [self._build_esi_monitoring_module(entry) for entry in entries]
            if not modules and equipment.si_verification is not None:
                fallback_module = self._build_legacy_esi_monitoring_module(equipment)
                if fallback_module is not None:
                    modules = [fallback_module]
            if not modules:
                continue
            monitoring_items.append(
                ESIEquipmentMonitoringItemRead(
                    equipment_id=equipment.id,
                    folder_id=equipment.folder_id,
                    equipment_name=equipment.name,
                    equipment_modification=equipment.modification,
                    equipment_serial_number=equipment.serial_number,
                    modules=modules,
                )
            )
        return monitoring_items

    def _sync_internal_esi_modules(
        self,
        *,
        equipment: Equipment,
        si_verification_payload: SIVerificationCreateRequest,
        requested_modules: list[ESIInternalModuleMeasurementRequest] | None,
    ) -> None:
        module_sources = self._build_internal_esi_module_sources(
            si_verification_payload=si_verification_payload
        )
        existing_entries = self.esi_composition_entries.list_by_equipment_id_and_kind(
            equipment_id=equipment.id,
            module_kind=ESIModuleKind.INTERNAL,
        )
        existing_by_registry = {
            _normalize_optional_text(entry.result_docnum): entry
            for entry in existing_entries
            if _normalize_optional_text(entry.result_docnum) is not None
        }
        requested_by_registry = {
            normalized_registry_number: item
            for item in (requested_modules or [])
            if (
                normalized_registry_number := _normalize_required_text(
                    item.registry_number,
                    field_label="ESI module registry number",
                )
            )
        }
        seen_registry_numbers: set[str] = set()

        for index, source in enumerate(module_sources):
            registry_number = _normalize_required_text(
                source["result_docnum"],
                field_label="ESI module registry number",
            )
            seen_registry_numbers.add(registry_number)
            requested_module = requested_by_registry.get(registry_number)
            existing_entry = existing_by_registry.get(registry_number)
            measurement_limit = (
                _normalize_measurement_limit(requested_module.measurement_limit)
                if requested_module is not None
                else (existing_entry.measurement_limit if existing_entry is not None else None)
            )

            if existing_entry is None:
                self.esi_composition_entries.add(
                    EquipmentESICompositionEntry(
                        equipment_id=equipment.id,
                        module_kind=ESIModuleKind.INTERNAL,
                        vri_id=source["vri_id"],
                        measurement_limit=measurement_limit,
                        sort_order=index,
                        arshin_url=source["arshin_url"],
                        org_title=source["org_title"],
                        mit_number=source["mit_number"],
                        mit_title=source["mit_title"],
                        mit_notation=source["mit_notation"],
                        mi_number=source["mi_number"],
                        result_docnum=registry_number,
                        verification_date=source["verification_date"],
                        valid_date=source["valid_date"],
                        raw_payload_json=source["raw_payload_json"],
                        detail_payload_json=source["detail_payload_json"],
                    )
                )
                continue

            existing_entry.vri_id = source["vri_id"]
            existing_entry.measurement_limit = measurement_limit
            existing_entry.sort_order = index
            existing_entry.arshin_url = source["arshin_url"]
            existing_entry.org_title = source["org_title"]
            existing_entry.mit_number = source["mit_number"]
            existing_entry.mit_title = source["mit_title"]
            existing_entry.mit_notation = source["mit_notation"]
            existing_entry.mi_number = source["mi_number"]
            existing_entry.result_docnum = registry_number
            existing_entry.verification_date = source["verification_date"]
            existing_entry.valid_date = source["valid_date"]
            existing_entry.raw_payload_json = source["raw_payload_json"]
            existing_entry.detail_payload_json = source["detail_payload_json"]

        for registry_number, entry in existing_by_registry.items():
            if registry_number not in seen_registry_numbers:
                self.esi_composition_entries.delete(entry)

    def _build_internal_esi_module_sources(
        self,
        *,
        si_verification_payload: SIVerificationCreateRequest,
    ) -> list[dict[str, object | None]]:
        detail_payload = (
            si_verification_payload.detail_payload_json
            if isinstance(si_verification_payload.detail_payload_json, dict)
            else {}
        )
        detail_vri = _extract_si_detail_vri_info(detail_payload)
        detail_mi = _extract_si_detail_single_mi(detail_payload)
        related_profiles = (
            detail_payload.get("metrolog_related_esi_profiles")
            if isinstance(detail_payload.get("metrolog_related_esi_profiles"), list)
            else []
        )
        related_verification_records = (
            detail_payload.get("metrolog_related_esi_verification_records")
            if isinstance(detail_payload.get("metrolog_related_esi_verification_records"), list)
            else []
        )

        verification_by_registry: dict[str, dict] = {}
        for item in related_verification_records:
            if not isinstance(item, dict):
                continue
            registry_number = _normalize_optional_text(_first_nonempty_str(item.get("eta_number")))
            if registry_number is None:
                continue
            existing = verification_by_registry.get(registry_number)
            item_verification_date = _parse_date_to_datetime(item.get("verification_date"))
            existing_verification_date = (
                _parse_date_to_datetime(existing.get("verification_date"))
                if existing is not None
                else None
            )
            if existing is None or (
                item_verification_date is not None
                and (
                    existing_verification_date is None
                    or item_verification_date >= existing_verification_date
                )
            ):
                verification_by_registry[registry_number] = item

        profile_by_registry: dict[str, dict] = {}
        for item in related_profiles:
            if not isinstance(item, dict):
                continue
            registry_number = _normalize_optional_text(_first_nonempty_str(item.get("number")))
            if registry_number is None:
                continue
            profile_by_registry[registry_number] = item

        selected_registry_number = _normalize_optional_text(
            _first_nonempty_str(
                detail_payload.get("number"),
                detail_mi.get("regNumber"),
                si_verification_payload.result_docnum,
            )
        )
        if selected_registry_number is not None:
            profile_by_registry.setdefault(
                selected_registry_number,
                {
                    "number": selected_registry_number,
                    "arshin_url": si_verification_payload.arshin_url,
                    "organization": si_verification_payload.org_title,
                    "mitype_num": _first_nonempty_str(
                        detail_mi.get("mitypeNumber"),
                        detail_payload.get("mitype_num"),
                        si_verification_payload.mit_number,
                    ),
                    "mitype": _first_nonempty_str(
                        detail_mi.get("mitypeTitle"),
                        detail_payload.get("mitype"),
                        si_verification_payload.mit_title,
                    ),
                    "minotation": _first_nonempty_str(
                        detail_mi.get("mitypeType"),
                        detail_payload.get("minotation"),
                        si_verification_payload.mit_notation,
                    ),
                    "modification": _first_nonempty_str(
                        detail_mi.get("modification"),
                        detail_payload.get("modification"),
                    ),
                    "factory_num": _first_nonempty_str(
                        detail_mi.get("manufactureNum"),
                        detail_payload.get("factory_num"),
                        si_verification_payload.mi_number,
                    ),
                    "year": _first_nonempty_int(
                        detail_mi.get("manufactureYear"),
                        detail_payload.get("year"),
                    ),
                    "rankcode": _first_nonempty_str(
                        detail_mi.get("rankCode"),
                        detail_payload.get("rankcode"),
                    ),
                    "rankclass": _first_nonempty_str(
                        detail_mi.get("rankTitle"),
                        detail_payload.get("rankclass"),
                    ),
                    "selected": True,
                },
            )
            verification_by_registry.setdefault(
                selected_registry_number,
                {
                    "vri_id": si_verification_payload.vri_id,
                    "certificate_number": _extract_cert_num_from_detail(detail_vri),
                    "verification_date": (
                        detail_vri.get("vrfDate") or si_verification_payload.verification_date
                    ),
                    "valid_date": detail_vri.get("validDate") or si_verification_payload.valid_date,
                    "organization": (
                        detail_vri.get("organization") or si_verification_payload.org_title
                    ),
                    "selected": True,
                },
            )

        sources: list[dict[str, object | None]] = []
        for registry_number, profile in profile_by_registry.items():
            verification_record = verification_by_registry.get(registry_number)
            vri_id = _normalize_optional_text(
                _first_nonempty_str(
                    verification_record.get("vri_id") if verification_record else None,
                    profile.get("vri_id"),
                    si_verification_payload.vri_id if bool(profile.get("selected")) else None,
                )
            )
            if vri_id is None:
                vri_id = _build_internal_esi_profile_vri_id(registry_number)

            organization = _normalize_optional_text(
                _first_nonempty_str(
                    verification_record.get("organization") if verification_record else None,
                    profile.get("organization"),
                    si_verification_payload.org_title,
                )
            )
            mit_number = _normalize_optional_text(
                _first_nonempty_str(profile.get("mitype_num"), si_verification_payload.mit_number)
            )
            mit_title = _normalize_optional_text(
                _first_nonempty_str(profile.get("mitype"), si_verification_payload.mit_title)
            )
            mit_notation = _normalize_optional_text(
                _first_nonempty_str(
                    profile.get("minotation"),
                    si_verification_payload.mit_notation,
                )
            )
            modification = _normalize_optional_text(
                _first_nonempty_str(profile.get("modification"))
            )
            serial_number = _normalize_optional_text(
                _first_nonempty_str(profile.get("factory_num"), si_verification_payload.mi_number)
            )
            manufacture_year = _first_nonempty_int(profile.get("year"))
            verification_date = _first_nonempty_datetime(
                _parse_date_to_datetime(
                    verification_record.get("verification_date") if verification_record else None
                ),
                _parse_date_to_datetime(profile.get("verification_date")),
                (
                    si_verification_payload.verification_date
                    if bool(profile.get("selected"))
                    else None
                ),
            )
            valid_date = _first_nonempty_datetime(
                _parse_date_to_datetime(
                    verification_record.get("valid_date") if verification_record else None
                ),
                _parse_date_to_datetime(profile.get("valid_date")),
                si_verification_payload.valid_date if bool(profile.get("selected")) else None,
            )
            certificate_number = _normalize_optional_text(
                _first_nonempty_str(
                    verification_record.get("certificate_number") if verification_record else None,
                    profile.get("certificate_number"),
                    (
                        _extract_cert_num_from_detail(detail_vri)
                        if bool(profile.get("selected"))
                        else None
                    ),
                )
            )
            arshin_url = _normalize_long_optional_text(
                _first_nonempty_str(
                    profile.get("arshin_url"),
                    si_verification_payload.arshin_url if bool(profile.get("selected")) else None,
                )
            )

            raw_payload_json = {
                "number": registry_number,
                "rankcode": _normalize_optional_text(_first_nonempty_str(profile.get("rankcode"))),
                "rankclass": _normalize_optional_text(
                    _first_nonempty_str(profile.get("rankclass"))
                ),
                "mitype_num": mit_number,
                "mitype": mit_title,
                "minotation": mit_notation,
                "modification": modification,
                "factory_num": serial_number,
                "year": manufacture_year,
                "verification_date": _format_display_date(verification_date),
                "valid_date": _format_display_date(valid_date),
                "certificate_number": certificate_number,
                "selected": bool(profile.get("selected")),
            }
            detail_payload_json = {
                **raw_payload_json,
                "vriInfo": {
                    "organization": organization,
                    "vrfDate": _format_display_date(verification_date),
                    "validDate": _format_display_date(valid_date),
                    "applicable": {"certNum": certificate_number} if certificate_number else None,
                },
                "miInfo": {
                    "singleMI": {
                        "mitypeNumber": mit_number,
                        "mitypeTitle": mit_title,
                        "mitypeType": mit_notation,
                        "manufactureNum": serial_number,
                        "manufactureYear": manufacture_year,
                        "modification": modification,
                        "rankCode": _normalize_optional_text(
                            _first_nonempty_str(profile.get("rankcode"))
                        ),
                        "rankTitle": _normalize_optional_text(
                            _first_nonempty_str(profile.get("rankclass"))
                        ),
                        "regNumber": registry_number,
                    }
                },
            }

            sources.append(
                {
                    "vri_id": vri_id,
                    "arshin_url": arshin_url,
                    "org_title": organization,
                    "mit_number": mit_number,
                    "mit_title": mit_title,
                    "mit_notation": mit_notation,
                    "mi_number": serial_number,
                    "result_docnum": registry_number,
                    "verification_date": verification_date,
                    "valid_date": valid_date,
                    "raw_payload_json": raw_payload_json,
                    "detail_payload_json": detail_payload_json,
                }
            )

        return sorted(
            sources,
            key=lambda item: (
                1 if item["result_docnum"] == selected_registry_number else 0,
                item["verification_date"] or datetime.min,
                item["result_docnum"] or "",
            ),
            reverse=True,
        )

    def _get_next_esi_module_sort_order(
        self,
        *,
        equipment_id: int,
        module_kind: ESIModuleKind,
    ) -> int:
        existing_entries = self.esi_composition_entries.list_by_equipment_id_and_kind(
            equipment_id=equipment_id,
            module_kind=module_kind,
        )
        if not existing_entries:
            return 0
        return max(entry.sort_order for entry in existing_entries) + 1

    def _get_esi_composition_entry(
        self,
        *,
        equipment_id: int,
        entry_id: int,
    ) -> EquipmentESICompositionEntry:
        entry = self.esi_composition_entries.get_by_id(entry_id=entry_id)
        if entry is None or entry.equipment_id != equipment_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="ESI composition entry not found.",
            )
        return entry

    def _build_esi_monitoring_module(
        self,
        entry: EquipmentESICompositionEntry,
    ) -> ESIEquipmentMonitoringModuleRead:
        verification_arshin_url = None
        if not entry.vri_id.startswith("esi-profile:"):
            verification_arshin_url = f"{settings.arshin_public_results_base_url}{entry.vri_id}"
        return ESIEquipmentMonitoringModuleRead(
            entry_id=entry.id,
            module_kind=entry.module_kind,
            vri_id=entry.vri_id,
            registry_number=entry.result_docnum,
            rank=_extract_esi_module_rank(entry),
            name=entry.mit_title,
            modification=_extract_esi_module_modification(entry),
            serial_number=entry.mi_number,
            measurement_limit=entry.measurement_limit,
            verification_date=self._format_sheet_date(entry.verification_date),
            valid_until=self._format_sheet_date(entry.valid_date),
            certificate_number=_extract_esi_module_certificate_number(entry),
            arshin_url=entry.arshin_url,
            verification_arshin_url=verification_arshin_url,
        )

    def _build_legacy_esi_monitoring_module(
        self,
        equipment: Equipment,
    ) -> ESIEquipmentMonitoringModuleRead | None:
        if equipment.si_verification is None:
            return None
        entry = EquipmentESICompositionEntry(
            equipment_id=equipment.id,
            module_kind=ESIModuleKind.INTERNAL,
            vri_id=equipment.si_verification.vri_id,
            measurement_limit=None,
            sort_order=0,
            arshin_url=equipment.si_verification.arshin_url,
            org_title=equipment.si_verification.org_title,
            mit_number=equipment.si_verification.mit_number,
            mit_title=equipment.si_verification.mit_title,
            mit_notation=equipment.si_verification.mit_notation,
            mi_number=equipment.si_verification.mi_number,
            result_docnum=equipment.si_verification.result_docnum,
            verification_date=equipment.si_verification.verification_date,
            valid_date=equipment.si_verification.valid_date,
            raw_payload_json=equipment.si_verification.raw_payload_json,
            detail_payload_json=equipment.si_verification.detail_payload_json,
        )
        return self._build_esi_monitoring_module(entry)

    async def import_si_from_excel(
        self,
        *,
        file_name: str | None,
        file_path: Path,
        folder_id: int,
        object_name: str,
        status_value: EquipmentStatus,
        current_location_manual: str | None,
        arshin_service: ArshinService | None = None,
        current_user: User | None = None,
    ) -> EquipmentSIBulkImportResultRead:
        self._get_folder(folder_id)

        rows = _extract_certificate_rows_from_table(
            file_name=file_name,
            file_path=file_path,
        )
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Excel file does not contain certificate numbers.",
            )

        arshin = arshin_service or ArshinService()
        result_rows: list[EquipmentSIBulkImportRowRead] = []
        seen_certificates: set[str] = set()

        for row in rows:
            row_number = row.row_number
            certificate_number = row.certificate_number
            normalized_certificate = _normalize_certificate_number(certificate_number)
            if normalized_certificate in seen_certificates:
                result_rows.append(
                    EquipmentSIBulkImportRowRead(
                        row_number=row_number,
                        certificate_number=certificate_number,
                        status="skipped",
                        message="Duplicate certificate number inside the uploaded file.",
                    )
                )
                continue
            seen_certificates.add(normalized_certificate)

            try:
                search_results = await arshin.search_by_certificate(
                    certificate_number=certificate_number,
                    year=row.verification_year,
                )
                matched_result = _select_bulk_import_candidate(
                    certificate_number=certificate_number,
                    results=search_results,
                )
                if matched_result is None:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Arshin search returned multiple ambiguous records.",
                    )

                detail = await arshin.get_vri_detail(vri_id=matched_result.vri_id)
                equipment = self.create_equipment(
                    _build_si_create_request_from_arshin(
                        folder_id=folder_id,
                        object_name=object_name,
                        status_value=status_value,
                        current_location_manual=current_location_manual,
                        result=matched_result,
                        detail=detail,
                    ),
                    current_user=None,
                )
                result_rows.append(
                    EquipmentSIBulkImportRowRead(
                        row_number=row_number,
                        certificate_number=certificate_number,
                        status="created",
                        message="SI equipment item was created from Arshin.",
                        equipment_id=equipment.id,
                        equipment_name=equipment.name,
                        vri_id=matched_result.vri_id,
                    )
                )
            except HTTPException as exc:
                row_status = "skipped" if exc.status_code == status.HTTP_409_CONFLICT else "error"
                result_rows.append(
                    EquipmentSIBulkImportRowRead(
                        row_number=row_number,
                        certificate_number=certificate_number,
                        status=row_status,
                        message=str(exc.detail),
                    )
                )

        result = EquipmentSIBulkImportResultRead(
            total_rows=len(rows),
            created_count=sum(1 for row in result_rows if row.status == "created"),
            skipped_count=sum(1 for row in result_rows if row.status == "skipped"),
            error_count=sum(1 for row in result_rows if row.status == "error"),
            rows=result_rows,
        )
        if current_user is not None:
            folder = self._get_folder(folder_id)
            self._record_event(
                category=EventCategory.EQUIPMENT,
                action="si_imported",
                user=current_user,
                title=f"Выполнен импорт СИ в папку «{folder.name}»",
                description=(
                    f"Создано: {result.created_count}. "
                    f"Пропущено: {result.skipped_count}. "
                    f"Ошибок: {result.error_count}."
                ),
                folder_id=folder.id,
                folder_name=folder.name,
            )
        return result

    def export_equipment_registry_xlsx(
        self,
        *,
        folder_id: int | None = None,
        group_id: int | None = None,
        equipment_ids: list[int] | None = None,
        query: str | None = None,
        status_value: EquipmentStatus | None = None,
        equipment_type: EquipmentType | None = None,
    ) -> Path:
        equipment_items = self.list_equipment(
            folder_id=folder_id,
            group_id=group_id,
            equipment_ids=equipment_ids,
            query=query,
            status=status_value,
            equipment_type=equipment_type,
        )

        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Equipment"
        headers = [
            "Папка",
            "Категория",
            "Статус",
            "Наименование",
            "Модификация",
            "Заводской номер",
            "Год выпуска",
            "Объект",
            "Локация",
            "Номер Аршина",
            "Действительно до",
        ]
        sheet.append(headers)

        for equipment in equipment_items:
            folder_name = None
            if equipment.folder_id is not None:
                folder = self.folders.get_by_id(equipment.folder_id)
                folder_name = folder.name if folder is not None else None

            verification = equipment.si_verification
            sheet.append(
                [
                    folder_name,
                    equipment.equipment_type.value,
                    equipment.status.value,
                    equipment.name,
                    equipment.modification,
                    equipment.serial_number,
                    equipment.manufacture_year,
                    equipment.object_name,
                    equipment.current_location_manual,
                    verification.result_docnum if verification is not None else None,
                    (
                        verification.valid_date.strftime("%d.%m.%Y")
                        if verification is not None and verification.valid_date is not None
                        else None
                    ),
                ]
            )

        return _save_workbook_to_temp_file(workbook)

    def export_repair_queue_xlsx(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
        folder_id: int | None = None,
    ) -> Path:
        items = self.list_repair_queue(
            lifecycle_status=lifecycle_status,
            query=query,
            folder_id=folder_id,
        )
        headers = [
            "Папка",
            "Группа ремонта",
            "Объект",
            "Категория",
            "Наименование",
            "Модификация",
            "Заводской номер",
            "Местонахождение",
            "Откуда",
            "Куда",
            "Отправлено в ремонт",
            "Дедлайн ремонта",
            "Текущий этап",
            "Макс. просрочка, дн.",
            "Номер Аршина",
            "Закрыт",
        ]
        rows: list[list[object | None]] = []
        for item in items:
            folder_name = None
            if item.folder_id is not None:
                folder = self.folders.get_by_id(item.folder_id)
                folder_name = folder.name if folder is not None else None
            rows.append(
                [
                    folder_name,
                    item.batch_name,
                    item.object_name,
                    item.equipment_type.value,
                    item.equipment_name,
                    item.modification,
                    item.serial_number,
                    item.current_location_manual,
                    item.route_city,
                    item.route_destination,
                    self._format_sheet_date(item.sent_to_repair_at),
                    self._format_sheet_date(item.repair_deadline_at),
                    item.current_stage_label,
                    item.max_overdue_days,
                    item.result_docnum,
                    self._format_sheet_date(item.closed_at),
                ]
            )
        return self._build_workbook_bytes(
            sheet_title="Repairs",
            headers=headers,
            rows=rows,
        )

    def export_verification_queue_xlsx(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
        folder_id: int | None = None,
    ) -> Path:
        items = self.list_verification_queue(
            lifecycle_status=lifecycle_status,
            query=query,
            folder_id=folder_id,
        )
        headers = [
            "Папка",
            "Группа поверки",
            "Объект",
            "Наименование",
            "Модификация",
            "Заводской номер",
            "Откуда",
            "Куда",
            "Отправлено в поверку",
            "Состояние",
            "Номер Аршина",
            "Действительно до",
            "Закрыта",
        ]
        rows: list[list[object | None]] = []
        for item in items:
            folder_name = None
            if item.folder_id is not None:
                folder = self.folders.get_by_id(item.folder_id)
                folder_name = folder.name if folder is not None else None
            rows.append(
                [
                    folder_name,
                    item.batch_name,
                    item.object_name,
                    item.equipment_name,
                    item.modification,
                    item.serial_number,
                    item.route_city,
                    item.route_destination,
                    self._format_sheet_date(item.sent_to_verification_at),
                    _get_verification_progress_label(item),
                    item.result_docnum,
                    self._format_sheet_date(item.valid_date),
                    self._format_sheet_date(item.closed_at),
                ]
            )
        return self._build_workbook_bytes(
            sheet_title="Verification",
            headers=headers,
            rows=rows,
        )

    def _build_workbook_bytes(
        self,
        *,
        sheet_title: str,
        headers: list[str],
        rows: list[list[object | None]],
    ) -> Path:
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = sheet_title
        sheet.append(headers)
        for row in rows:
            sheet.append(row)
        return _save_workbook_to_temp_file(workbook)

    def _format_sheet_date(self, value: date | datetime | None) -> str | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            value = value.date()
        return value.strftime("%d.%m.%Y")

    def create_repair(
        self,
        *,
        equipment_id: int,
        payload: RepairCreateRequest,
        current_user: User,
        files: list[UploadedFilePayload] | None = None,
    ) -> Repair:
        equipment = self.get_equipment(equipment_id=equipment_id)
        existing_repair = self.repairs.get_active_by_equipment_id(equipment_id=equipment.id)
        if existing_repair is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Для этого прибора уже есть активный ремонт.",
            )

        sent_to_repair_at = payload.sent_to_repair_at
        deadline_settings = self._get_repair_deadline_settings(folder_id=equipment.folder_id)
        selected_variant = self._get_repair_stage_template_variant_for_folder(
            folder_id=equipment.folder_id,
            is_on_site=payload.is_on_site,
            variant_id=payload.stage_template_variant_id,
        )
        stage_template = self._get_repair_stage_template_for_folder(
            folder_id=equipment.folder_id,
            is_on_site=payload.is_on_site,
            variant_id=payload.stage_template_variant_id,
        )
        start_stage_label = str(stage_template[0]["label"]) if stage_template else "Ремонт"
        repair = Repair(
            equipment_id=equipment.id,
            batch_key=_normalize_optional_text(payload.batch_key),
            batch_name=_normalize_optional_text(payload.batch_name),
            is_on_site=payload.is_on_site,
            route_city=_normalize_required_text(
                payload.route_city,
                field_label="Repair route city",
            ),
            route_destination=_normalize_required_text(
                payload.route_destination,
                field_label="Repair route destination",
            ),
            sent_to_repair_at=sent_to_repair_at,
            repair_deadline_at=sent_to_repair_at
            + timedelta(days=deadline_settings.repair_total_days),
            repair_total_days_snapshot=deadline_settings.repair_total_days,
            registration_after_arrival_days_snapshot=(
                deadline_settings.registration_after_arrival_days
            ),
            incoming_control_after_receipt_days_snapshot=(
                deadline_settings.incoming_control_after_receipt_days
            ),
            payment_after_control_days_snapshot=deadline_settings.payment_after_control_days,
            custom_stages_json=_build_process_custom_stages_from_variant(
                selected_variant,
                anchor_key="sent_to_repair_at",
            ),
        )
        equipment.status = EquipmentStatus.IN_REPAIR
        self.repairs.add(repair)
        normalized_initial_text = _normalize_message_text(payload.initial_message_text)
        initial_message: RepairMessage | None = None
        if normalized_initial_text is not None or files:
            initial_message = self._create_repair_message_record(
                repair=repair,
                author=current_user,
                payload=RepairMessageCreateRequest(
                    text=normalized_initial_text,
                    is_private=payload.initial_message_is_private,
                ),
                files=files or [],
            )
        self._record_event(
            category=EventCategory.REPAIR,
            action="repair_created",
            user=current_user,
            equipment=equipment,
            notification_equipment_ids=[equipment.id],
            batch_key=repair.batch_key,
            title=f"Прибор «{equipment.name}» отправлен в ремонт",
            description=_build_nonempty_description(
                (
                    [_build_named_detail("Формат", "На месте")]
                    if repair.is_on_site
                    else [
                        _build_named_detail("Откуда", repair.route_city),
                        _build_named_detail("Куда", repair.route_destination),
                    ]
                )
                + [
                    _build_named_detail(
                        start_stage_label,
                        self._format_sheet_date(repair.sent_to_repair_at),
                    ),
                    _build_named_detail("Группа", repair.batch_name),
                ]
            ),
        )
        self._commit_and_flush_process_notifications()
        self.session.refresh(repair)
        self._attach_repair_stage_template(repair=repair, folder_id=equipment.folder_id)
        if initial_message is not None:
            self.session.refresh(initial_message)
            self._send_repair_message_mentions(
                repair=repair,
                message=initial_message,
                actor=current_user,
            )
        return repair

    def create_repair_batch(
        self,
        *,
        payload: RepairBulkCreateRequest,
        current_user: User,
        files: list[UploadedFilePayload] | None = None,
    ) -> list[Repair]:
        equipment_ids = list(dict.fromkeys(payload.equipment_ids))
        if not equipment_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Нужно выбрать хотя бы один прибор для ремонта.",
            )

        batch_key = uuid4().hex
        batch_name = _normalize_required_text(
            payload.batch_name,
            field_label="Repair batch name",
        )
        created: list[Repair] = []
        for index, equipment_id in enumerate(equipment_ids):
            created.append(
                self.create_repair(
                    equipment_id=equipment_id,
                    payload=RepairCreateRequest(
                        batch_key=batch_key,
                        batch_name=batch_name,
                        is_on_site=payload.is_on_site,
                        stage_template_variant_id=payload.stage_template_variant_id,
                        route_city=payload.route_city,
                        route_destination=payload.route_destination,
                        sent_to_repair_at=payload.sent_to_repair_at,
                        initial_message_text=payload.initial_message_text if index == 0 else None,
                        initial_message_is_private=payload.initial_message_is_private,
                    ),
                    current_user=current_user,
                    files=files if index == 0 else [],
                )
            )
        return created

    def update_repair_batch_items(
        self,
        *,
        batch_key: str,
        payload: ProcessBatchMembershipUpdateRequest,
        current_user: User,
    ) -> list[Repair]:
        normalized_batch_key = _normalize_required_text(
            batch_key,
            field_label="Repair batch key",
        )
        repairs = self.repairs.list_active_by_batch_key(batch_key=normalized_batch_key)
        if not repairs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Активная группа ремонта не найдена.",
            )
        self._assert_repair_batch_access(repairs)

        anchor = repairs[0]
        existing_ids = {repair.equipment_id for repair in repairs}
        add_ids = [
            equipment_id
            for equipment_id in dict.fromkeys(payload.add_equipment_ids)
            if equipment_id not in existing_ids
        ]
        remove_ids = [
            equipment_id
            for equipment_id in dict.fromkeys(payload.remove_equipment_ids)
            if equipment_id in existing_ids
        ]

        if not add_ids and not remove_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Нужно добавить или удалить хотя бы один прибор из группы ремонта.",
            )
        if len(remove_ids) >= len(repairs):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Нельзя удалить из группы ремонта все приборы сразу.",
            )

        added_labels: list[str] = []
        removed_labels: list[str] = []

        for equipment_id in add_ids:
            new_repair = self._create_repair_from_batch_anchor(
                anchor=anchor,
                equipment_id=equipment_id,
            )
            added_labels.append(_build_equipment_batch_member_label(new_repair.equipment))

        if added_labels:
            self._create_repair_message_record(
                repair=anchor,
                author=current_user,
                payload=RepairMessageCreateRequest(
                    text="В группу ремонта добавлены приборы: "
                    + ", ".join(sorted(added_labels))
                    + "."
                ),
                files=[],
            )
            self._record_event(
                category=EventCategory.REPAIR,
                action="repair_batch_items_added",
                user=current_user,
                title=(
                    "В группу ремонта "
                    f"«{anchor.batch_name or anchor.route_destination}» добавлены приборы"
                ),
                description=f"Добавлено приборов: {len(added_labels)}.",
                equipment=anchor.equipment,
                notification_equipment_ids=sorted(existing_ids | set(add_ids)),
                batch_key=anchor.batch_key,
            )

        message_repair = next(
            (item for item in repairs if item.equipment_id not in remove_ids),
            anchor,
        )
        for repair in repairs:
            if repair.equipment_id not in remove_ids:
                continue
            removed_labels.append(_build_equipment_batch_member_label(repair.equipment))
            self._detach_repair_from_batch(
                repair=repair,
                current_user=current_user,
            )

        if removed_labels:
            self._create_repair_message_record(
                repair=message_repair,
                author=current_user,
                payload=RepairMessageCreateRequest(
                    text="Из группы ремонта выведены приборы: "
                    + ", ".join(sorted(removed_labels))
                    + "."
                ),
                files=[],
            )
            self._record_event(
                category=EventCategory.REPAIR,
                action="repair_batch_items_removed",
                user=current_user,
                title=(
                    "Из группы ремонта "
                    f"«{anchor.batch_name or anchor.route_destination}» выведены приборы"
                ),
                description=f"Удалено приборов: {len(removed_labels)}.",
                equipment=message_repair.equipment,
                notification_equipment_ids=sorted(existing_ids),
                batch_key=anchor.batch_key,
            )

        self._commit_and_flush_process_notifications()
        updated_repairs = self.repairs.list_active_by_batch_key(batch_key=normalized_batch_key)
        for repair in updated_repairs:
            self.session.refresh(repair)
        return updated_repairs

    def update_repair_milestones(
        self,
        *,
        equipment_id: int,
        payload: RepairMilestonesUpdateRequest,
        current_user: User,
    ) -> Repair:
        repair = self._get_active_repair(equipment_id=equipment_id)
        stage_template = self._get_repair_stage_template_for_folder(
            folder_id=repair.equipment.folder_id,
            is_on_site=repair.is_on_site,
            custom_stages_json=repair.custom_stages_json,
        )
        custom_stages_changed = False
        next_sent_to_repair_at = (
            payload.sent_to_repair_at
            if "sent_to_repair_at" in payload.model_fields_set
            else repair.sent_to_repair_at
        )
        if next_sent_to_repair_at is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Дата отправки в ремонт обязательна.",
            )
        _validate_repair_milestone_order(
            stage_template=stage_template,
            sent_to_repair_at=next_sent_to_repair_at,
            arrived_to_destination_at=(
                payload.arrived_to_destination_at
                if "arrived_to_destination_at" in payload.model_fields_set
                else repair.arrived_to_destination_at
            ),
            sent_from_repair_at=(
                payload.sent_from_repair_at
                if "sent_from_repair_at" in payload.model_fields_set
                else repair.sent_from_repair_at
            ),
            sent_from_irkutsk_at=(
                payload.sent_from_irkutsk_at
                if "sent_from_irkutsk_at" in payload.model_fields_set
                else repair.sent_from_irkutsk_at
            ),
            arrived_to_lensk_at=(
                payload.arrived_to_lensk_at
                if "arrived_to_lensk_at" in payload.model_fields_set
                else repair.arrived_to_lensk_at
            ),
            actually_received_at=(
                payload.actually_received_at
                if "actually_received_at" in payload.model_fields_set
                else repair.actually_received_at
            ),
            incoming_control_at=(
                payload.incoming_control_at
                if "incoming_control_at" in payload.model_fields_set
                else repair.incoming_control_at
            ),
            paid_at=(payload.paid_at if "paid_at" in payload.model_fields_set else repair.paid_at),
        )
        if "sent_to_repair_at" in payload.model_fields_set:
            new_sent_to_repair_at = payload.sent_to_repair_at
            if new_sent_to_repair_at is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Дата отправки в ремонт обязательна.",
                )
            if repair.sent_to_repair_at != new_sent_to_repair_at:
                repair.sent_to_repair_at = new_sent_to_repair_at
                repair.repair_deadline_at = new_sent_to_repair_at + timedelta(
                    days=repair.repair_total_days_snapshot
                )
                self._create_repair_message_record(
                    repair=repair,
                    author=current_user,
                    payload=RepairMessageCreateRequest(
                        text=_build_repair_milestone_message(
                            current_user=current_user,
                            milestone_label=str(stage_template[0]["label"]),
                            milestone_date=new_sent_to_repair_at,
                        )
                    ),
                    files=[],
                )
        for field_name, milestone_label in _get_stage_template_labels(stage_template):
            if field_name not in payload.model_fields_set:
                continue
            new_value = getattr(payload, field_name)
            current_value = getattr(repair, field_name)
            if current_value == new_value:
                continue
            setattr(repair, field_name, new_value)
            if new_value is not None:
                self._create_repair_message_record(
                    repair=repair,
                    author=current_user,
                    payload=RepairMessageCreateRequest(
                        text=_build_repair_milestone_message(
                            current_user=current_user,
                            milestone_label=milestone_label,
                            milestone_date=new_value,
                        )
                    ),
                    files=[],
                )

        if "custom_stages" in payload.model_fields_set:
            next_custom_stages = _normalize_process_custom_stages_for_write(
                payload.custom_stages,
                stage_template=stage_template,
            )
            next_custom_stages_with_meta = _merge_process_template_variant_meta(
                repair.custom_stages_json,
                next_custom_stages,
            )
            if repair.custom_stages_json != next_custom_stages_with_meta:
                repair.custom_stages_json = next_custom_stages_with_meta
                custom_stages_changed = True

        changed_labels = _collect_changed_repair_milestone_labels(
            payload=payload,
            stage_template=stage_template,
        )
        if custom_stages_changed:
            changed_labels.append("Доп. этапы")
        if changed_labels:
            self._record_event(
                category=EventCategory.REPAIR,
                action="repair_milestones_updated",
                user=current_user,
                title=f"Обновлены этапы ремонта «{repair.equipment.name}»",
                description="Изменено: " + ", ".join(changed_labels) + ".",
                equipment=repair.equipment,
                notification_equipment_ids=self._get_repair_notification_equipment_ids(repair),
                batch_key=repair.batch_key,
            )

        self._commit_and_flush_process_notifications()
        self.session.refresh(repair)
        self._attach_repair_stage_template(
            repair=repair,
            folder_id=repair.equipment.folder_id,
        )
        return repair

    def update_repair_batch_milestones(
        self,
        *,
        batch_key: str,
        payload: RepairMilestonesUpdateRequest,
        current_user: User,
    ) -> list[Repair]:
        normalized_batch_key = _normalize_required_text(
            batch_key,
            field_label="Repair batch key",
        )
        repairs = self.repairs.list_active_by_batch_key(batch_key=normalized_batch_key)
        if not repairs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Активная группа ремонта не найдена.",
            )
        self._assert_repair_batch_access(repairs)

        anchor = repairs[0]
        stage_template = self._get_repair_stage_template_for_folder(
            folder_id=anchor.equipment.folder_id,
            is_on_site=anchor.is_on_site,
            custom_stages_json=anchor.custom_stages_json,
        )
        custom_stages_changed = False
        next_sent_to_repair_at = (
            payload.sent_to_repair_at
            if "sent_to_repair_at" in payload.model_fields_set
            else anchor.sent_to_repair_at
        )
        if next_sent_to_repair_at is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Дата отправки в ремонт обязательна.",
            )
        _validate_repair_milestone_order(
            stage_template=stage_template,
            sent_to_repair_at=next_sent_to_repair_at,
            arrived_to_destination_at=(
                payload.arrived_to_destination_at
                if "arrived_to_destination_at" in payload.model_fields_set
                else anchor.arrived_to_destination_at
            ),
            sent_from_repair_at=(
                payload.sent_from_repair_at
                if "sent_from_repair_at" in payload.model_fields_set
                else anchor.sent_from_repair_at
            ),
            sent_from_irkutsk_at=(
                payload.sent_from_irkutsk_at
                if "sent_from_irkutsk_at" in payload.model_fields_set
                else anchor.sent_from_irkutsk_at
            ),
            arrived_to_lensk_at=(
                payload.arrived_to_lensk_at
                if "arrived_to_lensk_at" in payload.model_fields_set
                else anchor.arrived_to_lensk_at
            ),
            actually_received_at=(
                payload.actually_received_at
                if "actually_received_at" in payload.model_fields_set
                else anchor.actually_received_at
            ),
            incoming_control_at=(
                payload.incoming_control_at
                if "incoming_control_at" in payload.model_fields_set
                else anchor.incoming_control_at
            ),
            paid_at=(payload.paid_at if "paid_at" in payload.model_fields_set else anchor.paid_at),
        )

        if "sent_to_repair_at" in payload.model_fields_set:
            new_sent_to_repair_at = payload.sent_to_repair_at
            if new_sent_to_repair_at is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Дата отправки в ремонт обязательна.",
                )
            current_values = {item.sent_to_repair_at for item in repairs}
            if len(current_values) != 1 or new_sent_to_repair_at not in current_values:
                for repair in repairs:
                    repair.sent_to_repair_at = new_sent_to_repair_at
                    repair.repair_deadline_at = new_sent_to_repair_at + timedelta(
                        days=repair.repair_total_days_snapshot
                    )
                self._create_repair_message_record(
                    repair=anchor,
                    author=current_user,
                    payload=RepairMessageCreateRequest(
                        text=_build_repair_milestone_message(
                            current_user=current_user,
                            milestone_label=str(stage_template[0]["label"]),
                            milestone_date=new_sent_to_repair_at,
                        )
                    ),
                    files=[],
                )

        for field_name, milestone_label in _get_stage_template_labels(stage_template):
            if field_name not in payload.model_fields_set:
                continue
            new_value = getattr(payload, field_name)
            current_values = {getattr(item, field_name) for item in repairs}
            if len(current_values) == 1 and new_value in current_values:
                continue
            for repair in repairs:
                setattr(repair, field_name, new_value)
            if new_value is not None:
                self._create_repair_message_record(
                    repair=anchor,
                    author=current_user,
                    payload=RepairMessageCreateRequest(
                        text=_build_repair_milestone_message(
                            current_user=current_user,
                            milestone_label=milestone_label,
                            milestone_date=new_value,
                        )
                    ),
                    files=[],
                )

        if "custom_stages" in payload.model_fields_set:
            next_custom_stages = _normalize_process_custom_stages_for_write(
                payload.custom_stages,
                stage_template=stage_template,
            )
            if any(
                repair.custom_stages_json
                != _merge_process_template_variant_meta(
                    repair.custom_stages_json,
                    next_custom_stages,
                )
                for repair in repairs
            ):
                for repair in repairs:
                    repair.custom_stages_json = _merge_process_template_variant_meta(
                        repair.custom_stages_json,
                        next_custom_stages,
                    )
                custom_stages_changed = True

        changed_labels = _collect_changed_repair_milestone_labels(
            payload=payload,
            stage_template=stage_template,
        )
        if custom_stages_changed:
            changed_labels.append("Доп. этапы")
        if changed_labels:
            self._record_event(
                category=EventCategory.REPAIR,
                action="repair_batch_milestones_updated",
                user=current_user,
                title=(
                    "Обновлены этапы группы ремонта "
                    f"«{anchor.batch_name or anchor.route_destination}»"
                ),
                description="Изменено: " + ", ".join(changed_labels) + ".",
                equipment=anchor.equipment,
                notification_equipment_ids=[repair.equipment_id for repair in repairs],
                batch_key=anchor.batch_key,
            )

        self._commit_and_flush_process_notifications()
        for repair in repairs:
            self.session.refresh(repair)
            self._attach_repair_stage_template(
                repair=repair,
                folder_id=repair.equipment.folder_id,
            )
        return repairs

    def close_repair(
        self,
        *,
        equipment_id: int,
        current_user: User,
    ) -> Repair:
        repair = self._get_active_repair(equipment_id=equipment_id)
        stage_template = self._get_repair_stage_template_for_folder(
            folder_id=repair.equipment.folder_id,
            is_on_site=repair.is_on_site,
            custom_stages_json=repair.custom_stages_json,
        )
        last_stage_label, last_stage_date = _get_repair_last_stage_completion(
            repair=repair,
            stage_template=stage_template,
        )
        if last_stage_date is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Ремонт можно завершить только после даты этапа «{last_stage_label}».",
            )

        repair.closed_at = date.today()
        self._record_event(
            category=EventCategory.REPAIR,
            action="repair_closed",
            user=current_user,
            title=f"Ремонт «{repair.equipment.name}» завершен",
            description=_build_nonempty_description(
                [
                    _build_named_detail("Закрыт", self._format_sheet_date(repair.closed_at)),
                ]
            ),
            equipment=repair.equipment,
            notification_equipment_ids=self._get_repair_notification_equipment_ids(repair),
            batch_key=repair.batch_key,
        )
        self._sync_equipment_status(equipment=repair.equipment)
        self._commit_and_flush_process_notifications()
        self.session.refresh(repair)
        self._attach_repair_stage_template(
            repair=repair,
            folder_id=repair.equipment.folder_id,
        )
        return repair

    def close_repair_batch(
        self,
        *,
        batch_key: str,
        current_user: User,
    ) -> list[Repair]:
        normalized_batch_key = _normalize_required_text(
            batch_key,
            field_label="Repair batch key",
        )
        repairs = self.repairs.list_active_by_batch_key(batch_key=normalized_batch_key)
        if not repairs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Активная группа ремонта не найдена.",
            )
        self._assert_repair_batch_access(repairs)
        for repair in repairs:
            stage_template = self._get_repair_stage_template_for_folder(
                folder_id=repair.equipment.folder_id,
                is_on_site=repair.is_on_site,
                custom_stages_json=repair.custom_stages_json,
            )
            last_stage_label, last_stage_date = _get_repair_last_stage_completion(
                repair=repair,
                stage_template=stage_template,
            )
            if last_stage_date is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        "Групповой ремонт можно завершить только после даты этапа "
                        f"«{last_stage_label}»."
                    ),
                )

        closed_at = date.today()
        for repair in repairs:
            repair.closed_at = closed_at
        self._record_event(
            category=EventCategory.REPAIR,
            action="repair_batch_closed",
            user=current_user,
            title=(
                "Группа ремонта "
                f"«{repairs[0].batch_name or repairs[0].route_destination}» завершена"
            ),
            description=f"Закрыто приборов: {len(repairs)}.",
            equipment=repairs[0].equipment,
            notification_equipment_ids=[repair.equipment_id for repair in repairs],
            batch_key=repairs[0].batch_key,
        )
        for repair in repairs:
            self._sync_equipment_status(equipment=repair.equipment)

        self._commit_and_flush_process_notifications()
        for repair in repairs:
            self.session.refresh(repair)
            self._attach_repair_stage_template(
                repair=repair,
                folder_id=repair.equipment.folder_id,
            )
        return repairs

    def delete_repair_archive(
        self,
        *,
        repair_id: int,
    ) -> None:
        repair = self.repairs.get_by_id(repair_id)
        if repair is None or repair.closed_at is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Архив ремонта не найден.",
            )

        repairs: list[Repair]
        if repair.batch_key:
            repairs = self.repairs.list_archived_by_batch_key(batch_key=repair.batch_key)
            if not repairs:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Архив ремонта не найден.",
                )
        else:
            repairs = [repair]

        attachment_paths: list[Path] = []
        if repair.batch_key:
            messages = self.repair_messages.list_by_batch_key(
                batch_key=repair.batch_key,
                include_private=True,
            )
        else:
            messages = self.repair_messages.list_by_repair(
                repair_id=repair.id,
                include_private=True,
            )
        attachment_paths.extend(
            settings.attachment_storage_path / attachment.storage_path
            for message in messages
            for attachment in message.attachments
        )

        for archived_repair in repairs:
            equipment = archived_repair.equipment or self.get_equipment(
                equipment_id=archived_repair.equipment_id
            )
            self._assert_folder_access(
                equipment.folder_id,
                detail="Архив ремонта не найден.",
            )
            self.repairs.delete(archived_repair)

        self._commit_and_flush_process_notifications()

        for file_path in set(attachment_paths):
            if file_path.exists() and file_path.is_file():
                file_path.unlink()

    def create_verification(
        self,
        *,
        equipment_id: int,
        payload: VerificationCreateRequest,
        current_user: User,
        files: list[UploadedFilePayload] | None = None,
    ) -> Verification:
        equipment = self.get_equipment(equipment_id=equipment_id)
        if not _supports_verification(equipment.equipment_type):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Поверка доступна только для СИ и ЭСИ.",
            )

        existing_verification = self.verifications.get_active_by_equipment_id(
            equipment_id=equipment.id
        )
        if existing_verification is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Для этого прибора уже есть активная поверка.",
            )

        sent_to_verification_at = payload.sent_to_verification_at
        flow_mode = _get_verification_flow_mode(
            flow_mode=payload.flow_mode,
            is_on_site=payload.is_on_site,
        )
        is_on_site = _is_verification_on_site(flow_mode)
        selected_variant = self._get_verification_stage_template_variant_for_folder(
            folder_id=equipment.folder_id,
            flow_mode=flow_mode,
            variant_id=payload.stage_template_variant_id,
        )
        stage_template = self._get_verification_stage_template_for_folder(
            folder_id=equipment.folder_id,
            flow_mode=flow_mode,
            variant_id=payload.stage_template_variant_id,
        )
        start_stage_label = str(stage_template[0]["label"]) if stage_template else "Поверка"
        verification = Verification(
            equipment_id=equipment.id,
            batch_key=_normalize_optional_text(payload.batch_key),
            batch_name=_normalize_optional_text(payload.batch_name),
            is_on_site=is_on_site,
            flow_mode=flow_mode,
            route_city=_normalize_required_text(
                payload.route_city,
                field_label="Verification route city",
            ),
            route_destination=_normalize_required_text(
                payload.route_destination,
                field_label="Verification route destination",
            ),
            sent_to_verification_at=sent_to_verification_at,
            custom_stages_json=_build_process_custom_stages_from_variant(
                selected_variant,
                anchor_key="sent_to_verification_at",
            ),
        )
        if self.repairs.get_active_by_equipment_id(equipment_id=equipment.id) is None:
            equipment.status = EquipmentStatus.IN_VERIFICATION
        self.verifications.add(verification)
        normalized_initial_text = _normalize_message_text(payload.initial_message_text)
        initial_message: VerificationMessage | None = None
        if normalized_initial_text is not None or files:
            initial_message = self._create_verification_message_record(
                verification=verification,
                author=current_user,
                payload=VerificationMessageCreateRequest(
                    text=normalized_initial_text,
                    is_private=payload.initial_message_is_private,
                ),
                files=files or [],
            )
        self._record_event(
            category=EventCategory.VERIFICATION,
            action="verification_created",
            user=current_user,
            equipment=equipment,
            notification_equipment_ids=[equipment.id],
            batch_key=verification.batch_key,
            title=f"Прибор «{equipment.name}» отправлен в поверку",
            description=_build_nonempty_description(
                (
                    [_build_named_detail("Формат", _format_verification_flow_mode(flow_mode))]
                    if verification.is_on_site
                    else [
                        _build_named_detail("Откуда", verification.route_city),
                        _build_named_detail("Куда", verification.route_destination),
                    ]
                )
                + [
                    _build_named_detail(
                        start_stage_label,
                        self._format_sheet_date(verification.sent_to_verification_at),
                    ),
                    _build_named_detail("Группа", verification.batch_name),
                ]
            ),
        )
        self._commit_and_flush_process_notifications()
        self.session.refresh(verification)
        self._attach_verification_stage_template(
            verification=verification,
            folder_id=equipment.folder_id,
        )
        if initial_message is not None:
            self.session.refresh(initial_message)
            self._send_verification_message_mentions(
                verification=verification,
                message=initial_message,
                actor=current_user,
            )
        return verification

    def create_verification_batch(
        self,
        *,
        payload: VerificationBulkCreateRequest,
        current_user: User,
        files: list[UploadedFilePayload] | None = None,
    ) -> list[Verification]:
        equipment_ids = list(dict.fromkeys(payload.equipment_ids))
        if not equipment_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Нужно выбрать хотя бы один прибор для групповой поверки.",
            )

        batch_key = uuid4().hex
        batch_name = _normalize_required_text(
            payload.batch_name,
            field_label="Verification batch name",
        )
        created: list[Verification] = []
        for index, equipment_id in enumerate(equipment_ids):
            created.append(
                self.create_verification(
                    equipment_id=equipment_id,
                    payload=VerificationCreateRequest(
                        batch_key=batch_key,
                        batch_name=batch_name,
                        is_on_site=payload.is_on_site,
                        flow_mode=payload.flow_mode,
                        stage_template_variant_id=payload.stage_template_variant_id,
                        route_city=payload.route_city,
                        route_destination=payload.route_destination,
                        sent_to_verification_at=payload.sent_to_verification_at,
                        initial_message_text=payload.initial_message_text if index == 0 else None,
                        initial_message_is_private=payload.initial_message_is_private,
                    ),
                    current_user=current_user,
                    files=files if index == 0 else [],
                )
            )
        return created

    def update_verification_batch_items(
        self,
        *,
        batch_key: str,
        payload: ProcessBatchMembershipUpdateRequest,
        current_user: User,
    ) -> list[Verification]:
        normalized_batch_key = _normalize_required_text(
            batch_key,
            field_label="Verification batch key",
        )
        verifications = self.verifications.list_active_by_batch_key(batch_key=normalized_batch_key)
        if not verifications:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Активная группа поверки не найдена.",
            )
        self._assert_verification_batch_access(verifications)

        anchor = verifications[0]
        existing_ids = {verification.equipment_id for verification in verifications}
        add_ids = [
            equipment_id
            for equipment_id in dict.fromkeys(payload.add_equipment_ids)
            if equipment_id not in existing_ids
        ]
        remove_ids = [
            equipment_id
            for equipment_id in dict.fromkeys(payload.remove_equipment_ids)
            if equipment_id in existing_ids
        ]

        if not add_ids and not remove_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Нужно добавить или удалить хотя бы один прибор из группы поверки.",
            )
        if len(remove_ids) >= len(verifications):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Нельзя удалить из группы поверки все приборы сразу.",
            )

        added_labels: list[str] = []
        removed_labels: list[str] = []

        for equipment_id in add_ids:
            new_verification = self._create_verification_from_batch_anchor(
                anchor=anchor,
                equipment_id=equipment_id,
            )
            added_labels.append(_build_equipment_batch_member_label(new_verification.equipment))

        if added_labels:
            self._create_verification_message_record(
                verification=anchor,
                author=current_user,
                payload=VerificationMessageCreateRequest(
                    text="В группу поверки добавлены приборы: "
                    + ", ".join(sorted(added_labels))
                    + "."
                ),
                files=[],
            )
            self._record_event(
                category=EventCategory.VERIFICATION,
                action="verification_batch_items_added",
                user=current_user,
                title=(
                    "В группу поверки "
                    f"«{anchor.batch_name or anchor.route_destination}» добавлены приборы"
                ),
                description=f"Добавлено СИ: {len(added_labels)}.",
                equipment=anchor.equipment,
                notification_equipment_ids=sorted(existing_ids | set(add_ids)),
                batch_key=anchor.batch_key,
            )

        message_verification = next(
            (item for item in verifications if item.equipment_id not in remove_ids),
            anchor,
        )
        for verification in verifications:
            if verification.equipment_id not in remove_ids:
                continue
            removed_labels.append(_build_equipment_batch_member_label(verification.equipment))
            self._detach_verification_from_batch(
                verification=verification,
                current_user=current_user,
            )

        if removed_labels:
            self._create_verification_message_record(
                verification=message_verification,
                author=current_user,
                payload=VerificationMessageCreateRequest(
                    text="Из группы поверки выведены приборы: "
                    + ", ".join(sorted(removed_labels))
                    + "."
                ),
                files=[],
            )
            self._record_event(
                category=EventCategory.VERIFICATION,
                action="verification_batch_items_removed",
                user=current_user,
                title=(
                    "Из группы поверки "
                    f"«{anchor.batch_name or anchor.route_destination}» выведены приборы"
                ),
                description=f"Удалено СИ: {len(removed_labels)}.",
                equipment=message_verification.equipment,
                notification_equipment_ids=sorted(existing_ids),
                batch_key=anchor.batch_key,
            )

        self._commit_and_flush_process_notifications()
        updated_verifications = self.verifications.list_active_by_batch_key(
            batch_key=normalized_batch_key
        )
        for verification in updated_verifications:
            self.session.refresh(verification)
        return updated_verifications

    def close_verification(
        self,
        *,
        equipment_id: int,
        current_user: User,
    ) -> Verification:
        verification = self._get_active_verification(equipment_id=equipment_id)
        verification.closed_at = date.today()
        self._record_event(
            category=EventCategory.VERIFICATION,
            action="verification_closed",
            user=current_user,
            title=f"Поверка «{verification.equipment.name}» завершена",
            description=_build_nonempty_description(
                [
                    _build_named_detail("Закрыта", self._format_sheet_date(verification.closed_at)),
                ]
            ),
            equipment=verification.equipment,
            notification_equipment_ids=self._get_verification_notification_equipment_ids(
                verification
            ),
            batch_key=verification.batch_key,
        )
        self._sync_equipment_status(equipment=verification.equipment)
        self._commit_and_flush_process_notifications()
        self.session.refresh(verification)
        self._attach_verification_stage_template(
            verification=verification,
            folder_id=verification.equipment.folder_id,
        )
        return verification

    def close_verification_batch(
        self,
        *,
        batch_key: str,
        current_user: User,
    ) -> list[Verification]:
        normalized_batch_key = _normalize_required_text(
            batch_key,
            field_label="Verification batch key",
        )
        verifications = self.verifications.list_active_by_batch_key(batch_key=normalized_batch_key)
        if not verifications:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Активная группа поверки не найдена.",
            )
        self._assert_verification_batch_access(verifications)

        closed_at = date.today()
        for verification in verifications:
            verification.closed_at = closed_at
        self._record_event(
            category=EventCategory.VERIFICATION,
            action="verification_batch_closed",
            user=current_user,
            title=(
                "Группа поверки "
                f"«{verifications[0].batch_name or verifications[0].route_destination}» завершена"
            ),
            description=f"Закрыто СИ: {len(verifications)}.",
            equipment=verifications[0].equipment,
            notification_equipment_ids=[
                verification.equipment_id for verification in verifications
            ],
            batch_key=verifications[0].batch_key,
        )
        for verification in verifications:
            self._sync_equipment_status(equipment=verification.equipment)

        self._commit_and_flush_process_notifications()
        for verification in verifications:
            self.session.refresh(verification)
            self._attach_verification_stage_template(
                verification=verification,
                folder_id=verification.equipment.folder_id,
            )
        return verifications

    def delete_verification_archive(
        self,
        *,
        verification_id: int,
    ) -> None:
        verification = self.verifications.get_by_id(verification_id)
        if verification is None or verification.closed_at is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Архив поверки не найден.",
            )

        verifications: list[Verification]
        if verification.batch_key:
            verifications = self.verifications.list_archived_by_batch_key(
                batch_key=verification.batch_key
            )
            if not verifications:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Архив поверки не найден.",
                )
        else:
            verifications = [verification]

        attachment_paths: list[Path] = []
        if verification.batch_key:
            messages = self.verification_messages.list_by_batch_key(
                batch_key=verification.batch_key,
                include_private=True,
            )
        else:
            messages = self.verification_messages.list_by_verification(
                verification_id=verification.id,
                include_private=True,
            )
        attachment_paths.extend(
            settings.attachment_storage_path / attachment.storage_path
            for message in messages
            for attachment in message.attachments
        )

        for archived_verification in verifications:
            equipment = archived_verification.equipment or self.get_equipment(
                equipment_id=archived_verification.equipment_id
            )
            self._assert_folder_access(
                equipment.folder_id,
                detail="Архив поверки не найден.",
            )
            self.verifications.delete(archived_verification)

        self._commit_and_flush_process_notifications()

        for file_path in set(attachment_paths):
            if file_path.exists() and file_path.is_file():
                file_path.unlink()

    def update_verification_milestones(
        self,
        *,
        equipment_id: int,
        payload: VerificationMilestonesUpdateRequest,
        current_user: User,
    ) -> Verification:
        verification = self._get_active_verification(equipment_id=equipment_id)
        flow_mode = _get_verification_flow_mode(
            flow_mode=verification.flow_mode,
            is_on_site=verification.is_on_site,
        )
        stage_template = self._get_verification_stage_template_for_folder(
            folder_id=verification.equipment.folder_id,
            flow_mode=flow_mode,
            custom_stages_json=verification.custom_stages_json,
        )
        custom_stages_changed = False
        _validate_verification_milestone_order(
            stage_template=stage_template,
            sent_to_verification_at=verification.sent_to_verification_at,
            received_at_destination_at=(
                payload.received_at_destination_at
                if "received_at_destination_at" in payload.model_fields_set
                else verification.received_at_destination_at
            ),
            handed_to_csm_at=(
                payload.handed_to_csm_at
                if "handed_to_csm_at" in payload.model_fields_set
                else verification.handed_to_csm_at
            ),
            verification_completed_at=(
                payload.verification_completed_at
                if "verification_completed_at" in payload.model_fields_set
                else verification.verification_completed_at
            ),
            picked_up_from_csm_at=(
                payload.picked_up_from_csm_at
                if "picked_up_from_csm_at" in payload.model_fields_set
                else verification.picked_up_from_csm_at
            ),
            shipped_back_at=(
                payload.shipped_back_at
                if "shipped_back_at" in payload.model_fields_set
                else verification.shipped_back_at
            ),
            returned_from_verification_at=(
                payload.returned_from_verification_at
                if "returned_from_verification_at" in payload.model_fields_set
                else verification.returned_from_verification_at
            ),
        )
        for field_name, milestone_label in _get_stage_template_labels(stage_template):
            if field_name not in payload.model_fields_set:
                continue
            new_value = getattr(payload, field_name)
            current_value = getattr(verification, field_name)
            if current_value == new_value:
                continue
            setattr(verification, field_name, new_value)
            if new_value is not None:
                self._create_verification_message_record(
                    verification=verification,
                    author=current_user,
                    payload=VerificationMessageCreateRequest(
                        text=_build_verification_milestone_message(
                            current_user=current_user,
                            milestone_label=milestone_label,
                            milestone_date=new_value,
                        )
                    ),
                    files=[],
                )

        if "custom_stages" in payload.model_fields_set:
            next_custom_stages = _normalize_process_custom_stages_for_write(
                payload.custom_stages,
                stage_template=stage_template,
            )
            next_custom_stages_with_meta = _merge_process_template_variant_meta(
                verification.custom_stages_json,
                next_custom_stages,
            )
            if verification.custom_stages_json != next_custom_stages_with_meta:
                verification.custom_stages_json = next_custom_stages_with_meta
                custom_stages_changed = True

        changed_labels = _collect_changed_verification_milestone_labels(
            payload=payload,
            stage_template=stage_template,
        )
        if custom_stages_changed:
            changed_labels.append("Доп. этапы")
        if changed_labels:
            self._record_event(
                category=EventCategory.VERIFICATION,
                action="verification_milestones_updated",
                user=current_user,
                title=f"Обновлены этапы поверки «{verification.equipment.name}»",
                description="Изменено: " + ", ".join(changed_labels) + ".",
                equipment=verification.equipment,
                notification_equipment_ids=self._get_verification_notification_equipment_ids(
                    verification
                ),
                batch_key=verification.batch_key,
            )

        self._commit_and_flush_process_notifications()
        self.session.refresh(verification)
        self._attach_verification_stage_template(
            verification=verification,
            folder_id=verification.equipment.folder_id,
        )
        return verification

    def update_verification_batch_milestones(
        self,
        *,
        batch_key: str,
        payload: VerificationMilestonesUpdateRequest,
        current_user: User,
    ) -> list[Verification]:
        normalized_batch_key = _normalize_required_text(
            batch_key,
            field_label="Verification batch key",
        )
        verifications = self.verifications.list_active_by_batch_key(batch_key=normalized_batch_key)
        if not verifications:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Активная группа поверки не найдена.",
            )
        self._assert_verification_batch_access(verifications)

        anchor = verifications[0]
        flow_mode = _get_verification_flow_mode(
            flow_mode=anchor.flow_mode,
            is_on_site=anchor.is_on_site,
        )
        stage_template = self._get_verification_stage_template_for_folder(
            folder_id=anchor.equipment.folder_id,
            flow_mode=flow_mode,
            custom_stages_json=anchor.custom_stages_json,
        )
        custom_stages_changed = False
        _validate_verification_milestone_order(
            stage_template=stage_template,
            sent_to_verification_at=anchor.sent_to_verification_at,
            received_at_destination_at=(
                payload.received_at_destination_at
                if "received_at_destination_at" in payload.model_fields_set
                else anchor.received_at_destination_at
            ),
            handed_to_csm_at=(
                payload.handed_to_csm_at
                if "handed_to_csm_at" in payload.model_fields_set
                else anchor.handed_to_csm_at
            ),
            verification_completed_at=(
                payload.verification_completed_at
                if "verification_completed_at" in payload.model_fields_set
                else anchor.verification_completed_at
            ),
            picked_up_from_csm_at=(
                payload.picked_up_from_csm_at
                if "picked_up_from_csm_at" in payload.model_fields_set
                else anchor.picked_up_from_csm_at
            ),
            shipped_back_at=(
                payload.shipped_back_at
                if "shipped_back_at" in payload.model_fields_set
                else anchor.shipped_back_at
            ),
            returned_from_verification_at=(
                payload.returned_from_verification_at
                if "returned_from_verification_at" in payload.model_fields_set
                else anchor.returned_from_verification_at
            ),
        )
        for field_name, milestone_label in _get_stage_template_labels(stage_template):
            if field_name not in payload.model_fields_set:
                continue
            new_value = getattr(payload, field_name)
            current_values = {getattr(item, field_name) for item in verifications}
            if len(current_values) == 1 and new_value in current_values:
                continue
            for verification in verifications:
                setattr(verification, field_name, new_value)
            if new_value is not None:
                self._create_verification_message_record(
                    verification=anchor,
                    author=current_user,
                    payload=VerificationMessageCreateRequest(
                        text=_build_verification_milestone_message(
                            current_user=current_user,
                            milestone_label=milestone_label,
                            milestone_date=new_value,
                        )
                    ),
                    files=[],
                )

        if "custom_stages" in payload.model_fields_set:
            next_custom_stages = _normalize_process_custom_stages_for_write(
                payload.custom_stages,
                stage_template=stage_template,
            )
            if any(
                verification.custom_stages_json
                != _merge_process_template_variant_meta(
                    verification.custom_stages_json,
                    next_custom_stages,
                )
                for verification in verifications
            ):
                for verification in verifications:
                    verification.custom_stages_json = _merge_process_template_variant_meta(
                        verification.custom_stages_json, next_custom_stages
                    )
                custom_stages_changed = True

        changed_labels = _collect_changed_verification_milestone_labels(
            payload=payload,
            stage_template=stage_template,
        )
        if custom_stages_changed:
            changed_labels.append("Доп. этапы")
        if changed_labels:
            self._record_event(
                category=EventCategory.VERIFICATION,
                action="verification_batch_milestones_updated",
                user=current_user,
                title=(
                    "Обновлены этапы группы поверки "
                    f"«{anchor.batch_name or anchor.route_destination}»"
                ),
                description="Изменено: " + ", ".join(changed_labels) + ".",
                equipment=anchor.equipment,
                notification_equipment_ids=[
                    verification.equipment_id for verification in verifications
                ],
                batch_key=anchor.batch_key,
            )

        self._commit_and_flush_process_notifications()
        for verification in verifications:
            self.session.refresh(verification)
            self._attach_verification_stage_template(
                verification=verification,
                folder_id=verification.equipment.folder_id,
            )
        return verifications

    def list_active_repair_messages(self, *, equipment_id: int) -> list[RepairMessage]:
        repair = self._get_active_repair(equipment_id=equipment_id)
        if repair.batch_key:
            return self.repair_messages.list_by_batch_key(
                batch_key=repair.batch_key,
                include_private=self._can_view_private_notes(),
            )
        return self.repair_messages.list_by_repair(
            repair_id=repair.id,
            include_private=self._can_view_private_notes(),
        )

    def list_active_verification_messages(
        self,
        *,
        equipment_id: int,
    ) -> list[VerificationMessage]:
        verification = self._get_active_verification(equipment_id=equipment_id)
        if verification.batch_key:
            return self.verification_messages.list_by_batch_key(
                batch_key=verification.batch_key,
                include_private=self._can_view_private_notes(),
            )
        return self.verification_messages.list_by_verification(
            verification_id=verification.id,
            include_private=self._can_view_private_notes(),
        )

    def create_repair_message(
        self,
        *,
        equipment_id: int,
        payload: RepairMessageCreateRequest,
        author: User,
        files: list[UploadedFilePayload] | None = None,
    ) -> RepairMessage:
        repair = self._get_active_repair(equipment_id=equipment_id)
        message = self._create_repair_message_record(
            repair=repair,
            author=author,
            payload=payload,
            files=files or [],
        )
        if not message.is_private:
            self._record_event(
                category=EventCategory.REPAIR,
                action="repair_message_created",
                user=author,
                title=f"Добавлено сообщение по ремонту «{repair.equipment.name}»",
                description=_build_message_event_description(
                    text=payload.text,
                    attachment_count=len(files or []),
                ),
                equipment=repair.equipment,
                notification_equipment_ids=self._get_repair_notification_equipment_ids(repair),
                batch_key=repair.batch_key,
            )
        self._commit_comment_visibility_change(is_private=message.is_private)
        self.session.refresh(message)
        self._send_repair_message_mentions(
            repair=repair,
            message=message,
            actor=author,
        )
        return message

    def update_repair_message(
        self,
        *,
        equipment_id: int,
        message_id: int,
        payload: RepairMessageUpdateRequest,
        current_user: User,
    ) -> RepairMessage:
        repair = self._get_active_repair(equipment_id=equipment_id)
        message = self._get_repair_message(
            repair=repair,
            message_id=message_id,
        )
        self._assert_repair_message_editor(
            message=message,
            current_user=current_user,
        )
        previous_text = message.text
        normalized_text = _normalize_message_text(payload.text)
        if normalized_text is None and not message.attachments:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Сообщение ремонта должно содержать текст или хотя бы одно вложение.",
            )
        message.text = normalized_text
        if not message.is_private:
            self._record_event(
                category=EventCategory.REPAIR,
                action="repair_message_updated",
                user=current_user,
                title=f"Обновлено сообщение по ремонту «{repair.equipment.name}»",
                description=_build_preview_description(message.text),
                equipment=repair.equipment,
                notification_equipment_ids=self._get_repair_notification_equipment_ids(repair),
                batch_key=repair.batch_key,
            )
        self._commit_comment_visibility_change(is_private=message.is_private)
        self.session.refresh(message)
        self._send_repair_message_mentions(
            repair=repair,
            message=message,
            actor=current_user,
            previous_text=previous_text,
        )
        return message

    def delete_repair_message(
        self,
        *,
        equipment_id: int,
        message_id: int,
        current_user: User,
    ) -> None:
        repair = self._get_active_repair(equipment_id=equipment_id)
        message = self._get_repair_message(
            repair=repair,
            message_id=message_id,
        )
        self._assert_repair_message_owner(
            message=message,
            current_user=current_user,
        )

        attachment_paths = [
            settings.attachment_storage_path / attachment.storage_path
            for attachment in message.attachments
        ]
        message_preview = message.text
        for attachment in message.attachments:
            self.repair_message_attachments.delete(attachment)
        self.repair_messages.delete(message)
        if not message.is_private:
            self._record_event(
                category=EventCategory.REPAIR,
                action="repair_message_deleted",
                user=current_user,
                title=f"Удалено сообщение по ремонту «{repair.equipment.name}»",
                description=_build_preview_description(message_preview),
                equipment=repair.equipment,
                notification_equipment_ids=self._get_repair_notification_equipment_ids(repair),
                batch_key=repair.batch_key,
            )
        self._commit_comment_visibility_change(is_private=message.is_private)

        for file_path in attachment_paths:
            if file_path.exists() and file_path.is_file():
                file_path.unlink()

    def create_verification_message(
        self,
        *,
        equipment_id: int,
        payload: VerificationMessageCreateRequest,
        author: User,
        files: list[UploadedFilePayload] | None = None,
    ) -> VerificationMessage:
        verification = self._get_active_verification(equipment_id=equipment_id)
        message = self._create_verification_message_record(
            verification=verification,
            author=author,
            payload=payload,
            files=files or [],
        )
        if not message.is_private:
            self._record_event(
                category=EventCategory.VERIFICATION,
                action="verification_message_created",
                user=author,
                title=f"Добавлено сообщение по поверке «{verification.equipment.name}»",
                description=_build_message_event_description(
                    text=payload.text,
                    attachment_count=len(files or []),
                ),
                equipment=verification.equipment,
                notification_equipment_ids=self._get_verification_notification_equipment_ids(
                    verification
                ),
                batch_key=verification.batch_key,
            )
        self._commit_comment_visibility_change(is_private=message.is_private)
        self.session.refresh(message)
        self._send_verification_message_mentions(
            verification=verification,
            message=message,
            actor=author,
        )
        return message

    def update_verification_message(
        self,
        *,
        equipment_id: int,
        message_id: int,
        payload: VerificationMessageUpdateRequest,
        current_user: User,
    ) -> VerificationMessage:
        verification = self._get_active_verification(equipment_id=equipment_id)
        message = self._get_verification_message(
            verification_id=verification.id,
            message_id=message_id,
        )
        self._assert_verification_message_editor(
            message=message,
            current_user=current_user,
        )
        previous_text = message.text
        normalized_text = _normalize_message_text(payload.text)
        if normalized_text is None and not message.attachments:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Сообщение поверки должно содержать текст или хотя бы одно вложение.",
            )
        message.text = normalized_text
        if not message.is_private:
            self._record_event(
                category=EventCategory.VERIFICATION,
                action="verification_message_updated",
                user=current_user,
                title=f"Обновлено сообщение по поверке «{verification.equipment.name}»",
                description=_build_preview_description(message.text),
                equipment=verification.equipment,
                notification_equipment_ids=self._get_verification_notification_equipment_ids(
                    verification
                ),
                batch_key=verification.batch_key,
            )
        self._commit_comment_visibility_change(is_private=message.is_private)
        self.session.refresh(message)
        self._send_verification_message_mentions(
            verification=verification,
            message=message,
            actor=current_user,
            previous_text=previous_text,
        )
        return message

    def delete_verification_message(
        self,
        *,
        equipment_id: int,
        message_id: int,
        current_user: User,
    ) -> None:
        verification = self._get_active_verification(equipment_id=equipment_id)
        message = self._get_verification_message(
            verification_id=verification.id,
            message_id=message_id,
        )
        self._assert_verification_message_owner(
            message=message,
            current_user=current_user,
        )

        attachment_paths = [
            settings.attachment_storage_path / attachment.storage_path
            for attachment in message.attachments
        ]
        message_preview = message.text
        for attachment in message.attachments:
            self.verification_message_attachments.delete(attachment)
        self.verification_messages.delete(message)
        if not message.is_private:
            self._record_event(
                category=EventCategory.VERIFICATION,
                action="verification_message_deleted",
                user=current_user,
                title=f"Удалено сообщение по поверке «{verification.equipment.name}»",
                description=_build_preview_description(message_preview),
                equipment=verification.equipment,
                notification_equipment_ids=self._get_verification_notification_equipment_ids(
                    verification
                ),
                batch_key=verification.batch_key,
            )
        self._commit_comment_visibility_change(is_private=message.is_private)

        for file_path in attachment_paths:
            if file_path.exists() and file_path.is_file():
                file_path.unlink()

    def export_verification_archive_zip(
        self,
        *,
        verification_id: int,
    ) -> tuple[str, Path]:
        verification = self.verifications.get_by_id(verification_id)
        if verification is None or verification.closed_at is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Архив поверки не найден.",
            )
        equipment = verification.equipment or self.get_equipment(
            equipment_id=verification.equipment_id
        )
        self._assert_folder_access(equipment.folder_id, detail="Архив поверки не найден.")

        if verification.batch_key:
            messages = self.verification_messages.list_by_batch_key(
                batch_key=verification.batch_key,
                include_private=self._can_view_private_notes(),
            )
            archive_name = _build_verification_archive_name(
                label=verification.batch_name or "Групповая поверка",
                start_date=verification.sent_to_verification_at,
                end_date=verification.closed_at,
            )
        else:
            messages = self.verification_messages.list_by_verification(
                verification_id=verification.id,
                include_private=self._can_view_private_notes(),
            )
            equipment = verification.equipment
            folder_name = "Без папки"
            if equipment is not None and equipment.folder_id is not None:
                folder = self.folders.get_by_id(equipment.folder_id)
                if folder is not None:
                    folder_name = folder.name
            archive_name = _build_verification_archive_name(
                label=folder_name,
                start_date=verification.sent_to_verification_at,
                end_date=verification.closed_at,
            )

        archive_path = _create_temp_export_file_path(suffix=".zip")
        try:
            with ZipFile(archive_path, mode="w", compression=ZIP_DEFLATED) as zip_file:
                transcript_lines: list[str] = []
                for index, message in enumerate(messages, start=1):
                    created_at = message.created_at.strftime("%d.%m.%Y %H:%M")
                    transcript_lines.append(f"[{created_at}] {message.author_display_name}")
                    if message.text:
                        transcript_lines.append(message.text)
                    if message.attachments:
                        transcript_lines.append(
                            "Вложения: "
                            + ", ".join(attachment.file_name for attachment in message.attachments)
                        )
                    transcript_lines.append("")

                    for attachment_index, attachment in enumerate(
                        message.attachments,
                        start=1,
                    ):
                        file_path = settings.attachment_storage_path / attachment.storage_path
                        if file_path.exists() and file_path.is_file():
                            zip_file.write(
                                file_path,
                                arcname=(
                                    f"files/{index:03d}_{attachment_index:02d}_{attachment.file_name}"
                                ),
                            )

                transcript_content = "\n".join(transcript_lines).strip()
                if not transcript_content:
                    transcript_content = "Диалог поверки пуст."

                zip_file.writestr(
                    "dialog.txt",
                    transcript_content,
                )
        except Exception:
            archive_path.unlink(missing_ok=True)
            raise

        return f"{archive_name}.zip", archive_path

    def export_repair_archive_zip(
        self,
        *,
        repair_id: int,
    ) -> tuple[str, Path]:
        repair = self.repairs.get_by_id(repair_id)
        if repair is None or repair.closed_at is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Архив ремонта не найден.",
            )
        equipment = repair.equipment or self.get_equipment(equipment_id=repair.equipment_id)
        self._assert_folder_access(equipment.folder_id, detail="Архив ремонта не найден.")

        if repair.batch_key:
            messages = self.repair_messages.list_by_batch_key(
                batch_key=repair.batch_key,
                include_private=self._can_view_private_notes(),
            )
            archive_name = _build_repair_archive_name(
                folder_name=repair.batch_name or "Групповой ремонт",
                start_date=repair.sent_to_repair_at,
                end_date=repair.closed_at,
            )
        else:
            messages = self.repair_messages.list_by_repair(
                repair_id=repair.id,
                include_private=self._can_view_private_notes(),
            )
            equipment = repair.equipment
            folder_name = "Без папки"
            if equipment is not None and equipment.folder_id is not None:
                folder = self.folders.get_by_id(equipment.folder_id)
                if folder is not None:
                    folder_name = folder.name
            archive_name = _build_repair_archive_name(
                folder_name=folder_name,
                start_date=repair.sent_to_repair_at,
                end_date=repair.closed_at,
            )

        archive_path = _create_temp_export_file_path(suffix=".zip")
        try:
            with ZipFile(archive_path, mode="w", compression=ZIP_DEFLATED) as zip_file:
                transcript_lines: list[str] = []
                for index, message in enumerate(messages, start=1):
                    created_at = message.created_at.strftime("%d.%m.%Y %H:%M")
                    transcript_lines.append(f"[{created_at}] {message.author_display_name}")
                    if message.text:
                        transcript_lines.append(message.text)
                    if message.attachments:
                        transcript_lines.append(
                            "Вложения: "
                            + ", ".join(attachment.file_name for attachment in message.attachments)
                        )
                    transcript_lines.append("")

                    for attachment_index, attachment in enumerate(
                        message.attachments,
                        start=1,
                    ):
                        file_path = settings.attachment_storage_path / attachment.storage_path
                        if file_path.exists() and file_path.is_file():
                            zip_file.write(
                                file_path,
                                arcname=(
                                    f"files/{index:03d}_{attachment_index:02d}_{attachment.file_name}"
                                ),
                            )

                transcript_content = "\n".join(transcript_lines).strip()
                if not transcript_content:
                    transcript_content = "Диалог ремонта пуст."

                zip_file.writestr(
                    "dialog.txt",
                    transcript_content,
                )
        except Exception:
            archive_path.unlink(missing_ok=True)
            raise

        return f"{archive_name}.zip", archive_path

    def get_repair_message_attachment_file(
        self,
        *,
        equipment_id: int,
        message_id: int,
        attachment_id: int,
    ) -> tuple[RepairMessageAttachment, Path]:
        repair = self._get_active_repair(equipment_id=equipment_id)
        message = self._get_repair_message(repair=repair, message_id=message_id)
        attachment = self._get_repair_message_attachment(
            message_id=message.id,
            attachment_id=attachment_id,
        )
        file_path = settings.attachment_storage_path / attachment.storage_path
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Repair attachment file is missing.",
            )
        return attachment, file_path

    def get_verification_message_attachment_file(
        self,
        *,
        equipment_id: int,
        message_id: int,
        attachment_id: int,
    ) -> tuple[VerificationMessageAttachment, Path]:
        verification = self._get_active_verification(equipment_id=equipment_id)
        message = self._get_verification_message(
            verification_id=verification.id,
            message_id=message_id,
        )
        attachment = self._get_verification_message_attachment(
            message_id=message.id,
            attachment_id=attachment_id,
        )
        file_path = settings.attachment_storage_path / attachment.storage_path
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Verification attachment file is missing.",
            )
        return attachment, file_path

    def delete_equipment(self, *, equipment_id: int, current_user: User | None = None) -> None:
        equipment = self.get_equipment(equipment_id=equipment_id)
        if current_user is not None:
            self._record_equipment_event(
                action="equipment_deleted",
                user=current_user,
                equipment=equipment,
                title=f"Удален прибор «{equipment.name}»",
            )
        self.process_subscriptions.delete_by_equipment_id(equipment_id=equipment.id)
        self.equipment.delete(equipment)
        self._commit_and_flush_process_notifications()

    def delete_equipment_batch(
        self,
        *,
        equipment_ids: list[int],
        current_user: User | None = None,
    ) -> None:
        normalized_ids = list(dict.fromkeys(equipment_ids))
        if not normalized_ids:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Нужно выбрать хотя бы один прибор для удаления.",
            )

        for equipment_id in normalized_ids:
            equipment = self.get_equipment(equipment_id=equipment_id)
            if current_user is not None:
                self._record_equipment_event(
                    action="equipment_deleted",
                    user=current_user,
                    equipment=equipment,
                    title=f"Удален прибор «{equipment.name}»",
                )
            self.process_subscriptions.delete_by_equipment_id(equipment_id=equipment.id)
            self.equipment.delete(equipment)

        self._commit_and_flush_process_notifications()

    def list_attachments(self, *, equipment_id: int) -> list[EquipmentAttachment]:
        self.get_equipment(equipment_id=equipment_id)
        return self.attachments.list_by_equipment(equipment_id=equipment_id)

    def create_attachment(
        self,
        *,
        equipment_id: int,
        uploader: User,
        file_payload: UploadedFilePayload,
    ) -> EquipmentAttachment:
        equipment = self.get_equipment(equipment_id=equipment_id)
        normalized_file_name = _normalize_attachment_file_name(file_payload.file_name)
        if file_payload.file_size <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Attachment file must not be empty.",
            )

        storage_dir = settings.attachment_storage_path / str(equipment.id)
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_name = f"{uuid4().hex}{Path(normalized_file_name).suffix.lower()}"
        file_path = storage_dir / storage_name
        stored_file = _store_attachment_file(
            source_path=file_payload.temp_path,
            destination_path=file_path,
            file_name=normalized_file_name,
            content_type=file_payload.content_type,
            file_size=file_payload.file_size,
        )

        relative_storage_path = str(file_path.relative_to(settings.attachment_storage_path))
        attachment = EquipmentAttachment(
            equipment_id=equipment.id,
            uploaded_by_user_id=uploader.id,
            uploaded_by_display_name=_format_user_display_name(uploader),
            file_name=normalized_file_name,
            file_mime_type=stored_file.content_type,
            file_size=stored_file.file_size,
            storage_path=relative_storage_path,
        )
        self.attachments.add(attachment)
        self._record_equipment_event(
            action="attachment_created",
            user=uploader,
            equipment=equipment,
            title=f"Добавлено вложение к прибору «{equipment.name}»",
            description=normalized_file_name,
        )
        self._commit_and_flush_process_notifications()
        self.session.refresh(attachment)
        return attachment

    def get_attachment_file(
        self,
        *,
        equipment_id: int,
        attachment_id: int,
    ) -> tuple[EquipmentAttachment, Path]:
        attachment = self._get_attachment(equipment_id=equipment_id, attachment_id=attachment_id)
        file_path = settings.attachment_storage_path / attachment.storage_path
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Attachment file is missing.",
            )
        return attachment, file_path

    def delete_attachment(
        self,
        *,
        equipment_id: int,
        attachment_id: int,
        current_user: User,
    ) -> None:
        attachment = self._get_attachment(equipment_id=equipment_id, attachment_id=attachment_id)
        if (
            not has_admin_access(current_user.role)
            and attachment.uploaded_by_user_id != current_user.id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot delete this attachment.",
            )

        file_path = settings.attachment_storage_path / attachment.storage_path
        attachment_name = attachment.file_name
        equipment = self.get_equipment(equipment_id=equipment_id)
        self.attachments.delete(attachment)
        self._record_equipment_event(
            action="attachment_deleted",
            user=current_user,
            equipment=equipment,
            title=f"Удалено вложение у прибора «{equipment.name}»",
            description=attachment_name,
        )
        self._commit_and_flush_process_notifications()
        if file_path.exists() and file_path.is_file():
            file_path.unlink()

    def get_comment_attachment_file(
        self,
        *,
        equipment_id: int,
        comment_id: int,
        attachment_id: int,
    ) -> tuple[EquipmentCommentAttachment, Path]:
        comment = self._get_comment(equipment_id=equipment_id, comment_id=comment_id)
        attachment = self._get_comment_attachment(
            comment_id=comment.id,
            attachment_id=attachment_id,
        )
        file_path = settings.attachment_storage_path / attachment.storage_path
        if not file_path.exists() or not file_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Comment attachment file is missing.",
            )
        return attachment, file_path

    def create_comment_attachment_upload(
        self,
        *,
        equipment_id: int,
        uploader: User,
        file_payload: UploadedFilePayload,
    ) -> CommentAttachmentUpload:
        equipment = self.get_equipment(equipment_id=equipment_id)
        normalized_file_name = _normalize_attachment_file_name(file_payload.file_name)
        if file_payload.file_size <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Attachment file must not be empty.",
            )

        staging_dir = _get_comment_attachment_upload_staging_dir(
            equipment_id=equipment.id,
            user_id=uploader.id,
        )
        staging_dir.mkdir(parents=True, exist_ok=True)
        _cleanup_stale_comment_attachment_uploads(staging_dir)

        upload_token = uuid4().hex
        storage_name = f"{upload_token}{Path(normalized_file_name).suffix.lower()}"
        file_path = staging_dir / storage_name
        stored_file = _store_attachment_file(
            source_path=file_payload.temp_path,
            destination_path=file_path,
            file_name=normalized_file_name,
            content_type=file_payload.content_type,
            file_size=file_payload.file_size,
        )
        manifest_path = _get_comment_attachment_upload_manifest_path(
            staging_dir=staging_dir,
            upload_token=upload_token,
        )
        manifest_path.write_text(
            json.dumps(
                {
                    "file_name": normalized_file_name,
                    "file_mime_type": stored_file.content_type,
                    "file_size": stored_file.file_size,
                    "storage_name": storage_name,
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )

        return CommentAttachmentUpload(
            upload_token=upload_token,
            file_name=normalized_file_name,
            file_mime_type=stored_file.content_type,
            file_size=stored_file.file_size,
        )

    def delete_comment_attachment_upload(
        self,
        *,
        equipment_id: int,
        upload_token: str,
        current_user: User,
    ) -> None:
        self.get_equipment(equipment_id=equipment_id)
        staged_attachment = _load_comment_attachment_upload(
            equipment_id=equipment_id,
            user_id=current_user.id,
            upload_token=upload_token,
        )
        _delete_comment_attachment_upload_files(staged_attachment)

    def list_comments(self, *, equipment_id: int) -> list[EquipmentComment]:
        self.get_equipment(equipment_id=equipment_id)
        return self.comments.list_by_equipment(
            equipment_id=equipment_id,
            include_private=self._can_view_private_notes(),
        )

    def create_comment(
        self,
        *,
        equipment_id: int,
        payload: EquipmentCommentCreateRequest,
        author: User,
        files: list[UploadedFilePayload] | None = None,
    ) -> EquipmentComment:
        equipment = self.get_equipment(equipment_id=equipment_id)
        self._assert_private_note_creation_allowed(
            is_private=payload.is_private,
            current_user=author,
        )
        uploaded_files = files or []
        uploaded_attachment_tokens = list(
            dict.fromkeys(
                token
                for token in payload.uploaded_attachment_tokens
                if _normalize_optional_text(token) is not None
            )
        )
        normalized_text = _normalize_comment_text(
            payload.text,
            allow_empty=bool(uploaded_files or uploaded_attachment_tokens),
        )
        comment = EquipmentComment(
            equipment_id=equipment.id,
            author_user_id=author.id,
            author_display_name=_format_user_display_name(author),
            text=normalized_text,
            is_private=payload.is_private,
        )
        self.comments.add(comment)
        for upload_token in uploaded_attachment_tokens:
            self._attach_uploaded_comment_attachment(
                equipment=equipment,
                comment=comment,
                uploader=author,
                upload_token=upload_token,
            )
        for file_payload in uploaded_files:
            self._create_comment_attachment(
                equipment=equipment,
                comment=comment,
                uploader=author,
                file_payload=file_payload,
            )
        if not comment.is_private:
            self._record_equipment_event(
                action="comment_created",
                user=author,
                equipment=equipment,
                title=f"Добавлен комментарий к прибору «{equipment.name}»",
                description=_build_message_event_description(
                    text=comment.text,
                    attachment_count=len(uploaded_files) + len(uploaded_attachment_tokens),
                ),
            )
        self._commit_comment_visibility_change(is_private=comment.is_private)
        comment = self._get_comment(equipment_id=equipment.id, comment_id=comment.id)
        self._send_equipment_comment_mentions(
            equipment=equipment,
            comment=comment,
            actor=author,
        )
        return comment

    def update_comment(
        self,
        *,
        equipment_id: int,
        comment_id: int,
        payload: EquipmentCommentUpdateRequest,
        current_user: User,
    ) -> EquipmentComment:
        comment = self._get_comment(equipment_id=equipment_id, comment_id=comment_id)
        self._assert_comment_owner(comment=comment, current_user=current_user)
        previous_text = comment.text
        comment.text = _normalize_comment_text(payload.text)
        equipment = self.get_equipment(equipment_id=equipment_id)
        if not comment.is_private:
            self._record_equipment_event(
                action="comment_updated",
                user=current_user,
                equipment=equipment,
                title=f"Обновлен комментарий к прибору «{equipment.name}»",
                description=_build_preview_description(comment.text),
            )
        self._commit_comment_visibility_change(is_private=comment.is_private)
        comment = self._get_comment(equipment_id=equipment.id, comment_id=comment.id)
        self._send_equipment_comment_mentions(
            equipment=equipment,
            comment=comment,
            actor=current_user,
            previous_text=previous_text,
        )
        return comment

    def delete_comment(
        self,
        *,
        equipment_id: int,
        comment_id: int,
        current_user: User,
    ) -> None:
        comment = self._get_comment(equipment_id=equipment_id, comment_id=comment_id)
        self._assert_comment_delete_access(comment=comment, current_user=current_user)
        equipment = self.get_equipment(equipment_id=equipment_id)
        file_paths = [
            settings.attachment_storage_path / attachment.storage_path
            for attachment in comment.attachments
        ]
        if not comment.is_private:
            self._record_equipment_event(
                action="comment_deleted",
                user=current_user,
                equipment=equipment,
                title=f"Удален комментарий у прибора «{equipment.name}»",
                description=_build_preview_description(comment.text),
            )
        self.comments.delete(comment)
        self._commit_comment_visibility_change(is_private=comment.is_private)
        for file_path in file_paths:
            if file_path.exists() and file_path.is_file():
                file_path.unlink()

    def _send_equipment_comment_mentions(
        self,
        *,
        equipment: Equipment,
        comment: EquipmentComment,
        actor: User,
        previous_text: str | None = None,
    ) -> None:
        mentioned_users = self._resolve_mentioned_users(
            text=comment.text,
            exclude_user_id=actor.id,
            previous_text=previous_text,
        )
        if comment.is_private:
            mentioned_users = self._filter_private_mention_recipients(mentioned_users)
        if not mentioned_users:
            return

        target_url = f"{settings.frontend_app_url}/equipment/{equipment.id}?commentId={comment.id}"
        context_title = f"в карточке прибора «{equipment.name}»"
        self._send_mention_emails(
            users=mentioned_users,
            actor=actor,
            context_title=context_title,
            message_preview=comment.text,
            target_url=target_url,
        )

    def _send_repair_message_mentions(
        self,
        *,
        repair: Repair,
        message: RepairMessage,
        actor: User,
        previous_text: str | None = None,
    ) -> None:
        mentioned_users = self._resolve_mentioned_users(
            text=message.text,
            exclude_user_id=actor.id,
            previous_text=previous_text,
        )
        if message.is_private:
            mentioned_users = self._filter_private_mention_recipients(mentioned_users)
        if not mentioned_users:
            return

        target_url = self._build_repair_message_url(repair=repair, message=message)
        if repair.batch_key:
            context_title = f"в групповом ремонте «{repair.batch_name or repair.route_destination}»"
        else:
            context_title = f"в ремонте прибора «{repair.equipment.name}»"
        self._send_mention_emails(
            users=mentioned_users,
            actor=actor,
            context_title=context_title,
            message_preview=message.text,
            target_url=target_url,
        )

    def _send_verification_message_mentions(
        self,
        *,
        verification: Verification,
        message: VerificationMessage,
        actor: User,
        previous_text: str | None = None,
    ) -> None:
        mentioned_users = self._resolve_mentioned_users(
            text=message.text,
            exclude_user_id=actor.id,
            previous_text=previous_text,
        )
        if message.is_private:
            mentioned_users = self._filter_private_mention_recipients(mentioned_users)
        if not mentioned_users:
            return

        target_url = self._build_verification_message_url(
            verification=verification,
            message=message,
        )
        if verification.batch_key:
            context_title = (
                f"в групповой поверке «{verification.batch_name or verification.route_destination}»"
            )
        else:
            context_title = f"в поверке прибора «{verification.equipment.name}»"
        self._send_mention_emails(
            users=mentioned_users,
            actor=actor,
            context_title=context_title,
            message_preview=message.text,
            target_url=target_url,
        )

    def _send_mention_emails(
        self,
        *,
        users: list[User],
        actor: User,
        context_title: str,
        message_preview: str | None,
        target_url: str,
    ) -> None:
        actor_name = _format_user_display_name(actor)
        for user in users:
            if not user.mention_email_notifications_enabled:
                continue
            enqueue_mention_email(
                recipient_email=user.email,
                recipient_name=_format_user_display_name(user),
                actor_name=actor_name,
                context_title=context_title,
                message_preview=message_preview,
                target_url=target_url,
            )

    def _commit_and_flush_process_notifications(self) -> None:
        self.session.commit()
        self._flush_process_notifications()

    def _get_repair_notification_equipment_ids(self, repair: Repair) -> list[int]:
        if repair.batch_key:
            repairs = self.repairs.list_active_by_batch_key(batch_key=repair.batch_key)
            if repairs:
                return [item.equipment_id for item in repairs]
        return [repair.equipment_id]

    def _get_verification_notification_equipment_ids(
        self,
        verification: Verification,
    ) -> list[int]:
        if verification.batch_key:
            verifications = self.verifications.list_active_by_batch_key(
                batch_key=verification.batch_key
            )
            if verifications:
                return [item.equipment_id for item in verifications]
        return [verification.equipment_id]

    def _flush_process_notifications(self) -> None:
        if not self._pending_process_notifications:
            return

        pending_notifications = self._pending_process_notifications
        self._pending_process_notifications = []
        for notification in pending_notifications:
            equipment_subscription_users = (
                self.process_subscriptions.list_active_users_by_equipment_ids(
                    equipment_ids=list(notification.equipment_ids)
                )
            )
            folder_ids = self.equipment.list_folder_ids_by_equipment_ids(
                equipment_ids=list(notification.equipment_ids)
            )
            folder_subscription_users = (
                self.folder_process_subscriptions.list_active_users_by_folder_ids(
                    folder_ids=folder_ids
                )
            )
            users = list(
                {
                    user.id: user
                    for user in [*equipment_subscription_users, *folder_subscription_users]
                }.values()
            )
            if not users:
                continue

            target_url = self._build_process_notification_target_url(notification)
            for user in users:
                if notification.actor_user_id is not None and user.id == notification.actor_user_id:
                    continue
                enqueue_process_update_email(
                    recipient_email=user.email,
                    recipient_name=_format_user_display_name(user),
                    actor_name=notification.actor_name,
                    process_label=notification.process_label,
                    event_title=notification.title,
                    event_description=notification.description,
                    target_url=target_url,
                )

    def _build_process_notification_target_url(
        self,
        notification: PendingProcessNotification,
    ) -> str:
        if len(notification.equipment_ids) == 1:
            return f"{settings.frontend_app_url}/equipment/{notification.equipment_ids[0]}"
        if notification.category == EventCategory.REPAIR:
            return f"{settings.frontend_app_url}/repairs"
        return f"{settings.frontend_app_url}/verification/si"

    def _resolve_mentioned_users(
        self,
        *,
        text: str | None,
        exclude_user_id: int | None = None,
        previous_text: str | None = None,
    ) -> list[User]:
        if not text:
            return []

        active_users = self.users.list_active()
        mention_keys = build_user_mention_keys(active_users)
        users_by_id = {user.id: user for user in active_users}
        mention_lookup = {
            key.lower(): users_by_id[user_id]
            for user_id, key in mention_keys.items()
            if user_id in users_by_id
        }

        current_keys = _extract_mention_keys(text)
        if previous_text:
            previous_keys = _extract_mention_keys(previous_text)
            current_keys = current_keys.difference(previous_keys)

        resolved: list[User] = []
        seen_user_ids: set[int] = set()
        for mention_key in current_keys:
            user = mention_lookup.get(mention_key.lower())
            if user is None:
                continue
            if exclude_user_id is not None and user.id == exclude_user_id:
                continue
            if user.id in seen_user_ids:
                continue
            seen_user_ids.add(user.id)
            resolved.append(user)
        return resolved

    def _build_repair_message_url(
        self,
        *,
        repair: Repair,
        message: RepairMessage,
    ) -> str:
        query_parts = [
            f"equipmentId={repair.equipment_id}",
            f"repairId={repair.id}",
            f"messageId={message.id}",
        ]
        if repair.batch_key:
            query_parts.append(f"batchKey={repair.batch_key}")
        return f"{settings.frontend_app_url}/repairs?{'&'.join(query_parts)}"

    def _build_verification_message_url(
        self,
        *,
        verification: Verification,
        message: VerificationMessage,
    ) -> str:
        query_parts = [
            f"equipmentId={verification.equipment_id}",
            f"verificationId={verification.id}",
            f"messageId={message.id}",
        ]
        if verification.batch_key:
            query_parts.append(f"batchKey={verification.batch_key}")
        return f"{settings.frontend_app_url}/verification/si?{'&'.join(query_parts)}"

    def _record_equipment_event(
        self,
        *,
        action: str,
        user: User,
        equipment: Equipment,
        title: str,
        description: str | None = None,
        batch_key: str | None = None,
    ) -> None:
        self._record_event(
            category=EventCategory.EQUIPMENT,
            action=action,
            user=user,
            title=title,
            description=description,
            equipment=equipment,
            batch_key=batch_key,
        )

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
    ) -> None:
        resolved_equipment_id = equipment.id if equipment is not None else equipment_id
        resolved_equipment_name = equipment.name if equipment is not None else equipment_name
        resolved_equipment_modification = (
            equipment.modification if equipment is not None else equipment_modification
        )
        resolved_equipment_serial_number = (
            equipment.serial_number if equipment is not None else equipment_serial_number
        )
        resolved_folder_id = folder_id
        resolved_folder_name = folder_name

        if equipment is not None:
            resolved_folder_id = equipment.folder_id
            if resolved_folder_name is None and equipment.folder_id is not None:
                folder = self.folders.get_by_id(equipment.folder_id)
                if folder is not None:
                    resolved_folder_name = folder.name

        event = EventLog(
            category=category,
            action=action,
            title=title,
            description=description,
            user_id=user.id if user is not None else None,
            user_display_name=(_format_user_display_name(user) if user is not None else "Система"),
            equipment_id=resolved_equipment_id,
            equipment_name=resolved_equipment_name,
            equipment_modification=resolved_equipment_modification,
            equipment_serial_number=resolved_equipment_serial_number,
            folder_id=resolved_folder_id,
            folder_name=resolved_folder_name,
            batch_key=_normalize_optional_text(batch_key),
        )
        self.events.add(event)
        resolved_notification_equipment_ids = tuple(
            dict.fromkeys(
                notification_equipment_ids
                if notification_equipment_ids
                else ([resolved_equipment_id] if resolved_equipment_id is not None else [])
            )
        )
        if (
            _should_enqueue_subscription_notification(category=category, action=action)
            and resolved_notification_equipment_ids
        ):
            self._pending_process_notifications.append(
                PendingProcessNotification(
                    category=category,
                    process_label=_build_subscription_notification_label(
                        category=category,
                        equipment_name=resolved_equipment_name,
                    ),
                    equipment_ids=resolved_notification_equipment_ids,
                    actor_user_id=user.id if user is not None else None,
                    actor_name=_format_user_display_name(user) if user is not None else "Система",
                    title=title,
                    description=description,
                )
            )

    def _create_repair_from_batch_anchor(
        self,
        *,
        anchor: Repair,
        equipment_id: int,
    ) -> Repair:
        equipment = self.get_equipment(equipment_id=equipment_id)
        existing_repair = self.repairs.get_active_by_equipment_id(equipment_id=equipment.id)
        if existing_repair is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Для прибора «{equipment.name}» уже есть активный ремонт.",
            )

        repair = Repair(
            equipment_id=equipment.id,
            batch_key=anchor.batch_key,
            batch_name=anchor.batch_name,
            is_on_site=anchor.is_on_site,
            route_city=anchor.route_city,
            route_destination=anchor.route_destination,
            sent_to_repair_at=anchor.sent_to_repair_at,
            repair_deadline_at=anchor.repair_deadline_at,
            repair_total_days_snapshot=anchor.repair_total_days_snapshot,
            registration_after_arrival_days_snapshot=anchor.registration_after_arrival_days_snapshot,
            incoming_control_after_receipt_days_snapshot=anchor.incoming_control_after_receipt_days_snapshot,
            payment_after_control_days_snapshot=anchor.payment_after_control_days_snapshot,
            arrived_to_destination_at=anchor.arrived_to_destination_at,
            sent_from_repair_at=anchor.sent_from_repair_at,
            sent_from_irkutsk_at=anchor.sent_from_irkutsk_at,
            arrived_to_lensk_at=anchor.arrived_to_lensk_at,
            actually_received_at=anchor.actually_received_at,
            incoming_control_at=anchor.incoming_control_at,
            paid_at=anchor.paid_at,
            custom_stages_json=_clone_process_custom_stages(anchor.custom_stages_json),
        )
        equipment.status = EquipmentStatus.IN_REPAIR
        self.repairs.add(repair)
        self.session.flush()
        self.session.refresh(repair)
        return repair

    def _create_verification_from_batch_anchor(
        self,
        *,
        anchor: Verification,
        equipment_id: int,
    ) -> Verification:
        equipment = self.get_equipment(equipment_id=equipment_id)
        if not _supports_verification(equipment.equipment_type):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Прибор «{equipment.name}» нельзя добавить в поверку: это не СИ или ЭСИ.",
            )
        existing_verification = self.verifications.get_active_by_equipment_id(
            equipment_id=equipment.id
        )
        if existing_verification is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Для прибора «{equipment.name}» уже есть активная поверка.",
            )

        verification = Verification(
            equipment_id=equipment.id,
            batch_key=anchor.batch_key,
            batch_name=anchor.batch_name,
            is_on_site=anchor.is_on_site,
            route_city=anchor.route_city,
            route_destination=anchor.route_destination,
            sent_to_verification_at=anchor.sent_to_verification_at,
            received_at_destination_at=anchor.received_at_destination_at,
            handed_to_csm_at=anchor.handed_to_csm_at,
            verification_completed_at=anchor.verification_completed_at,
            picked_up_from_csm_at=anchor.picked_up_from_csm_at,
            shipped_back_at=anchor.shipped_back_at,
            returned_from_verification_at=anchor.returned_from_verification_at,
            custom_stages_json=_clone_process_custom_stages(anchor.custom_stages_json),
        )
        if self.repairs.get_active_by_equipment_id(equipment_id=equipment.id) is None:
            equipment.status = EquipmentStatus.IN_VERIFICATION
        self.verifications.add(verification)
        self.session.flush()
        self.session.refresh(verification)
        return verification

    def _detach_repair_from_batch(
        self,
        *,
        repair: Repair,
        current_user: User,
    ) -> None:
        batch_key = repair.batch_key
        batch_name = repair.batch_name or "Групповой ремонт"
        if batch_key is None:
            return

        self._clone_repair_batch_history_to_repair(
            repair=repair,
            batch_key=batch_key,
        )
        member_label = _build_equipment_batch_member_label(repair.equipment)
        repair.batch_key = None
        repair.batch_name = None
        self._create_repair_message_record(
            repair=repair,
            author=current_user,
            payload=RepairMessageCreateRequest(
                text=f"Прибор выведен из группы «{batch_name}»: {member_label}."
            ),
            files=[],
        )

    def _detach_verification_from_batch(
        self,
        *,
        verification: Verification,
        current_user: User,
    ) -> None:
        batch_key = verification.batch_key
        batch_name = verification.batch_name or "Групповая поверка"
        if batch_key is None:
            return

        self._clone_verification_batch_history_to_verification(
            verification=verification,
            batch_key=batch_key,
        )
        member_label = _build_equipment_batch_member_label(verification.equipment)
        verification.batch_key = None
        verification.batch_name = None
        self._create_verification_message_record(
            verification=verification,
            author=current_user,
            payload=VerificationMessageCreateRequest(
                text=f"Прибор выведен из группы «{batch_name}»: {member_label}."
            ),
            files=[],
        )

    def _clone_repair_batch_history_to_repair(
        self,
        *,
        repair: Repair,
        batch_key: str,
    ) -> None:
        messages = self.repair_messages.list_by_batch_key(batch_key=batch_key)
        for message in messages:
            if message.repair_id == repair.id:
                continue
            cloned_message = RepairMessage(
                repair_id=repair.id,
                batch_key=None,
                author_user_id=message.author_user_id,
                author_display_name=message.author_display_name,
                text=message.text,
                is_private=message.is_private,
                created_at=message.created_at,
            )
            self.repair_messages.add(cloned_message)
            for attachment in message.attachments:
                self._copy_repair_message_attachment(
                    repair=repair,
                    message=cloned_message,
                    source=attachment,
                )

    def _clone_verification_batch_history_to_verification(
        self,
        *,
        verification: Verification,
        batch_key: str,
    ) -> None:
        messages = self.verification_messages.list_by_batch_key(batch_key=batch_key)
        for message in messages:
            if message.verification_id == verification.id:
                continue
            cloned_message = VerificationMessage(
                verification_id=verification.id,
                batch_key=None,
                author_user_id=message.author_user_id,
                author_display_name=message.author_display_name,
                text=message.text,
                is_private=message.is_private,
                created_at=message.created_at,
            )
            self.verification_messages.add(cloned_message)
            for attachment in message.attachments:
                self._copy_verification_message_attachment(
                    verification=verification,
                    message=cloned_message,
                    source=attachment,
                )

    def _copy_repair_message_attachment(
        self,
        *,
        repair: Repair,
        message: RepairMessage,
        source: RepairMessageAttachment,
    ) -> RepairMessageAttachment | None:
        source_path = settings.attachment_storage_path / source.storage_path
        if not source_path.exists() or not source_path.is_file():
            return None

        storage_dir = (
            settings.attachment_storage_path / "repair-messages" / str(repair.id) / str(message.id)
        )
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_name = f"{uuid4().hex}{Path(source.file_name).suffix.lower()}"
        file_path = storage_dir / storage_name
        _copy_file_chunked(source_path, file_path)

        attachment = RepairMessageAttachment(
            repair_message_id=message.id,
            uploaded_by_user_id=source.uploaded_by_user_id,
            uploaded_by_display_name=source.uploaded_by_display_name,
            file_name=source.file_name,
            file_mime_type=source.file_mime_type,
            file_size=source.file_size,
            storage_path=str(file_path.relative_to(settings.attachment_storage_path)),
            created_at=source.created_at,
        )
        self.repair_message_attachments.add(attachment)
        return attachment

    def _copy_verification_message_attachment(
        self,
        *,
        verification: Verification,
        message: VerificationMessage,
        source: VerificationMessageAttachment,
    ) -> VerificationMessageAttachment | None:
        source_path = settings.attachment_storage_path / source.storage_path
        if not source_path.exists() or not source_path.is_file():
            return None

        storage_dir = (
            settings.attachment_storage_path
            / "verification-messages"
            / str(verification.id)
            / str(message.id)
        )
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_name = f"{uuid4().hex}{Path(source.file_name).suffix.lower()}"
        file_path = storage_dir / storage_name
        _copy_file_chunked(source_path, file_path)

        attachment = VerificationMessageAttachment(
            verification_message_id=message.id,
            uploaded_by_user_id=source.uploaded_by_user_id,
            uploaded_by_display_name=source.uploaded_by_display_name,
            file_name=source.file_name,
            file_mime_type=source.file_mime_type,
            file_size=source.file_size,
            storage_path=str(file_path.relative_to(settings.attachment_storage_path)),
            created_at=source.created_at,
        )
        self.verification_message_attachments.add(attachment)
        return attachment

    def _create_repair_message_record(
        self,
        *,
        repair: Repair,
        author: User,
        payload: RepairMessageCreateRequest,
        files: list[UploadedFilePayload],
    ) -> RepairMessage:
        self._assert_private_note_creation_allowed(
            is_private=payload.is_private,
            current_user=author,
        )
        normalized_text = _normalize_message_text(payload.text)
        if normalized_text is None and not files:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Сообщение ремонта должно содержать текст или хотя бы одно вложение.",
            )

        message = RepairMessage(
            repair_id=repair.id,
            batch_key=repair.batch_key,
            author_user_id=author.id,
            author_display_name=_format_user_display_name(author),
            text=normalized_text,
            is_private=payload.is_private,
        )
        self.repair_messages.add(message)
        for file_payload in files:
            self._create_repair_message_attachment(
                repair=repair,
                message=message,
                uploader=author,
                file_payload=file_payload,
            )
        return message

    def _create_verification_message_record(
        self,
        *,
        verification: Verification,
        author: User,
        payload: VerificationMessageCreateRequest,
        files: list[UploadedFilePayload],
    ) -> VerificationMessage:
        self._assert_private_note_creation_allowed(
            is_private=payload.is_private,
            current_user=author,
        )
        normalized_text = _normalize_message_text(payload.text)
        if normalized_text is None and not files:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Сообщение поверки должно содержать текст или хотя бы одно вложение.",
            )

        message = VerificationMessage(
            verification_id=verification.id,
            batch_key=verification.batch_key,
            author_user_id=author.id,
            author_display_name=_format_user_display_name(author),
            text=normalized_text,
            is_private=payload.is_private,
        )
        self.verification_messages.add(message)
        for file_payload in files:
            self._create_verification_message_attachment(
                verification=verification,
                message=message,
                uploader=author,
                file_payload=file_payload,
            )
        return message

    def _create_repair_message_attachment(
        self,
        *,
        repair: Repair,
        message: RepairMessage,
        uploader: User,
        file_payload: UploadedFilePayload,
    ) -> RepairMessageAttachment:
        normalized_file_name = _normalize_attachment_file_name(file_payload.file_name)
        if file_payload.file_size <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Attachment file must not be empty.",
            )

        storage_dir = (
            settings.attachment_storage_path / "repair-messages" / str(repair.id) / str(message.id)
        )
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_name = f"{uuid4().hex}{Path(normalized_file_name).suffix.lower()}"
        file_path = storage_dir / storage_name
        stored_file = _store_attachment_file(
            source_path=file_payload.temp_path,
            destination_path=file_path,
            file_name=normalized_file_name,
            content_type=file_payload.content_type,
            file_size=file_payload.file_size,
        )

        attachment = RepairMessageAttachment(
            repair_message_id=message.id,
            uploaded_by_user_id=uploader.id,
            uploaded_by_display_name=_format_user_display_name(uploader),
            file_name=normalized_file_name,
            file_mime_type=stored_file.content_type,
            file_size=stored_file.file_size,
            storage_path=str(file_path.relative_to(settings.attachment_storage_path)),
        )
        self.repair_message_attachments.add(attachment)
        return attachment

    def _create_verification_message_attachment(
        self,
        *,
        verification: Verification,
        message: VerificationMessage,
        uploader: User,
        file_payload: UploadedFilePayload,
    ) -> VerificationMessageAttachment:
        normalized_file_name = _normalize_attachment_file_name(file_payload.file_name)
        if file_payload.file_size <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Attachment file must not be empty.",
            )

        storage_dir = (
            settings.attachment_storage_path
            / "verification-messages"
            / str(verification.id)
            / str(message.id)
        )
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_name = f"{uuid4().hex}{Path(normalized_file_name).suffix.lower()}"
        file_path = storage_dir / storage_name
        stored_file = _store_attachment_file(
            source_path=file_payload.temp_path,
            destination_path=file_path,
            file_name=normalized_file_name,
            content_type=file_payload.content_type,
            file_size=file_payload.file_size,
        )

        attachment = VerificationMessageAttachment(
            verification_message_id=message.id,
            uploaded_by_user_id=uploader.id,
            uploaded_by_display_name=_format_user_display_name(uploader),
            file_name=normalized_file_name,
            file_mime_type=stored_file.content_type,
            file_size=stored_file.file_size,
            storage_path=str(file_path.relative_to(settings.attachment_storage_path)),
        )
        self.verification_message_attachments.add(attachment)
        return attachment

    def _create_comment_attachment(
        self,
        *,
        equipment: Equipment,
        comment: EquipmentComment,
        uploader: User,
        file_payload: UploadedFilePayload,
    ) -> EquipmentCommentAttachment:
        normalized_file_name = _normalize_attachment_file_name(file_payload.file_name)
        if file_payload.file_size <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Attachment file must not be empty.",
            )

        storage_dir = (
            settings.attachment_storage_path
            / "comment-attachments"
            / str(equipment.id)
            / str(comment.id)
        )
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_name = f"{uuid4().hex}{Path(normalized_file_name).suffix.lower()}"
        file_path = storage_dir / storage_name
        stored_file = _store_attachment_file(
            source_path=file_payload.temp_path,
            destination_path=file_path,
            file_name=normalized_file_name,
            content_type=file_payload.content_type,
            file_size=file_payload.file_size,
        )

        attachment = EquipmentCommentAttachment(
            equipment_comment_id=comment.id,
            uploaded_by_user_id=uploader.id,
            uploaded_by_display_name=_format_user_display_name(uploader),
            file_name=normalized_file_name,
            file_mime_type=stored_file.content_type,
            file_size=stored_file.file_size,
            storage_path=str(file_path.relative_to(settings.attachment_storage_path)),
        )
        self.comment_attachments.add(attachment)
        return attachment

    def _attach_uploaded_comment_attachment(
        self,
        *,
        equipment: Equipment,
        comment: EquipmentComment,
        uploader: User,
        upload_token: str,
    ) -> EquipmentCommentAttachment:
        staged_attachment = _load_comment_attachment_upload(
            equipment_id=equipment.id,
            user_id=uploader.id,
            upload_token=upload_token,
        )
        storage_dir = (
            settings.attachment_storage_path
            / "comment-attachments"
            / str(equipment.id)
            / str(comment.id)
        )
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_name = f"{uuid4().hex}{Path(staged_attachment.file_name).suffix.lower()}"
        file_path = storage_dir / storage_name
        shutil.move(str(staged_attachment.file_path), str(file_path))
        staged_attachment.manifest_path.unlink(missing_ok=True)

        attachment = EquipmentCommentAttachment(
            equipment_comment_id=comment.id,
            uploaded_by_user_id=uploader.id,
            uploaded_by_display_name=_format_user_display_name(uploader),
            file_name=staged_attachment.file_name,
            file_mime_type=staged_attachment.file_mime_type,
            file_size=staged_attachment.file_size,
            storage_path=str(file_path.relative_to(settings.attachment_storage_path)),
        )
        self.comment_attachments.add(attachment)
        return attachment

    def _get_folder(self, folder_id: int) -> EquipmentFolder:
        folder = self.folders.get_by_id(folder_id)
        if folder is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Folder not found.",
            )
        self._assert_folder_access(folder.id, detail="Folder not found.")
        return folder

    def _generate_deadline_preset_code(self, name: str) -> str:
        transliterated = (
            unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
        )
        slug = re.sub(r"[^a-z0-9]+", "-", transliterated.lower()).strip("-")
        base_code = slug or f"preset-{uuid4().hex[:8]}"
        candidate = base_code
        suffix = 2
        while self.deadline_presets.get_by_code(candidate) is not None:
            candidate = f"{base_code}-{suffix}"
            suffix += 1
        return candidate

    def _get_repair_deadline_settings(self, *, folder_id: int | None) -> RepairDeadlineSettings:
        if folder_id in self._deadline_settings_by_folder_id:
            return self._deadline_settings_by_folder_id[folder_id]

        settings = DEFAULT_REPAIR_DEADLINE_SETTINGS
        if folder_id is not None:
            folder = self.folders.get_by_id(folder_id)
            if folder is not None:
                settings = _coerce_repair_deadline_settings(folder.deadline_preset_snapshot_json)
                if settings is None and folder.deadline_preset_id is not None:
                    preset = self.deadline_presets.get_by_id(folder.deadline_preset_id)
                    if preset is not None:
                        settings = _build_repair_deadline_settings(
                            repair_total_days=preset.repair_total_days,
                            registration_after_arrival_days=preset.registration_after_arrival_days,
                            incoming_control_after_receipt_days=(
                                preset.incoming_control_after_receipt_days
                            ),
                            payment_after_control_days=preset.payment_after_control_days,
                        )
                if settings is None:
                    settings = DEFAULT_REPAIR_DEADLINE_SETTINGS

        self._deadline_settings_by_folder_id[folder_id] = settings
        return settings

    def _get_repair_deadline_settings_for_repair(
        self,
        *,
        repair: Repair,
        folder_id: int | None,
    ) -> RepairDeadlineSettings:
        try:
            return _build_repair_deadline_settings(
                repair_total_days=repair.repair_total_days_snapshot,
                registration_after_arrival_days=repair.registration_after_arrival_days_snapshot,
                incoming_control_after_receipt_days=(
                    repair.incoming_control_after_receipt_days_snapshot
                ),
                payment_after_control_days=repair.payment_after_control_days_snapshot,
            )
        except (TypeError, HTTPException):
            return self._get_repair_deadline_settings(folder_id=folder_id)

    def _get_repair_stage_template_payload(self, *, folder_id: int | None) -> object | None:
        if folder_id is not None:
            folder = self.folders.get_by_id(folder_id)
            if folder is not None:
                if folder.deadline_preset_id is not None:
                    preset = self.deadline_presets.get_by_id(folder.deadline_preset_id)
                    if preset is not None and preset.repair_stage_templates_json is not None:
                        return preset.repair_stage_templates_json
                snapshot_payload = (folder.deadline_preset_snapshot_json or {}).get(
                    "repair_stage_templates_json"
                )
                if snapshot_payload is not None:
                    return snapshot_payload
        return None

    def _get_verification_stage_template_payload(self, *, folder_id: int | None) -> object | None:
        if folder_id is not None:
            folder = self.folders.get_by_id(folder_id)
            if folder is not None:
                if folder.deadline_preset_id is not None:
                    preset = self.deadline_presets.get_by_id(folder.deadline_preset_id)
                    if preset is not None and preset.verification_stage_templates_json is not None:
                        return preset.verification_stage_templates_json
                snapshot_payload = (folder.deadline_preset_snapshot_json or {}).get(
                    "verification_stage_templates_json"
                )
                if snapshot_payload is not None:
                    return snapshot_payload
        return None

    def _normalize_deadline_preset_stage_templates(self, preset: DeadlinePreset) -> DeadlinePreset:
        repair_templates = _coerce_repair_stage_template_variants(
            preset.repair_stage_templates_json
        )
        verification_templates = _coerce_verification_stage_template_variants(
            preset.verification_stage_templates_json
        )
        preset.repair_stage_templates_json = (
            repair_templates
            if repair_templates is not None
            else _build_default_repair_stage_template_variants()
        )
        preset.verification_stage_templates_json = (
            verification_templates
            if verification_templates is not None
            else _build_default_verification_stage_template_variants()
        )
        return preset

    def _get_repair_stage_template_variants(
        self,
        *,
        folder_id: int | None,
    ) -> dict[str, object]:
        templates = _coerce_repair_stage_template_variants(
            self._get_repair_stage_template_payload(folder_id=folder_id)
        )
        if templates is not None:
            return templates
        return _build_default_repair_stage_template_variants()

    def _get_verification_stage_template_variants(
        self,
        *,
        folder_id: int | None,
    ) -> dict[str, object]:
        templates = _coerce_verification_stage_template_variants(
            self._get_verification_stage_template_payload(folder_id=folder_id)
        )
        if templates is not None:
            return templates
        return _build_default_verification_stage_template_variants()

    def _get_repair_stage_template_for_folder(
        self,
        *,
        folder_id: int | None,
        is_on_site: bool,
        variant_id: str | None = None,
        custom_stages_json: object | None = None,
    ) -> list[dict[str, object]]:
        raw_payload = self._get_repair_stage_template_payload(folder_id=folder_id)
        selected_variant_id = variant_id or _extract_process_template_variant_id(custom_stages_json)
        if not selected_variant_id and not _is_process_template_variants_payload(raw_payload):
            templates = (
                _coerce_repair_stage_templates(raw_payload)
                or _build_default_repair_stage_templates()
            )
            result = _get_enabled_stage_template_items(
                templates.get("on_site" if is_on_site else "offsite", [])
            )
            return result

        variants = (
            _coerce_repair_stage_template_variants(raw_payload)
            or _build_default_repair_stage_template_variants()
        )
        selected_variant = _select_process_template_variant(
            variants=variants,
            variant_id=selected_variant_id,
            route_kind="on_site" if is_on_site else "offsite",
        )
        return _build_stage_template_from_process_variant(
            selected_variant,
            key="sent_to_repair_at",
            fallback_label="Ремонт",
        )

    def _get_repair_stage_template_variant_for_folder(
        self,
        *,
        folder_id: int | None,
        is_on_site: bool,
        variant_id: str | None = None,
    ) -> dict[str, object] | None:
        variants = self._get_repair_stage_template_variants(folder_id=folder_id)
        return _select_process_template_variant(
            variants=variants,
            variant_id=variant_id,
            route_kind="on_site" if is_on_site else "offsite",
        )

    def _get_verification_stage_template_for_folder(
        self,
        *,
        folder_id: int | None,
        flow_mode: VerificationFlowMode,
        variant_id: str | None = None,
        custom_stages_json: object | None = None,
    ) -> list[dict[str, object]]:
        raw_payload = self._get_verification_stage_template_payload(folder_id=folder_id)
        selected_variant_id = variant_id or _extract_process_template_variant_id(custom_stages_json)
        if not selected_variant_id and not _is_process_template_variants_payload(raw_payload):
            templates = (
                _coerce_verification_stage_templates(raw_payload)
                or _build_default_verification_stage_templates()
            )
            template_key = _get_verification_stage_template_key(flow_mode)
            template_items = templates.get(template_key)
            if template_items is None:
                template_items = templates.get(flow_mode.value, [])
            return _get_enabled_stage_template_items(template_items)

        variants = (
            _coerce_verification_stage_template_variants(raw_payload)
            or _build_default_verification_stage_template_variants()
        )
        selected_variant = _select_process_template_variant(
            variants=variants,
            variant_id=selected_variant_id,
            route_kind="on_site" if _is_verification_on_site(flow_mode) else "offsite",
            flow_mode=flow_mode,
        )
        return _build_stage_template_from_process_variant(
            selected_variant,
            key="sent_to_verification_at",
            fallback_label="Поверка",
        )

    def _get_verification_stage_template_variant_for_folder(
        self,
        *,
        folder_id: int | None,
        flow_mode: VerificationFlowMode,
        variant_id: str | None = None,
    ) -> dict[str, object] | None:
        variants = self._get_verification_stage_template_variants(folder_id=folder_id)
        return _select_process_template_variant(
            variants=variants,
            variant_id=variant_id,
            route_kind="on_site" if _is_verification_on_site(flow_mode) else "offsite",
            flow_mode=flow_mode,
        )

    def _attach_repair_stage_template(
        self,
        *,
        repair: Repair,
        folder_id: int | None,
    ) -> Repair:
        stage_template = self._get_repair_stage_template_for_folder(
            folder_id=folder_id,
            is_on_site=repair.is_on_site,
            custom_stages_json=repair.custom_stages_json,
        )
        repair.stage_template = stage_template
        repair.custom_stages = _normalize_process_custom_stages_for_read(
            repair.custom_stages_json,
            stage_template=stage_template,
        )
        return repair

    def _attach_verification_stage_template(
        self,
        *,
        verification: Verification,
        folder_id: int | None,
    ) -> Verification:
        flow_mode = _get_verification_flow_mode(
            flow_mode=verification.flow_mode,
            is_on_site=verification.is_on_site,
        )
        verification.flow_mode = flow_mode
        verification.is_on_site = _is_verification_on_site(flow_mode)
        stage_template = self._get_verification_stage_template_for_folder(
            folder_id=folder_id,
            flow_mode=flow_mode,
            custom_stages_json=verification.custom_stages_json,
        )
        verification.stage_template = stage_template
        verification.custom_stages = _normalize_process_custom_stages_for_read(
            verification.custom_stages_json,
            stage_template=stage_template,
        )
        return verification

    def _enrich_equipment_processes(self, equipment: Equipment) -> Equipment:
        if equipment.active_repair is not None:
            self._attach_repair_stage_template(
                repair=equipment.active_repair,
                folder_id=equipment.folder_id,
            )
        if equipment.active_verification is not None:
            self._attach_verification_stage_template(
                verification=equipment.active_verification,
                folder_id=equipment.folder_id,
            )
        return equipment

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

    def _assert_repair_batch_access(self, repairs: list[Repair]) -> None:
        for repair in repairs:
            equipment = repair.equipment or self.get_equipment(equipment_id=repair.equipment_id)
            self._assert_folder_access(
                equipment.folder_id,
                detail="Активная группа ремонта не найдена.",
            )

    def _assert_verification_batch_access(self, verifications: list[Verification]) -> None:
        for verification in verifications:
            equipment = verification.equipment or self.get_equipment(
                equipment_id=verification.equipment_id
            )
            self._assert_folder_access(
                equipment.folder_id,
                detail="Активная группа поверки не найдена.",
            )

    def _get_attachment(self, *, equipment_id: int, attachment_id: int) -> EquipmentAttachment:
        self.get_equipment(equipment_id=equipment_id)
        attachment = self.attachments.get_by_id(attachment_id)
        if attachment is None or attachment.equipment_id != equipment_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Attachment not found.",
            )
        return attachment

    def _get_comment(self, *, equipment_id: int, comment_id: int) -> EquipmentComment:
        self.get_equipment(equipment_id=equipment_id)
        comment = self.comments.get_by_id(comment_id)
        if comment is None or comment.equipment_id != equipment_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Comment not found.",
            )
        self._assert_private_note_visible(
            is_private=comment.is_private,
            detail="Comment not found.",
        )
        return comment

    def _get_comment_attachment(
        self,
        *,
        comment_id: int,
        attachment_id: int,
    ) -> EquipmentCommentAttachment:
        attachment = self.comment_attachments.get_by_id(attachment_id)
        if attachment is None or attachment.equipment_comment_id != comment_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Comment attachment not found.",
            )
        return attachment

    def _get_active_repair(self, *, equipment_id: int) -> Repair:
        self.get_equipment(equipment_id=equipment_id)
        repair = self.repairs.get_active_by_equipment_id(equipment_id=equipment_id)
        if repair is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Для этого прибора нет активного ремонта.",
            )
        return repair

    def _get_active_verification(self, *, equipment_id: int) -> Verification:
        equipment = self.get_equipment(equipment_id=equipment_id)
        if not _supports_verification(equipment.equipment_type):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Для этого прибора активная поверка недоступна.",
            )
        verification = self.verifications.get_active_by_equipment_id(equipment_id=equipment_id)
        if verification is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Для этого прибора нет активной поверки.",
            )
        return verification

    def _sync_equipment_status(self, *, equipment: Equipment) -> None:
        if self.repairs.get_active_by_equipment_id(equipment_id=equipment.id) is not None:
            equipment.status = EquipmentStatus.IN_REPAIR
            return

        if (
            _supports_verification(equipment.equipment_type)
            and self.verifications.get_active_by_equipment_id(equipment_id=equipment.id) is not None
        ):
            equipment.status = EquipmentStatus.IN_VERIFICATION
            return

        if equipment.status in {EquipmentStatus.IN_REPAIR, EquipmentStatus.IN_VERIFICATION}:
            equipment.status = EquipmentStatus.IN_WORK

    def _get_repair_message(self, *, repair: Repair, message_id: int) -> RepairMessage:
        message = self.repair_messages.get_by_id(message_id)
        if message is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Repair message not found.",
            )
        if repair.batch_key:
            if message.batch_key != repair.batch_key:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Repair message not found.",
                )
            self._assert_private_note_visible(
                is_private=message.is_private,
                detail="Repair message not found.",
            )
            return message
        if message.repair_id != repair.id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Repair message not found.",
            )
        self._assert_private_note_visible(
            is_private=message.is_private,
            detail="Repair message not found.",
        )
        return message

    def _get_verification_message(
        self,
        *,
        verification_id: int,
        message_id: int,
    ) -> VerificationMessage:
        message = self.verification_messages.get_by_id(message_id)
        if message is None or message.verification_id != verification_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Verification message not found.",
            )
        self._assert_private_note_visible(
            is_private=message.is_private,
            detail="Verification message not found.",
        )
        return message

    def _get_repair_message_attachment(
        self,
        *,
        message_id: int,
        attachment_id: int,
    ) -> RepairMessageAttachment:
        attachment = self.repair_message_attachments.get_by_id(attachment_id)
        if attachment is None or attachment.repair_message_id != message_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Repair attachment not found.",
            )
        return attachment

    def _get_verification_message_attachment(
        self,
        *,
        message_id: int,
        attachment_id: int,
    ) -> VerificationMessageAttachment:
        attachment = self.verification_message_attachments.get_by_id(attachment_id)
        if attachment is None or attachment.verification_message_id != message_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Verification attachment not found.",
            )
        return attachment

    def _assert_comment_owner(self, *, comment: EquipmentComment, current_user: User) -> None:
        if comment.author_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot modify this comment.",
            )

    def _assert_comment_delete_access(
        self,
        *,
        comment: EquipmentComment,
        current_user: User,
    ) -> None:
        if has_admin_access(current_user.role):
            return
        if comment.author_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot delete this comment.",
            )

    def _assert_repair_message_owner(
        self,
        *,
        message: RepairMessage,
        current_user: User,
    ) -> None:
        if has_admin_access(current_user.role):
            return
        if message.author_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot delete this repair message.",
            )

    def _assert_repair_message_editor(
        self,
        *,
        message: RepairMessage,
        current_user: User,
    ) -> None:
        if message.author_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot modify this repair message.",
            )

    def _assert_verification_message_owner(
        self,
        *,
        message: VerificationMessage,
        current_user: User,
    ) -> None:
        if has_admin_access(current_user.role):
            return
        if message.author_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot delete this verification message.",
            )

    def _assert_verification_message_editor(
        self,
        *,
        message: VerificationMessage,
        current_user: User,
    ) -> None:
        if message.author_user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot modify this verification message.",
            )

    def _build_verification_queue_item(
        self,
        *,
        verification: Verification,
        equipment: Equipment,
        si_verification: SIVerification | None,
        has_active_repair: bool,
    ) -> VerificationQueueItemRead:
        flow_mode = _get_verification_flow_mode(
            flow_mode=verification.flow_mode,
            is_on_site=verification.is_on_site,
        )
        stage_template = self._get_verification_stage_template_for_folder(
            folder_id=equipment.folder_id,
            flow_mode=flow_mode,
            custom_stages_json=verification.custom_stages_json,
        )
        return VerificationQueueItemRead(
            equipment_id=equipment.id,
            verification_id=verification.id,
            batch_key=verification.batch_key,
            batch_name=verification.batch_name,
            is_on_site=_is_verification_on_site(flow_mode),
            flow_mode=flow_mode,
            stage_template=stage_template,
            folder_id=equipment.folder_id,
            object_name=equipment.object_name,
            equipment_type=equipment.equipment_type,
            equipment_name=equipment.name,
            modification=equipment.modification,
            serial_number=equipment.serial_number,
            manufacture_year=equipment.manufacture_year,
            route_city=verification.route_city,
            route_destination=verification.route_destination,
            sent_to_verification_at=verification.sent_to_verification_at,
            received_at_destination_at=verification.received_at_destination_at,
            handed_to_csm_at=verification.handed_to_csm_at,
            verification_completed_at=verification.verification_completed_at,
            picked_up_from_csm_at=verification.picked_up_from_csm_at,
            shipped_back_at=verification.shipped_back_at,
            returned_from_verification_at=verification.returned_from_verification_at,
            custom_stages=_normalize_process_custom_stages_for_read(
                verification.custom_stages_json,
                stage_template=stage_template,
            ),
            closed_at=verification.closed_at,
            has_active_repair=has_active_repair,
            result_docnum=si_verification.result_docnum if si_verification else None,
            valid_date=si_verification.valid_date if si_verification else None,
            arshin_url=si_verification.arshin_url if si_verification else None,
            created_at=verification.created_at,
            updated_at=verification.updated_at,
        )

    def _build_repair_queue_item(
        self,
        *,
        repair: Repair,
        equipment: Equipment,
        si_verification: SIVerification | None,
        has_active_verification: bool,
    ) -> RepairQueueItemRead:
        stage_template = self._get_repair_stage_template_for_folder(
            folder_id=equipment.folder_id,
            is_on_site=repair.is_on_site,
            custom_stages_json=repair.custom_stages_json,
        )
        deadline_settings = self._get_repair_deadline_settings_for_repair(
            repair=repair,
            folder_id=equipment.folder_id,
        )
        registration_deadline_at = _calculate_registration_deadline_at(
            arrived_to_lensk_at=repair.arrived_to_lensk_at,
            registration_after_arrival_days=deadline_settings.registration_after_arrival_days,
        )
        control_deadline_at = _calculate_control_deadline_at(
            actually_received_at=repair.actually_received_at,
            registration_deadline_at=registration_deadline_at,
            incoming_control_after_receipt_days=deadline_settings.incoming_control_after_receipt_days,
        )
        payment_deadline_at = _calculate_payment_deadline_at(
            incoming_control_at=repair.incoming_control_at,
            control_deadline_at=control_deadline_at,
            payment_after_control_days=deadline_settings.payment_after_control_days,
        )
        repair_overdue_days = _calculate_repair_overdue_days(
            repair_deadline_at=repair.repair_deadline_at,
            arrived_to_origin_at=repair.arrived_to_lensk_at,
        )
        registration_overdue_days = _calculate_stage_overdue_days(
            deadline_at=registration_deadline_at,
            completed_at=repair.actually_received_at,
        )
        control_overdue_days = _calculate_stage_overdue_days(
            deadline_at=control_deadline_at,
            completed_at=repair.incoming_control_at,
        )
        payment_overdue_days = _calculate_stage_overdue_days(
            deadline_at=payment_deadline_at,
            completed_at=repair.paid_at,
        )
        custom_stages = _normalize_process_custom_stages_for_read(
            repair.custom_stages_json,
            stage_template=stage_template,
        )
        return RepairQueueItemRead(
            repair_id=repair.id,
            equipment_id=equipment.id,
            batch_key=repair.batch_key,
            batch_name=repair.batch_name,
            is_on_site=repair.is_on_site,
            stage_template=stage_template,
            folder_id=equipment.folder_id,
            object_name=equipment.object_name,
            equipment_type=equipment.equipment_type,
            equipment_name=equipment.name,
            modification=equipment.modification,
            serial_number=equipment.serial_number,
            manufacture_year=equipment.manufacture_year,
            current_location_manual=equipment.current_location_manual,
            route_city=repair.route_city,
            route_destination=repair.route_destination,
            sent_to_repair_at=repair.sent_to_repair_at,
            repair_deadline_at=repair.repair_deadline_at,
            arrived_to_destination_at=repair.arrived_to_destination_at,
            sent_from_repair_at=repair.sent_from_repair_at,
            sent_from_irkutsk_at=repair.sent_from_irkutsk_at,
            arrived_to_lensk_at=repair.arrived_to_lensk_at,
            registration_deadline_at=registration_deadline_at,
            actually_received_at=repair.actually_received_at,
            control_deadline_at=control_deadline_at,
            incoming_control_at=repair.incoming_control_at,
            payment_deadline_at=payment_deadline_at,
            paid_at=repair.paid_at,
            custom_stages=custom_stages,
            closed_at=repair.closed_at,
            has_active_verification=has_active_verification,
            result_docnum=si_verification.result_docnum if si_verification else None,
            arshin_url=si_verification.arshin_url if si_verification else None,
            current_stage_label=_build_repair_progress_label(
                repair=repair,
                stage_template=stage_template,
                custom_stages=custom_stages,
            ),
            repair_overdue_days=repair_overdue_days,
            registration_overdue_days=registration_overdue_days,
            control_overdue_days=control_overdue_days,
            payment_overdue_days=payment_overdue_days,
            max_overdue_days=max(
                repair_overdue_days,
                registration_overdue_days,
                control_overdue_days,
                payment_overdue_days,
            ),
            created_at=repair.created_at,
            updated_at=repair.updated_at,
        )

    def _build_existing_si_message(
        self,
        existing: SIVerification,
        *,
        prefix: str,
    ) -> str:
        equipment = existing.equipment
        if equipment is None:
            return f"{prefix} к другому прибору."

        folder_name: str | None = None
        if equipment.folder_id is not None:
            folder = self.folders.get_by_id(equipment.folder_id)
            if folder is not None:
                folder_name = folder.name

        message = f"{prefix} за прибором «{equipment.name}»"
        if folder_name:
            message = f"{message} в папке «{folder_name}»"
        return f"{message}."

    def _validate_si_payload_for_create(self, payload: EquipmentCreateRequest) -> None:
        if _is_arshin_equipment_type(payload.equipment_type):
            if payload.si_verification is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="SI and ESI equipment must be created from an Arshin search result.",
                )
            if payload.exclude_from_arshin_refresh and not payload.created_manually:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        "Only manually created SI and ESI equipment can be excluded "
                        "from Arshin refresh."
                    ),
                )
            if payload.created_manually:
                certificate_number = _resolve_si_certificate_number(
                    payload.si_verification,
                    equipment_type=payload.equipment_type,
                )
                if certificate_number is None:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Manual SI and ESI creation requires a certificate number.",
                    )
                return
            if (
                payload.equipment_type == EquipmentType.SI
                and payload.si_verification.detail_payload_json is None
            ):
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="SI equipment creation requires Arshin detail fetch by vri_id.",
                )

            normalized_vri_id = _normalize_required_text(
                payload.si_verification.vri_id,
                field_label="SI vri_id",
            )
            existing = self.si_verifications.get_by_vri_id(vri_id=normalized_vri_id)
            if existing is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=self._build_existing_si_message(
                        existing,
                        prefix="Прибор с этой записью Аршина уже существует",
                    ),
                )
            return

        if payload.created_manually or payload.exclude_from_arshin_refresh:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Manual Arshin flags are available only for SI and ESI equipment.",
            )
        if payload.si_verification is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="SI verification data is allowed only for SI equipment.",
            )

    def _assert_create_equipment_access(
        self,
        *,
        payload: EquipmentCreateRequest,
        current_user: User | None,
    ) -> None:
        if current_user is None or has_operator_access(current_user.role):
            return

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Equipment creation is not available for this account.",
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


def _get_latest_completed_stage_label(
    *,
    stage_template: list[dict[str, object]],
    value_by_key: dict[str, date | None],
    custom_stages: list[object] | None = None,
) -> str:
    latest: tuple[date, int, str] | None = None
    stage_order_by_key: dict[str, int] = {}

    def consider(*, label: str, completed_at: object, order: int) -> None:
        nonlocal latest
        normalized_date = _coerce_process_progress_date(completed_at)
        if normalized_date is None:
            return
        if (
            latest is None
            or normalized_date > latest[0]
            or (normalized_date == latest[0] and order > latest[1])
        ):
            latest = (normalized_date, order, label)

    for index, item in enumerate(stage_template):
        key = str(_get_process_stage_item_field(item, "key") or "")
        label = str(_get_process_stage_item_field(item, "label") or "")
        stage_order_by_key[key] = index
        consider(
            label=label,
            completed_at=value_by_key.get(key),
            order=index * 10000,
        )

    for index, custom_stage in enumerate(custom_stages or []):
        after_key = str(_get_process_stage_item_field(custom_stage, "after_key") or "")
        anchor_order = stage_order_by_key.get(after_key)
        if anchor_order is None:
            continue
        sort_order = _coerce_process_stage_sort_order(
            _get_process_stage_item_field(custom_stage, "sort_order"),
        )
        consider(
            label=str(_get_process_stage_item_field(custom_stage, "label") or ""),
            completed_at=_get_process_stage_item_field(custom_stage, "date"),
            order=anchor_order * 10000 + sort_order * 100 + index + 1,
        )

    if latest is not None:
        return latest[2]

    for item in reversed(stage_template):
        key = str(_get_process_stage_item_field(item, "key") or "")
        if value_by_key.get(key) is not None:
            return str(_get_process_stage_item_field(item, "label") or "Этап")
    if stage_template:
        return str(_get_process_stage_item_field(stage_template[0], "label") or "Этап")
    return "Этап"


def _build_repair_progress_label(
    *,
    repair: Repair,
    stage_template: list[dict[str, object]],
    custom_stages: list[object] | None = None,
) -> str:
    if repair.closed_at is not None:
        return "Ремонт завершен"
    return _get_latest_completed_stage_label(
        stage_template=stage_template,
        value_by_key={
            "sent_to_repair_at": repair.sent_to_repair_at,
            "arrived_to_destination_at": repair.arrived_to_destination_at,
            "sent_from_repair_at": repair.sent_from_repair_at,
            "sent_from_irkutsk_at": repair.sent_from_irkutsk_at,
            "arrived_to_lensk_at": repair.arrived_to_lensk_at,
            "actually_received_at": repair.actually_received_at,
            "incoming_control_at": repair.incoming_control_at,
            "paid_at": repair.paid_at,
        },
        custom_stages=custom_stages,
    )


def _get_verification_progress_label(item: VerificationQueueItemRead) -> str:
    if item.closed_at is not None:
        return "Поверка завершена"
    return _get_latest_completed_stage_label(
        stage_template=item.stage_template,
        value_by_key={
            "sent_to_verification_at": item.sent_to_verification_at,
            "received_at_destination_at": item.received_at_destination_at,
            "handed_to_csm_at": item.handed_to_csm_at,
            "verification_completed_at": item.verification_completed_at,
            "picked_up_from_csm_at": item.picked_up_from_csm_at,
            "shipped_back_at": item.shipped_back_at,
            "returned_from_verification_at": item.returned_from_verification_at,
        },
        custom_stages=item.custom_stages,
    )


def _coerce_process_progress_date(raw_value: object) -> date | None:
    if raw_value is None:
        return None
    if isinstance(raw_value, datetime):
        return raw_value.date()
    if isinstance(raw_value, date):
        return raw_value
    if isinstance(raw_value, str):
        try:
            return date.fromisoformat(raw_value[:10])
        except ValueError:
            return None
    return None


def _get_process_stage_item_field(item: object, field_name: str) -> object:
    if isinstance(item, dict):
        return item.get(field_name)
    return getattr(item, field_name, None)


def _coerce_process_stage_sort_order(raw_value: object) -> int:
    if isinstance(raw_value, int):
        return raw_value
    if isinstance(raw_value, str):
        try:
            return int(raw_value)
        except ValueError:
            return 0
    return 0


def _build_repair_archive_name(
    *,
    folder_name: str,
    start_date: date,
    end_date: date | None,
) -> str:
    normalized_folder_name = re.sub(r'[\\/:*?"<>|]+', " ", folder_name).strip()
    normalized_folder_name = re.sub(r"\s+", " ", normalized_folder_name) or "Без папки"
    end_label = end_date.strftime("%d.%m.%Y") if end_date else "без даты"
    return f"Ремонт {normalized_folder_name} {start_date.strftime('%d.%m.%Y')} по {end_label}"


def _build_verification_archive_name(
    *,
    label: str,
    start_date: date,
    end_date: date | None,
) -> str:
    normalized_label = re.sub(r'[\\/:*?"<>|]+', " ", label).strip()
    normalized_label = re.sub(r"\s+", " ", normalized_label) or "Без папки"
    end_label = end_date.strftime("%d.%m.%Y") if end_date else "без даты"
    return f"Поверка {normalized_label} {start_date.strftime('%d.%m.%Y')} по {end_label}"


def _build_equipment_batch_member_label(equipment: Equipment) -> str:
    serial_number = equipment.serial_number
    if not serial_number and equipment.si_verification is not None:
        serial_number = equipment.si_verification.mi_number
    if serial_number:
        return f"{equipment.name} (зав. № {serial_number})"
    return equipment.name


def _extract_mention_keys(text: str | None) -> set[str]:
    if not text:
        return set()
    return {
        match.group(1).strip().lower()
        for match in re.finditer(r"(?<![\w@])@([A-Za-zА-Яа-яЁё0-9_]+)", text)
        if match.group(1).strip()
    }


def _should_enqueue_subscription_notification(
    *,
    category: EventCategory,
    action: str,
) -> bool:
    if category in (EventCategory.REPAIR, EventCategory.VERIFICATION):
        return True
    if category != EventCategory.EQUIPMENT:
        return False
    return action in {
        "equipment_updated",
        "si_refreshed",
        "attachment_created",
        "attachment_deleted",
        "comment_created",
        "comment_updated",
        "comment_deleted",
    }


def _build_subscription_notification_label(
    *,
    category: EventCategory,
    equipment_name: str | None,
) -> str:
    if category == EventCategory.REPAIR:
        return "ремонту"
    if category == EventCategory.VERIFICATION:
        return "поверке"
    normalized_equipment_name = (equipment_name or "").strip() or "без названия"
    return f"карточке прибора «{normalized_equipment_name}»"


def _calculate_repair_overdue_days(
    *,
    repair_deadline_at: date,
    arrived_to_origin_at: date | None,
) -> int:
    comparison_date = arrived_to_origin_at or date.today()
    return max((comparison_date - repair_deadline_at).days, 0)


def _calculate_stage_overdue_days(
    *,
    deadline_at: date | None,
    completed_at: date | None,
) -> int:
    if deadline_at is None:
        return 0
    comparison_date = completed_at or date.today()
    return max((comparison_date - deadline_at).days, 0)


def _get_verification_flow_mode(
    *,
    flow_mode: VerificationFlowMode | str | None,
    is_on_site: bool,
) -> VerificationFlowMode:
    if isinstance(flow_mode, VerificationFlowMode):
        return flow_mode
    if isinstance(flow_mode, str):
        try:
            return VerificationFlowMode(flow_mode)
        except ValueError:
            pass
    return (
        VerificationFlowMode.ONSITE_WITH_DEMOLITION
        if is_on_site
        else VerificationFlowMode.OFFSITE_WITH_DEMOLITION
    )


def _is_verification_on_site(flow_mode: VerificationFlowMode) -> bool:
    return flow_mode != VerificationFlowMode.OFFSITE_WITH_DEMOLITION


def _get_repair_last_stage_completion(
    *,
    repair: Repair,
    stage_template: list[dict[str, object]],
) -> tuple[str, date | None]:
    value_by_key = {
        "sent_to_repair_at": repair.sent_to_repair_at,
        "arrived_to_destination_at": repair.arrived_to_destination_at,
        "sent_from_repair_at": repair.sent_from_repair_at,
        "sent_from_irkutsk_at": repair.sent_from_irkutsk_at,
        "arrived_to_lensk_at": repair.arrived_to_lensk_at,
        "actually_received_at": repair.actually_received_at,
        "incoming_control_at": repair.incoming_control_at,
        "paid_at": repair.paid_at,
    }
    custom_stages = _normalize_process_custom_stages_for_read(
        repair.custom_stages_json,
        stage_template=stage_template,
    )
    custom_by_anchor: dict[str, list[dict[str, object]]] = {}
    for custom_stage in custom_stages:
        custom_by_anchor.setdefault(str(custom_stage["after_key"]), []).append(custom_stage)

    last_label = str(stage_template[0]["label"]) if stage_template else "этап"
    last_date = repair.sent_to_repair_at
    for stage in stage_template:
        stage_key = str(stage["key"])
        last_label = str(stage["label"])
        last_date = value_by_key.get(stage_key)
        for custom_stage in custom_by_anchor.get(stage_key, []):
            last_label = str(custom_stage["label"])
            raw_date = custom_stage.get("date")
            if isinstance(raw_date, date) and not isinstance(raw_date, datetime):
                last_date = raw_date
            elif isinstance(raw_date, str):
                last_date = date.fromisoformat(raw_date[:10])
            else:
                last_date = None
    return last_label, last_date


def _build_repair_stage_value_pairs(
    *,
    stage_template: list[dict[str, object]],
    sent_to_repair_at: date,
    arrived_to_destination_at: date | None,
    sent_from_repair_at: date | None,
    sent_from_irkutsk_at: date | None,
    arrived_to_lensk_at: date | None,
    actually_received_at: date | None,
    incoming_control_at: date | None,
    paid_at: date | None,
) -> tuple[tuple[str, date | None], ...]:
    value_by_key = {
        "sent_to_repair_at": sent_to_repair_at,
        "arrived_to_destination_at": arrived_to_destination_at,
        "sent_from_repair_at": sent_from_repair_at,
        "sent_from_irkutsk_at": sent_from_irkutsk_at,
        "arrived_to_lensk_at": arrived_to_lensk_at,
        "actually_received_at": actually_received_at,
        "incoming_control_at": incoming_control_at,
        "paid_at": paid_at,
    }
    return tuple((str(item["label"]), value_by_key[str(item["key"])]) for item in stage_template)


def _build_verification_stage_value_pairs(
    *,
    stage_template: list[dict[str, object]],
    sent_to_verification_at: date,
    received_at_destination_at: date | None,
    handed_to_csm_at: date | None,
    verification_completed_at: date | None,
    picked_up_from_csm_at: date | None,
    shipped_back_at: date | None,
    returned_from_verification_at: date | None,
) -> tuple[tuple[str, date | None], ...]:
    value_by_key = {
        "sent_to_verification_at": sent_to_verification_at,
        "received_at_destination_at": received_at_destination_at,
        "handed_to_csm_at": handed_to_csm_at,
        "verification_completed_at": verification_completed_at,
        "picked_up_from_csm_at": picked_up_from_csm_at,
        "shipped_back_at": shipped_back_at,
        "returned_from_verification_at": returned_from_verification_at,
    }
    return tuple((str(item["label"]), value_by_key[str(item["key"])]) for item in stage_template)


def _validate_repair_milestone_order(
    *,
    stage_template: list[dict[str, object]],
    sent_to_repair_at: date,
    arrived_to_destination_at: date | None,
    sent_from_repair_at: date | None,
    sent_from_irkutsk_at: date | None,
    arrived_to_lensk_at: date | None,
    actually_received_at: date | None,
    incoming_control_at: date | None,
    paid_at: date | None,
) -> None:
    _validate_milestone_order(
        milestones=_build_repair_stage_value_pairs(
            stage_template=stage_template,
            sent_to_repair_at=sent_to_repair_at,
            arrived_to_destination_at=arrived_to_destination_at,
            sent_from_repair_at=sent_from_repair_at,
            sent_from_irkutsk_at=sent_from_irkutsk_at,
            arrived_to_lensk_at=arrived_to_lensk_at,
            actually_received_at=actually_received_at,
            incoming_control_at=incoming_control_at,
            paid_at=paid_at,
        )
    )


def _validate_verification_milestone_order(
    *,
    stage_template: list[dict[str, object]],
    sent_to_verification_at: date,
    received_at_destination_at: date | None,
    handed_to_csm_at: date | None,
    verification_completed_at: date | None,
    picked_up_from_csm_at: date | None,
    shipped_back_at: date | None,
    returned_from_verification_at: date | None,
) -> None:
    _validate_milestone_order(
        milestones=_build_verification_stage_value_pairs(
            stage_template=stage_template,
            sent_to_verification_at=sent_to_verification_at,
            received_at_destination_at=received_at_destination_at,
            handed_to_csm_at=handed_to_csm_at,
            verification_completed_at=verification_completed_at,
            picked_up_from_csm_at=picked_up_from_csm_at,
            shipped_back_at=shipped_back_at,
            returned_from_verification_at=returned_from_verification_at,
        )
    )


def _validate_milestone_order(*, milestones: tuple[tuple[str, date | None], ...]) -> None:
    missing_previous_label: str | None = None
    previous_label: str | None = None
    previous_value: date | None = None

    for label, value in milestones:
        if value is None:
            if missing_previous_label is None:
                missing_previous_label = label
            continue

        if missing_previous_label is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(
                    f"Этап «{label}» нельзя указать раньше, чем этап «{missing_previous_label}»."
                ),
            )

        if previous_value is not None and value < previous_value:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=(f"Этап «{label}» не может быть раньше этапа «{previous_label}»."),
            )

        previous_label = label
        previous_value = value


def _normalize_measurement_unit(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > 128:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Measurement unit is too long. Maximum length is 128 characters.",
        )
    return normalized


def _normalize_long_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > 1024:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Field is too long. Maximum length is 1024 characters.",
        )
    return normalized


def _normalize_attachment_file_name(value: str | None) -> str:
    candidate = Path(value or "").name.strip()
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Attachment file name must not be empty.",
        )
    if len(candidate) > 255:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Attachment file name is too long. Maximum length is 255 characters.",
        )
    return candidate


def _normalize_comment_text(value: str | None, *, allow_empty: bool = False) -> str:
    if value is None:
        if allow_empty:
            return ""
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Comment text must not be empty.",
        )
    normalized = value.strip()
    if not normalized:
        if allow_empty:
            return ""
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Comment text must not be empty.",
        )
    if len(normalized) > 4000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Comment text is too long. Maximum length is 4000 characters.",
        )
    return normalized


def _normalize_message_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > 4000:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Message text is too long. Maximum length is 4000 characters.",
        )
    return normalized


def _validate_manufacture_year(value: int | None) -> int | None:
    if value is None:
        return None
    if value < 1900 or value > 2100:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Manufacture year must be between 1900 and 2100.",
        )
    return value


def _normalize_equipment_compliance_date(
    equipment_type: EquipmentType,
    value: date | None,
) -> date | None:
    if equipment_type not in {EquipmentType.IO, EquipmentType.VO}:
        return None
    return value


def _normalize_equipment_compliance_interval_months(
    equipment_type: EquipmentType,
    value: int | None,
) -> int | None:
    if equipment_type not in {EquipmentType.IO, EquipmentType.VO}:
        return None
    if value is None:
        return None
    if value < 1 or value > 240:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Compliance interval must be between 1 and 240 months.",
        )
    return value


def _normalize_equipment_manual_verification_interval_months(
    equipment_type: EquipmentType,
    value: int | None,
) -> int | None:
    if equipment_type != EquipmentType.SI:
        return None
    if value is None:
        return None
    if value < 1 or value > 240:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Manual verification interval must be between 1 and 240 months.",
        )
    return value


def _is_arshin_equipment_type(equipment_type: EquipmentType) -> bool:
    return equipment_type in {EquipmentType.SI, EquipmentType.ESI}


def _assert_equipment_type_transition_allowed(
    *,
    current_type: EquipmentType,
    next_type: EquipmentType,
) -> None:
    if next_type == current_type:
        return

    allowed_targets = EDITABLE_EQUIPMENT_TYPE_TRANSITIONS.get(current_type, frozenset())
    if next_type in allowed_targets:
        return

    allowed_labels = ", ".join(
        f"«{equipment_type.value}»" for equipment_type in sorted(allowed_targets, key=str)
    )
    if allowed_labels:
        detail = (
            f"Категорию прибора можно менять только из «{current_type.value}» в {allowed_labels}."
        )
    else:
        detail = "Категорию этого прибора после создания менять нельзя."
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        detail=detail,
    )


def _supports_verification(equipment_type: EquipmentType) -> bool:
    return _is_arshin_equipment_type(equipment_type)


def _get_arshin_document_label(equipment_type: EquipmentType) -> str:
    if equipment_type == EquipmentType.ESI:
        return "Номер в перечне"
    return "Свидетельство"


def _get_equipment_compliance_date_field_label(equipment_type: EquipmentType) -> str:
    if equipment_type == EquipmentType.IO:
        return "дата аттестации"
    if equipment_type == EquipmentType.VO:
        return "дата техосвидетельствования"
    return "контрольная дата"


def _get_equipment_compliance_interval_field_label(equipment_type: EquipmentType) -> str:
    if equipment_type == EquipmentType.IO:
        return "период аттестации"
    if equipment_type == EquipmentType.VO:
        return "период техосвидетельствования"
    return "контрольный период"


def _add_months(base_date: date, months: int) -> date:
    total_month = (base_date.month - 1) + months
    year = base_date.year + total_month // 12
    month = total_month % 12 + 1
    day = min(base_date.day, monthrange(year, month)[1])
    return date(year, month, day)


def _calculate_manual_verification_valid_date(
    verification_date: datetime,
    interval_months: int,
) -> datetime:
    valid_until = _add_months(verification_date.date(), interval_months) - timedelta(days=1)
    return datetime.combine(valid_until, verification_date.timetz())


def _extract_si_source_valid_date(si_verification: SIVerification) -> datetime | None:
    detail_payload = (
        si_verification.detail_payload_json
        if isinstance(si_verification.detail_payload_json, dict)
        else {}
    )
    raw_payload = (
        si_verification.raw_payload_json
        if isinstance(si_verification.raw_payload_json, dict)
        else {}
    )
    vri_info = detail_payload.get("vriInfo")
    detail_vri_info = vri_info if isinstance(vri_info, dict) else {}

    return _first_nonempty_datetime(
        _parse_date_to_datetime(detail_vri_info.get("validDate")),
        _parse_date_to_datetime(detail_payload.get("valid_date")),
        _parse_date_to_datetime(raw_payload.get("validDate")),
        _parse_date_to_datetime(raw_payload.get("valid_date")),
        si_verification.valid_date,
    )


def _resolve_equipment_si_valid_date(
    *,
    manual_interval_months: int | None,
    verification_date: datetime | None,
    fallback_valid_date: datetime | None,
) -> datetime | None:
    if manual_interval_months is not None and verification_date is not None:
        return _calculate_manual_verification_valid_date(
            verification_date,
            manual_interval_months,
        )
    return fallback_valid_date


def _sync_equipment_si_valid_date(equipment: Equipment) -> None:
    if equipment.equipment_type != EquipmentType.SI or equipment.si_verification is None:
        return

    equipment.si_verification.valid_date = _resolve_equipment_si_valid_date(
        manual_interval_months=equipment.manual_verification_interval_months,
        verification_date=equipment.si_verification.verification_date,
        fallback_valid_date=_extract_si_source_valid_date(equipment.si_verification),
    )


def _get_equipment_next_due_date(equipment: Equipment) -> date | None:
    if _is_arshin_equipment_type(equipment.equipment_type):
        if equipment.si_verification is None or equipment.si_verification.valid_date is None:
            return None
        return equipment.si_verification.valid_date.date()

    if equipment.equipment_type not in {EquipmentType.IO, EquipmentType.VO}:
        return None

    if equipment.compliance_date is None or equipment.compliance_interval_months is None:
        return None

    return _add_months(equipment.compliance_date, equipment.compliance_interval_months)


def _format_export_date(value: date | None) -> str | None:
    if value is None:
        return None
    return value.strftime("%d.%m.%Y")


def _format_user_display_name(user: User) -> str:
    parts = [user.last_name.strip(), user.first_name.strip()]
    if user.patronymic and user.patronymic.strip():
        parts.append(user.patronymic.strip())
    return " ".join(part for part in parts if part)


def _pluralize_recipient_dative(count: int) -> str:
    remainder_10 = count % 10
    remainder_100 = count % 100
    if remainder_10 == 1 and remainder_100 != 11:
        return "получателю"
    return "получателям"


def _is_folder_visible_to_user(*, user: User, folder_id: int) -> bool:
    allowed_folder_ids = get_user_allowed_folder_ids(user)
    if allowed_folder_ids is None:
        return True
    return folder_id in allowed_folder_ids


def _extract_si_detail_single_mi(detail: dict | None) -> dict:
    if not isinstance(detail, dict):
        return {}
    mi_info = detail.get("miInfo")
    if not isinstance(mi_info, dict):
        return {}
    for key in ("singleMI", "mi", "etaMI"):
        value = mi_info.get(key)
        if isinstance(value, dict):
            return value
    return {}


def _extract_si_detail_vri_info(detail: dict | None) -> dict:
    if not isinstance(detail, dict):
        return {}
    vri_info = detail.get("vriInfo")
    return vri_info if isinstance(vri_info, dict) else {}


def _extract_cert_num_from_detail(vri_info: dict) -> str | None:
    applicable = vri_info.get("applicable")
    if isinstance(applicable, dict):
        return _first_nonempty_str(applicable.get("certNum"), applicable.get("certificateNumber"))
    return _first_nonempty_str(vri_info.get("certNum"))


def _first_nonempty_str(*values: object) -> str | None:
    for value in values:
        if value is None:
            continue
        normalized = str(value).strip()
        if normalized:
            return normalized
    return None


def _first_nonempty_int(*values: object) -> int | None:
    for value in values:
        if value is None or value == "":
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return None


def _parse_date_to_datetime(value: object) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str):
        return None

    candidate = value.strip()
    if not candidate:
        return None
    candidate = candidate.replace("Z", "+00:00")

    try:
        return datetime.fromisoformat(candidate)
    except ValueError:
        for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%d.%m.%Y %H:%M:%S"):
            try:
                return datetime.strptime(candidate, fmt)
            except ValueError:
                continue
    return None


def _first_nonempty_datetime(*values: datetime | None) -> datetime | None:
    for value in values:
        if value is not None:
            return value
    return None


def _normalize_measurement_limit(value: str | None) -> str | None:
    return _normalize_optional_text(value)


def _build_internal_esi_profile_vri_id(registry_number: str) -> str:
    return f"esi-profile:{registry_number}"


def _format_display_date(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.strftime("%d.%m.%Y")
    return datetime.combine(value, datetime.min.time()).strftime("%d.%m.%Y")


def _get_esi_module_kind_label(module_kind: ESIModuleKind) -> str:
    if module_kind == ESIModuleKind.INTERNAL:
        return "Внутренний"
    return "Внешний"


def _extract_esi_module_rank(entry: EquipmentESICompositionEntry) -> str | None:
    raw = entry.detail_payload_json if isinstance(entry.detail_payload_json, dict) else {}
    mi = _extract_si_detail_single_mi(raw)
    rank_code = _first_nonempty_str(raw.get("rankcode"), mi.get("rankCode"))
    rank_title = _first_nonempty_str(raw.get("rankclass"), mi.get("rankTitle"))
    if rank_code and rank_title:
        return f"{rank_code} · {rank_title}"
    return rank_code or rank_title


def _extract_esi_module_modification(entry: EquipmentESICompositionEntry) -> str | None:
    raw = entry.detail_payload_json if isinstance(entry.detail_payload_json, dict) else {}
    mi = _extract_si_detail_single_mi(raw)
    return _first_nonempty_str(raw.get("modification"), mi.get("modification"))


def _extract_esi_module_certificate_number(entry: EquipmentESICompositionEntry) -> str | None:
    raw = entry.detail_payload_json if isinstance(entry.detail_payload_json, dict) else {}
    return _extract_cert_num_from_detail(_extract_si_detail_vri_info(raw))


def _resolve_stored_si_certificate_number(
    si_verification: SIVerification,
    *,
    equipment_type: EquipmentType,
) -> str | None:
    certificate_number = _normalize_optional_text(si_verification.certificate_number)
    if certificate_number is not None:
        return certificate_number
    if equipment_type == EquipmentType.SI:
        return _normalize_optional_text(si_verification.result_docnum)

    raw = (
        si_verification.detail_payload_json
        if isinstance(si_verification.detail_payload_json, dict)
        else {}
    )
    return _normalize_optional_text(_extract_cert_num_from_detail(_extract_si_detail_vri_info(raw)))


def _extract_root_esi_certificate_number(equipment: Equipment) -> str | None:
    si_verification = equipment.si_verification
    if si_verification is None:
        return None
    return _resolve_stored_si_certificate_number(
        si_verification,
        equipment_type=equipment.equipment_type,
    )


def _resolve_si_certificate_number(
    si_payload: SIVerificationCreateRequest,
    *,
    equipment_type: EquipmentType,
) -> str | None:
    detail = (
        si_payload.detail_payload_json if isinstance(si_payload.detail_payload_json, dict) else {}
    )
    raw = si_payload.raw_payload_json if isinstance(si_payload.raw_payload_json, dict) else {}
    detail_vri = _extract_si_detail_vri_info(detail)
    raw_vri = _extract_si_detail_vri_info(raw)

    if equipment_type == EquipmentType.ESI:
        return _normalize_optional_text(
            _first_nonempty_str(
                si_payload.certificate_number,
                _extract_cert_num_from_detail(detail_vri),
                _extract_cert_num_from_detail(raw_vri),
            )
        )

    return _normalize_optional_text(
        _first_nonempty_str(
            si_payload.certificate_number,
            _extract_cert_num_from_detail(detail_vri),
            _extract_cert_num_from_detail(raw_vri),
            si_payload.result_docnum,
        )
    )


def _resolve_si_result_docnum(
    si_payload: SIVerificationCreateRequest,
    *,
    equipment_type: EquipmentType,
    certificate_number: str | None,
) -> str | None:
    if equipment_type == EquipmentType.ESI:
        return _normalize_optional_text(si_payload.result_docnum)
    return certificate_number


def _build_manual_vri_id(equipment_type: EquipmentType) -> str:
    return f"manual:{equipment_type.value.lower()}:{uuid4().hex}"


def _is_retryable_arshin_exception(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in RETRYABLE_STATUS_CODES
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, HTTPException):
        return exc.status_code in {502, 503, 504}
    return False


def _folder_refresh_retry_delay(attempt: int) -> float:
    base = max(0.0, settings.folder_refresh_retry_base_seconds)
    max_delay = max(base, settings.folder_refresh_retry_max_seconds)
    delay = min(base * (2**attempt), max_delay)
    if delay <= 0:
        return 0.0
    return delay + random.uniform(0, delay * 0.25)


def _map_folder_refresh_row_status(
    *,
    match: FolderRefreshMatchResult,
    created_manually: bool = False,
) -> EquipmentFolderRefreshRowStatus:
    if not match.found:
        return EquipmentFolderRefreshRowStatus.NOT_FOUND
    if created_manually:
        if match.uncertain_update:
            return EquipmentFolderRefreshRowStatus.UPDATED_UNCERTAIN
        return EquipmentFolderRefreshRowStatus.UPDATED
    if match.certificate_updated:
        if match.uncertain_update:
            return EquipmentFolderRefreshRowStatus.UPDATED_UNCERTAIN
        return EquipmentFolderRefreshRowStatus.UPDATED
    return EquipmentFolderRefreshRowStatus.UNCHANGED


def _build_si_create_request_from_arshin(
    *,
    folder_id: int,
    object_name: str,
    status_value: EquipmentStatus,
    current_location_manual: str | None,
    result: ArshinSearchResultRead,
    detail: ArshinVriDetailRead,
) -> EquipmentCreateRequest:
    return EquipmentCreateRequest(
        folder_id=folder_id,
        group_id=None,
        object_name=object_name,
        equipment_type=EquipmentType.SI,
        name=detail.type_name or result.mit_title or "СИ из Аршина",
        modification=detail.modification or result.mi_modification,
        serial_number=detail.serial_number or result.mi_number,
        manufacture_year=detail.manufacture_year,
        status=status_value,
        current_location_manual=current_location_manual,
        si_verification={
            "vri_id": result.vri_id,
            "arshin_url": result.arshin_url,
            "org_title": result.org_title,
            "mit_number": result.mit_number,
            "mit_title": result.mit_title,
            "mit_notation": result.mit_notation,
            "mi_number": result.mi_number,
            "certificate_number": detail.certificate_number or result.result_docnum,
            "result_docnum": result.result_docnum,
            "verification_date": result.verification_date,
            "valid_date": result.valid_date,
            "raw_payload_json": result.raw_payload_json,
            "detail_payload_json": detail.raw_payload_json,
        },
    )


def _select_bulk_import_candidate(
    *,
    certificate_number: str,
    results: list[ArshinSearchResultRead],
) -> ArshinSearchResultRead | None:
    if not results:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Arshin did not return any records for this certificate number.",
        )

    if len(results) == 1:
        return results[0]

    normalized_input = _normalize_certificate_number(certificate_number)
    exact_matches = [
        result
        for result in results
        if _normalize_certificate_number(result.result_docnum) == normalized_input
    ]
    if len(exact_matches) == 1:
        return exact_matches[0]

    return None


def _normalize_certificate_number(value: str | None) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", "", value).upper()


def _create_temp_export_file_path(*, suffix: str) -> Path:
    temp_file = NamedTemporaryFile(delete=False, suffix=suffix)
    temp_file.close()
    return Path(temp_file.name)


def _save_workbook_to_temp_file(workbook: Workbook) -> Path:
    temp_path = _create_temp_export_file_path(suffix=".xlsx")
    try:
        workbook.save(temp_path)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise
    finally:
        workbook.close()
    return temp_path


def _copy_file_chunked(source_path: Path, destination_path: Path) -> None:
    with source_path.open("rb") as source_file, destination_path.open("wb") as destination_file:
        shutil.copyfileobj(source_file, destination_file, length=1024 * 1024)


def _get_comment_attachment_upload_staging_dir(*, equipment_id: int, user_id: int) -> Path:
    return settings.attachment_storage_path / "_comment-uploads" / str(equipment_id) / str(user_id)


def _get_comment_attachment_upload_manifest_path(
    *,
    staging_dir: Path,
    upload_token: str,
) -> Path:
    return staging_dir / f"{upload_token}.json"


def _cleanup_stale_comment_attachment_uploads(staging_dir: Path) -> None:
    if not staging_dir.exists():
        return

    stale_before = datetime.now(tz=UTC) - COMMENT_ATTACHMENT_UPLOAD_STAGING_TTL
    for path in staging_dir.iterdir():
        try:
            modified_at = datetime.fromtimestamp(path.stat().st_mtime, tz=UTC)
        except OSError:
            continue
        if modified_at >= stale_before:
            continue
        if path.is_file():
            path.unlink(missing_ok=True)


def _load_comment_attachment_upload(
    *,
    equipment_id: int,
    user_id: int,
    upload_token: str,
) -> StagedCommentAttachment:
    normalized_upload_token = _normalize_comment_attachment_upload_token(upload_token)
    staging_dir = _get_comment_attachment_upload_staging_dir(
        equipment_id=equipment_id,
        user_id=user_id,
    )
    _cleanup_stale_comment_attachment_uploads(staging_dir)
    manifest_path = _get_comment_attachment_upload_manifest_path(
        staging_dir=staging_dir,
        upload_token=normalized_upload_token,
    )
    if not manifest_path.exists() or not manifest_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Временное вложение комментария не найдено.",
        )

    try:
        payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Временное вложение комментария повреждено.",
        ) from error

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Временное вложение комментария повреждено.",
        )

    file_name = _normalize_attachment_file_name(payload.get("file_name"))
    file_mime_type = _normalize_optional_text(payload.get("file_mime_type"))
    file_size = payload.get("file_size")
    storage_name = payload.get("storage_name")
    if not isinstance(file_size, int) or file_size <= 0 or not isinstance(storage_name, str):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Временное вложение комментария повреждено.",
        )

    file_path = staging_dir / storage_name
    if not file_path.exists() or not file_path.is_file():
        manifest_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Файл временного вложения комментария не найден.",
        )

    return StagedCommentAttachment(
        upload_token=normalized_upload_token,
        file_name=file_name,
        file_mime_type=file_mime_type,
        file_size=file_size,
        file_path=file_path,
        manifest_path=manifest_path,
    )


def _delete_comment_attachment_upload_files(staged_attachment: StagedCommentAttachment) -> None:
    staged_attachment.file_path.unlink(missing_ok=True)
    staged_attachment.manifest_path.unlink(missing_ok=True)


def _normalize_comment_attachment_upload_token(value: str) -> str:
    candidate = value.strip().lower()
    if COMMENT_ATTACHMENT_UPLOAD_TOKEN_PATTERN.fullmatch(candidate):
        return candidate
    raise HTTPException(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        detail="Некорректный токен временного вложения комментария.",
    )


_ATTACHMENT_IMAGE_FORMAT_BY_SUFFIX: dict[str, str] = {
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".png": "PNG",
    ".webp": "WEBP",
}
_ATTACHMENT_IMAGE_CONTENT_TYPE_BY_FORMAT: dict[str, str] = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}
_ATTACHMENT_IMAGE_QUALITY_STEPS: dict[str, tuple[int, ...]] = {
    "JPEG": (82, 76, 70, 64, 58),
    "WEBP": (80, 74, 68, 62, 56),
}
_ATTACHMENT_IMAGE_MIN_DIMENSION_PIXELS = 640


def _store_attachment_file(
    *,
    source_path: Path,
    destination_path: Path,
    file_name: str,
    content_type: str | None,
    file_size: int,
) -> StoredAttachmentFile:
    optimized_image = _optimize_attachment_image(
        source_path=source_path,
        file_name=file_name,
        content_type=content_type,
        original_file_size=file_size,
    )
    if optimized_image is None:
        _copy_file_chunked(source_path, destination_path)
        return StoredAttachmentFile(
            file_size=file_size,
            content_type=_normalize_optional_text(content_type),
        )

    destination_path.write_bytes(optimized_image.content)
    return StoredAttachmentFile(
        file_size=len(optimized_image.content),
        content_type=optimized_image.content_type,
    )


def _optimize_attachment_image(
    *,
    source_path: Path,
    file_name: str,
    content_type: str | None,
    original_file_size: int,
) -> OptimizedAttachmentImage | None:
    suffix = Path(file_name).suffix.lower()
    normalized_content_type = _normalize_optional_text(content_type)
    if (
        suffix not in _ATTACHMENT_IMAGE_FORMAT_BY_SUFFIX
        and normalized_content_type not in _ATTACHMENT_IMAGE_CONTENT_TYPE_BY_FORMAT.values()
    ):
        return None

    try:
        with Image.open(source_path) as source_image:
            source_image.load()
            source_format = (
                source_image.format or _ATTACHMENT_IMAGE_FORMAT_BY_SUFFIX.get(suffix, "")
            ).upper()
            if source_format not in _ATTACHMENT_IMAGE_CONTENT_TYPE_BY_FORMAT:
                return None

            icc_profile = source_image.info.get("icc_profile")
            image = ImageOps.exif_transpose(source_image)
            candidate_dimensions = _build_attachment_image_candidate_dimensions(image.size)

            best_candidate: bytes | None = None
            best_size = original_file_size

            for max_dimension in candidate_dimensions:
                resized_image = _resize_image_to_max_dimension(
                    image=image,
                    max_dimension=max_dimension,
                )
                encoded_candidates = _encode_attachment_image_candidates(
                    image=resized_image,
                    image_format=source_format,
                    icc_profile=icc_profile,
                )
                for encoded_candidate in encoded_candidates:
                    candidate_size = len(encoded_candidate)
                    if candidate_size < best_size:
                        best_candidate = encoded_candidate
                        best_size = candidate_size
                    if candidate_size <= settings.attachment_image_target_size_bytes:
                        break
                if (
                    best_candidate is not None
                    and best_size <= settings.attachment_image_target_size_bytes
                ):
                    break

            if best_candidate is None:
                return None

            return OptimizedAttachmentImage(
                content=best_candidate,
                content_type=_ATTACHMENT_IMAGE_CONTENT_TYPE_BY_FORMAT[source_format],
            )
    except (OSError, UnidentifiedImageError, ValueError):
        return None


def _build_attachment_image_candidate_dimensions(size: tuple[int, int]) -> list[int]:
    original_max_dimension = max(size)
    current_dimension = min(
        original_max_dimension,
        settings.attachment_image_max_dimension_pixels,
    )
    dimensions: list[int] = []

    while True:
        if current_dimension not in dimensions:
            dimensions.append(current_dimension)
        if current_dimension <= _ATTACHMENT_IMAGE_MIN_DIMENSION_PIXELS:
            break
        next_dimension = max(
            _ATTACHMENT_IMAGE_MIN_DIMENSION_PIXELS,
            int(current_dimension * 0.82),
        )
        if next_dimension >= current_dimension:
            break
        current_dimension = next_dimension

    return dimensions


def _resize_image_to_max_dimension(*, image: Image.Image, max_dimension: int) -> Image.Image:
    if max(image.size) <= max_dimension:
        return image.copy()
    resized = image.copy()
    resized.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
    return resized


def _encode_attachment_image_candidates(
    *,
    image: Image.Image,
    image_format: str,
    icc_profile: bytes | None,
) -> Iterator[bytes]:
    if image_format == "JPEG":
        for quality in _ATTACHMENT_IMAGE_QUALITY_STEPS["JPEG"]:
            yield _encode_jpeg_attachment_image(
                image=image,
                quality=quality,
                icc_profile=icc_profile,
            )
        return
    if image_format == "WEBP":
        for quality in _ATTACHMENT_IMAGE_QUALITY_STEPS["WEBP"]:
            yield _encode_webp_attachment_image(
                image=image,
                quality=quality,
                icc_profile=icc_profile,
            )
        return
    yield _encode_png_attachment_image(image=image, icc_profile=icc_profile)


def _encode_jpeg_attachment_image(
    *,
    image: Image.Image,
    quality: int,
    icc_profile: bytes | None,
) -> bytes:
    prepared = _prepare_image_for_jpeg(image)
    buffer = BytesIO()
    save_kwargs: dict[str, object] = {
        "format": "JPEG",
        "quality": quality,
        "optimize": True,
        "progressive": True,
    }
    if icc_profile:
        save_kwargs["icc_profile"] = icc_profile
    prepared.save(buffer, **save_kwargs)
    return buffer.getvalue()


def _encode_webp_attachment_image(
    *,
    image: Image.Image,
    quality: int,
    icc_profile: bytes | None,
) -> bytes:
    prepared = image.copy()
    buffer = BytesIO()
    save_kwargs: dict[str, object] = {
        "format": "WEBP",
        "quality": quality,
        "method": 6,
    }
    if icc_profile:
        save_kwargs["icc_profile"] = icc_profile
    prepared.save(buffer, **save_kwargs)
    return buffer.getvalue()


def _encode_png_attachment_image(
    *,
    image: Image.Image,
    icc_profile: bytes | None,
) -> bytes:
    prepared = image.copy()
    buffer = BytesIO()
    save_kwargs: dict[str, object] = {
        "format": "PNG",
        "optimize": True,
        "compress_level": 9,
    }
    if icc_profile:
        save_kwargs["icc_profile"] = icc_profile
    prepared.save(buffer, **save_kwargs)
    return buffer.getvalue()


def _prepare_image_for_jpeg(image: Image.Image) -> Image.Image:
    if image.mode in {"RGB", "L"}:
        return image.copy()
    if "A" in image.getbands():
        background = Image.new("RGB", image.size, (255, 255, 255))
        background.paste(image, mask=image.getchannel("A"))
        return background
    return image.convert("RGB")


@dataclass(slots=True)
class ParsedCertificateImportRow:
    row_number: int
    certificate_number: str
    verification_year: int | None = None


@dataclass(slots=True)
class UploadedFilePayload:
    file_name: str | None
    content_type: str | None
    temp_path: Path
    file_size: int


@dataclass(slots=True)
class StoredAttachmentFile:
    file_size: int
    content_type: str | None


@dataclass(slots=True)
class CommentAttachmentUpload:
    upload_token: str
    file_name: str
    file_mime_type: str | None
    file_size: int


@dataclass(slots=True)
class StagedCommentAttachment:
    upload_token: str
    file_name: str
    file_mime_type: str | None
    file_size: int
    file_path: Path
    manifest_path: Path


@dataclass(slots=True)
class OptimizedAttachmentImage:
    content: bytes
    content_type: str


@dataclass(slots=True)
class PendingProcessNotification:
    category: EventCategory
    process_label: str
    equipment_ids: tuple[int, ...]
    actor_user_id: int | None
    actor_name: str
    title: str
    description: str | None = None


def _collect_changed_repair_milestone_labels(
    *,
    payload: RepairMilestonesUpdateRequest,
    stage_template: list[dict[str, object]],
) -> list[str]:
    labels: list[str] = []
    if stage_template and "sent_to_repair_at" in payload.model_fields_set:
        labels.append(str(stage_template[0]["label"]))
    for field_name, milestone_label in _get_stage_template_labels(stage_template):
        if field_name in payload.model_fields_set:
            labels.append(milestone_label)
    return labels


def _collect_changed_verification_milestone_labels(
    *,
    payload: VerificationMilestonesUpdateRequest,
    stage_template: list[dict[str, object]],
) -> list[str]:
    labels: list[str] = []
    if stage_template and "sent_to_verification_at" in payload.model_fields_set:
        labels.append(str(stage_template[0]["label"]))
    for field_name, milestone_label in _get_stage_template_labels(stage_template):
        if field_name in payload.model_fields_set:
            labels.append(milestone_label)
    return labels


def _format_verification_flow_mode(flow_mode: VerificationFlowMode) -> str:
    if flow_mode == VerificationFlowMode.ONSITE_WITH_DEMOLITION:
        return "На месте с демонтажом"
    if flow_mode == VerificationFlowMode.ONSITE_WITHOUT_DEMOLITION:
        return "На месте без демонтажа"
    return "С демонтажом и отправкой"


def _build_preview_description(text: str | None) -> str | None:
    normalized = _normalize_message_text(text)
    if normalized is None:
        return None
    if len(normalized) <= 160:
        return normalized
    return normalized[:157].rstrip() + "..."


def _build_message_event_description(
    *,
    text: str | None,
    attachment_count: int,
) -> str | None:
    parts: list[str] = []
    preview = _build_preview_description(text)
    if preview:
        parts.append(preview)
    if attachment_count > 0:
        parts.append(f"Вложений: {attachment_count}.")
    return " ".join(parts) if parts else None


def _build_verification_milestone_message(
    *,
    current_user: User,
    milestone_label: str,
    milestone_date,
) -> str:
    return (
        f"{_format_user_display_name(current_user)} отметил этап "
        f"«{milestone_label}» ({_format_short_date(milestone_date)})."
    )


def _build_repair_milestone_message(
    *,
    current_user: User,
    milestone_label: str,
    milestone_date,
) -> str:
    return (
        f"{_format_user_display_name(current_user)} отметил этап "
        f"«{milestone_label}» ({_format_short_date(milestone_date)})."
    )


def _format_short_date(value) -> str:
    return value.strftime("%d.%m.%Y")


def _extract_certificate_rows_from_table(
    *,
    file_name: str | None,
    file_path: Path,
) -> list[ParsedCertificateImportRow]:
    lower_name = (file_name or "").lower()
    if lower_name.endswith(".csv"):
        return _extract_certificate_rows_from_csv(file_path)
    return _extract_certificate_rows_from_workbook(file_path)


def _extract_certificate_rows_from_csv(file_path: Path) -> list[ParsedCertificateImportRow]:
    with file_path.open("r", encoding="utf-8-sig", newline="") as csv_file:
        rows = list(csv.reader(csv_file))
    return _extract_certificate_rows_from_matrix(rows)


def _extract_certificate_rows_from_workbook(file_path: Path) -> list[ParsedCertificateImportRow]:
    workbook = load_workbook(filename=file_path, read_only=True, data_only=True)
    try:
        worksheet = workbook.active
        matrix: list[list[str]] = []
        for row in worksheet.iter_rows(values_only=True):
            matrix.append(["" if cell is None else str(cell).strip() for cell in row])
        return _extract_certificate_rows_from_matrix(matrix)
    finally:
        workbook.close()


def _extract_certificate_rows_from_matrix(
    rows: list[list[str]],
) -> list[ParsedCertificateImportRow]:
    if not rows:
        return []

    header_row_index, cert_column, date_column = _detect_certificate_layout(rows)
    start_index = header_row_index + 1 if header_row_index is not None else 0
    if cert_column is None:
        cert_column = 0

    extracted: list[ParsedCertificateImportRow] = []
    for index, row in enumerate(rows[start_index:], start=start_index + 1):
        if cert_column >= len(row):
            continue
        certificate_number = row[cert_column].strip()
        if not certificate_number:
            continue
        verification_year = None
        if date_column is not None and date_column < len(row):
            verification_year = _extract_year_from_cell(row[date_column])
        extracted.append(
            ParsedCertificateImportRow(
                row_number=index,
                certificate_number=certificate_number,
                verification_year=verification_year,
            )
        )
    return extracted


def _detect_certificate_layout(
    rows: list[list[str]],
) -> tuple[int | None, int | None, int | None]:
    max_header_scan_rows = min(len(rows), 20)
    for row_index in range(max_header_scan_rows):
        cert_column = _detect_certificate_column(rows[row_index])
        if cert_column is not None:
            date_column = _detect_verification_date_column(rows[row_index])
            return row_index, cert_column, date_column
    return None, None, None


def _detect_certificate_column(header_row: list[str]) -> int | None:
    for index, value in enumerate(header_row):
        normalized = _normalize_header_label(value)
        if not normalized:
            continue
        if any(
            keyword in normalized for keyword in ("свид", "certificate", "документ", "document")
        ):
            return index
    return None


def _detect_verification_date_column(header_row: list[str]) -> int | None:
    for index, value in enumerate(header_row):
        normalized = _normalize_header_label(value)
        if not normalized:
            continue
        if normalized == "дата поверки" or normalized == "verification date":
            return index
        if "дата" in normalized and "поверк" in normalized:
            return index
        if "verification" in normalized and "date" in normalized:
            return index
    return None


def _normalize_header_label(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def _extract_year_from_cell(value: str) -> int | None:
    match = re.search(r"(19|20)\d{2}", value)
    if not match:
        return None
    year = int(match.group(0))
    if 1900 <= year <= 2100:
        return year
    return None
