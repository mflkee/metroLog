from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import (
    JSON,
    BigInteger,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.user import User


class TaskStatus(StrEnum):
    NEW = "NEW"
    IN_PROGRESS = "IN_PROGRESS"
    ON_HOLD = "ON_HOLD"
    DONE = "DONE"
    CANCELLED = "CANCELLED"
    ARCHIVED = "ARCHIVED"


TERMINAL_TASK_STATUSES: tuple[TaskStatus, ...] = (
    TaskStatus.DONE,
    TaskStatus.CANCELLED,
    TaskStatus.ARCHIVED,
)


class TaskPriority(StrEnum):
    LOW = "LOW"
    NORMAL = "NORMAL"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class TaskParticipantRole(StrEnum):
    RESPONSIBLE = "RESPONSIBLE"
    ASSIGNEE = "ASSIGNEE"
    OBSERVER = "OBSERVER"


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_folder_id_status", "folder_id", "status"),
        Index("ix_tasks_due_date_lookup", "due_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Nullable on purpose: a task may live outside any folder (see `_resolve_task_folder`).
    folder_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipment_folders.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, native_enum=False, length=32),
        nullable=False,
        default=TaskStatus.NEW,
    )
    priority: Mapped[TaskPriority] = mapped_column(
        Enum(TaskPriority, native_enum=False, length=16),
        nullable=False,
        default=TaskPriority.NORMAL,
    )
    kind: Mapped[str | None] = mapped_column(String(128), nullable=True)
    tags: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_by_display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    participants: Mapped[list[TaskParticipant]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
    )
    equipment_links: Mapped[list[TaskEquipment]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
    )
    checklist_items: Mapped[list[TaskChecklistItem]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
    )
    messages: Mapped[list[TaskMessage]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
    )
    attachments: Mapped[list[TaskAttachment]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
    )
    subscriptions: Mapped[list[TaskSubscription]] = relationship(
        back_populates="task",
        cascade="all, delete-orphan",
    )


class TaskParticipant(Base):
    __tablename__ = "task_participants"
    # Per role, not per person: the responsible may also be an assignee.
    __table_args__ = (
        UniqueConstraint(
            "task_id", "user_id", "role", name="uq_task_participants_task_id_user_id_role"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[TaskParticipantRole] = mapped_column(
        Enum(TaskParticipantRole, native_enum=False, length=32),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    task: Mapped[Task] = relationship(back_populates="participants")
    user: Mapped[User] = relationship()


class TaskEquipment(Base):
    __tablename__ = "task_equipment"
    __table_args__ = (
        UniqueConstraint("task_id", "equipment_id", name="uq_task_equipment_task_id_equipment_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    task: Mapped[Task] = relationship(back_populates="equipment_links")


class TaskChecklistItem(Base):
    __tablename__ = "task_checklist_items"
    __table_args__ = (Index("ix_task_checklist_items_task_id_sort", "task_id", "sort_order"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    is_done: Mapped[bool] = mapped_column(nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    task: Mapped[Task] = relationship(back_populates="checklist_items")


class TaskMessage(Base):
    __tablename__ = "task_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    author_display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_private: Mapped[bool] = mapped_column(nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    task: Mapped[Task] = relationship(back_populates="messages")
    attachments: Mapped[list[TaskMessageAttachment]] = relationship(
        back_populates="message",
        cascade="all, delete-orphan",
    )


class TaskMessageAttachment(Base):
    __tablename__ = "task_message_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_message_id: Mapped[int] = mapped_column(
        ForeignKey("task_messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    uploaded_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    uploaded_by_display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    message: Mapped[TaskMessage] = relationship(back_populates="attachments")


class TaskAttachment(Base):
    __tablename__ = "task_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    uploaded_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    uploaded_by_display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    task: Mapped[Task] = relationship(back_populates="attachments")


class TaskReminderLog(Base):
    __tablename__ = "task_reminder_log"
    __table_args__ = (
        UniqueConstraint(
            "task_id",
            "reminder_date",
            name="uq_task_reminder_log_task_id_reminder_date",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    reminder_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class TaskSubscription(Base):
    __tablename__ = "task_subscriptions"
    __table_args__ = (
        UniqueConstraint("task_id", "user_id", name="uq_task_subscriptions_task_id_user_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    task: Mapped[Task] = relationship(back_populates="subscriptions")
