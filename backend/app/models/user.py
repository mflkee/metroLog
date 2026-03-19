from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from sqlalchemy import JSON, DateTime, Enum, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserRole(StrEnum):
    ADMINISTRATOR = "ADMINISTRATOR"
    MKAIR = "MKAIR"
    CUSTOMER = "CUSTOMER"


class UserThemePreference(StrEnum):
    LIGHT = "light"
    DARK = "dark"
    GRAY = "gray"
    TOKYONIGHT = "tokyonight"
    CATPPUCCIN = "catppuccin"
    KANAGAWA = "kanagawa"
    FLEXOKI = "flexoki"
    GRUVBOX = "gruvbox"
    MOONFLY = "moonfly"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    first_name: Mapped[str] = mapped_column(String(255), nullable=False)
    last_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    patronymic: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, native_enum=False, length=32),
        nullable=False,
        default=UserRole.CUSTOMER,
    )
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    must_change_password: Mapped[bool] = mapped_column(nullable=False, default=False)
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    phone: Mapped[str | None] = mapped_column(String(64), nullable=True)
    organization: Mapped[str | None] = mapped_column(String(255), nullable=True)
    position: Mapped[str | None] = mapped_column(String(255), nullable=True)
    facility: Mapped[str | None] = mapped_column(String(255), nullable=True)
    theme_preference: Mapped[UserThemePreference | None] = mapped_column(
        Enum(UserThemePreference, native_enum=False, length=32),
        nullable=True,
    )
    enabled_theme_options: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
