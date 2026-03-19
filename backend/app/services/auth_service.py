from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
)
from app.schemas.user import UserProfileUpdateRequest
from app.utils.password_policy import validate_password_policy
from app.utils.security import (
    create_access_token,
    hash_password,
    verify_password,
)


class AuthService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.users = UserRepository(session)

    def login(self, payload: LoginRequest) -> tuple[User, str]:
        email = _normalize_email(payload.email)
        user = self.users.get_by_email(email)
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password.",
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive.",
            )

        return user, self._create_access_token_for_user(user)

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
        user.must_change_password = False
        user.password_changed_at = datetime.now(tz=UTC)
        self.session.commit()

    def update_profile(self, *, user: User, payload: UserProfileUpdateRequest) -> User:
        if "phone" in payload.model_fields_set:
            user.phone = _normalize_optional_text(payload.phone, limit=64)
        if "organization" in payload.model_fields_set:
            user.organization = _normalize_optional_text(payload.organization, limit=255)
        if "position" in payload.model_fields_set:
            user.position = _normalize_optional_text(payload.position, limit=255)
        if "facility" in payload.model_fields_set:
            user.facility = _normalize_optional_text(payload.facility, limit=255)
        if "theme_preference" in payload.model_fields_set:
            user.theme_preference = payload.theme_preference
        if "enabled_theme_options" in payload.model_fields_set:
            user.enabled_theme_options = _normalize_enabled_theme_options(
                payload.enabled_theme_options
            )
        self.session.commit()
        self.session.refresh(user)
        return user

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


def _normalize_optional_text(value: str | None, *, limit: int) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > limit:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Field is too long. Maximum length is {limit} characters.",
        )
    return normalized


def _normalize_enabled_theme_options(values: list[object] | None) -> list[str] | None:
    if values is None:
        return None

    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        if hasattr(value, "value"):
            candidate = str(value.value)
        else:
            candidate = str(value)
        if candidate in seen:
            continue
        seen.add(candidate)
        normalized.append(candidate)

    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Хотя бы одна тема должна оставаться доступной.",
        )

    return normalized
