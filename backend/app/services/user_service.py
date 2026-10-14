from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User, UserRole
from app.repositories.equipment_repository import EquipmentFolderRepository
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreateRequest, UserMentionRead, UserUpdateRequest
from app.services import accounts_client
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
        users = self.users.list_all()
        self._mirror_roles(users)
        return users

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
        self._mirror_roles([user])
        return user

    def _mirror_roles(self, users: list[User]) -> None:
        """Take the role from the registry for every local row the registry knows.

        This is the pull half of the arrangement: the registry owns the role, the local row
        is a copy, and a copy refreshed only at sign-in is how a role changed in the console
        used to stay invisible until that person happened to log in.

        The registry's stamp is remembered alongside the role, so the next write from this
        side can say what it read and be told when the registry has moved on since.

        Deliberately forgiving, because it runs while rendering a page: a registry that is
        down leaves the local copy in place instead of failing the user list, and a role the
        service refuses to apply — the last developer or administrator kept the service
        administrable, or a folder scope that no longer validates — is logged and skipped,
        with its stamp left alone so the conflict stays visible.
        """

        if not users or not accounts_client.is_enabled():
            return
        try:
            accounts = accounts_client.list_accounts()
        except accounts_client.AccountsUnavailable:
            logger.warning("Registry is unavailable: the user list is served from the local copy.")
            return
        except HTTPException as error:
            # A registry older than this service has no account list yet, and a wrong service
            # token answers 401: neither is a reason to fail an administrator's page.
            logger.warning(
                "Registry refused the account list (%s): the local copy is served instead.",
                getattr(error, "detail", error),
            )
            return

        by_email = {str(account.get("email", "")).lower(): account for account in accounts}
        changed = False
        for user in users:
            account = by_email.get(user.email.lower())
            if account is None:
                # Not everyone local lives in the registry (service accounts, test rows):
                # those keep the role they have; the registry is not asked about them.
                continue
            grant = _registry_grant(account)
            if grant is None or grant.role is None:
                continue
            stamp = _parse_stamp(grant.role_updated_at)
            role_changed = grant.role != user.role
            access_changed = grant.is_active is not None and grant.is_active != user.is_active
            if (
                not role_changed
                and not access_changed
                and _as_utc(stamp) == _as_utc(user.role_synced_at)
            ):
                continue
            if role_changed or access_changed:
                try:
                    self._validate_admin_guardrails(
                        user=user,
                        next_role=grant.role,
                        next_active=grant.is_active
                        if grant.is_active is not None
                        else user.is_active,
                    )
                except HTTPException as error:
                    logger.warning(
                        "Registry grant for %s was not applied: %s",
                        user.email,
                        getattr(error, "detail", error),
                    )
                    continue
            if role_changed:
                apply_role_scope(user, role=grant.role, folders=self.folders)
                logger.info("Role of %s taken from the registry: %s.", user.email, grant.role)
            if access_changed:
                user.is_active = bool(grant.is_active)
                logger.info(
                    "Access of %s in the registry is %s.",
                    user.email,
                    "on" if grant.is_active else "off",
                )
            user.role_synced_at = stamp
            changed = True

        if changed:
            self.session.commit()

    def create_user(
        self,
        payload: UserCreateRequest,
        *,
        current_user: User,
    ) -> tuple[User, str | None]:
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

        if accounts_client.is_enabled():
            # The registry owns the credentials and sends the invitation link; the
            # local row only carries the app's own role and folder scope.
            accounts_client.create_account(
                email=email,
                first_name=first_name,
                last_name=last_name,
                patronymic=patronymic,
                role=payload.role.value,
            )
            user = User(
                first_name=first_name,
                last_name=last_name,
                patronymic=patronymic,
                email=email,
                password_hash="!",
                role=payload.role,
                is_active=payload.is_active,
                allowed_folder_ids=_normalize_allowed_folder_scope(
                    role=payload.role,
                    values=payload.allowed_folder_ids,
                    folders=self.folders,
                ),
                must_change_password=False,
                password_changed_at=None,
            )
            self.users.add(user)
            self.session.commit()
            self.session.refresh(user)
            return user, None

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
                # Carrying the row's own scope along: a folder deleted since it was granted is
                # dropped, and does not stop a role or activity change.
                strict=False,
            )
        )
        self._validate_admin_guardrails(user=user, next_role=next_role, next_active=next_active)

        if accounts_client.is_enabled():
            role_changed = payload.role is not None and payload.role != user.role
            access_changed = payload.is_active is not None and payload.is_active != user.is_active
            if role_changed or access_changed:
                # The registry owns both the role and the flag, so the change goes there first
                # and the local copy follows its answer. The stamp this copy was built from goes
                # with it: the registry refuses a write that grew out of a role it has already
                # moved past, and that refusal leaves this row exactly as it was.
                grant = accounts_client.set_service(
                    email=user.email,
                    role=payload.role.value if payload.role is not None else user.role.value,
                    is_active=payload.is_active if access_changed else None,
                    if_unmodified_since=user.role_synced_at,
                )
                user.role_synced_at = _parse_stamp(grant.role_updated_at)
                if grant.role is not None and grant.role != (
                    payload.role.value if payload.role is not None else user.role.value
                ):
                    # The registry only accepts the roles the service knows, so this would mean
                    # the two sides disagree about the role set — worth a line in the log.
                    logger.warning(
                        "Registry put %s in force for %s while %s was requested.",
                        grant.role,
                        user.email,
                        payload.role.value,
                    )

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
            _reconcile_dashboard_folders(user, role=next_role)

        self.session.commit()
        self.session.refresh(user)
        return user

    def update_role(self, *, user_id: int, role: UserRole, current_user: User) -> User:
        """A role change is an ordinary update.

        One path, so the registry write and the folder-scope fix cannot be remembered in one
        place and forgotten in the other.
        """

        return self.update_user(
            user_id=user_id,
            payload=UserUpdateRequest(role=role),
            current_user=current_user,
        )

    def reset_password(self, *, user_id: int, current_user: User) -> tuple[User, str | None]:
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

        if accounts_client.is_enabled():
            # No administrator-issued password: the registry mails a one-time link.
            accounts_client.send_invite(email=user.email)
            return user, None

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
    strict: bool = True,
) -> list[int] | None:
    """The folder scope a role keeps.

    ``strict`` is the difference between "this is a scope I am setting" and "this scope came
    with the row": a folder id that no longer exists is an error in the first case (the caller
    got it wrong), while carrying a row's own scope over a role change must not fail — an id
    left behind by a deleted folder used to make the user impossible to edit at all.
    """

    if not _requires_folder_scope(role):
        return None
    if values is None:
        return []
    return _normalize_allowed_folder_ids(values, folders=folders, strict=strict)


