from datetime import date
from typing import Annotated

from fastapi import APIRouter, File, Form, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from app.api.deps import CurrentUser, DbSession, OperatorUser
from app.models.equipment import EquipmentStatus, EquipmentType
from app.schemas.equipment import (
    EquipmentAttachmentRead,
    EquipmentCommentCreateRequest,
    EquipmentCommentRead,
    EquipmentCommentUpdateRequest,
    EquipmentCreateRequest,
    EquipmentFolderCreateRequest,
    EquipmentFolderRead,
    EquipmentFolderSuggestionsRead,
    EquipmentFolderUpdateRequest,
    EquipmentGroupRead,
    EquipmentRead,
    EquipmentSIBulkImportResultRead,
    EquipmentSIRefreshRequest,
    EquipmentUpdateRequest,
    RepairCreateRequest,
    RepairMessageCreateRequest,
    RepairMessageRead,
    RepairRead,
    VerificationCreateRequest,
    VerificationMessageCreateRequest,
    VerificationMessageRead,
    VerificationRead,
)
from app.services.arshin_service import ArshinService
from app.services.equipment_service import EquipmentService, UploadedFilePayload

router = APIRouter(prefix="/equipment")
ATTACHMENT_FILE = File(...)
IMPORT_FOLDER_ID = Form(...)
IMPORT_OBJECT_NAME = Form(...)
IMPORT_STATUS_VALUE = Form(EquipmentStatus.IN_WORK)
IMPORT_CURRENT_LOCATION = Form(None)
REPAIR_ROUTE_CITY = Form(...)
REPAIR_ROUTE_DESTINATION = Form(...)
REPAIR_SENT_TO_REPAIR_AT = Form(...)
REPAIR_INITIAL_MESSAGE_TEXT = Form(None)
REPAIR_MESSAGE_TEXT = Form(None)
VERIFICATION_ROUTE_CITY = Form(...)
VERIFICATION_ROUTE_DESTINATION = Form(...)
VERIFICATION_SENT_TO_VERIFICATION_AT = Form(...)
VERIFICATION_INITIAL_MESSAGE_TEXT = Form(None)
VERIFICATION_MESSAGE_TEXT = Form(None)
OPTIONAL_FILES = File(None)


@router.get("/folders", response_model=list[EquipmentFolderRead])
async def list_folders(
    _: CurrentUser,
    db: DbSession,
) -> list[EquipmentFolderRead]:
    folders = EquipmentService(db).list_folders()
    return [EquipmentFolderRead.model_validate(folder) for folder in folders]


@router.get("/folders/{folder_id}/suggestions", response_model=EquipmentFolderSuggestionsRead)
async def get_folder_suggestions(
    folder_id: int,
    _: CurrentUser,
    db: DbSession,
) -> EquipmentFolderSuggestionsRead:
    return EquipmentService(db).get_folder_suggestions(folder_id=folder_id)


@router.post("/folders", response_model=EquipmentFolderRead, status_code=201)
async def create_folder(
    payload: EquipmentFolderCreateRequest,
    _: OperatorUser,
    db: DbSession,
) -> EquipmentFolderRead:
    folder = EquipmentService(db).create_folder(payload)
    return EquipmentFolderRead.model_validate(folder)


@router.patch("/folders/{folder_id}", response_model=EquipmentFolderRead)
async def update_folder(
    folder_id: int,
    payload: EquipmentFolderUpdateRequest,
    _: OperatorUser,
    db: DbSession,
) -> EquipmentFolderRead:
    folder = EquipmentService(db).update_folder(folder_id=folder_id, payload=payload)
    return EquipmentFolderRead.model_validate(folder)


@router.delete("/folders/{folder_id}", status_code=204)
async def delete_folder(
    folder_id: int,
    _: OperatorUser,
    db: DbSession,
) -> None:
    EquipmentService(db).delete_folder(folder_id=folder_id)


