from __future__ import annotations

from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User
from app.repositories.equipment_repository import EquipmentFolderRepository
from app.repositories.user_repository import UserRepository
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
)
from app.schemas.user import UserProfileUpdateRequest
from app.services.notification_service import (
    NotificationConfigurationError,
    NotificationDeliveryError,
    NotificationService,
)
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
        self.folders = EquipmentFolderRepository(session)
        self.notifications = NotificationService()

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

        now = datetime.now(tz=UTC)
        user.last_login_at = now
        user.last_seen_at = now
        self.session.commit()
        self.session.refresh(user)

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
        if "dashboard_folder_id" in payload.model_fields_set:
            user.dashboard_folder_id = _normalize_dashboard_folder_id(
                payload.dashboard_folder_id,
                folders=self.folders,
            )
        if "dashboard_widget_options" in payload.model_fields_set:
            user.dashboard_widget_options = _normalize_dashboard_widget_options(
                payload.dashboard_widget_options
            )
        if "mention_email_notifications_enabled" in payload.model_fields_set:
            user.mention_email_notifications_enabled = bool(
                payload.mention_email_notifications_enabled
            )
        if "theme_preference" in payload.model_fields_set:
            user.theme_preference = payload.theme_preference
        if "enabled_theme_options" in payload.model_fields_set:
            user.enabled_theme_options = _normalize_enabled_theme_options(
                payload.enabled_theme_options
            )
        self.session.commit()
        self.session.refresh(user)
        return user

    def send_test_mention_email(self, *, user: User) -> None:
        try:
            self.notifications.send_test_email(
                recipient_email=user.email,
                recipient_name=_format_user_display_name(user),
            )
        except NotificationConfigurationError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc
        except NotificationDeliveryError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

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


def _normalize_dashboard_folder_id(
    value: int | None,
    *,
    folders: EquipmentFolderRepository,
) -> int | None:
    if value is None:
        return None
    if value <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Папка дашборда выбрана некорректно.",
        )
    folder = folders.get_by_id(value)
    if folder is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Выбранная папка для дашборда не найдена.",
        )
    return value


def _normalize_dashboard_widget_options(values: list[str] | None) -> list[str] | None:
    if values is None:
        return None

    allowed = {
        "summary_cards",
        "status_distribution",
        "type_distribution",
        "top_locations",
        "repair_overdue",
        "verification_expiry",
        "completed_processes",
        "average_durations",
        "recent_events",
    }

    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        candidate = str(value).strip()
        if not candidate:
            continue
        if candidate not in allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Неизвестный виджет дашборда: {candidate}.",
            )
        if candidate in seen:
            continue
        seen.add(candidate)
        normalized.append(candidate)

    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Хотя бы один виджет дашборда должен оставаться включенным.",
        )

    return normalized


def _format_user_display_name(user: User) -> str:
    parts = [user.last_name.strip(), user.first_name.strip()]
    if user.patronymic:
        patronymic = user.patronymic.strip()
        if patronymic:
            parts.append(patronymic)
    return " ".join(part for part in parts if part).strip() or user.email
