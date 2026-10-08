"""Equipment-folder-refresh mixin for the equipment service (Arshin rescan)."""

from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING

import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.integrations.arshin_client import RETRYABLE_STATUS_CODES
from app.models.equipment import (
    Equipment,
    EquipmentESICompositionEntry,
    EquipmentFolderRefreshRow,
    EquipmentFolderRefreshRowStatus,
    EquipmentFolderRefreshTargetKind,
    EquipmentFolderRefreshTask,
    EquipmentFolderRefreshTaskStatus,
    EquipmentType,
    ESIModuleKind,
    SIVerification,
)
from app.models.user import User
from app.schemas.equipment import (
    EquipmentFolderRefreshApplyRequest,
    EquipmentFolderRefreshApplyResultRead,
    EquipmentFolderRefreshApplyRowResultRead,
    EquipmentFolderRefreshRowRead,
    EquipmentFolderRefreshTaskDetailsRead,
    EquipmentFolderRefreshTaskRead,
    EquipmentSIRefreshRequest,
    SIVerificationCreateRequest,
)
from app.services.equipment_text import _normalize_optional_text
from app.services.equipment_verifications import (
    _extract_cert_num_from_detail,
    _extract_si_detail_vri_info,
    _first_nonempty_str,
    _normalize_long_optional_text,
    _resolve_equipment_si_valid_date,
)
from app.services.folder_refresh_matcher import FolderRefreshMatchResult

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models.equipment import EquipmentFolder, EquipmentStatus
    from app.repositories.equipment_repository import (
        EquipmentESICompositionRepository,
        EquipmentFolderRefreshRowRepository,
        EquipmentFolderRefreshTaskRepository,
    )
    from app.services.folder_refresh_matcher import FolderRefreshMatcher

FOLDER_REFRESH_TASK_STALE_TIMEOUT = timedelta(minutes=10)


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


def _extract_esi_module_certificate_number(entry: EquipmentESICompositionEntry) -> str | None:
    raw = entry.detail_payload_json if isinstance(entry.detail_payload_json, dict) else {}
    return _extract_cert_num_from_detail(_extract_si_detail_vri_info(raw))


def _extract_root_esi_certificate_number(equipment: Equipment) -> str | None:
    si_verification = equipment.si_verification
    if si_verification is None:
        return None
    return _resolve_stored_si_certificate_number(
        si_verification,
        equipment_type=equipment.equipment_type,
    )


def _folder_refresh_retry_delay(attempt: int) -> float:
    base = max(0.0, settings.folder_refresh_retry_base_seconds)
    max_delay = max(base, settings.folder_refresh_retry_max_seconds)
    delay = min(base * (2**attempt), max_delay)
    if delay <= 0:
        return 0.0
    return delay + random.uniform(0, delay * 0.25)


def _is_retryable_arshin_exception(exc: BaseException) -> bool:
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in RETRYABLE_STATUS_CODES
    if isinstance(exc, httpx.TransportError):
        return True
    if isinstance(exc, HTTPException):
        return exc.status_code in {502, 503, 504}
    return False


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


class EquipmentFolderRefreshMixin:
    """Mixed into ``EquipmentService``."""

    if TYPE_CHECKING:
        session: Session
        esi_composition_entries: EquipmentESICompositionRepository
        folder_refresh_matcher: FolderRefreshMatcher
        folder_refresh_rows: EquipmentFolderRefreshRowRepository
        folder_refresh_tasks: EquipmentFolderRefreshTaskRepository

        def _get_folder(self, folder_id: int) -> EquipmentFolder: ...

        def refresh_si_verification(
            self,
            *,
            equipment_id: int,
            payload: EquipmentSIRefreshRequest,
            current_user: User | None = None,
        ) -> Equipment: ...

        def _refresh_esi_composition_entry_from_payload(
            self,
            *,
            equipment_id: int,
            entry_id: int,
            si_payload: SIVerificationCreateRequest,
            current_user: User | None = None,
        ) -> EquipmentESICompositionEntry: ...

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
        ) -> list[Equipment]: ...

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
