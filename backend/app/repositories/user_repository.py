from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.user import User, UserRole


class UserRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, user: User) -> User:
        self.session.add(user)
        self.session.flush()
        return user

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

    def count_all(self) -> int:
        statement = select(func.count()).select_from(User)
        return int(self.session.scalar(statement) or 0)

    def count_by_role(self, role: UserRole) -> int:
        statement = select(func.count()).select_from(User).where(User.role == role)
        return int(self.session.scalar(statement) or 0)
