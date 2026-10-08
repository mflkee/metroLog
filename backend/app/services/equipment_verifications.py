"""Equipment-verifications mixin for the equipment service."""

from __future__ import annotations

import re
from calendar import monthrange
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import uuid4
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import HTTPException, status

from app.core.config import settings
from app.models.equipment import (
    Equipment,
    EquipmentStatus,
    EquipmentType,
    SIVerification,
    Verification,
    VerificationFlowMode,
    VerificationMessage,
    VerificationMessageAttachment,
)
from app.models.event import EventCategory
from app.models.user import User
from app.schemas.equipment import (
    EquipmentSIRefreshRequest,
    ESIInternalModuleMeasurementRequest,
    ProcessBatchMembershipUpdateRequest,
    SIVerificationCreateRequest,
    VerificationBulkCreateRequest,
    VerificationCreateRequest,
    VerificationMessageCreateRequest,
    VerificationMessageUpdateRequest,
    VerificationMilestonesUpdateRequest,
    VerificationQueueItemRead,
    VerificationQueuePageRead,
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
from app.services.equipment_exports import (
    _create_temp_export_file_path,
)
from app.services.equipment_folders import _format_user_display_name
from app.services.equipment_process_templates import (
    _build_default_verification_stage_template_variants,
    _build_default_verification_stage_templates,
    _build_process_custom_stages_from_variant,
    _build_stage_template_from_process_variant,
    _clone_process_custom_stages,
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
from app.services.equipment_repairs import (
    _build_equipment_batch_member_label,
    _format_short_date,
    _get_latest_completed_stage_label,
    _validate_milestone_order,
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
        RepairRepository,
        SIVerificationRepository,
        VerificationMessageAttachmentRepository,
        VerificationMessageRepository,
        VerificationRepository,
    )


def _add_months(base_date: date, months: int) -> date:
    total_month = (base_date.month - 1) + months
    year = base_date.year + total_month // 12
    month = total_month % 12 + 1
    day = min(base_date.day, monthrange(year, month)[1])
    return date(year, month, day)


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


def _calculate_manual_verification_valid_date(
    verification_date: datetime,
    interval_months: int,
) -> datetime:
    valid_until = _add_months(verification_date.date(), interval_months) - timedelta(days=1)
    return datetime.combine(valid_until, verification_date.timetz())


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


def _extract_cert_num_from_detail(vri_info: dict) -> str | None:
    applicable = vri_info.get("applicable")
    if isinstance(applicable, dict):
        return _first_nonempty_str(applicable.get("certNum"), applicable.get("certificateNumber"))
    return _first_nonempty_str(vri_info.get("certNum"))


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


def _first_nonempty_datetime(*values: datetime | None) -> datetime | None:
    for value in values:
        if value is not None:
            return value
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


def _first_nonempty_str(*values: object) -> str | None:
    for value in values:
        if value is None:
            continue
        normalized = str(value).strip()
        if normalized:
            return normalized
    return None


def _format_verification_flow_mode(flow_mode: VerificationFlowMode) -> str:
    if flow_mode == VerificationFlowMode.ONSITE_WITH_DEMOLITION:
        return "На месте с демонтажом"
    if flow_mode == VerificationFlowMode.ONSITE_WITHOUT_DEMOLITION:
        return "На месте без демонтажа"
    return "С демонтажом и отправкой"


def _get_arshin_document_label(equipment_type: EquipmentType) -> str:
    if equipment_type == EquipmentType.ESI:
        return "Номер в перечне"
    return "Свидетельство"


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


def _is_arshin_equipment_type(equipment_type: EquipmentType) -> bool:
    return equipment_type in {EquipmentType.SI, EquipmentType.ESI}


def _is_verification_on_site(flow_mode: VerificationFlowMode) -> bool:
    return flow_mode != VerificationFlowMode.OFFSITE_WITH_DEMOLITION


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


def _supports_verification(equipment_type: EquipmentType) -> bool:
    return _is_arshin_equipment_type(equipment_type)


def _validate_manufacture_year(value: int | None) -> int | None:
    if value is None:
        return None
    if value < 1900 or value > 2100:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Manufacture year must be between 1900 and 2100.",
        )
    return value


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


class EquipmentVerificationsMixin:
    """Mixed into ``EquipmentService``."""

    if TYPE_CHECKING:
        session: Session
        deadline_presets: DeadlinePresetRepository
        folders: EquipmentFolderRepository
        repairs: RepairRepository
        si_verifications: SIVerificationRepository
        verification_message_attachments: VerificationMessageAttachmentRepository
        verification_messages: VerificationMessageRepository
        verifications: VerificationRepository

        def _build_workbook_bytes(
            self, *, sheet_title: str, headers: list[str], rows: list[list[object | None]]
        ) -> Path: ...

        def _format_sheet_date(self, value: date | datetime | None) -> str | None: ...

        def _get_accessible_folder_ids(self) -> set[int] | None: ...

        def _assert_folder_access(self, folder_id: int | None, *, detail: str) -> None: ...

        def _assert_private_note_creation_allowed(
            self,
            *,
            is_private: bool,
            current_user: User,
        ) -> None: ...

        def _assert_private_note_visible(self, *, is_private: bool, detail: str) -> None: ...

        def _build_existing_si_message(
            self,
            existing: SIVerification,
            *,
            prefix: str,
        ) -> str: ...

        def _can_view_private_notes(self) -> bool: ...

        def _commit_and_flush_process_notifications(self) -> None: ...

        def _commit_comment_visibility_change(self, *, is_private: bool) -> None: ...

        def _filter_private_mention_recipients(self, users: list[User]) -> list[User]: ...

        def _get_folder(self, folder_id: int) -> EquipmentFolder: ...

        def _record_equipment_event(
            self,
            *,
            action: str,
            user: User,
            equipment: Equipment,
            title: str,
            description: str | None = None,
            batch_key: str | None = None,
        ) -> None: ...

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

        def _sync_internal_esi_modules(
            self,
            *,
            equipment: Equipment,
            si_verification_payload: SIVerificationCreateRequest,
            requested_modules: list[ESIInternalModuleMeasurementRequest] | None,
        ) -> None: ...

        def get_equipment(self, *, equipment_id: int) -> Equipment: ...

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

    def _assert_verification_batch_access(self, verifications: list[Verification]) -> None:
        for verification in verifications:
            equipment = verification.equipment or self.get_equipment(
                equipment_id=verification.equipment_id
            )
            self._assert_folder_access(
                equipment.folder_id,
                detail="Активная группа поверки не найдена.",
            )

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
