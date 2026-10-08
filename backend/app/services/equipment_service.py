from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.equipment import (
    DeadlinePreset,
    Equipment,
    EquipmentESICompositionEntry,
    EquipmentProcessSubscription,
    EquipmentStatus,
    EquipmentType,
    ESIModuleKind,
    SIVerification,
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
from app.schemas.equipment import (
    EquipmentAttachmentRead,
    EquipmentCommentRead,
    EquipmentCreateRequest,
    EquipmentDetailsRead,
    EquipmentESICompositionEntryCreateRequest,
    EquipmentESICompositionEntryRead,
    EquipmentESICompositionEntryUpdateRequest,
    EquipmentPageRead,
    EquipmentRead,
    EquipmentShareRecipientRead,
    EquipmentShareRecipientsRead,
    EquipmentShareRequest,
    EquipmentShareResultRead,
    EquipmentSortDirection,
    EquipmentSortKey,
    EquipmentUpdateRequest,
    ESIEquipmentMonitoringItemRead,
    ESIEquipmentMonitoringModuleRead,
    ESIInternalModuleMeasurementRequest,
    SIVerificationCreateRequest,
    VerificationQueueItemRead,
)
from app.services.equipment_comments import (
    EquipmentCommentsMixin,
)
from app.services.equipment_exports import EquipmentExportsMixin
from app.services.equipment_folder_refresh import (
    EquipmentFolderRefreshMixin,
    _extract_esi_module_certificate_number,
)
from app.services.equipment_folders import (
    EquipmentFoldersMixin,
    _format_user_display_name,
    _is_folder_visible_to_user,
)
from app.services.equipment_process_templates import (
    EquipmentProcessTemplatesMixin,
    RepairDeadlineSettings,
    _build_default_repair_stage_template_variants,
    _build_default_verification_stage_template_variants,
    _coerce_repair_stage_template_variants,
    _coerce_verification_stage_template_variants,
    _normalize_required_text,
)
from app.services.equipment_repairs import EquipmentRepairsMixin
from app.services.equipment_text import (
    _build_named_detail,
    _build_nonempty_description,
    _normalize_optional_text,
)
from app.services.equipment_verifications import (
    EquipmentVerificationsMixin,
    _add_months,
    _extract_cert_num_from_detail,
    _extract_si_detail_single_mi,
    _extract_si_detail_vri_info,
    _first_nonempty_datetime,
    _first_nonempty_int,
    _first_nonempty_str,
    _get_arshin_document_label,
    _is_arshin_equipment_type,
    _normalize_long_optional_text,
    _parse_date_to_datetime,
    _resolve_equipment_si_valid_date,
    _resolve_si_certificate_number,
    _supports_verification,
    _validate_manufacture_year,
)
from app.services.folder_refresh_matcher import FolderRefreshMatcher
from app.services.notification_service import (
    NotificationConfigurationError,
    NotificationDeliveryError,
    NotificationService,
)
from app.services.user_service import (
    build_user_mention_keys,
    has_operator_access,
)
from app.tasks.notifications import enqueue_mention_email, enqueue_process_update_email

EDITABLE_EQUIPMENT_TYPE_TRANSITIONS: dict[EquipmentType, frozenset[EquipmentType]] = {
    EquipmentType.OTHER: frozenset(
        {
            EquipmentType.SI,
            EquipmentType.IO,
            EquipmentType.VO,
        }
    ),
}


class EquipmentService(
    EquipmentCommentsMixin,
    EquipmentExportsMixin,
    EquipmentFolderRefreshMixin,
    EquipmentFoldersMixin,
    EquipmentProcessTemplatesMixin,
    EquipmentRepairsMixin,
    EquipmentVerificationsMixin,
):
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


def _pluralize_recipient_dative(count: int) -> str:
    remainder_10 = count % 10
    remainder_100 = count % 100
    if remainder_10 == 1 and remainder_100 != 11:
        return "получателю"
    return "получателям"


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


@dataclass(slots=True)
class PendingProcessNotification:
    category: EventCategory
    process_label: str
    equipment_ids: tuple[int, ...]
    actor_user_id: int | None
    actor_name: str
    title: str
    description: str | None = None
