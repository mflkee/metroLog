from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.event import EventCategory, EventLog
from app.models.task import (
    TERMINAL_TASK_STATUSES,
    Task,
    TaskChecklistItem,
    TaskEquipment,
    TaskParticipant,
    TaskParticipantRole,
    TaskPriority,
    TaskStatus,
)
from app.models.user import User
from app.repositories.equipment_repository import EquipmentFolderRepository, EquipmentRepository
from app.repositories.event_repository import EventLogRepository
from app.repositories.task_repository import TaskRepository
from app.schemas.task import (
    TaskChecklistItemCreateRequest,
    TaskChecklistItemRead,
    TaskChecklistItemUpdateRequest,
    TaskCreateRequest,
    TaskEquipmentRead,
    TaskListItemRead,
    TaskPageRead,
    TaskParticipantRead,
    TaskRead,
    TaskUpdateRequest,
)
from app.services.user_service import get_user_allowed_folder_ids, has_operator_access

MUTABLE_ROLES = {TaskParticipantRole.RESPONSIBLE, TaskParticipantRole.ASSIGNEE}


def _display_name(user: User | None) -> str:
    if user is None:
        return "Система"
    parts = [user.last_name.strip(), user.first_name.strip()]
    if user.patronymic and user.patronymic.strip():
        parts.append(user.patronymic.strip())
    return " ".join(part for part in parts if part) or user.email


def _is_overdue(task: Task, *, today: date) -> bool:
    return (
        task.due_date is not None
        and task.due_date < today
        and task.status not in TERMINAL_TASK_STATUSES
    )


