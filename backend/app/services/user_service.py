from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository


class UserService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.users = UserRepository(session)

    def list_users(self) -> list[User]:
        return self.users.list_all()

    def update_role(self, *, user_id: int, role: UserRole) -> User:
        user = self.users.get_by_id(user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )

        if user.role == UserRole.ADMINISTRATOR and role != UserRole.ADMINISTRATOR:
            if self.users.count_by_role(UserRole.ADMINISTRATOR) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The system must keep at least one administrator.",
                )

        user.role = role
        self.session.commit()
        self.session.refresh(user)
        return user