@router.get("/groups", response_model=list[EquipmentGroupRead])
async def list_groups(
    _: CurrentUser,
    db: DbSession,
    folder_id: Annotated[int | None, Query()] = None,
) -> list[EquipmentGroupRead]:
    groups = EquipmentService(db).list_groups(folder_id=folder_id)
    return [EquipmentGroupRead.model_validate(group) for group in groups]


@router.get("", response_model=list[EquipmentRead])
async def list_equipment(
    _: CurrentUser,
    db: DbSession,
    folder_id: Annotated[int | None, Query()] = None,
    group_id: Annotated[int | None, Query()] = None,
    query: Annotated[str | None, Query()] = None,
    status: Annotated[EquipmentStatus | None, Query()] = None,
    equipment_type: Annotated[EquipmentType | None, Query()] = None,
) -> list[EquipmentRead]:
    equipment_items = EquipmentService(db).list_equipment(
        folder_id=folder_id,
        group_id=group_id,
        query=query,
        status=status,
        equipment_type=equipment_type,
    )
    return [EquipmentRead.model_validate(item) for item in equipment_items]


@router.get("/export/xlsx")
async def export_equipment_registry_xlsx(
    _: CurrentUser,
    db: DbSession,
    folder_id: Annotated[int | None, Query()] = None,
    group_id: Annotated[int | None, Query()] = None,
    query: Annotated[str | None, Query()] = None,
    status: Annotated[EquipmentStatus | None, Query()] = None,
    equipment_type: Annotated[EquipmentType | None, Query()] = None,
) -> StreamingResponse:
    content = EquipmentService(db).export_equipment_registry_xlsx(
        folder_id=folder_id,
        group_id=group_id,
        query=query,
        status_value=status,
        equipment_type=equipment_type,
    )
    return StreamingResponse(
        iter([content]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="equipment-registry.xlsx"',
        },
    )


@router.post("/si/import", response_model=EquipmentSIBulkImportResultRead)
async def import_si_from_excel(
    _: OperatorUser,
    db: DbSession,
    folder_id: int = IMPORT_FOLDER_ID,
    object_name: str = IMPORT_OBJECT_NAME,
    status_value: EquipmentStatus = IMPORT_STATUS_VALUE,
    current_location_manual: str | None = IMPORT_CURRENT_LOCATION,
    file: UploadFile = ATTACHMENT_FILE,
) -> EquipmentSIBulkImportResultRead:
    result = await EquipmentService(db).import_si_from_excel(
        file_name=file.filename,
        content=await file.read(),
        folder_id=folder_id,
        object_name=object_name,
        status_value=status_value,
        current_location_manual=current_location_manual,
        arshin_service=ArshinService(),
    )
    await file.close()
    return result


@router.get("/{equipment_id}", response_model=EquipmentRead)
async def get_equipment(
    equipment_id: int,
    _: CurrentUser,
    db: DbSession,
) -> EquipmentRead:
    equipment_item = EquipmentService(db).get_equipment(equipment_id=equipment_id)
    return EquipmentRead.model_validate(equipment_item)


@router.post("/{equipment_id}/verification", response_model=VerificationRead, status_code=201)
async def create_equipment_verification(
    equipment_id: int,
    current_user: OperatorUser,
    db: DbSession,
    route_city: str = VERIFICATION_ROUTE_CITY,
    route_destination: str = VERIFICATION_ROUTE_DESTINATION,
    sent_to_verification_at: date = VERIFICATION_SENT_TO_VERIFICATION_AT,
    initial_message_text: str | None = VERIFICATION_INITIAL_MESSAGE_TEXT,
    files: list[UploadFile] | None = OPTIONAL_FILES,
) -> VerificationRead:
    payload = VerificationCreateRequest(
        route_city=route_city,
        route_destination=route_destination,
        sent_to_verification_at=sent_to_verification_at,
        initial_message_text=initial_message_text,
    )
    uploaded_files = await _read_uploaded_files(files)
    verification = EquipmentService(db).create_verification(
        equipment_id=equipment_id,
        payload=payload,
        current_user=current_user,
        files=uploaded_files,
    )
    return VerificationRead.model_validate(verification)


