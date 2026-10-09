from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.equipment import EquipmentType
from app.models.task import TaskParticipantRole, TaskPriority, TaskStatus

TAG_MAX_LENGTH = 64
TAG_MAX_COUNT = 30


def _normalize_tags(values: list[str] | None) -> list[str]:
    if not values:
        return []
    seen: list[str] = []
    for raw in values:
        tag = str(raw).strip()
        if not tag:
            continue
        tag = tag[:TAG_MAX_LENGTH]
        if tag not in seen:
            seen.append(tag)
        if len(seen) >= TAG_MAX_COUNT:
            break
    return seen


class TaskParticipantRead(BaseModel):
    user_id: int
    role: TaskParticipantRole
    display_name: str
    email: str | None = None


class TaskEquipmentRead(BaseModel):
    equipment_id: int
    note: str | None = None
    sort_order: int = 0
    object_name: str | None = None
    name: str | None = None
    modification: str | None = None
    serial_number: str | None = None
    equipment_type: EquipmentType | None = None


class TaskChecklistItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    is_done: bool
    sort_order: int


class TaskChecklistItemCreateRequest(BaseModel):
    label: str = Field(min_length=1, max_length=255)

    @field_validator("label")
    @classmethod
    def _strip_label(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Название пункта не может быть пустым.")
        return stripped


class TaskChecklistItemUpdateRequest(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=255)
    is_done: bool | None = None
    sort_order: int | None = None

    @field_validator("label")
    @classmethod
    def _strip_optional_label(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Название пункта не может быть пустым.")
        return stripped


class TaskCreateRequest(BaseModel):
    # Optional: when it is omitted the folder is taken from the attached equipment.
    folder_id: int | None = None
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    status: TaskStatus = TaskStatus.NEW
    priority: TaskPriority = TaskPriority.NORMAL
    kind: str | None = Field(default=None, max_length=128)
    tags: list[str] = Field(default_factory=list)
    due_date: date | None = None
    responsible_user_id: int
    assignee_user_ids: list[int] = Field(default_factory=list)
    observer_user_ids: list[int] = Field(default_factory=list)
    equipment_ids: list[int] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def _strip_title(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Название задачи не может быть пустым.")
        return stripped

    @field_validator("description")
    @classmethod
    def _strip_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("kind")
    @classmethod
    def _strip_kind(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("tags")
    @classmethod
    def _validate_tags(cls, value: list[str]) -> list[str]:
        return _normalize_tags(value)


class TaskUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None
    kind: str | None = Field(default=None, max_length=128)
    tags: list[str] | None = None
    due_date: date | None = None
    responsible_user_id: int | None = None
    assignee_user_ids: list[int] | None = None
    observer_user_ids: list[int] | None = None
    equipment_ids: list[int] | None = None

    @field_validator("title")
    @classmethod
    def _strip_optional_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        if not stripped:
            raise ValueError("Название задачи не может быть пустым.")
        return stripped

    @field_validator("description")
    @classmethod
    def _strip_optional_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("tags")
    @classmethod
    def _validate_optional_tags(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return _normalize_tags(value)


class TaskRead(BaseModel):
    id: int
    folder_id: int | None = None
    folder_name: str | None = None
    title: str
    description: str | None
    status: TaskStatus
    priority: TaskPriority
    kind: str | None
    tags: list[str]
    due_date: date | None
    created_by_user_id: int | None
    created_by_display_name: str
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    is_overdue: bool
    can_mutate: bool = False
    participants: list[TaskParticipantRead] = Field(default_factory=list)
    equipment: list[TaskEquipmentRead] = Field(default_factory=list)
    checklist: list[TaskChecklistItemRead] = Field(default_factory=list)
    checklist_done: int = 0
    checklist_total: int = 0


class TaskListItemRead(BaseModel):
    id: int
    folder_id: int | None = None
    folder_name: str | None = None
    title: str
    status: TaskStatus
    priority: TaskPriority
    kind: str | None
    tags: list[str]
    due_date: date | None
    responsible_display_name: str | None = None
    assignee_count: int = 0
    observer_count: int = 0
    equipment_count: int = 0
    checklist_done: int = 0
    checklist_total: int = 0
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    is_overdue: bool
    can_mutate: bool = False


class TaskPageRead(BaseModel):
    items: list[TaskListItemRead]
    total: int
    limit: int
    offset: int


class TaskMessageAttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_name: str
    file_mime_type: str | None = None
    file_size: int
    uploaded_by_display_name: str
    created_at: datetime


class TaskMessageRead(BaseModel):
    id: int
    author_user_id: int | None
    author_display_name: str
    text: str | None
    is_private: bool
    created_at: datetime
    updated_at: datetime
    attachments: list[TaskMessageAttachmentRead] = Field(default_factory=list)


class TaskMessageCreateRequest(BaseModel):
    text: str | None = None
    is_private: bool = False

    @field_validator("text")
    @classmethod
    def _strip_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class TaskMessageUpdateRequest(BaseModel):
    text: str | None = None
    is_private: bool | None = None

    @field_validator("text")
    @classmethod
    def _strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None


class TaskAttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_name: str
    file_mime_type: str | None = None
    file_size: int
    uploaded_by_user_id: int | None = None
    uploaded_by_display_name: str
    created_at: datetime


class TaskSubscriptionRead(BaseModel):
    is_subscribed: bool
