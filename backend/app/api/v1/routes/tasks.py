from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentUser, DbSession
from app.models.task import TaskPriority, TaskStatus
from app.models.user import User
from app.schemas.task import (
    TaskChecklistItemCreateRequest,
    TaskChecklistItemUpdateRequest,
    TaskCreateRequest,
    TaskPageRead,
    TaskRead,
    TaskUpdateRequest,
)
from app.services.task_service import TaskService

router = APIRouter(prefix="/tasks")


def _service(db: DbSession, current_user: User) -> TaskService:
    return TaskService(db, access_user=current_user)


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
