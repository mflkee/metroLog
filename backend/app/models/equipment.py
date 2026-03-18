from __future__ import annotations

from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EquipmentType(StrEnum):
    SI = "SI"
    IO = "IO"
    VO = "VO"
    OTHER = "OTHER"


class EquipmentStatus(StrEnum):
    ACTIVE = "ACTIVE"
    IN_REPAIR = "IN_REPAIR"
    ARCHIVED = "ARCHIVED"


class EquipmentFolder(Base):
    __tablename__ = "equipment_folders"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
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


class EquipmentGroup(Base):
    __tablename__ = "equipment_groups"
    __table_args__ = (
        UniqueConstraint("folder_id", "name", name="uq_equipment_groups_folder_id_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    folder_id: Mapped[int] = mapped_column(
        ForeignKey("equipment_folders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
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


class Equipment(Base):
    __tablename__ = "equipment"

    id: Mapped[int] = mapped_column(primary_key=True)
    folder_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipment_folders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    group_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipment_groups.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    object_name: Mapped[str] = mapped_column(String(255), nullable=False)
    equipment_type: Mapped[EquipmentType] = mapped_column(
        Enum(EquipmentType, native_enum=False, length=32),
        nullable=False,
        default=EquipmentType.OTHER,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    modification: Mapped[str | None] = mapped_column(String(255), nullable=True)
    serial_number: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    manufacture_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[EquipmentStatus] = mapped_column(
        Enum(EquipmentStatus, native_enum=False, length=32),
        nullable=False,
        default=EquipmentStatus.ACTIVE,
    )
    current_location_manual: Mapped[str | None] = mapped_column(String(255), nullable=True)
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
