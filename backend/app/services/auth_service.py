from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

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
from app.services.user_service import (
    _filter_dashboard_folder_ids_for_scope,
    is_folder_access_allowed,
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
        has_dashboard_folder_ids = "dashboard_folder_ids" in payload.model_fields_set
        if "phone" in payload.model_fields_set:
            user.phone = _normalize_optional_text(payload.phone, limit=64)
        if "organization" in payload.model_fields_set:
            user.organization = _normalize_optional_text(payload.organization, limit=255)
        if "position" in payload.model_fields_set:
            user.position = _normalize_optional_text(payload.position, limit=255)
        if "facility" in payload.model_fields_set:
            user.facility = _normalize_optional_text(payload.facility, limit=255)
        if has_dashboard_folder_ids:
            user.dashboard_folder_ids = _normalize_dashboard_folder_ids(
                payload.dashboard_folder_ids,
                folders=self.folders,
                user=user,
            )
            user.dashboard_folder_id = (
                user.dashboard_folder_ids[0] if user.dashboard_folder_ids else None
            )
        if not has_dashboard_folder_ids and "dashboard_folder_id" in payload.model_fields_set:
            user.dashboard_folder_id = _normalize_dashboard_folder_id(
                payload.dashboard_folder_id,
                folders=self.folders,
                user=user,
            )
            user.dashboard_folder_ids = (
                [user.dashboard_folder_id] if user.dashboard_folder_id else []
            )
        if "hidden_equipment_folder_ids" in payload.model_fields_set:
            user.hidden_equipment_folder_ids = _normalize_hidden_equipment_folder_ids(
                payload.hidden_equipment_folder_ids,
                folders=self.folders,
                user=user,
            )
        if "dashboard_widget_options" in payload.model_fields_set:
            user.dashboard_widget_options = _normalize_dashboard_widget_options(
                payload.dashboard_widget_options
            )
        if "dashboard_layout" in payload.model_fields_set:
            user.dashboard_layout = _normalize_dashboard_layout(payload.dashboard_layout)
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
        if "folder_order_ids" in payload.model_fields_set:
            user.folder_order_ids = _normalize_folder_order_ids(
                payload.folder_order_ids,
                folders=self.folders,
            )
        self._sync_dashboard_folder_scope(user)
        self.session.commit()
        self.session.refresh(user)
        return user

    def _sync_dashboard_folder_scope(self, user: User) -> None:
        filtered = _filter_dashboard_folder_ids_for_scope(
            role=user.role,
            allowed_folder_ids=user.allowed_folder_ids,
            folder_ids=user.dashboard_folder_ids,
        )
        if filtered != user.dashboard_folder_ids:
            user.dashboard_folder_ids = filtered
            user.dashboard_folder_id = filtered[0] if filtered else None

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
    user: User,
) -> int | None:
    if value is None:
        return None
    if value <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Папка информационной панели выбрана некорректно.",
        )
    folder = folders.get_by_id(value)
    if folder is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Выбранная папка для информационной панели не найдена.",
        )
    if not is_folder_access_allowed(user, value):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Выбранная папка недоступна для этого пользователя.",
        )
    return value


def _normalize_dashboard_folder_ids(
    values: list[int] | None,
    *,
    folders: EquipmentFolderRepository,
    user: User,
) -> list[int]:
    if not values:
        return []

    normalized: list[int] = []
    seen: set[int] = set()
    for raw_value in values:
        try:
            folder_id = int(raw_value)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Список папок информационной панели заполнен некорректно.",
            ) from exc

        if folder_id <= 0 or folder_id in seen:
            continue

        folder = folders.get_by_id(folder_id)
        if folder is None:
            continue
        if not is_folder_access_allowed(user, folder_id):
            continue

        seen.add(folder_id)
        normalized.append(folder_id)

    return normalized


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
        "my_tasks",
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
                detail=f"Неизвестный виджет информационной панели: {candidate}.",
            )
        if candidate in seen:
            continue
        seen.add(candidate)
        normalized.append(candidate)

    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Хотя бы один виджет информационной панели должен оставаться включенным.",
        )

    return normalized


# The dashboard arrangement is stored per user as an ordered list of entries. The keys and the
# default widths mirror the frontend catalogue in `frontend/src/lib/dashboard.ts`; keep the two in
# sync when a widget is added or removed.
_DASHBOARD_WIDGET_DEFAULT_SIZES: dict[str, str] = {
    "summary_cards": "full",
    "my_tasks": "full",
    "status_distribution": "third",
    "type_distribution": "third",
    "top_locations": "half",
    "verification_expiry": "half",
    "completed_processes": "half",
    "average_durations": "half",
    "recent_events": "full",
}

_DASHBOARD_WIDGET_SIZES = frozenset({"third", "half", "full"})


def _normalize_dashboard_layout(
    values: list[dict[str, Any]] | None,
) -> list[dict[str, Any]] | None:
    """Keep only known widgets, one entry each, with a valid width preset.

    An unreadable width falls back to the widget's default; an unknown widget is dropped. A stored
    arrangement is never rejected, so an older or newer client can always save its own view.
    """
    if values is None:
        return None

    normalized: list[dict[str, Any]] = []
    seen: set[str] = set()
    for value in values:
        if not isinstance(value, dict):
            continue
        key = str(value.get("key", "")).strip()
        if key not in _DASHBOARD_WIDGET_DEFAULT_SIZES or key in seen:
            continue
        size = str(value.get("size", "")).strip()
        if size not in _DASHBOARD_WIDGET_SIZES:
            size = _DASHBOARD_WIDGET_DEFAULT_SIZES[key]
        seen.add(key)
        normalized.append(
            {
                "key": key,
                "size": size,
                "collapsed": bool(value.get("collapsed", False)),
            }
        )

    return normalized


def _normalize_hidden_equipment_folder_ids(
    values: list[int] | None,
    *,
    folders: EquipmentFolderRepository,
    user: User,
) -> list[int]:
    if not values:
        return []

    normalized: list[int] = []
    seen: set[int] = set()
    for raw_value in values:
        try:
            folder_id = int(raw_value)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Список скрытых папок заполнен некорректно.",
            ) from exc

        if folder_id <= 0 or folder_id in seen:
            continue

        folder = folders.get_by_id(folder_id)
        if folder is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Папка {folder_id} не найдена.",
            )
        if not is_folder_access_allowed(user, folder_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Нельзя скрыть папку, к которой у пользователя нет доступа.",
            )

        seen.add(folder_id)
        normalized.append(folder_id)

    return normalized


def _normalize_folder_order_ids(
    values: list[int] | None,
    *,
    folders: EquipmentFolderRepository,
) -> list[int]:
    """The user's own folder order: known folder ids only, in order, without duplicates."""

    if not values:
        return []

    known_folder_ids = {folder.id for folder in folders.list_all()}
    normalized: list[int] = []
    seen: set[int] = set()
    for raw_value in values:
        try:
            folder_id = int(raw_value)
        except (TypeError, ValueError):
            continue
        if folder_id in seen or folder_id not in known_folder_ids:
            continue
        seen.add(folder_id)
        normalized.append(folder_id)
    return normalized


def _format_user_display_name(user: User) -> str:
    parts = [user.last_name.strip(), user.first_name.strip()]
    if user.patronymic:
        patronymic = user.patronymic.strip()
        if patronymic:
            parts.append(patronymic)
    return " ".join(part for part in parts if part).strip() or user.email
