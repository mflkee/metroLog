from fastapi import APIRouter

from app.api.deps import AdminUser, DbSession
from app.schemas.user import UserRead, UserRoleUpdate
from app.services.user_service import UserService

router = APIRouter(prefix="/users")


@router.get("", response_model=list[UserRead])
async def list_users(
    _: AdminUser,
    db: DbSession,
) -> list[UserRead]:
    users = UserService(db).list_users()
    return [UserRead.model_validate(user) for user in users]


@router.patch("/{user_id}/role", response_model=UserRead)
async def update_role(
    user_id: int,
    payload: UserRoleUpdate,
    _: AdminUser,
    db: DbSession,
) -> UserRead:
    user = UserService(db).update_role(user_id=user_id, role=payload.role)
    return UserRead.model_validate(user)
