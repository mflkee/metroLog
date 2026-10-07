from __future__ import annotations

from datetime import date

from sqlalchemy import case, exists, false, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models.task import (
    TERMINAL_TASK_STATUSES,
    Task,
    TaskAttachment,
    TaskEquipment,
    TaskMessage,
    TaskMessageAttachment,
    TaskParticipant,
    TaskParticipantRole,
    TaskPriority,
    TaskReminderLog,
    TaskStatus,
    TaskSubscription,
)
from app.models.user import User

_PRIORITY_ORDER = {
    TaskPriority.CRITICAL: 0,
    TaskPriority.HIGH: 1,
    TaskPriority.NORMAL: 2,
    TaskPriority.LOW: 3,
}


def _participant_exists(user_id: int, role: TaskParticipantRole | None = None):
    statement = select(TaskParticipant.id).where(
        TaskParticipant.task_id == Task.id,
        TaskParticipant.user_id == user_id,
    )
    if role is not None:
        statement = statement.where(TaskParticipant.role == role)
    return exists(statement)


def _equipment_exists(equipment_id: int):
    return exists(
        select(TaskEquipment.id).where(
            TaskEquipment.task_id == Task.id,
            TaskEquipment.equipment_id == equipment_id,
        )
    )


class TaskRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, task: Task) -> Task:
        self.session.add(task)
        self.session.flush()
        return task

    def delete(self, task: Task) -> None:
        self.session.delete(task)

    def _load_options(self):
        return (
            selectinload(Task.participants).selectinload(TaskParticipant.user),
            selectinload(Task.equipment_links),
            selectinload(Task.checklist_items),
        )

    def get_by_id(self, task_id: int) -> Task | None:
        statement = select(Task).options(*self._load_options()).where(Task.id == task_id)
        return self.session.scalar(statement)

    def _apply_filters(
        self,
        statement,
        *,
        allowed_folder_ids: set[int] | None = None,
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
        today: date | None = None,
    ):
        if allowed_folder_ids is not None:
            if not allowed_folder_ids:
                return statement.where(false())
            statement = statement.where(Task.folder_id.in_(sorted(allowed_folder_ids)))

        if folder_id is not None:
            statement = statement.where(Task.folder_id == folder_id)

        if statuses:
            statement = statement.where(Task.status.in_(statuses))

        if priorities:
            statement = statement.where(Task.priority.in_(priorities))

        if kind:
            statement = statement.where(Task.kind == kind)

        if responsible_user_id is not None:
            statement = statement.where(
                _participant_exists(responsible_user_id, TaskParticipantRole.RESPONSIBLE)
            )

        if assignee_user_id is not None:
            statement = statement.where(
                _participant_exists(assignee_user_id, TaskParticipantRole.ASSIGNEE)
            )

        if observer_user_id is not None:
            statement = statement.where(
                _participant_exists(observer_user_id, TaskParticipantRole.OBSERVER)
            )

        if equipment_id is not None:
            statement = statement.where(_equipment_exists(equipment_id))

        if query:
            pattern = f"%{query}%"
            statement = statement.where(
                or_(Task.title.ilike(pattern), Task.description.ilike(pattern))
            )

        if due_before is not None:
            statement = statement.where(Task.due_date.is_not(None), Task.due_date <= due_before)

        if overdue_only and today is not None:
            statement = statement.where(
                Task.due_date.is_not(None),
                Task.due_date < today,
                Task.status.not_in(list(TERMINAL_TASK_STATUSES)),
            )

        return statement

    def _ordering(self, *, sort: str | None) -> list:
        priority_weight = case(
            *[(Task.priority == key, value) for key, value in _PRIORITY_ORDER.items()],
            else_=9,
        )
        if sort == "priority":
            return [priority_weight.asc(), Task.due_date.asc().nulls_last(), Task.id.desc()]
        if sort == "updated":
            return [Task.updated_at.desc(), Task.id.desc()]
        if sort == "created":
            return [Task.created_at.desc(), Task.id.desc()]
        return [Task.due_date.asc().nulls_last(), priority_weight.asc(), Task.id.desc()]

    def _list_by_ids(self, task_ids: list[int]) -> list[Task]:
        if not task_ids:
            return []
        statement = select(Task).options(*self._load_options()).where(Task.id.in_(task_ids))
        items = list(self.session.scalars(statement))
        by_id = {item.id: item for item in items}
        return [by_id[task_id] for task_id in task_ids if task_id in by_id]

    def list_page(
        self,
        *,
        allowed_folder_ids: set[int] | None = None,
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
        today: date | None = None,
        sort: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Task], int]:
        filtered_ids = self._apply_filters(
            select(Task.id),
            allowed_folder_ids=allowed_folder_ids,
            folder_id=folder_id,
            statuses=statuses,
            priorities=priorities,
            kind=kind,
            responsible_user_id=responsible_user_id,
            assignee_user_id=assignee_user_id,
            observer_user_id=observer_user_id,
            equipment_id=equipment_id,
            query=query,
            due_before=due_before,
            overdue_only=overdue_only,
            today=today,
        )
        total = self.session.scalar(select(func.count()).select_from(filtered_ids.subquery())) or 0
        page_ids = list(
            self.session.scalars(
                filtered_ids.order_by(*self._ordering(sort=sort)).limit(limit).offset(offset)
            )
        )
        return self._list_by_ids(page_ids), int(total)

    def list_by_equipment_id(self, *, equipment_id: int) -> list[Task]:
        statement = (
            select(Task)
            .options(*self._load_options())
            .where(_equipment_exists(equipment_id))
            .order_by(Task.created_at.desc(), Task.id.desc())
        )
        return list(self.session.scalars(statement))

    def list_participant_user_ids(self, *, task_id: int) -> set[int]:
        statement = select(TaskParticipant.user_id).where(TaskParticipant.task_id == task_id)
        return {int(value) for value in self.session.scalars(statement)}


class TaskMessageRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, message: TaskMessage) -> TaskMessage:
        self.session.add(message)
        self.session.flush()
        return message

    def get_by_id(self, message_id: int) -> TaskMessage | None:
        statement = (
            select(TaskMessage)
            .options(selectinload(TaskMessage.attachments))
            .where(TaskMessage.id == message_id)
        )
        return self.session.scalar(statement)

    def list_by_task(self, *, task_id: int) -> list[TaskMessage]:
        statement = (
            select(TaskMessage)
            .options(selectinload(TaskMessage.attachments))
            .where(TaskMessage.task_id == task_id)
            .order_by(TaskMessage.created_at.asc(), TaskMessage.id.asc())
        )
        return list(self.session.scalars(statement))

    def delete(self, message: TaskMessage) -> None:
        self.session.delete(message)


class TaskMessageAttachmentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, attachment: TaskMessageAttachment) -> TaskMessageAttachment:
        self.session.add(attachment)
        self.session.flush()
        return attachment

    def get_by_id(self, attachment_id: int) -> TaskMessageAttachment | None:
        statement = select(TaskMessageAttachment).where(TaskMessageAttachment.id == attachment_id)
        return self.session.scalar(statement)


class TaskAttachmentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, attachment: TaskAttachment) -> TaskAttachment:
        self.session.add(attachment)
        self.session.flush()
        return attachment

    def get_by_id(self, attachment_id: int) -> TaskAttachment | None:
        statement = select(TaskAttachment).where(TaskAttachment.id == attachment_id)
        return self.session.scalar(statement)

    def list_by_task(self, *, task_id: int) -> list[TaskAttachment]:
        statement = (
            select(TaskAttachment)
            .where(TaskAttachment.task_id == task_id)
            .order_by(TaskAttachment.created_at.asc(), TaskAttachment.id.asc())
        )
        return list(self.session.scalars(statement))


class TaskSubscriptionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get(self, *, task_id: int, user_id: int) -> TaskSubscription | None:
        statement = select(TaskSubscription).where(
            TaskSubscription.task_id == task_id,
            TaskSubscription.user_id == user_id,
        )
        return self.session.scalar(statement)

    def add(self, subscription: TaskSubscription) -> TaskSubscription:
        self.session.add(subscription)
        self.session.flush()
        return subscription

    def delete(self, subscription: TaskSubscription) -> None:
        self.session.delete(subscription)

    def list_active_users_by_task_id(self, *, task_id: int) -> list[User]:
        subscribed_user_ids = select(TaskSubscription.user_id).where(
            TaskSubscription.task_id == task_id
        )
        statement = (
            select(User)
            .where(User.is_active.is_(True), User.id.in_(subscribed_user_ids))
            .order_by(User.last_name.asc(), User.first_name.asc(), User.id.asc())
        )
        return list(self.session.scalars(statement))


class TaskReminderLogRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def exists(self, *, task_id: int, reminder_date: date) -> bool:
        statement = (
            select(TaskReminderLog.id)
            .where(
                TaskReminderLog.task_id == task_id,
                TaskReminderLog.reminder_date == reminder_date,
            )
            .limit(1)
        )
        return self.session.scalar(statement) is not None

    def add(self, log: TaskReminderLog) -> TaskReminderLog:
        self.session.add(log)
        self.session.flush()
        return log


def list_tasks_due_for_reminder(
    session: Session, *, horizon: date, include_overdue: bool = True
) -> list[Task]:
    statement = (
        select(Task)
        .options(selectinload(Task.participants).selectinload(TaskParticipant.user))
        .where(
            Task.due_date.is_not(None),
            Task.due_date <= horizon,
            Task.status.not_in(list(TERMINAL_TASK_STATUSES)),
        )
        .order_by(Task.due_date.asc(), Task.id.asc())
    )
    return list(session.scalars(statement))
