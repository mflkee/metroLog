from __future__ import annotations

import logging

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User, UserRole
from app.repositories.equipment_repository import EquipmentFolderRepository
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreateRequest, UserMentionRead, UserUpdateRequest
from app.services.notification_service import (
    NotificationConfigurationError,
    NotificationDeliveryError,
    NotificationService,
)
from app.utils.password_policy import validate_password_policy
from app.utils.security import create_temporary_password, hash_password

logger = logging.getLogger(__name__)


class UserService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.users = UserRepository(session)
        self.folders = EquipmentFolderRepository(session)
        self.notifications = NotificationService()

    def ensure_bootstrap_admin(self) -> User | None:
        first_name = _normalize_required_name(
            settings.bootstrap_admin_first_name,
            field_label="First name",
        )
        last_name = _normalize_required_name(
            settings.bootstrap_admin_last_name,
            field_label="Last name",
        )
        patronymic = _normalize_optional_name(settings.bootstrap_admin_patronymic)
        email = _normalize_email(settings.bootstrap_admin_email)
        password = settings.bootstrap_admin_password.strip()
        validate_password_policy(password)

        user = self.users.get_by_email_for_update(email)
        if user is not None:
            return self._ensure_bootstrap_admin_state(user, email=email)

        user = User(
            first_name=first_name,
            last_name=last_name,
            patronymic=patronymic,
            email=email,
            password_hash=hash_password(password),
            role=UserRole.ADMINISTRATOR,
            is_active=True,
            must_change_password=True,
        )
        self.users.add(user)
        try:
            self.session.commit()
        except IntegrityError:
            self.session.rollback()
            concurrent_user = self.users.get_by_email(email)
            if concurrent_user is None:
                raise
            return self._ensure_bootstrap_admin_state(concurrent_user, email=email)
        self.session.refresh(user)
        logger.warning("Bootstrap administrator %s was created automatically.", email)
        return user

    def _ensure_bootstrap_admin_state(self, user: User, *, email: str) -> User:
        if user.role not in {UserRole.DEVELOPER, UserRole.ADMINISTRATOR} or not user.is_active:
            if user.role != UserRole.DEVELOPER:
                user.role = UserRole.ADMINISTRATOR
            user.is_active = True
            self.session.commit()
            self.session.refresh(user)
            logger.warning("Bootstrap administrator %s was elevated automatically.", email)
        return user

    def list_users(self) -> list[User]:
        return self.users.list_all()

    def list_mention_users(self, *, current_user: User) -> list[UserMentionRead]:
        users = self.users.list_active()
        return build_user_mention_reads(
            _filter_mention_candidates(users, current_user=current_user)
        )

    def get_user(self, *, user_id: int) -> User:
        user = self.users.get_by_id(user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )
        return user

    def create_user(
        self,
        payload: UserCreateRequest,
        *,
        current_user: User,
    ) -> tuple[User, str]:
        self._assert_user_management_target_access(
            current_user=current_user,
            target_user=None,
            next_role=payload.role,
        )
        first_name = _normalize_required_name(payload.first_name, field_label="First name")
        last_name = _normalize_required_name(payload.last_name, field_label="Last name")
        patronymic = _normalize_optional_name(payload.patronymic)
        email = _normalize_email(payload.email)
        if self.users.get_by_email(email) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A user with this email already exists.",
            )

        temporary_password = (
            payload.temporary_password.strip()
            if payload.temporary_password and payload.temporary_password.strip()
            else create_temporary_password()
        )
        validate_password_policy(temporary_password)

        user = User(
            first_name=first_name,
            last_name=last_name,
            patronymic=patronymic,
            email=email,
            password_hash=hash_password(temporary_password),
            role=payload.role,
            is_active=payload.is_active,
            allowed_folder_ids=_normalize_allowed_folder_scope(
                role=payload.role,
                values=payload.allowed_folder_ids,
                folders=self.folders,
            ),
            must_change_password=True,
            password_changed_at=None,
        )
        self.users.add(user)
        try:
            self.notifications.send_temporary_password_email(
                recipient_email=user.email,
                recipient_name=_format_user_display_name(user),
                temporary_password=temporary_password,
            )
        except (NotificationConfigurationError, NotificationDeliveryError) as exc:
            self.session.rollback()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

        self.session.commit()
        self.session.refresh(user)
        return user, temporary_password

    def update_user(
        self,
        *,
        user_id: int,
        payload: UserUpdateRequest,
        current_user: User,
    ) -> User:
        user = self.users.get_by_id_for_update(user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )

        next_role = payload.role or user.role
        next_active = payload.is_active if payload.is_active is not None else user.is_active
        self._assert_user_management_target_access(
            current_user=current_user,
            target_user=user,
            next_role=next_role,
        )
        next_allowed_folder_ids = (
            _normalize_allowed_folder_scope(
                role=next_role,
                values=payload.allowed_folder_ids,
                folders=self.folders,
            )
            if "allowed_folder_ids" in payload.model_fields_set
            else _normalize_allowed_folder_scope(
                role=next_role,
                values=user.allowed_folder_ids,
                folders=self.folders,
            )
        )
        self._validate_admin_guardrails(user=user, next_role=next_role, next_active=next_active)

        if payload.first_name is not None:
            user.first_name = _normalize_required_name(payload.first_name, field_label="First name")

        if payload.last_name is not None:
            user.last_name = _normalize_required_name(payload.last_name, field_label="Last name")

        if payload.patronymic is not None:
            user.patronymic = _normalize_optional_name(payload.patronymic)

        if payload.role is not None:
            user.role = payload.role

        if payload.is_active is not None:
            user.is_active = payload.is_active

        if payload.role is not None or "allowed_folder_ids" in payload.model_fields_set:
            user.allowed_folder_ids = next_allowed_folder_ids
            user.dashboard_folder_ids = _filter_dashboard_folder_ids_for_scope(
                role=next_role,
                allowed_folder_ids=next_allowed_folder_ids,
                folder_ids=user.dashboard_folder_ids,
            )
            is_legacy_dashboard_folder_allowed = _is_folder_allowed_for_scope(
                role=next_role,
                allowed_folder_ids=next_allowed_folder_ids,
                folder_id=user.dashboard_folder_id,
            )
            if user.dashboard_folder_id is not None and not is_legacy_dashboard_folder_allowed:
                user.dashboard_folder_id = None
            if user.dashboard_folder_ids:
                user.dashboard_folder_id = user.dashboard_folder_ids[0]
            elif user.dashboard_folder_id is not None and is_legacy_dashboard_folder_allowed:
                user.dashboard_folder_ids = [user.dashboard_folder_id]

        self.session.commit()
        self.session.refresh(user)
        return user

    def update_role(self, *, user_id: int, role: UserRole, current_user: User) -> User:
        user = self.users.get_by_id_for_update(user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )

        self._assert_user_management_target_access(
            current_user=current_user,
            target_user=user,
            next_role=role,
        )
        self._validate_admin_guardrails(user=user, next_role=role, next_active=user.is_active)
        user.role = role
        user.allowed_folder_ids = _normalize_allowed_folder_scope(
            role=role,
            values=user.allowed_folder_ids,
            folders=self.folders,
        )
        user.dashboard_folder_ids = _filter_dashboard_folder_ids_for_scope(
            role=role,
            allowed_folder_ids=user.allowed_folder_ids,
            folder_ids=user.dashboard_folder_ids,
        )
        is_legacy_dashboard_folder_allowed = _is_folder_allowed_for_scope(
            role=role,
            allowed_folder_ids=user.allowed_folder_ids,
            folder_id=user.dashboard_folder_id,
        )
        if user.dashboard_folder_id is not None and not is_legacy_dashboard_folder_allowed:
            user.dashboard_folder_id = None
        if user.dashboard_folder_ids:
            user.dashboard_folder_id = user.dashboard_folder_ids[0]
        elif user.dashboard_folder_id is not None and is_legacy_dashboard_folder_allowed:
            user.dashboard_folder_ids = [user.dashboard_folder_id]
        self.session.commit()
        self.session.refresh(user)
        return user

    def reset_password(self, *, user_id: int, current_user: User) -> tuple[User, str]:
        user = self.users.get_by_id_for_update(user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )

        self._assert_user_management_target_access(
            current_user=current_user,
            target_user=user,
            next_role=user.role,
        )
        temporary_password = create_temporary_password()
        user.password_hash = hash_password(temporary_password)
        user.must_change_password = True
        user.password_changed_at = None
        self.session.commit()
        self.session.refresh(user)
        return user, temporary_password

    def delete_user(self, *, user_id: int, current_user: User) -> None:
        user = self.users.get_by_id_for_update(user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )

        if user.id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Нельзя удалить текущего пользователя.",
            )

        if user.role == UserRole.DEVELOPER:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Пользователя с ролью «Разработчик» удалить нельзя.",
            )

        self._assert_user_management_target_access(
            current_user=current_user,
            target_user=user,
            next_role=UserRole.CUSTOMER,
        )
        self._validate_admin_guardrails(
            user=user,
            next_role=UserRole.CUSTOMER,
            next_active=False,
        )
        self.users.clear_references(user_id=user.id)
        self.users.delete(user)
        self.session.commit()

    def _validate_admin_guardrails(
        self,
        *,
        user: User,
        next_role: UserRole,
        next_active: bool,
    ) -> None:
        if user.role == UserRole.DEVELOPER and (next_role != UserRole.DEVELOPER or not next_active):
            if self.users.count_by_role(UserRole.DEVELOPER) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The system must keep at least one developer.",
                )

        if user.role == UserRole.ADMINISTRATOR and (
            next_role != UserRole.ADMINISTRATOR or not next_active
        ):
            if self.users.count_by_role(UserRole.ADMINISTRATOR) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The system must keep at least one administrator.",
                )

    def _assert_user_management_target_access(
        self,
        *,
        current_user: User,
        target_user: User | None,
        next_role: UserRole,
    ) -> None:
        if (
            target_user is not None
            and target_user.role == UserRole.DEVELOPER
            and not is_developer_role(current_user.role)
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Пользователя с ролью «Разработчик» может изменять только разработчик.",
            )

        if next_role == UserRole.DEVELOPER and not is_developer_role(current_user.role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Только разработчик может назначить роль «Разработчик».",
            )