@router.post("/{equipment_id}/repair", response_model=RepairRead, status_code=201)
async def create_equipment_repair(
    equipment_id: int,
    current_user: OperatorUser,
    db: DbSession,
    route_city: str = REPAIR_ROUTE_CITY,
    route_destination: str = REPAIR_ROUTE_DESTINATION,
    sent_to_repair_at: date = REPAIR_SENT_TO_REPAIR_AT,
    initial_message_text: str | None = REPAIR_INITIAL_MESSAGE_TEXT,
    files: list[UploadFile] | None = OPTIONAL_FILES,
) -> RepairRead:
    payload = RepairCreateRequest(
        route_city=route_city,
        route_destination=route_destination,
        sent_to_repair_at=sent_to_repair_at,
        initial_message_text=initial_message_text,
    )
    uploaded_files = await _read_uploaded_files(files)
    repair = EquipmentService(db).create_repair(
        equipment_id=equipment_id,
        payload=payload,
        current_user=current_user,
        files=uploaded_files,
    )
    return RepairRead.model_validate(repair)


@router.get("/{equipment_id}/repair/messages", response_model=list[RepairMessageRead])
async def list_equipment_repair_messages(
    equipment_id: int,
    _: CurrentUser,
    db: DbSession,
) -> list[RepairMessageRead]:
    messages = EquipmentService(db).list_active_repair_messages(equipment_id=equipment_id)
    return [RepairMessageRead.model_validate(message) for message in messages]


@router.get(
    "/{equipment_id}/verification/messages",
    response_model=list[VerificationMessageRead],
)
async def list_equipment_verification_messages(
    equipment_id: int,
    _: CurrentUser,
    db: DbSession,
) -> list[VerificationMessageRead]:
    messages = EquipmentService(db).list_active_verification_messages(
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
    files: list[UploadFile] | None = OPTIONAL_FILES,
) -> RepairMessageRead:
    uploaded_files = await _read_uploaded_files(files)
    message = EquipmentService(db).create_repair_message(
        equipment_id=equipment_id,
        payload=RepairMessageCreateRequest(text=text),
        author=current_user,
        files=uploaded_files,
    )
    return RepairMessageRead.model_validate(message)


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
    files: list[UploadFile] | None = OPTIONAL_FILES,
) -> VerificationMessageRead:
    uploaded_files = await _read_uploaded_files(files)
    message = EquipmentService(db).create_verification_message(
        equipment_id=equipment_id,
        payload=VerificationMessageCreateRequest(text=text),
        author=current_user,
        files=uploaded_files,
    )
    return VerificationMessageRead.model_validate(message)


@router.get(
    "/{equipment_id}/repair/messages/{message_id}/attachments/{attachment_id}/download"
)
async def download_equipment_repair_message_attachment(
    equipment_id: int,
    message_id: int,
    attachment_id: int,
    _: CurrentUser,
    db: DbSession,
) -> FileResponse:
    attachment, file_path = EquipmentService(db).get_repair_message_attachment_file(
        equipment_id=equipment_id,
        message_id=message_id,
        attachment_id=attachment_id,
    )
    return FileResponse(
        file_path,
        filename=attachment.file_name,
        media_type=attachment.file_mime_type or "application/octet-stream",
    )


@router.get(
    "/{equipment_id}/verification/messages/{message_id}/attachments/{attachment_id}/download"
)
async def download_equipment_verification_message_attachment(
    equipment_id: int,
    message_id: int,
    attachment_id: int,
    _: CurrentUser,
    db: DbSession,
) -> FileResponse:
    attachment, file_path = EquipmentService(db).get_verification_message_attachment_file(
        equipment_id=equipment_id,
        message_id=message_id,
        attachment_id=attachment_id,
    )
    return FileResponse(
        file_path,
        filename=attachment.file_name,
        media_type=attachment.file_mime_type or "application/octet-stream",
    )


