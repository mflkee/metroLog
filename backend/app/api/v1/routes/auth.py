from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.auth import (
    AuthActionResponse,
    AuthResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
)
from app.schemas.user import UserRead
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth")


@router.post("/register", response_model=AuthActionResponse, status_code=201)
async def register(payload: RegisterRequest, db: DbSession) -> AuthActionResponse:
    AuthService(db).register(payload)
    return AuthActionResponse(message="Verification email sent.")


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: DbSession) -> AuthResponse:
    user, token = AuthService(db).login(payload)
    return AuthResponse(access_token=token, user=UserRead.model_validate(user))


@router.post("/verify-email", response_model=AuthResponse)
async def verify_email(payload: VerifyEmailRequest, db: DbSession) -> AuthResponse:
    user, token = AuthService(db).verify_email(payload)
    return AuthResponse(access_token=token, user=UserRead.model_validate(user))


@router.post("/resend-verification", response_model=AuthActionResponse)
async def resend_verification(
    payload: ResendVerificationRequest,
    db: DbSession,
) -> AuthActionResponse:
    AuthService(db).resend_verification(payload)
    return AuthActionResponse(message="Verification email sent if the account exists.")


@router.post("/forgot-password", response_model=AuthActionResponse)
async def forgot_password(payload: ForgotPasswordRequest, db: DbSession) -> AuthActionResponse:
    AuthService(db).request_password_reset(payload)
    return AuthActionResponse(message="Password reset email sent if the account exists.")


@router.post("/reset-password", response_model=AuthActionResponse)
async def reset_password(payload: ResetPasswordRequest, db: DbSession) -> AuthActionResponse:
    AuthService(db).reset_password(payload)
    return AuthActionResponse(message="Password reset successfully.")


@router.get("/me", response_model=UserRead)
async def me(current_user: CurrentUser) -> UserRead:
    return UserRead.model_validate(current_user)


@router.post("/change-password", response_model=AuthActionResponse)
async def change_password(
    payload: ChangePasswordRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> AuthActionResponse:
    AuthService(db).change_password(user=current_user, payload=payload)
    return AuthActionResponse(message="Password changed successfully.")
