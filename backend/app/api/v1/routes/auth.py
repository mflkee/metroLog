from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.auth import (
    AuthActionResponse,
    AuthResponse,
    ChangePasswordRequest,
    LoginRequest,
)
from app.schemas.user import UserProfileUpdateRequest, UserRead
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth")


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: DbSession) -> AuthResponse:
    user, token = AuthService(db).login(payload)
    return AuthResponse(access_token=token, user=UserRead.model_validate(user))


@router.get("/me", response_model=UserRead)
async def me(current_user: CurrentUser) -> UserRead:
    return UserRead.model_validate(current_user)


@router.patch("/me", response_model=UserRead)
async def update_me(
    payload: UserProfileUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> UserRead:
    user = AuthService(db).update_profile(user=current_user, payload=payload)
    return UserRead.model_validate(user)


@router.post("/change-password", response_model=AuthActionResponse)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> AuthActionResponse:
    AuthService(db).change_password(user=current_user, payload=payload)
    return AuthActionResponse(message="Password changed successfully.")


@router.post("/test-mention-email", response_model=AuthActionResponse)
async def test_mention_email(
    current_user: CurrentUser,
    db: DbSession,
) -> AuthActionResponse:
    AuthService(db).send_test_mention_email(user=current_user)
    return AuthActionResponse(message="Тестовое письмо отправлено.")
