from fastapi import APIRouter

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.schemas.user import (
    UserCreateRequest,
    UserMentionRead,
    UserRead,
    UserRoleUpdate,
    UserTemporaryPasswordResponse,
    UserUpdateRequest,
)
from app.services.user_service import UserService

router = APIRouter(prefix="/users")


@router.get("/mentions", response_model=list[UserMentionRead])
async def list_mention_users(
    _: CurrentUser,
    db: DbSession,
) -> list[UserMentionRead]:
    return UserService(db).list_mention_users()


@router.get("", response_model=list[UserRead])
async def list_users(
    _: AdminUser,
    db: DbSession,
) -> list[UserRead]:
    users = UserService(db).list_users()
    return [UserRead.model_validate(user) for user in users]


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
    user_id: int,
    _: AdminUser,
    db: DbSession,
) -> UserRead:
    user = UserService(db).get_user(user_id=user_id)
    return UserRead.model_validate(user)


@router.post("", response_model=UserTemporaryPasswordResponse, status_code=201)
async def create_user(
    payload: UserCreateRequest,
    _: AdminUser,
    db: DbSession,
) -> UserTemporaryPasswordResponse:
    user, temporary_password = UserService(db).create_user(payload)
    return UserTemporaryPasswordResponse(
        user=UserRead.model_validate(user),
        temporary_password=temporary_password,
    )


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: int,
    payload: UserUpdateRequest,
    _: AdminUser,
    db: DbSession,
) -> UserRead:
    user = UserService(db).update_user(user_id=user_id, payload=payload)
    return UserRead.model_validate(user)


@router.patch("/{user_id}/role", response_model=UserRead)
async def update_role(
    user_id: int,
    payload: UserRoleUpdate,
    _: AdminUser,
    db: DbSession,
) -> UserRead:
    user = UserService(db).update_role(user_id=user_id, role=payload.role)
    return UserRead.model_validate(user)


@router.post("/{user_id}/reset-password", response_model=UserTemporaryPasswordResponse)
async def reset_password(
    user_id: int,
    _: AdminUser,
    db: DbSession,
) -> UserTemporaryPasswordResponse:
    user, temporary_password = UserService(db).reset_password(user_id=user_id)
    return UserTemporaryPasswordResponse(
        user=UserRead.model_validate(user),
        temporary_password=temporary_password,
    )