def _normalize_allowed_folder_ids(
    values: list[object],
    *,
    folders: EquipmentFolderRepository,
    strict: bool = True,
) -> list[int]:
    normalized = _coerce_allowed_folder_ids(values)
    existing: list[int] = []
    missing: list[int] = []
    for folder_id in normalized:
        target = existing if folders.get_by_id(folder_id) is not None else missing
        target.append(folder_id)
    if missing and strict:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Разрешенная папка {missing[0]} не найдена.",
        )
    if missing:
        logger.info("Dropped folders that no longer exist from a scope: %s.", missing)
    return existing


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


def apply_role_scope(user: User, *, role: UserRole, folders: EquipmentFolderRepository) -> None:
    """Put a role in force together with the folder scope that belongs to it.

    Every place that takes a role from somewhere else goes through here: the registry's
    answer to a local edit, the registry's copy read on a page load, and the role that comes
    back at sign-in. A role assigned without this is how a person ends up an administrator
    whose folder scope still says `MKAIR`.

    The scope is computed before the role is assigned, so a scope that no longer validates
    (a folder deleted since it was granted) leaves the row as it was instead of half-changed.
    """

    allowed_folder_ids = _normalize_allowed_folder_scope(
        role=role,
        values=user.allowed_folder_ids,
        folders=folders,
        # The scope comes with the row: an id whose folder has been deleted is dropped here
        # rather than blocking the role change that brought us in.
        strict=False,
    )
    user.role = role
    user.allowed_folder_ids = allowed_folder_ids
    _reconcile_dashboard_folders(user, role=role)


def _reconcile_dashboard_folders(user: User, *, role: UserRole) -> None:
    """Drop dashboards outside the role's scope, and keep the leading folder in sync."""

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


def coerce_role(value: object) -> UserRole | None:
    """A role from the wire, or None when this service does not know it."""

    if not value:
        return None
    try:
        return UserRole(str(value))
    except ValueError:
        return None


def _registry_grant(account: dict[str, Any]) -> accounts_client.Grant | None:
    """This service's grant inside one registry account.

    The flag comes along: a revoked grant is mirrored as an inactive local row, so the service
    shows the same thing the registry decided. Sign-in is still refused at the registry (403)
    — the local flag is the mirror, not the lock.
    """

    for entry in account.get("services") or []:
        if entry.get("service") != settings.accounts_service_name:
            continue
        return accounts_client.Grant(
            role=coerce_role(entry.get("role")),
            is_active=entry.get("is_active"),
            role_updated_at=entry.get("role_updated_at"),
        )
    return None


def _parse_stamp(value: str | None) -> datetime | None:
    """The registry's stamp as a datetime; unreadable or missing means "no idea"."""

    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _as_utc(value: datetime | None) -> datetime | None:
    """Compare stamps across backends: SQLite hands them back without a timezone."""

    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


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
