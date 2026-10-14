from __future__ import annotations

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.models.equipment import (
    EquipmentAttachment,
    EquipmentComment,
    EquipmentProcessSubscription,
    FolderProcessSubscription,
    RepairMessage,
    RepairMessageAttachment,
    VerificationMessage,
    VerificationMessageAttachment,
)
from app.models.event import EventLog
from app.models.user import User, UserRole


class UserRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, user: User) -> User:
        self.session.add(user)
        self.session.flush()
        return user

    def remove_folder_reference(self, *, folder_id: int) -> int:
        """Take a deleted folder out of every user's scope.

        `allowed_folder_ids` and the dashboard lists are plain JSON, so nothing cascades when a
        folder goes: a stale id lingers, and because the scope is validated on every write, that
        row becomes impossible to edit until somebody cleans it by hand. Returns how many rows
        changed.
        """

        changed = 0
        for user in self.session.scalars(select(User)):
            before = (
                user.allowed_folder_ids,
                user.dashboard_folder_ids,
                user.dashboard_folder_id,
            )
            user.allowed_folder_ids = _without_folder(user.allowed_folder_ids, folder_id)
            user.dashboard_folder_ids = _without_folder(user.dashboard_folder_ids, folder_id)
            if _is_same_folder(user.dashboard_folder_id, folder_id):
                user.dashboard_folder_id = next(iter(user.dashboard_folder_ids or []), None)
            if before != (
                user.allowed_folder_ids,
                user.dashboard_folder_ids,
                user.dashboard_folder_id,
            ):
                changed += 1
        return changed

    def delete(self, user: User) -> None:
        self.session.delete(user)
        self.session.flush()

    def get_by_email(self, email: str) -> User | None:
        statement = select(User).where(User.email == email)
        return self.session.scalar(statement)

    def get_by_email_for_update(self, email: str) -> User | None:
        statement = select(User).where(User.email == email).with_for_update()
        return self.session.scalar(statement)

    def get_by_id(self, user_id: int) -> User | None:
        statement = select(User).where(User.id == user_id)
        return self.session.scalar(statement)

    def get_by_id_for_update(self, user_id: int) -> User | None:
        statement = select(User).where(User.id == user_id).with_for_update()
        return self.session.scalar(statement)

    def list_all(self) -> list[User]:
        statement = select(User).order_by(User.created_at.asc(), User.id.asc())
        return list(self.session.scalars(statement))

    def list_active(self) -> list[User]:
        statement = (
            select(User)
            .where(User.is_active.is_(True))
            .order_by(User.last_name.asc(), User.first_name.asc(), User.id.asc())
        )
        return list(self.session.scalars(statement))

    def count_all(self) -> int:
        statement = select(func.count()).select_from(User)
        return int(self.session.scalar(statement) or 0)

    def count_by_role(self, role: UserRole) -> int:
        statement = select(func.count()).select_from(User).where(User.role == role)
        return int(self.session.scalar(statement) or 0)

    def clear_references(self, *, user_id: int) -> None:
        self.session.execute(
            delete(EquipmentProcessSubscription).where(
                EquipmentProcessSubscription.user_id == user_id
            )
        )
        self.session.execute(
            delete(FolderProcessSubscription).where(FolderProcessSubscription.user_id == user_id)
        )
        for model, column in (
            (EventLog, EventLog.user_id),
            (RepairMessage, RepairMessage.author_user_id),
            (RepairMessageAttachment, RepairMessageAttachment.uploaded_by_user_id),
            (VerificationMessage, VerificationMessage.author_user_id),
            (VerificationMessageAttachment, VerificationMessageAttachment.uploaded_by_user_id),
            (EquipmentAttachment, EquipmentAttachment.uploaded_by_user_id),
            (EquipmentComment, EquipmentComment.author_user_id),
        ):
            self.session.execute(update(model).where(column == user_id).values({column.key: None}))


def _is_same_folder(value: object, folder_id: int) -> bool:
    """Folder ids are ints in the app, but a JSON column can hand one back as a string."""

    if value is None:
        return False
    try:
        return int(value) == folder_id
    except (TypeError, ValueError):
        return False


def _without_folder(values: list[int] | None, folder_id: int) -> list[int] | None:
    if not values:
        return values
    kept = [value for value in values if not _is_same_folder(value, folder_id)]
    return kept if len(kept) != len(values) else values
