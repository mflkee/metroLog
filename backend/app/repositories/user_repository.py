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
