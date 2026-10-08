import unicodedata
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Annotated
from urllib.parse import quote

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    Query,
    Request,
    UploadFile,
    status,
)
from fastapi.responses import Response
from starlette.types import Receive, Scope, Send

from app.api.deps import AdminUser, CurrentUser, DbSession, OperatorUser
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.equipment import EquipmentStatus, EquipmentType, VerificationFlowMode
from app.models.user import User
from app.schemas.equipment import (
    DeadlinePresetCreateRequest,
    DeadlinePresetRead,
    DeadlinePresetUpdateRequest,
    EquipmentAttachmentRead,
    EquipmentBulkDeleteRequest,
    EquipmentCommentCreateRequest,
    EquipmentCommentDraftAttachmentRead,
    EquipmentCommentRead,
    EquipmentCommentUpdateRequest,
    EquipmentCreateRequest,
    EquipmentDetailsRead,
    EquipmentESICompositionEntryCreateRequest,
    EquipmentESICompositionEntryRead,
    EquipmentESICompositionEntryUpdateRequest,
    EquipmentFolderCreateRequest,
    EquipmentFolderRead,
    EquipmentFolderRefreshApplyRequest,
    EquipmentFolderRefreshApplyResultRead,
    EquipmentFolderRefreshTaskDetailsRead,
    EquipmentFolderRefreshTaskRead,
    EquipmentFolderRefreshTaskStartRequest,
    EquipmentFolderSuggestionsRead,
    EquipmentFolderUpdateRequest,
    EquipmentGroupRead,
    EquipmentPageRead,
    EquipmentProcessSubscriptionRead,
    EquipmentProcessSubscriptionUpdateRequest,
    EquipmentRead,
    EquipmentShareRecipientsRead,
    EquipmentShareRequest,
    EquipmentShareResultRead,
    EquipmentSIBulkImportResultRead,
    EquipmentSIRefreshRequest,
    EquipmentSortDirection,
    EquipmentSortKey,
    EquipmentUpdateRequest,
    ESIEquipmentMonitoringItemRead,
    FolderProcessSubscriptionRead,
    FolderProcessSubscriptionUpdateRequest,
    ProcessBatchMembershipUpdateRequest,
    RepairBulkCreateRequest,
    RepairCreateRequest,
    RepairMessageCreateRequest,
    RepairMessageRead,
    RepairMessageUpdateRequest,
    RepairMilestonesUpdateRequest,
    RepairQueueItemRead,
    RepairQueuePageRead,
    RepairRead,
    VerificationBulkCreateRequest,
    VerificationCreateRequest,
    VerificationMessageCreateRequest,
    VerificationMessageRead,
    VerificationMessageUpdateRequest,
    VerificationMilestonesUpdateRequest,
    VerificationQueueItemRead,
    VerificationQueuePageRead,
    VerificationRead,
)
from app.services.arshin_service import ArshinService
from app.services.equipment_comments import UploadedFilePayload
from app.services.equipment_service import EquipmentService

router = APIRouter(prefix="/equipment")
ATTACHMENT_FILE = File(...)
IMPORT_FOLDER_ID = Form(...)
IMPORT_OBJECT_NAME = Form(...)
IMPORT_STATUS_VALUE = Form(EquipmentStatus.IN_WORK)
IMPORT_CURRENT_LOCATION = Form(None)
REPAIR_ROUTE_CITY = Form(...)
REPAIR_ROUTE_DESTINATION = Form(...)
REPAIR_SENT_TO_REPAIR_AT = Form(...)
REPAIR_IS_ON_SITE = Form(False)
REPAIR_STAGE_TEMPLATE_VARIANT_ID = Form(None)
REPAIR_INITIAL_MESSAGE_TEXT = Form(None)
REPAIR_INITIAL_MESSAGE_IS_PRIVATE = Form(False)
REPAIR_MESSAGE_TEXT = Form(None)
REPAIR_MESSAGE_IS_PRIVATE = Form(False)
VERIFICATION_ROUTE_CITY = Form(...)
VERIFICATION_ROUTE_DESTINATION = Form(...)
VERIFICATION_SENT_TO_VERIFICATION_AT = Form(...)
VERIFICATION_IS_ON_SITE = Form(False)
VERIFICATION_FLOW_MODE = Form(None)
VERIFICATION_STAGE_TEMPLATE_VARIANT_ID = Form(None)
VERIFICATION_INITIAL_MESSAGE_TEXT = Form(None)
VERIFICATION_INITIAL_MESSAGE_IS_PRIVATE = Form(False)
VERIFICATION_MESSAGE_TEXT = Form(None)
VERIFICATION_MESSAGE_IS_PRIVATE = Form(False)
COMMENT_IS_PRIVATE = Form(False)
OPTIONAL_FILES = File(None)
PROCESS_EQUIPMENT_IDS = Form(...)
PROCESS_BATCH_NAME = Form(...)
UPLOAD_READ_CHUNK_SIZE_BYTES = 1024 * 1024


def _equipment_service(db: DbSession, current_user: User) -> EquipmentService:
    return EquipmentService(db, access_user=current_user)


async def _run_folder_refresh_task(task_id: int) -> None:
    with SessionLocal() as session:
        service = EquipmentService(session)
        await service.process_folder_refresh_task(task_id=task_id)


async def _run_folder_refresh_task_for_selection(task_id: int, equipment_ids: list[int]) -> None:
    with SessionLocal() as session:
        service = EquipmentService(session)
        await service.process_folder_refresh_task(task_id=task_id, equipment_ids=equipment_ids)


def _cleanup_temp_file(file_path: Path) -> None:
    file_path.unlink(missing_ok=True)


class FileBackedResponse(Response):
    def __init__(
        self,
        *,
        file_path: Path,
        media_type: str,
        headers: dict[str, str],
        cleanup_after_send: bool,
    ) -> None:
        self.file_path = file_path
        self.cleanup_after_send = cleanup_after_send
        super().__init__(content=b"", media_type=media_type, headers=headers)

    async def __call__(self, scope: Scope, _receive: Receive, send: Send) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": self.status_code,
                "headers": self.raw_headers,
            }
        )
        try:
            with self.file_path.open("rb") as source:
                while chunk := source.read(UPLOAD_READ_CHUNK_SIZE_BYTES):
                    await send(
                        {
                            "type": "http.response.body",
                            "body": chunk,
                            "more_body": True,
                        }
                    )
            await send({"type": "http.response.body", "body": b"", "more_body": False})
        finally:
            if self.cleanup_after_send:
                _cleanup_temp_file(self.file_path)


