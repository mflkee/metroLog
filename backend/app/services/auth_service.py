from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.auth_code import AuthCode, AuthCodeType
from app.models.user import User, UserRole
from app.repositories.auth_code_repository import AuthCodeRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResendVerificationRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
)
from app.services.email_service import EmailService
from app.utils.password_policy import validate_password_policy
from app.utils.security import (
    create_access_token,
    create_numeric_code,
    hash_password,
    hash_secret,
    verify_password,
)


class AuthService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.users = UserRepository(session)
        self.auth_codes = AuthCodeRepository(session)
        self.email_service = EmailService()

    def register(self, payload: RegisterRequest) -> None:
        display_name = payload.display_name.strip()
        email = _normalize_email(payload.email)

        if not display_name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Display name must not be empty.",
            )

        if payload.password != payload.confirm_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password confirmation does not match.",
            )
        validate_password_policy(payload.password)

        if self.users.get_by_email(email) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email already exists.",
            )

        role = UserRole.ADMINISTRATOR if self.users.count_all() == 0 else UserRole.CUSTOMER
        user = User(
            display_name=display_name,
            email=email,
            password_hash=hash_password(payload.password),
            role=role,
            is_active=True,
        )
        self.users.add(user)
        verification_code = self._create_auth_code(
            user_id=user.id,
            code_type=AuthCodeType.EMAIL_VERIFICATION,
            ttl_minutes=settings.email_verification_code_ttl_minutes,
        )
        self.email_service.send_verification_email(email=email, code=verification_code)
        self.session.commit()

    def login(self, payload: LoginRequest) -> tuple[User, str]:
        email = _normalize_email(payload.email)
        user = self.users.get_by_email(email)
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )

        if user.email_verified_at is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email address is not verified.",
            )

        token = create_access_token(
            user_id=user.id,
            role=user.role.value,
            secret_key=settings.secret_key,
            ttl_hours=settings.access_token_ttl_hours,
        )
        return user, token

    def change_password(self, *, user: User, payload: ChangePasswordRequest) -> None:
        if not verify_password(payload.current_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect.",
            )

        if payload.new_password != payload.confirm_new_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password confirmation does not match.",
            )

        if payload.current_password == payload.new_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password must be different from the current password.",
            )
        validate_password_policy(payload.new_password)

        user.password_hash = hash_password(payload.new_password)
        self.session.commit()

    def verify_email(self, payload: VerifyEmailRequest) -> tuple[User, str]:
        email = _normalize_email(payload.email)
        user = self.users.get_by_email_for_update(email)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification code is invalid or expired.",
            )

        auth_code = self.auth_codes.get_active_code(
            user_id=user.id,
            code_type=AuthCodeType.EMAIL_VERIFICATION,
            code_hash=hash_secret(payload.code.strip()),
        )
        if auth_code is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification code is invalid or expired.",
            )

        auth_code.consumed_at = datetime.now(tz=UTC)
        user.email_verified_at = datetime.now(tz=UTC)
        self.session.commit()
        self.session.refresh(user)
        return user, self._create_access_token_for_user(user)

    def resend_verification(self, payload: ResendVerificationRequest) -> None:
        email = _normalize_email(payload.email)
        user = self.users.get_by_email_for_update(email)
        if user is None:
            return

        if user.email_verified_at is not None:
            return

        verification_code = self._create_auth_code(
            user_id=user.id,
            code_type=AuthCodeType.EMAIL_VERIFICATION,
            ttl_minutes=settings.email_verification_code_ttl_minutes,
        )
        self.email_service.send_verification_email(email=user.email, code=verification_code)
        self.session.commit()

    def request_password_reset(self, payload: ForgotPasswordRequest) -> None:
        email = _normalize_email(payload.email)
        user = self.users.get_by_email_for_update(email)
        if user is None or user.email_verified_at is None or not user.is_active:
            return

        reset_code = self._create_auth_code(
            user_id=user.id,
            code_type=AuthCodeType.PASSWORD_RESET,
            ttl_minutes=settings.password_reset_code_ttl_minutes,
        )
        self.email_service.send_password_reset_email(email=user.email, code=reset_code)
        self.session.commit()

    def reset_password(self, payload: ResetPasswordRequest) -> None:
        email = _normalize_email(payload.email)
        user = self.users.get_by_email_for_update(email)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reset code is invalid or expired.",
            )

        if payload.new_password != payload.confirm_new_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="New password confirmation does not match.",
            )
        validate_password_policy(payload.new_password)

        auth_code = self.auth_codes.get_active_code(
            user_id=user.id,
            code_type=AuthCodeType.PASSWORD_RESET,
            code_hash=hash_secret(payload.code.strip()),
        )
        if auth_code is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reset code is invalid or expired.",
            )

        auth_code.consumed_at = datetime.now(tz=UTC)
        user.password_hash = hash_password(payload.new_password)
        self.session.commit()

    def _create_auth_code(self, *, user_id: int, code_type: AuthCodeType, ttl_minutes: int) -> str:
        self.auth_codes.invalidate_active_codes(user_id=user_id, code_type=code_type)
        raw_code = create_numeric_code()
        auth_code = AuthCode(
            user_id=user_id,
            code_type=code_type,
            code_hash=hash_secret(raw_code),
            expires_at=datetime.now(tz=UTC) + timedelta(minutes=ttl_minutes),
        )
        self.auth_codes.add(auth_code)
        return raw_code

    def _create_access_token_for_user(self, user: User) -> str:
        return create_access_token(
            user_id=user.id,
            role=user.role.value,
            secret_key=settings.secret_key,
            ttl_hours=settings.access_token_ttl_hours,
        )


def _normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not normalized or "@" not in normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Email must be valid.",
        )
    return normalized
