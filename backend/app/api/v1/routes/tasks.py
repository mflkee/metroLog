from __future__ import annotations

from datetime import date
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse

from app.api.deps import CurrentUser, DbSession
from app.core.config import settings
from app.models.task import TaskPriority, TaskStatus
from app.models.user import User
from app.schemas.task import (
    TaskAttachmentRead,
    TaskChecklistItemCreateRequest,
    TaskChecklistItemUpdateRequest,
    TaskCreateRequest,
    TaskMessageCreateRequest,
    TaskMessageRead,
    TaskMessageUpdateRequest,
    TaskPageRead,
    TaskRead,
    TaskSubscriptionRead,
    TaskUpdateRequest,
)
from app.services.equipment_service import UploadedFilePayload
from app.services.task_service import TaskService

router = APIRouter(prefix="/tasks")
UPLOAD_READ_CHUNK_SIZE_BYTES = 1024 * 1024


def _service(db: DbSession, current_user: User) -> TaskService:
    return TaskService(db, access_user=current_user)


async def _persist_upload(file: UploadFile) -> UploadedFilePayload:
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
                    detail="Файл слишком большой.",
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


async def _persist_uploads(files: list[UploadFile]) -> list[UploadedFilePayload]:
    payloads: list[UploadedFilePayload] = []
    try:
        for file in files:
            payloads.append(await _persist_upload(file))
    except Exception:
        _cleanup_uploads(payloads)
        raise
    return payloads


def _cleanup_uploads(payloads: list[UploadedFilePayload]) -> None:
    for payload in payloads:
        payload.temp_path.unlink(missing_ok=True)


@router.get("", response_model=TaskPageRead)
async def list_tasks(
    db: DbSession,
    current_user: CurrentUser,
    folder_id: Annotated[int | None, Query()] = None,
    status_filter: Annotated[list[TaskStatus] | None, Query(alias="status")] = None,
    priority: Annotated[list[TaskPriority] | None, Query()] = None,
    kind: Annotated[str | None, Query()] = None,
    responsible_user_id: Annotated[int | None, Query()] = None,
    assignee_user_id: Annotated[int | None, Query()] = None,
    observer_user_id: Annotated[int | None, Query()] = None,
    equipment_id: Annotated[int | None, Query()] = None,
    query: Annotated[str | None, Query()] = None,
    due_before: Annotated[date | None, Query()] = None,
    overdue_only: Annotated[bool, Query()] = False,
    sort: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TaskPageRead:
    return _service(db, current_user).list_tasks(
        folder_id=folder_id,
        statuses=status_filter,
        priorities=priority,
        kind=kind,
        responsible_user_id=responsible_user_id,
        assignee_user_id=assignee_user_id,
        observer_user_id=observer_user_id,
        equipment_id=equipment_id,
        query=query,
        due_before=due_before,
        overdue_only=overdue_only,
        sort=sort,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=TaskRead, status_code=status.HTTP_201_CREATED)
async def create_task(
    db: DbSession,
    current_user: CurrentUser,
    payload: TaskCreateRequest,
) -> TaskRead:
    return _service(db, current_user).create_task(payload=payload, current_user=current_user)


@router.get("/{task_id}", response_model=TaskRead)
async def get_task(task_id: int, db: DbSession, current_user: CurrentUser) -> TaskRead:
    return _service(db, current_user).get_task(task_id=task_id)


@router.patch("/{task_id}", response_model=TaskRead)
async def update_task(
    task_id: int,
    db: DbSession,
    current_user: CurrentUser,
    payload: TaskUpdateRequest,
) -> TaskRead:
    return _service(db, current_user).update_task(
        task_id=task_id, payload=payload, current_user=current_user
    )


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: int, db: DbSession, current_user: CurrentUser) -> None:
    _service(db, current_user).delete_task(task_id=task_id, current_user=current_user)


@router.post("/{task_id}/checklist", response_model=TaskRead)
async def add_checklist_item(
    task_id: int,
    db: DbSession,
    current_user: CurrentUser,
    payload: TaskChecklistItemCreateRequest,
) -> TaskRead:
    return _service(db, current_user).add_checklist_item(
        task_id=task_id, payload=payload, current_user=current_user
    )


@router.patch("/{task_id}/checklist/{item_id}", response_model=TaskRead)
async def update_checklist_item(
    task_id: int,
    item_id: int,
    db: DbSession,
    current_user: CurrentUser,
    payload: TaskChecklistItemUpdateRequest,
) -> TaskRead:
    return _service(db, current_user).update_checklist_item(
        task_id=task_id, item_id=item_id, payload=payload, current_user=current_user
    )


@router.delete("/{task_id}/checklist/{item_id}", response_model=TaskRead)
async def delete_checklist_item(
    task_id: int,
    item_id: int,
    db: DbSession,
    current_user: CurrentUser,
) -> TaskRead:
    return _service(db, current_user).delete_checklist_item(
        task_id=task_id, item_id=item_id, current_user=current_user
    )


