from __future__ import annotations

import logging

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.user import User, UserRole
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreateRequest, UserMentionRead, UserUpdateRequest
from app.utils.password_policy import validate_password_policy
from app.utils.security import create_temporary_password, hash_password

logger = logging.getLogger(__name__)


class UserService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.users = UserRepository(session)

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
            if user.role != UserRole.ADMINISTRATOR or not user.is_active:
                user.role = UserRole.ADMINISTRATOR
                user.is_active = True
                self.session.commit()
                self.session.refresh(user)
                logger.warning("Bootstrap administrator %s was elevated automatically.", email)
            return user

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
        self.session.commit()
        self.session.refresh(user)
        logger.warning("Bootstrap administrator %s was created automatically.", email)
        return user

    def list_users(self) -> list[User]:
        return self.users.list_all()

    def list_mention_users(self) -> list[UserMentionRead]:
        users = self.users.list_active()
        return build_user_mention_reads(users)

    def get_user(self, *, user_id: int) -> User:
        user = self.users.get_by_id(user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )
        return user

    def create_user(self, payload: UserCreateRequest) -> tuple[User, str]:
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
            must_change_password=True,
            password_changed_at=None,
        )
        self.users.add(user)
        self.session.commit()
        self.session.refresh(user)
        return user, temporary_password

    def update_user(self, *, user_id: int, payload: UserUpdateRequest) -> User:
        user = self.users.get_by_id_for_update(user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )

        next_role = payload.role or user.role
        next_active = payload.is_active if payload.is_active is not None else user.is_active
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

        self.session.commit()
        self.session.refresh(user)
        return user

    def update_role(self, *, user_id: int, role: UserRole) -> User:
        user = self.users.get_by_id_for_update(user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )

        self._validate_admin_guardrails(user=user, next_role=role, next_active=user.is_active)
        user.role = role
        self.session.commit()
        self.session.refresh(user)
        return user

    def reset_password(self, *, user_id: int) -> tuple[User, str]:
        user = self.users.get_by_id_for_update(user_id)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )

        temporary_password = create_temporary_password()
        user.password_hash = hash_password(temporary_password)
        user.must_change_password = True
        user.password_changed_at = None
        self.session.commit()
        self.session.refresh(user)
        return user, temporary_password

    def _validate_admin_guardrails(
        self,
        *,
        user: User,
        next_role: UserRole,
        next_active: bool,
    ) -> None:
        if user.role == UserRole.ADMINISTRATOR and (
            next_role != UserRole.ADMINISTRATOR or not next_active
        ):
            if self.users.count_by_role(UserRole.ADMINISTRATOR) <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The system must keep at least one administrator.",
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