def _normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not normalized or "@" not in normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Email must be valid.",
        )
    return normalized


def _normalize_required_name(value: str, *, field_label: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_label} must not be empty.",
        )
    if len(normalized) > 255:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_label} is too long. Maximum length is 255 characters.",
        )
    return normalized


def _normalize_optional_name(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > 255:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Patronymic is too long. Maximum length is 255 characters.",
        )
    return normalized


def _normalize_allowed_folder_scope(
    *,
    role: UserRole,
    values: list[object] | None,
    folders: EquipmentFolderRepository,
) -> list[int] | None:
    if not _requires_folder_scope(role):
        return None
    if values is None:
        return []
    return _normalize_allowed_folder_ids(values, folders=folders)


def _normalize_allowed_folder_ids(
    values: list[object],
    *,
    folders: EquipmentFolderRepository,
) -> list[int]:
    normalized = _coerce_allowed_folder_ids(values)
    for folder_id in normalized:
        if folders.get_by_id(folder_id) is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Разрешенная папка {folder_id} не найдена.",
            )
    return normalized


def _coerce_allowed_folder_ids(values: list[object] | None) -> list[int]:
    if not values:
        return []

    normalized: list[int] = []
    seen: set[int] = set()
    for value in values:
        try:
            folder_id = int(value)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Список разрешенных папок заполнен некорректно.",
            ) from exc
        if folder_id <= 0 or folder_id in seen:
            continue
        seen.add(folder_id)
        normalized.append(folder_id)
    return normalized


