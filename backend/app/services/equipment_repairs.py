"""Equipment-repairs mixin for the equipment service."""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import TYPE_CHECKING
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import HTTPException, status

from app.core.config import settings
from app.models.equipment import (
    Equipment,
    EquipmentStatus,
    Repair,
    RepairMessage,
    RepairMessageAttachment,
    SIVerification,
)
from app.models.event import EventCategory
from app.models.user import User
from app.schemas.equipment import (
    ProcessBatchMembershipUpdateRequest,
    RepairBulkCreateRequest,
    RepairCreateRequest,
    RepairMessageCreateRequest,
    RepairMessageUpdateRequest,
    RepairMilestonesUpdateRequest,
    RepairQueueItemRead,
    RepairQueuePageRead,
)
from app.services.equipment_comments import (
    UploadedFilePayload,
    _build_message_event_description,
    _build_preview_description,
    _copy_file_chunked,
    _normalize_attachment_file_name,
    _normalize_message_text,
    _store_attachment_file,
)
from app.services.equipment_folders import _format_user_display_name
from app.services.equipment_process_templates import (
    DEFAULT_REPAIR_DEADLINE_SETTINGS,
    RepairDeadlineSettings,
    _build_default_repair_stage_template_variants,
    _build_default_repair_stage_templates,
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
    _extract_process_template_variant_id,
    _get_enabled_stage_template_items,
    _get_stage_template_labels,
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
from app.services.user_service import has_admin_access

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.equipment import EquipmentFolder
    from app.repositories.equipment_repository import (
        DeadlinePresetRepository,
        EquipmentFolderRepository,
        RepairMessageAttachmentRepository,
        RepairMessageRepository,
        RepairRepository,
    )
    from app.services.equipment_process_templates import RepairDeadlineSettings


def _build_equipment_batch_member_label(equipment: Equipment) -> str:
    serial_number = equipment.serial_number
    if not serial_number and equipment.si_verification is not None:
        serial_number = equipment.si_verification.mi_number
    if serial_number:
        return f"{equipment.name} (зав. № {serial_number})"
    return equipment.name


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


def _coerce_process_stage_sort_order(raw_value: object) -> int:
    if isinstance(raw_value, int):
        return raw_value
    if isinstance(raw_value, str):
        try:
            return int(raw_value)
        except ValueError:
            return 0
    return 0


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


def _create_temp_export_file_path(*, suffix: str) -> Path:
    temp_file = NamedTemporaryFile(delete=False, suffix=suffix)
    temp_file.close()
    return Path(temp_file.name)


def _format_short_date(value) -> str:
    return value.strftime("%d.%m.%Y")


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


def _get_process_stage_item_field(item: object, field_name: str) -> object:
    if isinstance(item, dict):
        return item.get(field_name)
    return getattr(item, field_name, None)


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


class EquipmentRepairsMixin:
    """Mixed into ``EquipmentService``."""

    if TYPE_CHECKING:
        # Provided by EquipmentService through the MRO.
        session: Session
        deadline_presets: DeadlinePresetRepository
        folders: EquipmentFolderRepository
        repairs: RepairRepository
        repair_messages: RepairMessageRepository
        repair_message_attachments: RepairMessageAttachmentRepository
        _deadline_settings_by_folder_id: dict[int | None, RepairDeadlineSettings]

        def _assert_folder_access(self, folder_id: int | None, *, detail: str) -> None: ...

        def _assert_private_note_creation_allowed(
            self, *, is_private: bool, current_user: User
        ) -> None: ...

        def _assert_private_note_visible(self, *, is_private: bool, detail: str) -> None: ...

        def _build_workbook_bytes(
            self, *, sheet_title: str, headers: list[str], rows: list[list[object | None]]
        ) -> Path: ...

        def _can_view_private_notes(self) -> bool: ...

        def _commit_and_flush_process_notifications(self) -> None: ...

        def _commit_comment_visibility_change(self, *, is_private: bool) -> None: ...

        def _filter_private_mention_recipients(self, users: list[User]) -> list[User]: ...

        def _format_sheet_date(self, value: date | datetime | None) -> str | None: ...

        def _get_accessible_folder_ids(self) -> set[int] | None: ...

        def _get_folder(self, folder_id: int) -> EquipmentFolder: ...

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

        def _resolve_mentioned_users(
            self,
            *,
            text: str | None,
            exclude_user_id: int | None = None,
            previous_text: str | None = None,
        ) -> list[User]: ...

        def _send_mention_emails(
            self,
            *,
            users: list[User],
            actor: User,
            context_title: str,
            message_preview: str | None,
            target_url: str,
        ) -> None: ...

        def _sync_equipment_status(self, *, equipment: Equipment) -> None: ...

        def get_equipment(self, *, equipment_id: int) -> Equipment: ...

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

    def _get_repair_notification_equipment_ids(self, repair: Repair) -> list[int]:
        if repair.batch_key:
            repairs = self.repairs.list_active_by_batch_key(batch_key=repair.batch_key)
            if repairs:
                return [item.equipment_id for item in repairs]
        return [repair.equipment_id]

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

    def _assert_repair_batch_access(self, repairs: list[Repair]) -> None:
        for repair in repairs:
            equipment = repair.equipment or self.get_equipment(equipment_id=repair.equipment_id)
            self._assert_folder_access(
                equipment.folder_id,
                detail="Активная группа ремонта не найдена.",
            )

    def _get_active_repair(self, *, equipment_id: int) -> Repair:
        self.get_equipment(equipment_id=equipment_id)
        repair = self.repairs.get_active_by_equipment_id(equipment_id=equipment_id)
        if repair is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Для этого прибора нет активного ремонта.",
            )
        return repair

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