@router.get("/{task_id}/messages", response_model=list[TaskMessageRead])
async def list_task_messages(
    task_id: int, db: DbSession, current_user: CurrentUser
) -> list[TaskMessageRead]:
    return _service(db, current_user).list_messages(task_id=task_id, current_user=current_user)


@router.post(
    "/{task_id}/messages", response_model=TaskMessageRead, status_code=status.HTTP_201_CREATED
)
async def create_task_message(
    task_id: int,
    db: DbSession,
    current_user: CurrentUser,
    text: Annotated[str | None, Form()] = None,
    is_private: Annotated[bool, Form()] = False,
    files: Annotated[list[UploadFile] | None, File()] = None,
) -> TaskMessageRead:
    payloads = await _persist_uploads(files or [])
    try:
        return _service(db, current_user).create_message(
            task_id=task_id,
            payload=TaskMessageCreateRequest(text=text, is_private=is_private),
            files=payloads,
            current_user=current_user,
        )
    finally:
        _cleanup_uploads(payloads)


@router.patch("/{task_id}/messages/{message_id}", response_model=TaskMessageRead)
async def update_task_message(
    task_id: int,
    message_id: int,
    db: DbSession,
    current_user: CurrentUser,
    payload: TaskMessageUpdateRequest,
) -> TaskMessageRead:
    return _service(db, current_user).update_message(
        task_id=task_id, message_id=message_id, payload=payload, current_user=current_user
    )


@router.delete("/{task_id}/messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_message(
    task_id: int, message_id: int, db: DbSession, current_user: CurrentUser
) -> None:
    _service(db, current_user).delete_message(
        task_id=task_id, message_id=message_id, current_user=current_user
    )


@router.get("/{task_id}/messages/{message_id}/attachments/{attachment_id}")
async def download_task_message_attachment(
    task_id: int,
    message_id: int,
    attachment_id: int,
    db: DbSession,
    current_user: CurrentUser,
) -> FileResponse:
    service = _service(db, current_user)
    attachment = service.get_message_attachment(
        task_id=task_id, message_id=message_id, attachment_id=attachment_id
    )
    file_path = settings.attachment_storage_path / attachment.storage_path
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Файл вложения не найден."
        )
    return FileResponse(
        file_path,
        media_type=attachment.file_mime_type or "application/octet-stream",
        filename=attachment.file_name,
    )


@router.get("/{task_id}/attachments", response_model=list[TaskAttachmentRead])
async def list_task_attachments(
    task_id: int, db: DbSession, current_user: CurrentUser
) -> list[TaskAttachmentRead]:
    return _service(db, current_user).list_task_attachments(
        task_id=task_id, current_user=current_user
    )


@router.post(
    "/{task_id}/attachments",
    response_model=list[TaskAttachmentRead],
    status_code=status.HTTP_201_CREATED,
)
async def add_task_attachments(
    task_id: int,
    db: DbSession,
    current_user: CurrentUser,
    files: Annotated[list[UploadFile], File()],
) -> list[TaskAttachmentRead]:
    payloads = await _persist_uploads(files)
    try:
        return _service(db, current_user).add_task_attachments(
            task_id=task_id, files=payloads, current_user=current_user
        )
    finally:
        _cleanup_uploads(payloads)


@router.get("/{task_id}/attachments/{attachment_id}")
async def download_task_attachment(
    task_id: int, attachment_id: int, db: DbSession, current_user: CurrentUser
) -> FileResponse:
    service = _service(db, current_user)
    meta = service.get_task_attachment_meta(task_id=task_id, attachment_id=attachment_id)
    file_path = service.read_task_attachment(task_id=task_id, attachment_id=attachment_id)
    return FileResponse(
        file_path,
        media_type=meta.file_mime_type or "application/octet-stream",
        filename=meta.file_name,
    )


@router.delete("/{task_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task_attachment(
    task_id: int, attachment_id: int, db: DbSession, current_user: CurrentUser
) -> None:
    _service(db, current_user).delete_task_attachment(
        task_id=task_id, attachment_id=attachment_id, current_user=current_user
    )


@router.get("/{task_id}/subscription", response_model=TaskSubscriptionRead)
async def get_task_subscription(
    task_id: int, db: DbSession, current_user: CurrentUser
) -> TaskSubscriptionRead:
    return _service(db, current_user).get_subscription(task_id=task_id, current_user=current_user)


@router.post("/{task_id}/subscription", response_model=TaskSubscriptionRead)
async def subscribe_task(
    task_id: int, db: DbSession, current_user: CurrentUser
) -> TaskSubscriptionRead:
    return _service(db, current_user).set_subscription(
        task_id=task_id, subscribed=True, current_user=current_user
    )


@router.delete("/{task_id}/subscription", response_model=TaskSubscriptionRead)
async def unsubscribe_task(
    task_id: int, db: DbSession, current_user: CurrentUser
) -> TaskSubscriptionRead:
    return _service(db, current_user).set_subscription(
        task_id=task_id, subscribed=False, current_user=current_user
    )