def _requires_folder_scope(role: UserRole) -> bool:
    return role in {UserRole.CUSTOMER, UserRole.MKAIR}


def is_developer_role(role: UserRole | None) -> bool:
    return role == UserRole.DEVELOPER


def has_admin_access(role: UserRole | None) -> bool:
    return role in {UserRole.DEVELOPER, UserRole.ADMINISTRATOR}


def has_operator_access(role: UserRole | None) -> bool:
    return role in {UserRole.DEVELOPER, UserRole.ADMINISTRATOR, UserRole.MKAIR}


def _is_folder_allowed_for_scope(
    *,
    role: UserRole,
    allowed_folder_ids: list[int] | None,
    folder_id: int | None,
) -> bool:
    if not _requires_folder_scope(role):
        return True
    if folder_id is None:
        return False
    return folder_id in set(_coerce_allowed_folder_ids(allowed_folder_ids))


def _filter_dashboard_folder_ids_for_scope(
    *,
    role: UserRole,
    allowed_folder_ids: list[int] | None,
    folder_ids: list[int] | None,
) -> list[int]:
    if not folder_ids:
        return []
    if not _requires_folder_scope(role):
        return list(dict.fromkeys(folder_ids))

    allowed = set(_coerce_allowed_folder_ids(allowed_folder_ids))
    return [folder_id for folder_id in dict.fromkeys(folder_ids) if folder_id in allowed]


