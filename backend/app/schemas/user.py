from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.user import UserRole


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    first_name: str
    last_name: str
    patronymic: str | None
    email: str
    role: UserRole
    email_verified_at: datetime | None
    is_active: bool
    must_change_password: bool
    password_changed_at: datetime | None
    phone: str | None
    organization: str | None
    position: str | None
    facility: str | None
    created_at: datetime
    updated_at: datetime


class UserRoleUpdate(BaseModel):
    role: UserRole


class UserCreateRequest(BaseModel):
    first_name: str
    last_name: str
    patronymic: str | None = None
    email: str
    role: UserRole = UserRole.CUSTOMER
    is_active: bool = True
    temporary_password: str | None = None


class UserUpdateRequest(BaseModel):
    first_name: str | None = None
    last_name: str | None = None
    patronymic: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserProfileUpdateRequest(BaseModel):
    phone: str | None = None
    organization: str | None = None
    position: str | None = None
    facility: str | None = None


class UserTemporaryPasswordResponse(BaseModel):
    user: UserRead
    temporary_password: str
