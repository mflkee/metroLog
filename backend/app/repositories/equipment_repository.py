from __future__ import annotations

from sqlalchemy import delete, distinct, exists, or_, select, update
from sqlalchemy.orm import Session, selectinload

from app.models.equipment import (
    Equipment,
    EquipmentAttachment,
    EquipmentComment,
    EquipmentFolder,
    EquipmentGroup,
    EquipmentStatus,
    EquipmentType,
    Repair,
    RepairMessage,
    RepairMessageAttachment,
    SIVerification,
    Verification,
    VerificationMessage,
    VerificationMessageAttachment,
)


class EquipmentFolderRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, folder: EquipmentFolder) -> EquipmentFolder:
        self.session.add(folder)
        self.session.flush()
        return folder

    def get_by_id(self, folder_id: int) -> EquipmentFolder | None:
        statement = select(EquipmentFolder).where(EquipmentFolder.id == folder_id)
        return self.session.scalar(statement)

    def get_by_name(self, name: str) -> EquipmentFolder | None:
        statement = select(EquipmentFolder).where(EquipmentFolder.name == name)
        return self.session.scalar(statement)

    def list_all(self) -> list[EquipmentFolder]:
        statement = select(EquipmentFolder).order_by(
            EquipmentFolder.sort_order.asc(),
            EquipmentFolder.name.asc(),
            EquipmentFolder.id.asc(),
        )
        return list(self.session.scalars(statement))

    def delete(self, folder: EquipmentFolder) -> None:
        self.session.delete(folder)


class EquipmentGroupRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, group: EquipmentGroup) -> EquipmentGroup:
        self.session.add(group)
        self.session.flush()
        return group

    def get_by_id(self, group_id: int) -> EquipmentGroup | None:
        statement = select(EquipmentGroup).where(EquipmentGroup.id == group_id)
        return self.session.scalar(statement)

    def get_by_name_in_folder(self, *, folder_id: int, name: str) -> EquipmentGroup | None:
        statement = select(EquipmentGroup).where(
            EquipmentGroup.folder_id == folder_id,
            EquipmentGroup.name == name,
        )
        return self.session.scalar(statement)

    def list_by_folder(self, *, folder_id: int | None = None) -> list[EquipmentGroup]:
        statement = select(EquipmentGroup)
        if folder_id is not None:
            statement = statement.where(EquipmentGroup.folder_id == folder_id)
        statement = statement.order_by(
            EquipmentGroup.sort_order.asc(),
            EquipmentGroup.name.asc(),
            EquipmentGroup.id.asc(),
        )
        return list(self.session.scalars(statement))

    def delete(self, group: EquipmentGroup) -> None:
        self.session.delete(group)


class EquipmentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, equipment: Equipment) -> Equipment:
        self.session.add(equipment)
        self.session.flush()
        return equipment

    def get_by_id(self, equipment_id: int) -> Equipment | None:
        statement = (
            select(Equipment)
            .options(
                selectinload(Equipment.si_verification),
                selectinload(Equipment.active_repair),
                selectinload(Equipment.active_verification),
            )
            .where(Equipment.id == equipment_id)
        )
        return self.session.scalar(statement)

    def delete(self, equipment: Equipment) -> None:
        self.session.delete(equipment)

    def list_all(
        self,
        *,
        folder_id: int | None = None,
        group_id: int | None = None,
        query: str | None = None,
        status: EquipmentStatus | None = None,
        equipment_type: EquipmentType | None = None,
    ) -> list[Equipment]:
        statement = (
            select(Equipment)
            .options(
                selectinload(Equipment.si_verification),
                selectinload(Equipment.active_repair),
                selectinload(Equipment.active_verification),
            )
            .order_by(Equipment.created_at.desc(), Equipment.id.desc())
        )

        if folder_id is not None:
            statement = statement.where(Equipment.folder_id == folder_id)

        if group_id is not None:
            statement = statement.where(Equipment.group_id == group_id)

        active_repair_exists = exists(
            select(Repair.id).where(
                Repair.equipment_id == Equipment.id,
                Repair.closed_at.is_(None),
            )
        )
        active_verification_exists = exists(
            select(Verification.id).where(
                Verification.equipment_id == Equipment.id,
                Verification.closed_at.is_(None),
            )
        )

        if status is not None:
            if status == EquipmentStatus.IN_REPAIR:
                statement = statement.where(
                    or_(
                        Equipment.status == status,
                        active_repair_exists,
                    )
                )
            elif status == EquipmentStatus.IN_VERIFICATION:
                statement = statement.where(
                    or_(
                        Equipment.status == status,
                        active_verification_exists,
                    )
                )
            elif status == EquipmentStatus.IN_WORK:
                statement = statement.where(
                    Equipment.status == status,
                    ~active_repair_exists,
                    ~active_verification_exists,
                )
            else:
                statement = statement.where(Equipment.status == status)

        if equipment_type is not None:
            statement = statement.where(Equipment.equipment_type == equipment_type)

        if query:
            pattern = f"%{query}%"
            statement = statement.where(
                or_(
                    Equipment.object_name.ilike(pattern),
                    Equipment.name.ilike(pattern),
                    Equipment.modification.ilike(pattern),
                    Equipment.serial_number.ilike(pattern),
                    Equipment.current_location_manual.ilike(pattern),
                )
            )

        return list(self.session.scalars(statement))

    def list_distinct_object_names(self, *, folder_id: int) -> list[str]:
        statement = (
            select(distinct(Equipment.object_name))
            .where(Equipment.folder_id == folder_id)
            .order_by(Equipment.object_name.asc())
        )
        return [value for value in self.session.scalars(statement) if value]

    def list_distinct_locations(self, *, folder_id: int) -> list[str]:
        statement = (
            select(distinct(Equipment.current_location_manual))
            .where(
                Equipment.folder_id == folder_id,
                Equipment.current_location_manual.is_not(None),
                Equipment.current_location_manual != "",
            )
            .order_by(Equipment.current_location_manual.asc())
        )
        return [value for value in self.session.scalars(statement) if value]

    def clear_group_for_group_id(self, *, group_id: int) -> None:
        statement = update(Equipment).where(Equipment.group_id == group_id).values(group_id=None)
        self.session.execute(statement)

    def delete_by_folder_id(self, *, folder_id: int) -> None:
        statement = delete(Equipment).where(Equipment.folder_id == folder_id)
        self.session.execute(statement)


class EquipmentAttachmentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, attachment: EquipmentAttachment) -> EquipmentAttachment:
        self.session.add(attachment)
        self.session.flush()
        return attachment

    def get_by_id(self, attachment_id: int) -> EquipmentAttachment | None:
        statement = select(EquipmentAttachment).where(EquipmentAttachment.id == attachment_id)
        return self.session.scalar(statement)

    def list_by_equipment(self, *, equipment_id: int) -> list[EquipmentAttachment]:
        statement = (
            select(EquipmentAttachment)
            .where(EquipmentAttachment.equipment_id == equipment_id)
            .order_by(EquipmentAttachment.created_at.desc(), EquipmentAttachment.id.desc())
        )
        return list(self.session.scalars(statement))

    def delete(self, attachment: EquipmentAttachment) -> None:
        self.session.delete(attachment)


class EquipmentCommentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, comment: EquipmentComment) -> EquipmentComment:
        self.session.add(comment)
        self.session.flush()
        return comment

    def get_by_id(self, comment_id: int) -> EquipmentComment | None:
        statement = select(EquipmentComment).where(EquipmentComment.id == comment_id)
        return self.session.scalar(statement)

    def list_by_equipment(self, *, equipment_id: int) -> list[EquipmentComment]:
        statement = (
            select(EquipmentComment)
            .where(EquipmentComment.equipment_id == equipment_id)
            .order_by(EquipmentComment.created_at.asc(), EquipmentComment.id.asc())
        )
        return list(self.session.scalars(statement))

    def delete(self, comment: EquipmentComment) -> None:
        self.session.delete(comment)


class RepairRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, repair: Repair) -> Repair:
        self.session.add(repair)
        self.session.flush()
        return repair

    def get_active_by_equipment_id(self, *, equipment_id: int) -> Repair | None:
        statement = select(Repair).where(
            Repair.equipment_id == equipment_id,
            Repair.closed_at.is_(None),
        )
        return self.session.scalar(statement)

    def get_by_id(self, repair_id: int) -> Repair | None:
        statement = select(Repair).where(Repair.id == repair_id)
        return self.session.scalar(statement)

    def list_queue_items(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
    ) -> list[tuple[Repair, Equipment, SIVerification | None, bool]]:
        has_active_verification = exists(
            select(Verification.id).where(
                Verification.equipment_id == Repair.equipment_id,
                Verification.closed_at.is_(None),
            )
        )
        statement = (
            select(
                Repair,
                Equipment,
                SIVerification,
                has_active_verification.label("has_active_verification"),
            )
            .join(Equipment, Equipment.id == Repair.equipment_id)
            .outerjoin(SIVerification, SIVerification.equipment_id == Equipment.id)
        )

        if lifecycle_status == "active":
            statement = statement.where(Repair.closed_at.is_(None)).order_by(
                Repair.sent_to_repair_at.desc(),
                Repair.created_at.desc(),
                Repair.id.desc(),
            )
        else:
            statement = statement.where(Repair.closed_at.is_not(None)).order_by(
                Repair.closed_at.desc(),
                Repair.updated_at.desc(),
                Repair.id.desc(),
            )

        if query:
            pattern = f"%{query}%"
            statement = statement.where(
                or_(
                    Equipment.object_name.ilike(pattern),
                    Equipment.name.ilike(pattern),
                    Equipment.modification.ilike(pattern),
                    Equipment.serial_number.ilike(pattern),
                    Equipment.current_location_manual.ilike(pattern),
                    SIVerification.result_docnum.ilike(pattern),
                    SIVerification.mit_number.ilike(pattern),
                    SIVerification.mi_number.ilike(pattern),
                    Repair.route_city.ilike(pattern),
                    Repair.route_destination.ilike(pattern),
                )
            )

        rows = self.session.execute(statement).all()
        return [
            (
                row[0],
                row[1],
                row[2],
                bool(row[3]),
            )
            for row in rows
        ]

    def list_distinct_route_cities(self, *, folder_id: int) -> list[str]:
        statement = (
            select(distinct(Repair.route_city))
            .join(Equipment, Equipment.id == Repair.equipment_id)
            .where(Equipment.folder_id == folder_id)
            .order_by(Repair.route_city.asc())
        )
        return [value for value in self.session.scalars(statement) if value]

    def list_distinct_route_destinations(self, *, folder_id: int) -> list[str]:
        statement = (
            select(distinct(Repair.route_destination))
            .join(Equipment, Equipment.id == Repair.equipment_id)
            .where(Equipment.folder_id == folder_id)
            .order_by(Repair.route_destination.asc())
        )
        return [value for value in self.session.scalars(statement) if value]


class RepairMessageRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, message: RepairMessage) -> RepairMessage:
        self.session.add(message)
        self.session.flush()
        return message

    def list_by_repair(self, *, repair_id: int) -> list[RepairMessage]:
        statement = (
            select(RepairMessage)
            .options(selectinload(RepairMessage.attachments))
            .where(RepairMessage.repair_id == repair_id)
            .order_by(RepairMessage.created_at.asc(), RepairMessage.id.asc())
        )
        return list(self.session.scalars(statement))

    def get_by_id(self, message_id: int) -> RepairMessage | None:
        statement = (
            select(RepairMessage)
            .options(selectinload(RepairMessage.attachments))
            .where(RepairMessage.id == message_id)
        )
        return self.session.scalar(statement)

    def delete(self, message: RepairMessage) -> None:
        self.session.delete(message)


class RepairMessageAttachmentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, attachment: RepairMessageAttachment) -> RepairMessageAttachment:
        self.session.add(attachment)
        self.session.flush()
        return attachment

    def get_by_id(self, attachment_id: int) -> RepairMessageAttachment | None:
        statement = select(RepairMessageAttachment).where(
            RepairMessageAttachment.id == attachment_id
        )
        return self.session.scalar(statement)

    def delete(self, attachment: RepairMessageAttachment) -> None:
        self.session.delete(attachment)


class VerificationRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, verification: Verification) -> Verification:
        self.session.add(verification)
        self.session.flush()
        return verification

    def get_active_by_equipment_id(self, *, equipment_id: int) -> Verification | None:
        statement = select(Verification).where(
            Verification.equipment_id == equipment_id,
            Verification.closed_at.is_(None),
        )
        return self.session.scalar(statement)

    def get_by_id(self, verification_id: int) -> Verification | None:
        statement = select(Verification).where(Verification.id == verification_id)
        return self.session.scalar(statement)

    def list_archived_by_equipment_id(
        self,
        *,
        equipment_id: int,
    ) -> list[tuple[Verification, Equipment, SIVerification | None, bool]]:
        has_active_repair = exists(
            select(Repair.id).where(
                Repair.equipment_id == Verification.equipment_id,
                Repair.closed_at.is_(None),
            )
        )
        statement = (
            select(
                Verification,
                Equipment,
                SIVerification,
                has_active_repair.label("has_active_repair"),
            )
            .join(Equipment, Equipment.id == Verification.equipment_id)
            .outerjoin(SIVerification, SIVerification.equipment_id == Equipment.id)
            .where(
                Verification.equipment_id == equipment_id,
                Verification.closed_at.is_not(None),
            )
            .order_by(Verification.closed_at.desc(), Verification.id.desc())
        )
        rows = self.session.execute(statement).all()
        return [(row[0], row[1], row[2], bool(row[3])) for row in rows]

    def list_active_by_batch_key(self, *, batch_key: str) -> list[Verification]:
        statement = (
            select(Verification)
            .where(
                Verification.batch_key == batch_key,
                Verification.closed_at.is_(None),
            )
            .order_by(Verification.id.asc())
        )
        return list(self.session.scalars(statement))

    def list_queue_items(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
    ) -> list[tuple[Verification, Equipment, SIVerification | None, bool]]:
        has_active_repair = exists(
            select(Repair.id).where(
                Repair.equipment_id == Verification.equipment_id,
                Repair.closed_at.is_(None),
            )
        )
        statement = (
            select(
                Verification,
                Equipment,
                SIVerification,
                has_active_repair.label("has_active_repair"),
            )
            .join(Equipment, Equipment.id == Verification.equipment_id)
            .outerjoin(SIVerification, SIVerification.equipment_id == Equipment.id)
            .where(Equipment.equipment_type == EquipmentType.SI)
        )

        if lifecycle_status == "active":
            statement = statement.where(Verification.closed_at.is_(None)).order_by(
                Verification.sent_to_verification_at.desc(),
                Verification.created_at.desc(),
                Verification.id.desc(),
            )
        else:
            statement = statement.where(Verification.closed_at.is_not(None)).order_by(
                Verification.closed_at.desc(),
                Verification.updated_at.desc(),
                Verification.id.desc(),
            )

        if query:
            pattern = f"%{query}%"
            statement = statement.where(
                or_(
                    Equipment.object_name.ilike(pattern),
                    Equipment.name.ilike(pattern),
                    Equipment.modification.ilike(pattern),
                    Equipment.serial_number.ilike(pattern),
                    SIVerification.result_docnum.ilike(pattern),
                    SIVerification.mit_number.ilike(pattern),
                    SIVerification.mi_number.ilike(pattern),
                    Verification.batch_name.ilike(pattern),
                    Verification.route_city.ilike(pattern),
                    Verification.route_destination.ilike(pattern),
                )
            )

        rows = self.session.execute(statement).all()
        return [
            (
                row[0],
                row[1],
                row[2],
                bool(row[3]),
            )
            for row in rows
        ]


class VerificationMessageRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, message: VerificationMessage) -> VerificationMessage:
        self.session.add(message)
        self.session.flush()
        return message

    def list_by_verification(self, *, verification_id: int) -> list[VerificationMessage]:
        statement = (
            select(VerificationMessage)
            .options(selectinload(VerificationMessage.attachments))
            .where(VerificationMessage.verification_id == verification_id)
            .order_by(VerificationMessage.created_at.asc(), VerificationMessage.id.asc())
        )
        return list(self.session.scalars(statement))

    def list_by_batch_key(self, *, batch_key: str) -> list[VerificationMessage]:
        statement = (
            select(VerificationMessage)
            .options(selectinload(VerificationMessage.attachments))
            .where(VerificationMessage.batch_key == batch_key)
            .order_by(VerificationMessage.created_at.asc(), VerificationMessage.id.asc())
        )
        return list(self.session.scalars(statement))

    def get_by_id(self, message_id: int) -> VerificationMessage | None:
        statement = (
            select(VerificationMessage)
            .options(selectinload(VerificationMessage.attachments))
            .where(VerificationMessage.id == message_id)
        )
        return self.session.scalar(statement)

    def delete(self, message: VerificationMessage) -> None:
        self.session.delete(message)


class VerificationMessageAttachmentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(
        self,
        attachment: VerificationMessageAttachment,
    ) -> VerificationMessageAttachment:
        self.session.add(attachment)
        self.session.flush()
        return attachment

    def get_by_id(self, attachment_id: int) -> VerificationMessageAttachment | None:
        statement = select(VerificationMessageAttachment).where(
            VerificationMessageAttachment.id == attachment_id
        )
        return self.session.scalar(statement)

    def delete(self, attachment: VerificationMessageAttachment) -> None:
        self.session.delete(attachment)


class SIVerificationRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, si_verification: SIVerification) -> SIVerification:
        self.session.add(si_verification)
        self.session.flush()
        return si_verification

    def get_by_equipment_id(self, *, equipment_id: int) -> SIVerification | None:
        statement = select(SIVerification).where(SIVerification.equipment_id == equipment_id)
        return self.session.scalar(statement)

    def get_by_vri_id(self, *, vri_id: str) -> SIVerification | None:
        statement = select(SIVerification).where(SIVerification.vri_id == vri_id)
        return self.session.scalar(statement)