@router.post("/{equipment_id}/si/refresh", response_model=EquipmentRead)
async def refresh_equipment_si(
    equipment_id: int,
    payload: EquipmentSIRefreshRequest,
    _: OperatorUser,
    db: DbSession,
) -> EquipmentRead:
    equipment_item = EquipmentService(db).refresh_si_verification(
        equipment_id=equipment_id,
        payload=payload,
    )
    return EquipmentRead.model_validate(equipment_item)


@router.get("/{equipment_id}/attachments", response_model=list[EquipmentAttachmentRead])
async def list_equipment_attachments(
    equipment_id: int,
    _: CurrentUser,
    db: DbSession,
) -> list[EquipmentAttachmentRead]:
    attachments = EquipmentService(db).list_attachments(equipment_id=equipment_id)
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
    attachment = EquipmentService(db).create_attachment(
        equipment_id=equipment_id,
        uploader=current_user,
        file_name=file.filename,
        content_type=file.content_type,
        content=await file.read(),
    )
    await file.close()
    return EquipmentAttachmentRead.model_validate(attachment)


@router.get("/{equipment_id}/attachments/{attachment_id}/download")
async def download_equipment_attachment(
    equipment_id: int,
    attachment_id: int,
    _: CurrentUser,
    db: DbSession,
) -> FileResponse:
    attachment, file_path = EquipmentService(db).get_attachment_file(
        equipment_id=equipment_id,
        attachment_id=attachment_id,
    )
    return FileResponse(
        file_path,
        filename=attachment.file_name,
        media_type=attachment.file_mime_type or "application/octet-stream",
    )


@router.get("/{equipment_id}/comments", response_model=list[EquipmentCommentRead])
async def list_equipment_comments(
    equipment_id: int,
    _: CurrentUser,
    db: DbSession,
) -> list[EquipmentCommentRead]:
    comments = EquipmentService(db).list_comments(equipment_id=equipment_id)
    return [EquipmentCommentRead.model_validate(item) for item in comments]


@router.post(
    "/{equipment_id}/comments",
    response_model=EquipmentCommentRead,
    status_code=201,
)
async def create_equipment_comment(
    equipment_id: int,
    payload: EquipmentCommentCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> EquipmentCommentRead:
    comment = EquipmentService(db).create_comment(
        equipment_id=equipment_id,
        payload=payload,
        author=current_user,
    )
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
    comment = EquipmentService(db).update_comment(
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
    EquipmentService(db).delete_comment(
        equipment_id=equipment_id,
        comment_id=comment_id,
        current_user=current_user,
    )


@router.delete("/{equipment_id}/attachments/{attachment_id}", status_code=204)
async def delete_equipment_attachment(
    equipment_id: int,
    attachment_id: int,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    EquipmentService(db).delete_attachment(
        equipment_id=equipment_id,
        attachment_id=attachment_id,
        current_user=current_user,
    )


@router.post("", response_model=EquipmentRead, status_code=201)
async def create_equipment(
    payload: EquipmentCreateRequest,
    _: OperatorUser,
    db: DbSession,
) -> EquipmentRead:
    equipment_item = EquipmentService(db).create_equipment(payload)
    return EquipmentRead.model_validate(equipment_item)


@router.patch("/{equipment_id}", response_model=EquipmentRead)
async def update_equipment(
    equipment_id: int,
    payload: EquipmentUpdateRequest,
    _: OperatorUser,
    db: DbSession,
) -> EquipmentRead:
    equipment_item = EquipmentService(db).update_equipment(
        equipment_id=equipment_id,
        payload=payload,
    )
    return EquipmentRead.model_validate(equipment_item)


async def _read_uploaded_files(files: list[UploadFile] | None) -> list[UploadedFilePayload]:
    uploaded_files: list[UploadedFilePayload] = []
    for file in files or []:
        uploaded_files.append(
            UploadedFilePayload(
                file_name=file.filename,
                content_type=file.content_type,
                content=await file.read(),
            )
        )
        await file.close()
    return uploaded_files


@router.delete("/{equipment_id}", status_code=204)
async def delete_equipment(
    equipment_id: int,
    _: OperatorUser,
    db: DbSession,
) -> None:
    EquipmentService(db).delete_equipment(equipment_id=equipment_id)
