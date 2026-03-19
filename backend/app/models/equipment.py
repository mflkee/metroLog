from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import (
    JSON,
    BigInteger,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    and_,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class EquipmentType(StrEnum):
    SI = "SI"
    IO = "IO"
    VO = "VO"
    OTHER = "OTHER"


class EquipmentStatus(StrEnum):
    IN_WORK = "IN_WORK"
    IN_VERIFICATION = "IN_VERIFICATION"
    IN_REPAIR = "IN_REPAIR"
    ARCHIVED = "ARCHIVED"


class EquipmentFolder(Base):
    __tablename__ = "equipment_folders"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
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
        default=EquipmentStatus.IN_WORK,
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
    repairs: Mapped[list[Repair]] = relationship(
        back_populates="equipment",
        cascade="all, delete-orphan",
    )
    verifications: Mapped[list[Verification]] = relationship(
        back_populates="equipment",
        cascade="all, delete-orphan",
    )
    active_repair: Mapped[Repair | None] = relationship(
        primaryjoin=lambda: and_(
            Equipment.id == Repair.equipment_id,
            Repair.closed_at.is_(None),
        ),
        uselist=False,
        viewonly=True,
    )
    active_verification: Mapped[Verification | None] = relationship(
        primaryjoin=lambda: and_(
            Equipment.id == Verification.equipment_id,
            Verification.closed_at.is_(None),
        ),
        uselist=False,
        viewonly=True,
    )
    si_verification: Mapped[SIVerification | None] = relationship(
        back_populates="equipment",
        uselist=False,
        cascade="all, delete-orphan",
    )


class Repair(Base):
    __tablename__ = "repairs"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    route_city: Mapped[str] = mapped_column(String(255), nullable=False)
    route_destination: Mapped[str] = mapped_column(String(255), nullable=False)
    sent_to_repair_at: Mapped[date] = mapped_column(Date, nullable=False)
    repair_deadline_at: Mapped[date] = mapped_column(Date, nullable=False)
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
    closed_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    equipment: Mapped[Equipment] = relationship(back_populates="repairs")
    messages: Mapped[list[RepairMessage]] = relationship(
        back_populates="repair",
        cascade="all, delete-orphan",
    )


class RepairMessage(Base):
    __tablename__ = "repair_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    repair_id: Mapped[int] = mapped_column(
        ForeignKey("repairs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    author_display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    repair: Mapped[Repair] = relationship(back_populates="messages")
    attachments: Mapped[list[RepairMessageAttachment]] = relationship(
        back_populates="message",
        cascade="all, delete-orphan",
    )


class RepairMessageAttachment(Base):
    __tablename__ = "repair_message_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    repair_message_id: Mapped[int] = mapped_column(
        ForeignKey("repair_messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    uploaded_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    uploaded_by_display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    message: Mapped[RepairMessage] = relationship(back_populates="attachments")


class Verification(Base):
    __tablename__ = "verifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    batch_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    batch_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    route_city: Mapped[str] = mapped_column(String(255), nullable=False)
    route_destination: Mapped[str] = mapped_column(String(255), nullable=False)
    sent_to_verification_at: Mapped[date] = mapped_column(Date, nullable=False)
    received_at_destination_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    handed_to_csm_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    verification_completed_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    picked_up_from_csm_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    shipped_back_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    returned_from_verification_at: Mapped[date | None] = mapped_column(Date, nullable=True)
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
    closed_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    equipment: Mapped[Equipment] = relationship(back_populates="verifications")
    messages: Mapped[list[VerificationMessage]] = relationship(
        back_populates="verification",
        cascade="all, delete-orphan",
    )


class VerificationMessage(Base):
    __tablename__ = "verification_messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    verification_id: Mapped[int] = mapped_column(
        ForeignKey("verifications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    batch_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    author_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    author_display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    verification: Mapped[Verification] = relationship(back_populates="messages")
    attachments: Mapped[list[VerificationMessageAttachment]] = relationship(
        back_populates="message",
        cascade="all, delete-orphan",
    )


class VerificationMessageAttachment(Base):
    __tablename__ = "verification_message_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    verification_message_id: Mapped[int] = mapped_column(
        ForeignKey("verification_messages.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    uploaded_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    uploaded_by_display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    message: Mapped[VerificationMessage] = relationship(back_populates="attachments")


class SIVerification(Base):
    __tablename__ = "si_verifications"
    __table_args__ = (
        UniqueConstraint("equipment_id", name="uq_si_verifications_equipment_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    vri_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    arshin_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    org_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mit_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mit_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mit_notation: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mi_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    result_docnum: Mapped[str | None] = mapped_column(String(255), nullable=True)
    verification_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    valid_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    raw_payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    detail_payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
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
    equipment: Mapped[Equipment] = relationship(back_populates="si_verification")


class EquipmentAttachment(Base):
    __tablename__ = "equipment_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    uploaded_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    uploaded_by_display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1024), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class EquipmentComment(Base):
    __tablename__ = "equipment_comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    author_display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