def _build_ascii_download_name(name: str) -> str:
    source_path = Path(name)
    suffix = "".join(source_path.suffixes)
    stem = source_path.name[: -len(suffix)] if suffix else source_path.name

    normalized_stem = unicodedata.normalize("NFKD", stem).encode("ascii", "ignore").decode("ascii")
    safe_stem = "".join(
        character if character.isalnum() or character in {" ", "-", "_", "."} else "_"
        for character in normalized_stem
    ).strip(" ._")
    if not safe_stem or not any(character.isalpha() for character in safe_stem):
        safe_stem = "download"

    normalized_suffix = (
        unicodedata.normalize("NFKD", suffix).encode("ascii", "ignore").decode("ascii")
    )
    safe_suffix = "".join(
        character if character.isalnum() or character in {".", "-", "_"} else "_"
        for character in normalized_suffix
    )

    return f"{safe_stem}{safe_suffix}"


def _build_file_response(
    *,
    file_path: Path,
    media_type: str,
    download_name: str,
    fallback_name: str | None = None,
    cleanup_after_send: bool = False,
    disposition_type: str = "attachment",
) -> Response:
    ascii_fallback_name = _build_ascii_download_name(fallback_name or download_name)
    headers = {
        "Content-Disposition": (
            f'{disposition_type}; filename="{ascii_fallback_name}"; '
            f"filename*=UTF-8''{quote(download_name, safe='')}"
        ),
        "Content-Length": str(file_path.stat().st_size),
    }
    return FileBackedResponse(
        file_path=file_path,
        media_type=media_type,
        headers=headers,
        cleanup_after_send=cleanup_after_send,
    )


def _cleanup_uploaded_file_payload(payload: UploadedFilePayload) -> None:
    payload.temp_path.unlink(missing_ok=True)


def _cleanup_uploaded_file_payloads(payloads: list[UploadedFilePayload]) -> None:
    for payload in payloads:
        _cleanup_uploaded_file_payload(payload)


def _format_upload_size_limit() -> str:
    limit_mb = settings.upload_max_file_size_bytes / 1_000_000
    return f"{limit_mb:.0f} MB" if limit_mb.is_integer() else f"{limit_mb:.1f} MB"


async def _persist_upload_to_temp_file(file: UploadFile) -> UploadedFilePayload:
    suffix = Path(file.filename or "").suffix.lower()
    temp_file = NamedTemporaryFile(delete=False, suffix=suffix)
    temp_path = Path(temp_file.name)
    file_size = 0

    try:
        while True:
            chunk = await file.read(UPLOAD_READ_CHUNK_SIZE_BYTES)
            if not chunk:
                break

            file_size += len(chunk)
            if file_size > settings.upload_max_file_size_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    detail=(
                        "Uploaded file is too large. "
                        f"Maximum allowed size is {_format_upload_size_limit()}."
                    ),
                )
            temp_file.write(chunk)
    except Exception:
        temp_path.unlink(missing_ok=True)
        raise
    finally:
        temp_file.close()
        await file.close()

    return UploadedFilePayload(
        file_name=file.filename,
        content_type=file.content_type,
        temp_path=temp_path,
        file_size=file_size,
    )


@asynccontextmanager
async def _uploaded_file_context(file: UploadFile):
    payload = await _persist_upload_to_temp_file(file)
    try:
        yield payload
    finally:
        _cleanup_uploaded_file_payload(payload)


async def _parse_comment_create_request(
    request: Request,
) -> tuple[EquipmentCommentCreateRequest, list[UploadedFilePayload]]:
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" not in content_type:
        payload = EquipmentCommentCreateRequest.model_validate(await request.json())
        return payload, []

    form = await request.form()
    uploaded_files: list[UploadedFilePayload] = []
    try:
        for raw_file in form.getlist("files"):
            if (
                not hasattr(raw_file, "read")
                or not hasattr(raw_file, "close")
                or not hasattr(raw_file, "filename")
            ):
                continue
            uploaded_files.append(await _persist_upload_to_temp_file(raw_file))
    except Exception:
        _cleanup_uploaded_file_payloads(uploaded_files)
        raise

    try:
        payload = EquipmentCommentCreateRequest(
            text=form.get("text"),
            is_private=form.get("is_private", False),
            uploaded_attachment_tokens=[
                str(token)
                for token in form.getlist("uploaded_attachment_tokens")
                if token is not None and str(token).strip()
            ],
        )
    except Exception:
        _cleanup_uploaded_file_payloads(uploaded_files)
        raise
    return payload, uploaded_files


@router.get("/folders", response_model=list[EquipmentFolderRead])
async def list_folders(
    current_user: CurrentUser,
    db: DbSession,
) -> list[EquipmentFolderRead]:
    folders = _equipment_service(db, current_user).list_folders()
    return [EquipmentFolderRead.model_validate(folder) for folder in folders]


