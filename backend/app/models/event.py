from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EventCategory(StrEnum):
    EQUIPMENT = "EQUIPMENT"
    REPAIR = "REPAIR"
    VERIFICATION = "VERIFICATION"


class EventLog(Base):
    __tablename__ = "event_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[EventCategory] = mapped_column(
        Enum(EventCategory, native_enum=False, length=32),
        nullable=False,
        index=True,
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    equipment_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipment.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    equipment_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    equipment_modification: Mapped[str | None] = mapped_column(String(255), nullable=True)
    equipment_serial_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    folder_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipment_folders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    folder_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    batch_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    event_date: Mapped[date] = mapped_column(nullable=False, server_default=func.current_date())
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )
