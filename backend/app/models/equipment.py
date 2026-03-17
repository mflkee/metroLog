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
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    and_,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class EquipmentType(StrEnum):
    SI = "SI"
    ESI = "ESI"
    IO = "IO"
    VO = "VO"
    OTHER = "OTHER"


class ESIModuleKind(StrEnum):
    INTERNAL = "INTERNAL"
    EXTERNAL = "EXTERNAL"


class EquipmentFolderRefreshTaskStatus(StrEnum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class EquipmentFolderRefreshRowStatus(StrEnum):
    UPDATED = "UPDATED"
    UPDATED_UNCERTAIN = "UPDATED_UNCERTAIN"
    UNCHANGED = "UNCHANGED"
    NOT_FOUND = "NOT_FOUND"
    ERROR = "ERROR"


class EquipmentFolderRefreshTargetKind(StrEnum):
    SI = "SI"
    ESI = "ESI"
    ESI_INTERNAL = "ESI_INTERNAL"
    ESI_EXTERNAL = "ESI_EXTERNAL"


class EquipmentStatus(StrEnum):
    IN_WORK = "IN_WORK"
    IN_VERIFICATION = "IN_VERIFICATION"
    IN_REPAIR = "IN_REPAIR"
    ARCHIVED = "ARCHIVED"


class VerificationFlowMode(StrEnum):
    OFFSITE_WITH_DEMOLITION = "OFFSITE_WITH_DEMOLITION"
    ONSITE_WITH_DEMOLITION = "ONSITE_WITH_DEMOLITION"
    ONSITE_WITHOUT_DEMOLITION = "ONSITE_WITHOUT_DEMOLITION"


class DeadlinePreset(Base):
    __tablename__ = "deadline_presets"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(nullable=False, default=True)
    is_system: Mapped[bool] = mapped_column(nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    repair_total_days: Mapped[int] = mapped_column(Integer, nullable=False)
    registration_after_arrival_days: Mapped[int] = mapped_column(Integer, nullable=False)
    incoming_control_after_receipt_days: Mapped[int] = mapped_column(Integer, nullable=False)
    payment_after_control_days: Mapped[int] = mapped_column(Integer, nullable=False)
    repair_stage_templates_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    verification_stage_templates_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
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


class EquipmentFolder(Base):
    __tablename__ = "equipment_folders"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    deadline_preset_id: Mapped[int | None] = mapped_column(
        ForeignKey("deadline_presets.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    deadline_preset_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    deadline_preset_snapshot_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
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
    measurement_range_start: Mapped[str | None] = mapped_column(String(255), nullable=True)
    measurement_range_end: Mapped[str | None] = mapped_column(String(255), nullable=True)
    measurement_unit: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[EquipmentStatus] = mapped_column(
        Enum(EquipmentStatus, native_enum=False, length=32),
        nullable=False,
        default=EquipmentStatus.IN_WORK,
    )
    created_manually: Mapped[bool] = mapped_column(nullable=False, default=False)
    exclude_from_arshin_refresh: Mapped[bool] = mapped_column(nullable=False, default=False)
    current_location_manual: Mapped[str | None] = mapped_column(String(255), nullable=True)
    compliance_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    compliance_interval_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    manual_verification_interval_months: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )
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
    esi_composition_entries: Mapped[list[EquipmentESICompositionEntry]] = relationship(
        back_populates="equipment",
        cascade="all, delete-orphan",
    )


class EquipmentProcessSubscription(Base):
    __tablename__ = "equipment_process_subscriptions"
    __table_args__ = (
        UniqueConstraint(
            "equipment_id",
            "user_id",
            name="uq_equipment_process_subscriptions_equipment_id_user_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class FolderProcessSubscription(Base):
    __tablename__ = "folder_process_subscriptions"
    __table_args__ = (
        UniqueConstraint(
            "folder_id",
            "user_id",
            name="uq_folder_process_subscriptions_folder_id_user_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    folder_id: Mapped[int] = mapped_column(
        ForeignKey("equipment_folders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )


class Repair(Base):
    __tablename__ = "repairs"
    __table_args__ = (
        Index(
            "ix_repairs_active_queue_order",
            "sent_to_repair_at",
            "created_at",
            "id",
            postgresql_where=text("closed_at IS NULL"),
        ),
        Index(
            "ix_repairs_archived_queue_order",
            "closed_at",
            "updated_at",
            "id",
            postgresql_where=text("closed_at IS NOT NULL"),
        ),
        Index(
            "ix_repairs_active_equipment_lookup",
            "equipment_id",
            postgresql_where=text("closed_at IS NULL"),
        ),
        Index(
            "ix_repairs_active_batch_lookup",
            "batch_key",
            "id",
            postgresql_where=text("closed_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    batch_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    batch_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_on_site: Mapped[bool] = mapped_column(nullable=False, default=False)
    route_city: Mapped[str] = mapped_column(String(255), nullable=False)
    route_destination: Mapped[str] = mapped_column(String(255), nullable=False)
    sent_to_repair_at: Mapped[date] = mapped_column(Date, nullable=False)
    repair_deadline_at: Mapped[date] = mapped_column(Date, nullable=False)
    repair_total_days_snapshot: Mapped[int] = mapped_column(Integer, nullable=False)
    registration_after_arrival_days_snapshot: Mapped[int] = mapped_column(Integer, nullable=False)
    incoming_control_after_receipt_days_snapshot: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )
    payment_after_control_days_snapshot: Mapped[int] = mapped_column(Integer, nullable=False)
    arrived_to_destination_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    sent_from_repair_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    sent_from_irkutsk_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    arrived_to_lensk_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    actually_received_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    incoming_control_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    paid_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    custom_stages_json: Mapped[list[dict[str, object]]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )
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
    batch_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    author_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    author_display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_private: Mapped[bool] = mapped_column(nullable=False, default=False)
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
    __table_args__ = (
        Index(
            "ix_verifications_active_queue_order",
            "sent_to_verification_at",
            "created_at",
            "id",
            postgresql_where=text("closed_at IS NULL"),
        ),
        Index(
            "ix_verifications_archived_queue_order",
            "closed_at",
            "updated_at",
            "id",
            postgresql_where=text("closed_at IS NOT NULL"),
        ),
        Index(
            "ix_verifications_active_equipment_lookup",
            "equipment_id",
            postgresql_where=text("closed_at IS NULL"),
        ),
        Index(
            "ix_verifications_active_batch_lookup",
            "batch_key",
            "id",
            postgresql_where=text("closed_at IS NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    batch_key: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    batch_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_on_site: Mapped[bool] = mapped_column(nullable=False, default=False)
    flow_mode: Mapped[VerificationFlowMode] = mapped_column(
        Enum(VerificationFlowMode, native_enum=False, length=48),
        nullable=False,
        default=VerificationFlowMode.OFFSITE_WITH_DEMOLITION,
    )
    route_city: Mapped[str] = mapped_column(String(255), nullable=False)
    route_destination: Mapped[str] = mapped_column(String(255), nullable=False)
    sent_to_verification_at: Mapped[date] = mapped_column(Date, nullable=False)
    received_at_destination_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    handed_to_csm_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    verification_completed_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    picked_up_from_csm_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    shipped_back_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    returned_from_verification_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    custom_stages_json: Mapped[list[dict[str, object]]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )
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
    is_private: Mapped[bool] = mapped_column(nullable=False, default=False)
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
    __table_args__ = (UniqueConstraint("equipment_id", name="uq_si_verifications_equipment_id"),)

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
    certificate_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
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


class EquipmentESICompositionEntry(Base):
    __tablename__ = "equipment_esi_composition_entries"
    __table_args__ = (
        UniqueConstraint(
            "equipment_id",
            "vri_id",
            name="uq_equipment_esi_composition_entries_equipment_id_vri_id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    module_kind: Mapped[ESIModuleKind] = mapped_column(
        Enum(ESIModuleKind, native_enum=False, length=32),
        nullable=False,
        default=ESIModuleKind.EXTERNAL,
    )
    vri_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    measurement_limit: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
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

    equipment: Mapped[Equipment] = relationship(back_populates="esi_composition_entries")


class EquipmentFolderRefreshTask(Base):
    __tablename__ = "equipment_folder_refresh_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    folder_id: Mapped[int] = mapped_column(
        ForeignKey("equipment_folders.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[EquipmentFolderRefreshTaskStatus] = mapped_column(
        Enum(EquipmentFolderRefreshTaskStatus, native_enum=False, length=32),
        nullable=False,
        default=EquipmentFolderRefreshTaskStatus.PENDING,
    )
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_rows: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    summary_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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


class EquipmentFolderRefreshRow(Base):
    __tablename__ = "equipment_folder_refresh_rows"
    __table_args__ = (
        Index(
            "ix_equipment_folder_refresh_rows_task_sort",
            "task_id",
            "sort_order",
            "id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(
        ForeignKey("equipment_folder_refresh_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    composition_entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("equipment_esi_composition_entries.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    target_kind: Mapped[EquipmentFolderRefreshTargetKind] = mapped_column(
        Enum(EquipmentFolderRefreshTargetKind, native_enum=False, length=32),
        nullable=False,
    )
    module_kind: Mapped[ESIModuleKind | None] = mapped_column(
        Enum(ESIModuleKind, native_enum=False, length=32),
        nullable=True,
    )
    equipment_name: Mapped[str] = mapped_column(String(255), nullable=False)
    equipment_modification: Mapped[str | None] = mapped_column(String(255), nullable=True)
    equipment_serial_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    target_title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    target_serial_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    target_registry_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    measurement_limit: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_certificate_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    current_verification_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    current_valid_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    status: Mapped[EquipmentFolderRefreshRowStatus] = mapped_column(
        Enum(EquipmentFolderRefreshRowStatus, native_enum=False, length=32),
        nullable=False,
    )
    uncertain_update: Mapped[bool] = mapped_column(nullable=False, default=False)
    stage2_successful: Mapped[bool | None] = mapped_column(nullable=True)
    modification_relaxed: Mapped[bool | None] = mapped_column(nullable=True)
    notation_relaxed: Mapped[bool | None] = mapped_column(nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    matched_vri_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    matched_arshin_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    matched_registry_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    matched_certificate_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    matched_verification_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    matched_valid_date: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    matched_payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
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
    is_private: Mapped[bool] = mapped_column(nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    attachments: Mapped[list[EquipmentCommentAttachment]] = relationship(
        back_populates="comment",
        cascade="all, delete-orphan",
    )


class EquipmentCommentAttachment(Base):
    __tablename__ = "equipment_comment_attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_comment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment_comments.id", ondelete="CASCADE"),
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
    comment: Mapped[EquipmentComment] = relationship(back_populates="attachments")