@router.get("/folders/{folder_id}/suggestions", response_model=EquipmentFolderSuggestionsRead)
async def get_folder_suggestions(
    folder_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> EquipmentFolderSuggestionsRead:
    return _equipment_service(db, current_user).get_folder_suggestions(folder_id=folder_id)


@router.get(
    "/folders/{folder_id}/process-subscriptions",
    response_model=FolderProcessSubscriptionRead,
)
async def get_folder_process_subscriptions(
    folder_id: int,
    current_user: OperatorUser,
    db: DbSession,
) -> FolderProcessSubscriptionRead:
    return _equipment_service(
        db,
        current_user,
    ).get_folder_process_subscriptions(folder_id=folder_id)


@router.put(
    "/folders/{folder_id}/process-subscriptions",
    response_model=FolderProcessSubscriptionRead,
)
async def update_folder_process_subscriptions(
    folder_id: int,
    payload: FolderProcessSubscriptionUpdateRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> FolderProcessSubscriptionRead:
    return _equipment_service(db, current_user).update_folder_process_subscriptions(
        folder_id=folder_id,
        payload=payload,
        current_user=current_user,
    )


@router.post(
    "/folders/{folder_id}/refresh-tasks",
    response_model=EquipmentFolderRefreshTaskRead,
    status_code=201,
)
async def create_folder_refresh_task(
    folder_id: int,
    payload: EquipmentFolderRefreshTaskStartRequest,
    background_tasks: BackgroundTasks,
    current_user: OperatorUser,
    db: DbSession,
) -> EquipmentFolderRefreshTaskRead:
    task = _equipment_service(db, current_user).create_folder_refresh_task(
        folder_id=folder_id,
        current_user=current_user,
    )
    selected_equipment_ids = list(dict.fromkeys(payload.equipment_ids))
    if selected_equipment_ids:
        background_tasks.add_task(
            _run_folder_refresh_task_for_selection,
            task.id,
            selected_equipment_ids,
        )
    else:
        background_tasks.add_task(_run_folder_refresh_task, task.id)
    return task


@router.get(
    "/folders/{folder_id}/refresh-tasks/{task_id}",
    response_model=EquipmentFolderRefreshTaskDetailsRead,
)
async def get_folder_refresh_task(
    folder_id: int,
    task_id: int,
    current_user: OperatorUser,
    db: DbSession,
) -> EquipmentFolderRefreshTaskDetailsRead:
    return _equipment_service(db, current_user).get_folder_refresh_task_details(
        folder_id=folder_id,
        task_id=task_id,
    )


@router.post(
    "/folders/{folder_id}/refresh-tasks/{task_id}/apply",
    response_model=EquipmentFolderRefreshApplyResultRead,
)
async def apply_folder_refresh_task_rows(
    folder_id: int,
    task_id: int,
    payload: EquipmentFolderRefreshApplyRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> EquipmentFolderRefreshApplyResultRead:
    return _equipment_service(db, current_user).apply_folder_refresh_rows(
        folder_id=folder_id,
        task_id=task_id,
        payload=payload,
        current_user=current_user,
    )


@router.get("/deadline-presets", response_model=list[DeadlinePresetRead])
async def list_deadline_presets(
    current_user: CurrentUser,
    db: DbSession,
    include_inactive: Annotated[bool, Query()] = False,
) -> list[DeadlinePresetRead]:
    presets = _equipment_service(db, current_user).list_deadline_presets(
        include_inactive=include_inactive,
    )
    return [DeadlinePresetRead.model_validate(preset) for preset in presets]


@router.post("/deadline-presets", response_model=DeadlinePresetRead, status_code=201)
async def create_deadline_preset(
    payload: DeadlinePresetCreateRequest,
    current_user: AdminUser,
    db: DbSession,
) -> DeadlinePresetRead:
    preset = _equipment_service(db, current_user).create_deadline_preset(
        payload,
        current_user=current_user,
    )
    return DeadlinePresetRead.model_validate(preset)


@router.patch("/deadline-presets/{preset_id}", response_model=DeadlinePresetRead)
async def update_deadline_preset(
    preset_id: int,
    payload: DeadlinePresetUpdateRequest,
    current_user: AdminUser,
    db: DbSession,
) -> DeadlinePresetRead:
    preset = _equipment_service(db, current_user).update_deadline_preset(
        preset_id=preset_id,
        payload=payload,
        current_user=current_user,
    )
    return DeadlinePresetRead.model_validate(preset)


@router.delete("/deadline-presets/{preset_id}", status_code=204)
async def delete_deadline_preset(
    preset_id: int,
    current_user: AdminUser,
    db: DbSession,
) -> None:
    _equipment_service(db, current_user).delete_deadline_preset(
        preset_id=preset_id,
        current_user=current_user,
    )


@router.post("/folders", response_model=EquipmentFolderRead, status_code=201)
async def create_folder(
    payload: EquipmentFolderCreateRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> EquipmentFolderRead:
    folder = _equipment_service(db, current_user).create_folder(payload, current_user=current_user)
    return EquipmentFolderRead.model_validate(folder)


@router.patch("/folders/{folder_id}", response_model=EquipmentFolderRead)
async def update_folder(
    folder_id: int,
    payload: EquipmentFolderUpdateRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> EquipmentFolderRead:
    folder = _equipment_service(db, current_user).update_folder(
        folder_id=folder_id,
        payload=payload,
        current_user=current_user,
    )
    return EquipmentFolderRead.model_validate(folder)


@router.delete("/folders/{folder_id}", status_code=204)
async def delete_folder(
    folder_id: int,
    current_user: OperatorUser,
    db: DbSession,
) -> None:
    _equipment_service(db, current_user).delete_folder(
        folder_id=folder_id,
        current_user=current_user,
    )


@router.get("/groups", response_model=list[EquipmentGroupRead])
async def list_groups(
    current_user: CurrentUser,
    db: DbSession,
    folder_id: Annotated[int | None, Query()] = None,
) -> list[EquipmentGroupRead]:
    groups = _equipment_service(db, current_user).list_groups(folder_id=folder_id)
    return [EquipmentGroupRead.model_validate(group) for group in groups]


@router.get("", response_model=list[EquipmentRead])
async def list_equipment(
    current_user: CurrentUser,
    db: DbSession,
    folder_id: Annotated[int | None, Query()] = None,
    group_id: Annotated[int | None, Query()] = None,
    equipment_ids: Annotated[list[int] | None, Query()] = None,
    query: Annotated[str | None, Query()] = None,
    object_name: Annotated[str | None, Query()] = None,
    current_location_manual: Annotated[str | None, Query()] = None,
    status: Annotated[EquipmentStatus | None, Query()] = None,
    equipment_type: Annotated[EquipmentType | None, Query()] = None,
) -> list[EquipmentRead]:
    equipment_items = _equipment_service(db, current_user).list_equipment(
        folder_id=folder_id,
        group_id=group_id,
        equipment_ids=equipment_ids,
        query=query,
        object_name=object_name,
        current_location_manual=current_location_manual,
        status=status,
        equipment_type=equipment_type,
    )
    return [EquipmentRead.model_validate(item) for item in equipment_items]


@router.get("/page", response_model=EquipmentPageRead)
async def list_equipment_page(
    current_user: CurrentUser,
    db: DbSession,
    folder_id: Annotated[int | None, Query()] = None,
    group_id: Annotated[int | None, Query()] = None,
    query: Annotated[str | None, Query()] = None,
    object_name: Annotated[str | None, Query()] = None,
    current_location_manual: Annotated[str | None, Query()] = None,
    status: Annotated[EquipmentStatus | None, Query()] = None,
    equipment_type: Annotated[EquipmentType | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
    sort_key: Annotated[EquipmentSortKey | None, Query()] = None,
    sort_direction: Annotated[EquipmentSortDirection, Query()] = "asc",
) -> EquipmentPageRead:
    return _equipment_service(db, current_user).list_equipment_page(
        folder_id=folder_id,
        group_id=group_id,
        query=query,
        object_name=object_name,
        current_location_manual=current_location_manual,
        status=status,
        equipment_type=equipment_type,
        limit=limit,
        offset=offset,
        sort_key=sort_key,
        sort_direction=sort_direction,
    )


@router.get("/verifications", response_model=list[VerificationQueueItemRead])
async def list_verification_queue(
    current_user: CurrentUser,
    db: DbSession,
    lifecycle_status: Annotated[str, Query()] = "active",
    query: Annotated[str | None, Query()] = None,
    folder_id: Annotated[int | None, Query()] = None,
    verification_id: Annotated[int | None, Query(ge=1)] = None,
    batch_key: Annotated[str | None, Query()] = None,
    equipment_id: Annotated[int | None, Query(ge=1)] = None,
) -> list[VerificationQueueItemRead]:
    return _equipment_service(db, current_user).list_verification_queue(
        lifecycle_status=lifecycle_status,
        query=query,
        folder_id=folder_id,
        target_id=verification_id,
        target_batch_key=batch_key,
        target_equipment_id=equipment_id,
    )


@router.get("/verifications/page", response_model=VerificationQueuePageRead)
async def list_verification_queue_page(
    current_user: CurrentUser,
    db: DbSession,
    lifecycle_status: Annotated[str, Query()] = "active",
    query: Annotated[str | None, Query()] = None,
    folder_id: Annotated[int | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> VerificationQueuePageRead:
    return _equipment_service(db, current_user).list_verification_queue_page(
        lifecycle_status=lifecycle_status,
        query=query,
        folder_id=folder_id,
        limit=limit,
        offset=offset,
    )


@router.get("/repairs", response_model=list[RepairQueueItemRead])
async def list_repair_queue(
    current_user: CurrentUser,
    db: DbSession,
    lifecycle_status: Annotated[str, Query()] = "active",
    query: Annotated[str | None, Query()] = None,
    folder_id: Annotated[int | None, Query()] = None,
    repair_id: Annotated[int | None, Query(ge=1)] = None,
    batch_key: Annotated[str | None, Query()] = None,
    equipment_id: Annotated[int | None, Query(ge=1)] = None,
) -> list[RepairQueueItemRead]:
    return _equipment_service(db, current_user).list_repair_queue(
        lifecycle_status=lifecycle_status,
        query=query,
        folder_id=folder_id,
        target_id=repair_id,
        target_batch_key=batch_key,
        target_equipment_id=equipment_id,
    )


@router.get("/repairs/page", response_model=RepairQueuePageRead)
async def list_repair_queue_page(
    current_user: CurrentUser,
    db: DbSession,
    lifecycle_status: Annotated[str, Query()] = "active",
    query: Annotated[str | None, Query()] = None,
    folder_id: Annotated[int | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> RepairQueuePageRead:
    return _equipment_service(db, current_user).list_repair_queue_page(
        lifecycle_status=lifecycle_status,
        query=query,
        folder_id=folder_id,
        limit=limit,
        offset=offset,
    )


@router.get("/verifications/export/xlsx")
async def export_verification_queue_xlsx(
    current_user: CurrentUser,
    db: DbSession,
    lifecycle_status: Annotated[str, Query()] = "active",
    query: Annotated[str | None, Query()] = None,
    folder_id: Annotated[int | None, Query()] = None,
) -> Response:
    file_path = _equipment_service(db, current_user).export_verification_queue_xlsx(
        lifecycle_status=lifecycle_status,
        query=query,
        folder_id=folder_id,
    )
    lifecycle_label = "активные" if lifecycle_status.strip().lower() == "active" else "архив"
    file_name = f"Поверка СИ {lifecycle_label} {date.today().strftime('%d.%m.%Y')}.xlsx"
    return _build_file_response(
        file_path=file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        download_name=file_name,
        fallback_name="verification-queue.xlsx",
        cleanup_after_send=True,
    )


@router.get("/repairs/export/xlsx")
async def export_repair_queue_xlsx(
    current_user: CurrentUser,
    db: DbSession,
    lifecycle_status: Annotated[str, Query()] = "active",
    query: Annotated[str | None, Query()] = None,
    folder_id: Annotated[int | None, Query()] = None,
) -> Response:
    file_path = _equipment_service(db, current_user).export_repair_queue_xlsx(
        lifecycle_status=lifecycle_status,
        query=query,
        folder_id=folder_id,
    )
    lifecycle_label = "активные" if lifecycle_status.strip().lower() == "active" else "архив"
    file_name = f"Ремонты {lifecycle_label} {date.today().strftime('%d.%m.%Y')}.xlsx"
    return _build_file_response(
        file_path=file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        download_name=file_name,
        fallback_name="repair-queue.xlsx",
        cleanup_after_send=True,
    )


@router.get(
    "/{equipment_id}/verification/history",
    response_model=list[VerificationQueueItemRead],
)
async def list_equipment_verification_history(
    equipment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> list[VerificationQueueItemRead]:
    return _equipment_service(db, current_user).list_equipment_verification_history(
        equipment_id=equipment_id
    )


@router.get(
    "/{equipment_id}/repair/history",
    response_model=list[RepairQueueItemRead],
)
async def list_equipment_repair_history(
    equipment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> list[RepairQueueItemRead]:
    return _equipment_service(db, current_user).list_equipment_repair_history(
        equipment_id=equipment_id
    )


@router.post("/verifications/bulk", response_model=list[VerificationRead], status_code=201)
async def create_verification_batch(
    current_user: OperatorUser,
    db: DbSession,
    equipment_ids: list[int] = PROCESS_EQUIPMENT_IDS,
    batch_name: str = PROCESS_BATCH_NAME,
    route_city: str = VERIFICATION_ROUTE_CITY,
    route_destination: str = VERIFICATION_ROUTE_DESTINATION,
    sent_to_verification_at: date = VERIFICATION_SENT_TO_VERIFICATION_AT,
    is_on_site: bool = VERIFICATION_IS_ON_SITE,
    flow_mode: VerificationFlowMode | None = VERIFICATION_FLOW_MODE,
    stage_template_variant_id: str | None = VERIFICATION_STAGE_TEMPLATE_VARIANT_ID,
    initial_message_text: str | None = VERIFICATION_INITIAL_MESSAGE_TEXT,
    initial_message_is_private: bool = VERIFICATION_INITIAL_MESSAGE_IS_PRIVATE,
    files: list[UploadFile] | None = OPTIONAL_FILES,
) -> list[VerificationRead]:
    payload = VerificationBulkCreateRequest(
        equipment_ids=equipment_ids,
        batch_name=batch_name,
        is_on_site=is_on_site,
        flow_mode=(
            flow_mode
            if flow_mode is not None
            else (
                VerificationFlowMode.ONSITE_WITH_DEMOLITION
                if is_on_site
                else VerificationFlowMode.OFFSITE_WITH_DEMOLITION
            )
        ),
        stage_template_variant_id=stage_template_variant_id,
        route_city=route_city,
        route_destination=route_destination,
        sent_to_verification_at=sent_to_verification_at,
        initial_message_text=initial_message_text,
        initial_message_is_private=initial_message_is_private,
    )
    async with _uploaded_files_context(files) as uploaded_files:
        verifications = _equipment_service(db, current_user).create_verification_batch(
            payload=payload,
            current_user=current_user,
            files=uploaded_files,
        )
    return [VerificationRead.model_validate(item) for item in verifications]


@router.post("/repairs/bulk", response_model=list[RepairRead], status_code=201)
async def create_repair_batch(
    current_user: OperatorUser,
    db: DbSession,
    equipment_ids: list[int] = PROCESS_EQUIPMENT_IDS,
    batch_name: str = PROCESS_BATCH_NAME,
    route_city: str = REPAIR_ROUTE_CITY,
    route_destination: str = REPAIR_ROUTE_DESTINATION,
    sent_to_repair_at: date = REPAIR_SENT_TO_REPAIR_AT,
    is_on_site: bool = REPAIR_IS_ON_SITE,
    stage_template_variant_id: str | None = REPAIR_STAGE_TEMPLATE_VARIANT_ID,
    initial_message_text: str | None = REPAIR_INITIAL_MESSAGE_TEXT,
    initial_message_is_private: bool = REPAIR_INITIAL_MESSAGE_IS_PRIVATE,
    files: list[UploadFile] | None = OPTIONAL_FILES,
) -> list[RepairRead]:
    payload = RepairBulkCreateRequest(
        equipment_ids=equipment_ids,
        batch_name=batch_name,
        is_on_site=is_on_site,
        stage_template_variant_id=stage_template_variant_id,
        route_city=route_city,
        route_destination=route_destination,
        sent_to_repair_at=sent_to_repair_at,
        initial_message_text=initial_message_text,
        initial_message_is_private=initial_message_is_private,
    )
    async with _uploaded_files_context(files) as uploaded_files:
        repairs = _equipment_service(db, current_user).create_repair_batch(
            payload=payload,
            current_user=current_user,
            files=uploaded_files,
        )
    return [RepairRead.model_validate(item) for item in repairs]


@router.get("/export/xlsx")
async def export_equipment_registry_xlsx(
    current_user: CurrentUser,
    db: DbSession,
    folder_id: Annotated[int | None, Query()] = None,
    group_id: Annotated[int | None, Query()] = None,
    equipment_ids: Annotated[list[int] | None, Query()] = None,
    query: Annotated[str | None, Query()] = None,
    status: Annotated[EquipmentStatus | None, Query()] = None,
    equipment_type: Annotated[EquipmentType | None, Query()] = None,
) -> Response:
    file_path = _equipment_service(db, current_user).export_equipment_registry_xlsx(
        folder_id=folder_id,
        group_id=group_id,
        equipment_ids=equipment_ids,
        query=query,
        status_value=status,
        equipment_type=equipment_type,
    )
    return _build_file_response(
        file_path=file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        download_name="equipment-registry.xlsx",
        cleanup_after_send=True,
    )


@router.post("/si/import", response_model=EquipmentSIBulkImportResultRead)
async def import_si_from_excel(
    current_user: OperatorUser,
    db: DbSession,
    folder_id: int = IMPORT_FOLDER_ID,
    object_name: str = IMPORT_OBJECT_NAME,
    status_value: EquipmentStatus = IMPORT_STATUS_VALUE,
    current_location_manual: str | None = IMPORT_CURRENT_LOCATION,
    file: UploadFile = ATTACHMENT_FILE,
) -> EquipmentSIBulkImportResultRead:
    async with _uploaded_file_context(file) as uploaded_file:
        result = await _equipment_service(db, current_user).import_si_from_excel(
            file_name=uploaded_file.file_name,
            file_path=uploaded_file.temp_path,
            folder_id=folder_id,
            object_name=object_name,
            status_value=status_value,
            current_location_manual=current_location_manual,
            arshin_service=ArshinService(),
            current_user=current_user,
        )
    return result


@router.get("/{equipment_id}", response_model=EquipmentRead)
async def get_equipment(
    equipment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> EquipmentRead:
    equipment_item = _equipment_service(db, current_user).get_equipment(equipment_id=equipment_id)
    return EquipmentRead.model_validate(equipment_item)


@router.get("/{equipment_id}/details", response_model=EquipmentDetailsRead)
async def get_equipment_details(
    equipment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> EquipmentDetailsRead:
    return _equipment_service(db, current_user).get_equipment_details(equipment_id=equipment_id)


@router.get(
    "/folders/{folder_id}/esi-monitoring",
    response_model=list[ESIEquipmentMonitoringItemRead],
)
async def get_folder_esi_monitoring(
    folder_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> list[ESIEquipmentMonitoringItemRead]:
    return _equipment_service(db, current_user).list_folder_esi_monitoring(folder_id=folder_id)


@router.post(
    "/{equipment_id}/esi-composition",
    response_model=EquipmentESICompositionEntryRead,
    status_code=201,
)
async def create_equipment_esi_composition_entry(
    equipment_id: int,
    payload: EquipmentESICompositionEntryCreateRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> EquipmentESICompositionEntryRead:
    entry = _equipment_service(db, current_user).add_esi_composition_entry(
        equipment_id=equipment_id,
        payload=payload,
        current_user=current_user,
    )
    return EquipmentESICompositionEntryRead.model_validate(entry)


@router.patch(
    "/{equipment_id}/esi-composition/{entry_id}",
    response_model=EquipmentESICompositionEntryRead,
)
async def update_equipment_esi_composition_entry(
    equipment_id: int,
    entry_id: int,
    payload: EquipmentESICompositionEntryUpdateRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> EquipmentESICompositionEntryRead:
    entry = _equipment_service(db, current_user).update_esi_composition_entry(
        equipment_id=equipment_id,
        entry_id=entry_id,
        payload=payload,
        current_user=current_user,
    )
    return EquipmentESICompositionEntryRead.model_validate(entry)


@router.delete(
    "/{equipment_id}/esi-composition/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_equipment_esi_composition_entry(
    equipment_id: int,
    entry_id: int,
    current_user: OperatorUser,
    db: DbSession,
) -> None:
    _equipment_service(db, current_user).delete_esi_composition_entry(
        equipment_id=equipment_id,
        entry_id=entry_id,
        current_user=current_user,
    )


@router.get(
    "/{equipment_id}/process-subscription",
    response_model=EquipmentProcessSubscriptionRead,
)
async def get_equipment_process_subscription(
    equipment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> EquipmentProcessSubscriptionRead:
    enabled = _equipment_service(db, current_user).get_equipment_process_subscription(
        equipment_id=equipment_id,
        user=current_user,
    )
    return EquipmentProcessSubscriptionRead(enabled=enabled)


@router.get(
    "/{equipment_id}/share-recipients",
    response_model=EquipmentShareRecipientsRead,
)
async def get_equipment_share_recipients(
    equipment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> EquipmentShareRecipientsRead:
    return _equipment_service(db, current_user).get_equipment_share_recipients(
        equipment_id=equipment_id
    )


@router.post(
    "/{equipment_id}/share",
    response_model=EquipmentShareResultRead,
)
async def share_equipment(
    equipment_id: int,
    payload: EquipmentShareRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> EquipmentShareResultRead:
    return _equipment_service(db, current_user).share_equipment(
        equipment_id=equipment_id,
        payload=payload,
        current_user=current_user,
    )


@router.put(
    "/{equipment_id}/process-subscription",
    response_model=EquipmentProcessSubscriptionRead,
)
async def update_equipment_process_subscription(
    equipment_id: int,
    payload: EquipmentProcessSubscriptionUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> EquipmentProcessSubscriptionRead:
    enabled = _equipment_service(db, current_user).set_equipment_process_subscription(
        equipment_id=equipment_id,
        enabled=payload.enabled,
        current_user=current_user,
    )
    return EquipmentProcessSubscriptionRead(enabled=enabled)


@router.post("/{equipment_id}/verification", response_model=VerificationRead, status_code=201)
async def create_equipment_verification(
    equipment_id: int,
    current_user: OperatorUser,
    db: DbSession,
    route_city: str = VERIFICATION_ROUTE_CITY,
    route_destination: str = VERIFICATION_ROUTE_DESTINATION,
    sent_to_verification_at: date = VERIFICATION_SENT_TO_VERIFICATION_AT,
    is_on_site: bool = VERIFICATION_IS_ON_SITE,
    flow_mode: VerificationFlowMode | None = VERIFICATION_FLOW_MODE,
    stage_template_variant_id: str | None = VERIFICATION_STAGE_TEMPLATE_VARIANT_ID,
    initial_message_text: str | None = VERIFICATION_INITIAL_MESSAGE_TEXT,
    initial_message_is_private: bool = VERIFICATION_INITIAL_MESSAGE_IS_PRIVATE,
    files: list[UploadFile] | None = OPTIONAL_FILES,
) -> VerificationRead:
    payload = VerificationCreateRequest(
        is_on_site=is_on_site,
        flow_mode=(
            flow_mode
            if flow_mode is not None
            else (
                VerificationFlowMode.ONSITE_WITH_DEMOLITION
                if is_on_site
                else VerificationFlowMode.OFFSITE_WITH_DEMOLITION
            )
        ),
        stage_template_variant_id=stage_template_variant_id,
        route_city=route_city,
        route_destination=route_destination,
        sent_to_verification_at=sent_to_verification_at,
        initial_message_text=initial_message_text,
        initial_message_is_private=initial_message_is_private,
    )
    async with _uploaded_files_context(files) as uploaded_files:
        verification = _equipment_service(db, current_user).create_verification(
            equipment_id=equipment_id,
            payload=payload,
            current_user=current_user,
            files=uploaded_files,
        )
    return VerificationRead.model_validate(verification)


@router.patch("/{equipment_id}/verification", response_model=VerificationRead)
async def update_equipment_verification_milestones(
    equipment_id: int,
    payload: VerificationMilestonesUpdateRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> VerificationRead:
    verification = _equipment_service(db, current_user).update_verification_milestones(
        equipment_id=equipment_id,
        payload=payload,
        current_user=current_user,
    )
    return VerificationRead.model_validate(verification)


@router.patch("/verifications/batch/{batch_key}", response_model=list[VerificationRead])
async def update_verification_batch_milestones(
    batch_key: str,
    payload: VerificationMilestonesUpdateRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> list[VerificationRead]:
    verifications = _equipment_service(db, current_user).update_verification_batch_milestones(
        batch_key=batch_key,
        payload=payload,
        current_user=current_user,
    )
    return [VerificationRead.model_validate(item) for item in verifications]


@router.patch("/verifications/batch/{batch_key}/items", response_model=list[VerificationRead])
async def update_verification_batch_items(
    batch_key: str,
    payload: ProcessBatchMembershipUpdateRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> list[VerificationRead]:
    verifications = _equipment_service(db, current_user).update_verification_batch_items(
        batch_key=batch_key,
        payload=payload,
        current_user=current_user,
    )
    return [VerificationRead.model_validate(item) for item in verifications]


@router.post("/{equipment_id}/verification/close", response_model=VerificationRead)
async def close_equipment_verification(
    equipment_id: int,
    current_user: OperatorUser,
    db: DbSession,
) -> VerificationRead:
    verification = _equipment_service(db, current_user).close_verification(
        equipment_id=equipment_id,
        current_user=current_user,
    )
    return VerificationRead.model_validate(verification)


@router.post("/verifications/batch/{batch_key}/close", response_model=list[VerificationRead])
async def close_verification_batch(
    batch_key: str,
    current_user: OperatorUser,
    db: DbSession,
) -> list[VerificationRead]:
    verifications = _equipment_service(db, current_user).close_verification_batch(
        batch_key=batch_key,
        current_user=current_user,
    )
    return [VerificationRead.model_validate(item) for item in verifications]


@router.delete("/verifications/{verification_id}", status_code=204)
async def delete_verification_archive(
    verification_id: int,
    current_user: OperatorUser,
    db: DbSession,
) -> None:
    _equipment_service(db, current_user).delete_verification_archive(
        verification_id=verification_id,
    )


@router.post("/{equipment_id}/repair", response_model=RepairRead, status_code=201)
async def create_equipment_repair(
    equipment_id: int,
    current_user: OperatorUser,
    db: DbSession,
    route_city: str = REPAIR_ROUTE_CITY,
    route_destination: str = REPAIR_ROUTE_DESTINATION,
    sent_to_repair_at: date = REPAIR_SENT_TO_REPAIR_AT,
    is_on_site: bool = REPAIR_IS_ON_SITE,
    stage_template_variant_id: str | None = REPAIR_STAGE_TEMPLATE_VARIANT_ID,
    initial_message_text: str | None = REPAIR_INITIAL_MESSAGE_TEXT,
    initial_message_is_private: bool = REPAIR_INITIAL_MESSAGE_IS_PRIVATE,
    files: list[UploadFile] | None = OPTIONAL_FILES,
) -> RepairRead:
    payload = RepairCreateRequest(
        is_on_site=is_on_site,
        stage_template_variant_id=stage_template_variant_id,
        route_city=route_city,
        route_destination=route_destination,
        sent_to_repair_at=sent_to_repair_at,
        initial_message_text=initial_message_text,
        initial_message_is_private=initial_message_is_private,
    )
    async with _uploaded_files_context(files) as uploaded_files:
        repair = _equipment_service(db, current_user).create_repair(
            equipment_id=equipment_id,
            payload=payload,
            current_user=current_user,
            files=uploaded_files,
        )
    return RepairRead.model_validate(repair)


@router.patch("/{equipment_id}/repair", response_model=RepairRead)
async def update_equipment_repair_milestones(
    equipment_id: int,
    payload: RepairMilestonesUpdateRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> RepairRead:
    repair = _equipment_service(db, current_user).update_repair_milestones(
        equipment_id=equipment_id,
        payload=payload,
        current_user=current_user,
    )
    return RepairRead.model_validate(repair)


@router.patch("/repairs/batch/{batch_key}", response_model=list[RepairRead])
async def update_repair_batch_milestones(
    batch_key: str,
    payload: RepairMilestonesUpdateRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> list[RepairRead]:
    repairs = _equipment_service(db, current_user).update_repair_batch_milestones(
        batch_key=batch_key,
        payload=payload,
        current_user=current_user,
    )
    return [RepairRead.model_validate(item) for item in repairs]


@router.patch("/repairs/batch/{batch_key}/items", response_model=list[RepairRead])
async def update_repair_batch_items(
    batch_key: str,
    payload: ProcessBatchMembershipUpdateRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> list[RepairRead]:
    repairs = _equipment_service(db, current_user).update_repair_batch_items(
        batch_key=batch_key,
        payload=payload,
        current_user=current_user,
    )
    return [RepairRead.model_validate(item) for item in repairs]


@router.post("/{equipment_id}/repair/close", response_model=RepairRead)
async def close_equipment_repair(
    equipment_id: int,
    current_user: OperatorUser,
    db: DbSession,
) -> RepairRead:
    repair = _equipment_service(db, current_user).close_repair(
        equipment_id=equipment_id,
        current_user=current_user,
    )
    return RepairRead.model_validate(repair)


@router.post("/repairs/batch/{batch_key}/close", response_model=list[RepairRead])
async def close_repair_batch(
    batch_key: str,
    current_user: OperatorUser,
    db: DbSession,
) -> list[RepairRead]:
    repairs = _equipment_service(db, current_user).close_repair_batch(
        batch_key=batch_key,
        current_user=current_user,
    )
    return [RepairRead.model_validate(item) for item in repairs]


@router.delete("/repairs/{repair_id}", status_code=204)
async def delete_repair_archive(
    repair_id: int,
    current_user: OperatorUser,
    db: DbSession,
) -> None:
    _equipment_service(db, current_user).delete_repair_archive(
        repair_id=repair_id,
    )


@router.get("/{equipment_id}/repair/messages", response_model=list[RepairMessageRead])
async def list_equipment_repair_messages(
    equipment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> list[RepairMessageRead]:
    messages = _equipment_service(db, current_user).list_active_repair_messages(
        equipment_id=equipment_id
    )
    return [RepairMessageRead.model_validate(message) for message in messages]


@router.get(
    "/{equipment_id}/verification/messages",
    response_model=list[VerificationMessageRead],
)
async def list_equipment_verification_messages(
    equipment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> list[VerificationMessageRead]:
    messages = _equipment_service(db, current_user).list_active_verification_messages(
        equipment_id=equipment_id
    )
    return [VerificationMessageRead.model_validate(message) for message in messages]


@router.post(
    "/{equipment_id}/repair/messages",
    response_model=RepairMessageRead,
    status_code=201,
)
async def create_equipment_repair_message(
    equipment_id: int,
    current_user: OperatorUser,
    db: DbSession,
    text: str | None = REPAIR_MESSAGE_TEXT,
    is_private: bool = REPAIR_MESSAGE_IS_PRIVATE,
    files: list[UploadFile] | None = OPTIONAL_FILES,
) -> RepairMessageRead:
    async with _uploaded_files_context(files) as uploaded_files:
        message = _equipment_service(db, current_user).create_repair_message(
            equipment_id=equipment_id,
            payload=RepairMessageCreateRequest(text=text, is_private=is_private),
            author=current_user,
            files=uploaded_files,
        )
    return RepairMessageRead.model_validate(message)


@router.patch(
    "/{equipment_id}/repair/messages/{message_id}",
    response_model=RepairMessageRead,
)
async def update_equipment_repair_message(
    equipment_id: int,
    message_id: int,
    payload: RepairMessageUpdateRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> RepairMessageRead:
    message = _equipment_service(db, current_user).update_repair_message(
        equipment_id=equipment_id,
        message_id=message_id,
        payload=payload,
        current_user=current_user,
    )
    return RepairMessageRead.model_validate(message)


@router.delete(
    "/{equipment_id}/repair/messages/{message_id}",
    status_code=204,
)
async def delete_equipment_repair_message(
    equipment_id: int,
    message_id: int,
    current_user: OperatorUser,
    db: DbSession,
) -> None:
    _equipment_service(db, current_user).delete_repair_message(
        equipment_id=equipment_id,
        message_id=message_id,
        current_user=current_user,
    )


@router.post(
    "/{equipment_id}/verification/messages",
    response_model=VerificationMessageRead,
    status_code=201,
)
async def create_equipment_verification_message(
    equipment_id: int,
    current_user: OperatorUser,
    db: DbSession,
    text: str | None = VERIFICATION_MESSAGE_TEXT,
    is_private: bool = VERIFICATION_MESSAGE_IS_PRIVATE,
    files: list[UploadFile] | None = OPTIONAL_FILES,
) -> VerificationMessageRead:
    async with _uploaded_files_context(files) as uploaded_files:
        message = _equipment_service(db, current_user).create_verification_message(
            equipment_id=equipment_id,
            payload=VerificationMessageCreateRequest(text=text, is_private=is_private),
            author=current_user,
            files=uploaded_files,
        )
    return VerificationMessageRead.model_validate(message)


@router.patch(
    "/{equipment_id}/verification/messages/{message_id}",
    response_model=VerificationMessageRead,
)
async def update_equipment_verification_message(
    equipment_id: int,
    message_id: int,
    payload: VerificationMessageUpdateRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> VerificationMessageRead:
    message = _equipment_service(db, current_user).update_verification_message(
        equipment_id=equipment_id,
        message_id=message_id,
        payload=payload,
        current_user=current_user,
    )
    return VerificationMessageRead.model_validate(message)


@router.delete(
    "/{equipment_id}/verification/messages/{message_id}",
    status_code=204,
)
async def delete_equipment_verification_message(
    equipment_id: int,
    message_id: int,
    current_user: OperatorUser,
    db: DbSession,
) -> None:
    _equipment_service(db, current_user).delete_verification_message(
        equipment_id=equipment_id,
        message_id=message_id,
        current_user=current_user,
    )


@router.get("/{equipment_id}/repair/messages/{message_id}/attachments/{attachment_id}/download")
async def download_equipment_repair_message_attachment(
    equipment_id: int,
    message_id: int,
    attachment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> Response:
    attachment, file_path = _equipment_service(db, current_user).get_repair_message_attachment_file(
        equipment_id=equipment_id,
        message_id=message_id,
        attachment_id=attachment_id,
    )
    return _build_file_response(
        file_path=file_path,
        media_type=attachment.file_mime_type or "application/octet-stream",
        download_name=attachment.file_name,
    )


@router.get(
    "/{equipment_id}/verification/messages/{message_id}/attachments/{attachment_id}/download"
)
async def download_equipment_verification_message_attachment(
    equipment_id: int,
    message_id: int,
    attachment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> Response:
    attachment, file_path = _equipment_service(
        db,
        current_user,
    ).get_verification_message_attachment_file(
        equipment_id=equipment_id,
        message_id=message_id,
        attachment_id=attachment_id,
    )
    return _build_file_response(
        file_path=file_path,
        media_type=attachment.file_mime_type or "application/octet-stream",
        download_name=attachment.file_name,
    )


@router.get("/verifications/{verification_id}/archive.zip")
async def download_verification_archive(
    verification_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> Response:
    file_name, file_path = _equipment_service(db, current_user).export_verification_archive_zip(
        verification_id=verification_id
    )
    return _build_file_response(
        file_path=file_path,
        media_type="application/zip",
        download_name=file_name,
        fallback_name="verification-archive.zip",
        cleanup_after_send=True,
    )


@router.get("/repairs/{repair_id}/archive.zip")
async def download_repair_archive(
    repair_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> Response:
    file_name, file_path = _equipment_service(db, current_user).export_repair_archive_zip(
        repair_id=repair_id
    )
    return _build_file_response(
        file_path=file_path,
        media_type="application/zip",
        download_name=file_name,
        fallback_name="repair-archive.zip",
        cleanup_after_send=True,
    )


@router.post("/{equipment_id}/si/refresh", response_model=EquipmentRead)
async def refresh_equipment_si(
    equipment_id: int,
    payload: EquipmentSIRefreshRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> EquipmentRead:
    equipment_item = _equipment_service(db, current_user).refresh_si_verification(
        equipment_id=equipment_id,
        payload=payload,
        current_user=current_user,
    )
    return EquipmentRead.model_validate(equipment_item)


@router.get("/{equipment_id}/attachments", response_model=list[EquipmentAttachmentRead])
async def list_equipment_attachments(
    equipment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> list[EquipmentAttachmentRead]:
    attachments = _equipment_service(db, current_user).list_attachments(equipment_id=equipment_id)
    return [EquipmentAttachmentRead.model_validate(item) for item in attachments]


@router.post(
    "/{equipment_id}/attachments",
    response_model=EquipmentAttachmentRead,
    status_code=201,
)
async def upload_equipment_attachment(
    equipment_id: int,
    current_user: CurrentUser,
    db: DbSession,
    file: UploadFile = ATTACHMENT_FILE,
) -> EquipmentAttachmentRead:
    async with _uploaded_file_context(file) as uploaded_file:
        attachment = _equipment_service(db, current_user).create_attachment(
            equipment_id=equipment_id,
            uploader=current_user,
            file_payload=uploaded_file,
        )
    return EquipmentAttachmentRead.model_validate(attachment)


@router.get("/{equipment_id}/attachments/{attachment_id}/download")
async def download_equipment_attachment(
    equipment_id: int,
    attachment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> Response:
    attachment, file_path = _equipment_service(db, current_user).get_attachment_file(
        equipment_id=equipment_id,
        attachment_id=attachment_id,
    )
    return _build_file_response(
        file_path=file_path,
        media_type=attachment.file_mime_type or "application/octet-stream",
        download_name=attachment.file_name,
    )


@router.get("/{equipment_id}/comments", response_model=list[EquipmentCommentRead])
async def list_equipment_comments(
    equipment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> list[EquipmentCommentRead]:
    comments = _equipment_service(db, current_user).list_comments(equipment_id=equipment_id)
    return [EquipmentCommentRead.model_validate(item) for item in comments]


@router.post(
    "/{equipment_id}/comment-uploads",
    response_model=EquipmentCommentDraftAttachmentRead,
    status_code=201,
)
async def upload_equipment_comment_attachment_draft(
    equipment_id: int,
    current_user: CurrentUser,
    db: DbSession,
    file: UploadFile = ATTACHMENT_FILE,
) -> EquipmentCommentDraftAttachmentRead:
    async with _uploaded_file_context(file) as uploaded_file:
        draft_attachment = _equipment_service(db, current_user).create_comment_attachment_upload(
            equipment_id=equipment_id,
            uploader=current_user,
            file_payload=uploaded_file,
        )
    return EquipmentCommentDraftAttachmentRead.model_validate(draft_attachment)


@router.delete("/{equipment_id}/comment-uploads/{upload_token}", status_code=204)
async def delete_equipment_comment_attachment_draft(
    equipment_id: int,
    upload_token: str,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    _equipment_service(db, current_user).delete_comment_attachment_upload(
        equipment_id=equipment_id,
        upload_token=upload_token,
        current_user=current_user,
    )


@router.post(
    "/{equipment_id}/comments",
    response_model=EquipmentCommentRead,
    status_code=201,
)
async def create_equipment_comment(
    equipment_id: int,
    request: Request,
    current_user: CurrentUser,
    db: DbSession,
) -> EquipmentCommentRead:
    payload, uploaded_files = await _parse_comment_create_request(request)
    try:
        comment = _equipment_service(db, current_user).create_comment(
            equipment_id=equipment_id,
            payload=payload,
            author=current_user,
            files=uploaded_files,
        )
    finally:
        _cleanup_uploaded_file_payloads(uploaded_files)
    return EquipmentCommentRead.model_validate(comment)


@router.patch(
    "/{equipment_id}/comments/{comment_id}",
    response_model=EquipmentCommentRead,
)
async def update_equipment_comment(
    equipment_id: int,
    comment_id: int,
    payload: EquipmentCommentUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> EquipmentCommentRead:
    comment = _equipment_service(db, current_user).update_comment(
        equipment_id=equipment_id,
        comment_id=comment_id,
        payload=payload,
        current_user=current_user,
    )
    return EquipmentCommentRead.model_validate(comment)


@router.delete("/{equipment_id}/comments/{comment_id}", status_code=204)
async def delete_equipment_comment(
    equipment_id: int,
    comment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    _equipment_service(db, current_user).delete_comment(
        equipment_id=equipment_id,
        comment_id=comment_id,
        current_user=current_user,
    )


@router.get("/{equipment_id}/comments/{comment_id}/attachments/{attachment_id}/download")
async def download_equipment_comment_attachment(
    equipment_id: int,
    comment_id: int,
    attachment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> Response:
    attachment, file_path = _equipment_service(db, current_user).get_comment_attachment_file(
        equipment_id=equipment_id,
        comment_id=comment_id,
        attachment_id=attachment_id,
    )
    return _build_file_response(
        file_path=file_path,
        media_type=attachment.file_mime_type or "application/octet-stream",
        download_name=attachment.file_name,
    )


@router.delete("/{equipment_id}/attachments/{attachment_id}", status_code=204)
async def delete_equipment_attachment(
    equipment_id: int,
    attachment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    _equipment_service(db, current_user).delete_attachment(
        equipment_id=equipment_id,
        attachment_id=attachment_id,
        current_user=current_user,
    )


@router.post("", response_model=EquipmentRead, status_code=201)
async def create_equipment(
    payload: EquipmentCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> EquipmentRead:
    equipment_item = _equipment_service(db, current_user).create_equipment(
        payload,
        current_user=current_user,
    )
    return EquipmentRead.model_validate(equipment_item)


@router.patch("/{equipment_id}", response_model=EquipmentRead)
async def update_equipment(
    equipment_id: int,
    payload: EquipmentUpdateRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> EquipmentRead:
    equipment_item = _equipment_service(db, current_user).update_equipment(
        equipment_id=equipment_id,
        payload=payload,
        current_user=current_user,
    )
    return EquipmentRead.model_validate(equipment_item)


@router.post("/delete-batch", status_code=204)
async def delete_equipment_batch(
    payload: EquipmentBulkDeleteRequest,
    current_user: OperatorUser,
    db: DbSession,
) -> None:
    _equipment_service(db, current_user).delete_equipment_batch(
        equipment_ids=payload.equipment_ids,
        current_user=current_user,
    )


@asynccontextmanager
async def _uploaded_files_context(files: list[UploadFile] | None):
    uploaded_files: list[UploadedFilePayload] = []
    try:
        for file in files or []:
            uploaded_files.append(await _persist_upload_to_temp_file(file))
        yield uploaded_files
    finally:
        for uploaded_file in uploaded_files:
            _cleanup_uploaded_file_payload(uploaded_file)


@router.delete("/{equipment_id}", status_code=204)
async def delete_equipment(
    equipment_id: int,
    current_user: OperatorUser,
    db: DbSession,
) -> None:
    _equipment_service(db, current_user).delete_equipment(
        equipment_id=equipment_id,
        current_user=current_user,
    )