class TaskService:
    def __init__(self, session: Session, *, access_user: User | None = None) -> None:
        self.session = session
        self.access_user = access_user
        self.tasks = TaskRepository(session)
        self.events = EventLogRepository(session)
        self.folders = EquipmentFolderRepository(session)
        self.equipment = EquipmentRepository(session)

    # ------------------------------------------------------------------ access

    def _accessible_folder_ids(self) -> set[int] | None:
        return get_user_allowed_folder_ids(self.access_user)

    def _assert_folder_access(
        self, folder_id: int | None, *, detail: str = "Задача не найдена."
    ) -> None:
        allowed = self._accessible_folder_ids()
        if allowed is None:
            return
        if folder_id is None or folder_id not in allowed:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)

    def _get_task_or_404(self, task_id: int) -> Task:
        task = self.tasks.get_by_id(task_id)
        if task is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Задача не найдена.")
        self._assert_folder_access(task.folder_id)
        return task

    def _assert_can_mutate(self, task: Task, user: User) -> None:
        if has_operator_access(user.role) or task.created_by_user_id == user.id:
            return
        for participant in task.participants:
            if participant.user_id == user.id and participant.role in MUTABLE_ROLES:
                return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Недостаточно прав для изменения задачи.",
        )

    def _resolve_active_users(self, user_ids: list[int]) -> dict[int, User]:
        ids = list(dict.fromkeys(user_ids))
        if not ids:
            return {}
        rows = self.session.scalars(
            select(User).where(User.id.in_(ids), User.is_active.is_(True))
        ).all()
        found = {user.id: user for user in rows}
        missing = [user_id for user_id in ids if user_id not in found]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Некоторые выбранные пользователи не найдены или неактивны.",
            )
        return found

    def _resolve_equipment(self, equipment_ids: list[int]) -> list:
        ids = list(dict.fromkeys(equipment_ids))
        if not ids:
            return []
        items = []
        for equipment_id in ids:
            equipment = self.equipment.get_by_id(equipment_id)
            if equipment is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Некоторые приборы не найдены.",
                )
            self._assert_folder_access(equipment.folder_id, detail="Прибор не найден.")
            items.append(equipment)
        return items

    # ------------------------------------------------------------------ events

    def _record_event(
        self,
        *,
        action: str,
        title: str,
        user: User | None,
        task: Task,
        description: str | None = None,
    ) -> None:
        folder = self.folders.get_by_id(task.folder_id)
        self.events.add(
            EventLog(
                category=EventCategory.TASK,
                action=action,
                title=title,
                description=description,
                user_id=user.id if user is not None else None,
                user_display_name=_display_name(user),
                folder_id=task.folder_id,
                folder_name=folder.name if folder is not None else None,
            )
        )

    # ------------------------------------------------------------------ reads

    def _folder_names(self, folder_ids: set[int]) -> dict[int, str]:
        if not folder_ids:
            return {}
        result: dict[int, str] = {}
        for folder_id in folder_ids:
            folder = self.folders.get_by_id(folder_id)
            if folder is not None:
                result[folder_id] = folder.name
        return result

    def _participant_reads(self, task: Task) -> list[TaskParticipantRead]:
        role_order = {
            TaskParticipantRole.RESPONSIBLE: 0,
            TaskParticipantRole.ASSIGNEE: 1,
            TaskParticipantRole.OBSERVER: 2,
        }
        participants = sorted(
            task.participants,
            key=lambda item: (role_order.get(item.role, 9), item.id),
        )
        return [
            TaskParticipantRead(
                user_id=participant.user_id,
                role=participant.role,
                display_name=_display_name(participant.user),
                email=participant.user.email if participant.user is not None else None,
            )
            for participant in participants
        ]

    def _equipment_reads(self, task: Task) -> list[TaskEquipmentRead]:
        reads: list[TaskEquipmentRead] = []
        for link in sorted(task.equipment_links, key=lambda item: (item.sort_order, item.id)):
            equipment = self.equipment.get_by_id(link.equipment_id)
            reads.append(
                TaskEquipmentRead(
                    equipment_id=link.equipment_id,
                    note=link.note,
                    sort_order=link.sort_order,
                    object_name=equipment.object_name if equipment is not None else None,
                    name=equipment.name if equipment is not None else None,
                    modification=equipment.modification if equipment is not None else None,
                    serial_number=equipment.serial_number if equipment is not None else None,
                    equipment_type=equipment.equipment_type if equipment is not None else None,
                )
            )
        return reads

    def _checklist_reads(self, task: Task) -> list[TaskChecklistItemRead]:
        return [
            TaskChecklistItemRead.model_validate(item)
            for item in sorted(task.checklist_items, key=lambda row: (row.sort_order, row.id))
        ]

    def serialize_task(self, task: Task) -> TaskRead:
        folder = self.folders.get_by_id(task.folder_id)
        checklist = self._checklist_reads(task)
        today = datetime.now(tz=UTC).date()
        return TaskRead(
            id=task.id,
            folder_id=task.folder_id,
            folder_name=folder.name if folder is not None else None,
            title=task.title,
            description=task.description,
            status=task.status,
            priority=task.priority,
            kind=task.kind,
            tags=list(task.tags or []),
            due_date=task.due_date,
            created_by_user_id=task.created_by_user_id,
            created_by_display_name=task.created_by_display_name,
            completed_at=task.completed_at,
            created_at=task.created_at,
            updated_at=task.updated_at,
            is_overdue=_is_overdue(task, today=today),
            participants=self._participant_reads(task),
            equipment=self._equipment_reads(task),
            checklist=checklist,
            checklist_done=sum(1 for item in checklist if item.is_done),
            checklist_total=len(checklist),
        )

    def _serialize_list_item(
        self, task: Task, *, folder_name: str | None, today: date
    ) -> TaskListItemRead:
        participants = task.participants
        responsible = next(
            (item for item in participants if item.role == TaskParticipantRole.RESPONSIBLE),
            None,
        )
        checklist = task.checklist_items
        return TaskListItemRead(
            id=task.id,
            folder_id=task.folder_id,
            folder_name=folder_name,
            title=task.title,
            status=task.status,
            priority=task.priority,
            kind=task.kind,
            tags=list(task.tags or []),
            due_date=task.due_date,
            responsible_display_name=(
                _display_name(responsible.user) if responsible is not None else None
            ),
            assignee_count=sum(
                1 for item in participants if item.role == TaskParticipantRole.ASSIGNEE
            ),
            observer_count=sum(
                1 for item in participants if item.role == TaskParticipantRole.OBSERVER
            ),
            equipment_count=len(task.equipment_links),
            checklist_done=sum(1 for item in checklist if item.is_done),
            checklist_total=len(checklist),
            completed_at=task.completed_at,
            created_at=task.created_at,
            updated_at=task.updated_at,
            is_overdue=_is_overdue(task, today=today),
        )

    def list_tasks(
        self,
        *,
        folder_id: int | None = None,
        statuses: list[TaskStatus] | None = None,
        priorities: list[TaskPriority] | None = None,
        kind: str | None = None,
        responsible_user_id: int | None = None,
        assignee_user_id: int | None = None,
        observer_user_id: int | None = None,
        equipment_id: int | None = None,
        query: str | None = None,
        due_before: date | None = None,
        overdue_only: bool = False,
        sort: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> TaskPageRead:
        if folder_id is not None:
            self._assert_folder_access(folder_id)
        allowed_folder_ids = self._accessible_folder_ids()
        tasks, total = self.tasks.list_page(
            allowed_folder_ids=allowed_folder_ids,
            folder_id=folder_id,
            statuses=statuses,
            priorities=priorities,
            kind=kind,
            responsible_user_id=responsible_user_id,
            assignee_user_id=assignee_user_id,
            observer_user_id=observer_user_id,
            equipment_id=equipment_id,
            query=query.strip() if query else None,
            due_before=due_before,
            overdue_only=overdue_only,
            today=datetime.now(tz=UTC).date(),
            sort=sort,
            limit=max(1, min(limit, 200)),
            offset=max(0, offset),
        )
        folder_names = self._folder_names({task.folder_id for task in tasks})
        today = datetime.now(tz=UTC).date()
        return TaskPageRead(
            items=[
                self._serialize_list_item(
                    task, folder_name=folder_names.get(task.folder_id), today=today
                )
                for task in tasks
            ],
            total=total,
            limit=max(1, min(limit, 200)),
            offset=max(0, offset),
        )

    def get_task(self, *, task_id: int) -> TaskRead:
        return self.serialize_task(self._get_task_or_404(task_id))

    def list_tasks_for_equipment(self, *, equipment_id: int) -> list[TaskListItemRead]:
        equipment = self.equipment.get_by_id(equipment_id)
        if equipment is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Прибор не найден.")
        self._assert_folder_access(equipment.folder_id, detail="Прибор не найден.")
        today = datetime.now(tz=UTC).date()
        tasks = self.tasks.list_by_equipment_id(equipment_id=equipment_id)
        folder_names = self._folder_names({task.folder_id for task in tasks})
        return [
            self._serialize_list_item(
                task, folder_name=folder_names.get(task.folder_id), today=today
            )
            for task in tasks
        ]

    # ------------------------------------------------------------------ writes

    def _apply_participants(
        self,
        task: Task,
        *,
        responsible_user_id: int,
        assignee_user_ids: list[int],
        observer_user_ids: list[int],
    ) -> None:
        assignees = [user_id for user_id in assignee_user_ids if user_id != responsible_user_id]
        observers = [
            user_id
            for user_id in observer_user_ids
            if user_id != responsible_user_id and user_id not in assignees
        ]
        all_ids = [responsible_user_id, *assignees, *observers]
        self._resolve_active_users(all_ids)

        task.participants.clear()
        self.session.flush()
        task.participants.append(
            TaskParticipant(user_id=responsible_user_id, role=TaskParticipantRole.RESPONSIBLE)
        )
        for user_id in assignees:
            task.participants.append(
                TaskParticipant(user_id=user_id, role=TaskParticipantRole.ASSIGNEE)
            )
        for user_id in observers:
            task.participants.append(
                TaskParticipant(user_id=user_id, role=TaskParticipantRole.OBSERVER)
            )

    def _apply_equipment(self, task: Task, equipment_ids: list[int]) -> None:
        equipment_items = self._resolve_equipment(equipment_ids)
        task.equipment_links.clear()
        self.session.flush()
        for index, equipment in enumerate(equipment_items):
            task.equipment_links.append(TaskEquipment(equipment_id=equipment.id, sort_order=index))

    def _sync_completion(self, task: Task, previous_status: TaskStatus) -> None:
        if task.status in TERMINAL_TASK_STATUSES and previous_status not in TERMINAL_TASK_STATUSES:
            task.completed_at = datetime.now(tz=UTC)
        elif task.status not in TERMINAL_TASK_STATUSES:
            task.completed_at = None

    def create_task(self, *, payload: TaskCreateRequest, current_user: User) -> TaskRead:
        self._assert_folder_access(payload.folder_id)
        responsible = payload.responsible_user_id
        self._resolve_active_users([responsible])
        equipment_items = self._resolve_equipment(payload.equipment_ids)

        task = Task(
            folder_id=payload.folder_id,
            title=payload.title,
            description=payload.description,
            status=payload.status,
            priority=payload.priority,
            kind=payload.kind,
            tags=list(payload.tags),
            due_date=payload.due_date,
            created_by_user_id=current_user.id,
            created_by_display_name=_display_name(current_user),
        )
        if task.status in TERMINAL_TASK_STATUSES:
            task.completed_at = datetime.now(tz=UTC)
        self.tasks.add(task)

        self._apply_participants(
            task,
            responsible_user_id=responsible,
            assignee_user_ids=payload.assignee_user_ids,
            observer_user_ids=payload.observer_user_ids,
        )
        for index, equipment in enumerate(equipment_items):
            task.equipment_links.append(TaskEquipment(equipment_id=equipment.id, sort_order=index))

        self._record_event(
            action="task_created",
            title=f"Создана задача «{task.title}»",
            user=current_user,
            task=task,
        )
        self.session.commit()
        return self.serialize_task(self._get_task_or_404(task.id))

    def update_task(
        self, *, task_id: int, payload: TaskUpdateRequest, current_user: User
    ) -> TaskRead:
        task = self._get_task_or_404(task_id)
        self._assert_can_mutate(task, current_user)
        fields = payload.model_fields_set
        previous_status = task.status

        if "title" in fields and payload.title is not None:
            task.title = payload.title
        if "description" in fields:
            task.description = payload.description
        if "status" in fields and payload.status is not None:
            task.status = payload.status
        if "priority" in fields and payload.priority is not None:
            task.priority = payload.priority
        if "kind" in fields:
            task.kind = payload.kind
        if "tags" in fields and payload.tags is not None:
            task.tags = list(payload.tags)
        if "due_date" in fields:
            task.due_date = payload.due_date

        self._sync_completion(task, previous_status)

        if (
            "responsible_user_id" in fields
            and "assignee_user_ids" in fields
            and "observer_user_ids" in fields
            and payload.responsible_user_id is not None
        ):
            self._apply_participants(
                task,
                responsible_user_id=payload.responsible_user_id,
                assignee_user_ids=payload.assignee_user_ids or [],
                observer_user_ids=payload.observer_user_ids or [],
            )
        elif payload.responsible_user_id is not None or payload.assignee_user_ids is not None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Ответственного, исполнителей и наблюдателей нужно передавать вместе.",
            )

        if "equipment_ids" in fields and payload.equipment_ids is not None:
            self._apply_equipment(task, payload.equipment_ids)

        self._record_event(
            action="task_updated",
            title=f"Обновлена задача «{task.title}»",
            user=current_user,
            task=task,
        )
        self.session.commit()
        return self.serialize_task(self._get_task_or_404(task.id))

    def delete_task(self, *, task_id: int, current_user: User) -> None:
        task = self._get_task_or_404(task_id)
        self._assert_can_mutate(task, current_user)
        self._record_event(
            action="task_deleted",
            title=f"Удалена задача «{task.title}»",
            user=current_user,
            task=task,
        )
        self.tasks.delete(task)
        self.session.commit()

    # --------------------------------------------------------------- checklist

    def add_checklist_item(
        self, *, task_id: int, payload: TaskChecklistItemCreateRequest, current_user: User
    ) -> TaskRead:
        task = self._get_task_or_404(task_id)
        self._assert_can_mutate(task, current_user)
        next_order = max((item.sort_order for item in task.checklist_items), default=-1) + 1
        task.checklist_items.append(
            TaskChecklistItem(label=payload.label, is_done=False, sort_order=next_order)
        )
        self._record_event(
            action="task_checklist_item_added",
            title=f"Задача «{task.title}»: добавлен пункт чек-листа",
            user=current_user,
            task=task,
        )
        self.session.commit()
        return self.serialize_task(self._get_task_or_404(task.id))

    def update_checklist_item(
        self,
        *,
        task_id: int,
        item_id: int,
        payload: TaskChecklistItemUpdateRequest,
        current_user: User,
    ) -> TaskRead:
        task = self._get_task_or_404(task_id)
        self._assert_can_mutate(task, current_user)
        item = next((row for row in task.checklist_items if row.id == item_id), None)
        if item is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Пункт чек-листа не найден."
            )
        fields = payload.model_fields_set
        if "label" in fields and payload.label is not None:
            item.label = payload.label
        if "is_done" in fields and payload.is_done is not None:
            item.is_done = payload.is_done
        if "sort_order" in fields and payload.sort_order is not None:
            item.sort_order = payload.sort_order
        self._record_event(
            action="task_checklist_item_updated",
            title=f"Задача «{task.title}»: изменён пункт чек-листа",
            user=current_user,
            task=task,
        )
        self.session.commit()
        return self.serialize_task(self._get_task_or_404(task.id))

    def delete_checklist_item(self, *, task_id: int, item_id: int, current_user: User) -> TaskRead:
        task = self._get_task_or_404(task_id)
        self._assert_can_mutate(task, current_user)
        item = next((row for row in task.checklist_items if row.id == item_id), None)
        if item is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Пункт чек-листа не найден."
            )
        self.session.delete(item)
        self._record_event(
            action="task_checklist_item_deleted",
            title=f"Задача «{task.title}»: удалён пункт чек-листа",
            user=current_user,
            task=task,
        )
        self.session.commit()
        return self.serialize_task(self._get_task_or_404(task.id))