def get_user_allowed_folder_ids(user: User | None) -> set[int] | None:
    if user is None or not _requires_folder_scope(user.role):
        return None
    return set(_coerce_allowed_folder_ids(user.allowed_folder_ids))


def _filter_mention_candidates(users: list[User], *, current_user: User) -> list[User]:
    """Keep mention candidates inside the caller's folder scope.

    Users without a folder restriction (administrators and developers) stay visible to
    everyone because they oversee every folder; everything else is limited to users who
    share at least one accessible folder with the caller.
    """

    allowed_folder_ids = get_user_allowed_folder_ids(current_user)
    if allowed_folder_ids is None:
        return users

    visible: list[User] = []
    for user in users:
        user_folder_ids = get_user_allowed_folder_ids(user)
        if user_folder_ids is None or user_folder_ids & allowed_folder_ids:
            visible.append(user)
    return visible


def is_folder_access_allowed(user: User | None, folder_id: int | None) -> bool:
    if user is None:
        return True
    return _is_folder_allowed_for_scope(
        role=user.role,
        allowed_folder_ids=user.allowed_folder_ids,
        folder_id=folder_id,
    )


def build_user_mention_reads(users: list[User]) -> list[UserMentionRead]:
    mention_keys = build_user_mention_keys(users)
    return [
        UserMentionRead(
            id=user.id,
            display_name=_format_user_display_name(user),
            email=user.email,
            mention_key=mention_keys[user.id],
        )
        for user in users
    ]


def build_user_mention_keys(users: list[User]) -> dict[int, str]:
    base_counts: dict[str, int] = {}
    bases: dict[int, str] = {}

    for user in users:
        base = _build_user_mention_base(user)
        normalized_base = base.lower()
        bases[user.id] = base
        base_counts[normalized_base] = base_counts.get(normalized_base, 0) + 1

    result: dict[int, str] = {}
    for user in users:
        base = bases[user.id]
        if base_counts[base.lower()] > 1:
            result[user.id] = f"{base}{user.id}"
        else:
            result[user.id] = base
    return result


def _build_user_mention_base(user: User) -> str:
    last_name = _normalize_mention_chunk(user.last_name)
    first_name = _normalize_mention_chunk(user.first_name)
    patronymic = _normalize_mention_chunk(user.patronymic or "")

    if last_name:
        initials = f"{first_name[:1]}{patronymic[:1]}".strip()
        candidate = f"{last_name}{initials}"
        if candidate:
            return candidate

    if first_name:
        return first_name

    email_local_part = _normalize_mention_chunk(user.email.split("@", maxsplit=1)[0])
    return email_local_part or f"user{user.id}"


def _normalize_mention_chunk(value: str) -> str:
    return "".join(character for character in value if character.isalnum())


def _format_user_display_name(user: User) -> str:
    parts = [user.last_name.strip(), user.first_name.strip(), (user.patronymic or "").strip()]
    return " ".join(part for part in parts if part)
