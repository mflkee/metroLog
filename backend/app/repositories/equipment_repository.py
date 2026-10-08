from __future__ import annotations

from sqlalchemy import (
    String,
    case,
    cast,
    delete,
    distinct,
    exists,
    false,
    func,
    literal,
    or_,
    select,
    update,
)
from sqlalchemy.orm import Session, selectinload

from app.models.equipment import (
    DeadlinePreset,
    Equipment,
    EquipmentAttachment,
    EquipmentComment,
    EquipmentCommentAttachment,
    EquipmentESICompositionEntry,
    EquipmentFolder,
    EquipmentFolderRefreshRow,
    EquipmentFolderRefreshTask,
    EquipmentGroup,
    EquipmentProcessSubscription,
    EquipmentStatus,
    EquipmentType,
    ESIModuleKind,
    FolderProcessSubscription,
    Repair,
    RepairMessage,
    RepairMessageAttachment,
    SIVerification,
    Verification,
    VerificationMessage,
    VerificationMessageAttachment,
)
from app.models.user import User
from app.schemas.equipment import EquipmentSortDirection, EquipmentSortKey


def _queue_target_group_keys(
    *,
    batch_key_column,
    id_column,
    equipment_id_column,
    target_id: int | None,
    target_batch_key: str | None,
    target_equipment_id: int | None,
):
    """Resolve the group keys a target-navigation request points at.

    Returns a scalar subquery of matching process group keys, or ``None`` when no target was
    requested. This keeps the queue query bounded when the UI deep-links to a single repair
    or verification instead of loading every group in scope.
    """

    filters = []
    if target_batch_key:
        filters.append(batch_key_column == target_batch_key)
    if target_id is not None:
        filters.append(id_column == target_id)
    if target_equipment_id is not None:
        filters.append(equipment_id_column == target_equipment_id)
    if not filters:
        return None
    return (
        select(func.coalesce(batch_key_column, cast(id_column, String)))
        .where(or_(*filters))
        .scalar_subquery()
    )


class DeadlinePresetRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, preset: DeadlinePreset) -> DeadlinePreset:
        self.session.add(preset)
        self.session.flush()
        return preset

    def get_by_id(self, preset_id: int) -> DeadlinePreset | None:
        statement = select(DeadlinePreset).where(DeadlinePreset.id == preset_id)
        return self.session.scalar(statement)

    def get_by_code(self, code: str) -> DeadlinePreset | None:
        statement = select(DeadlinePreset).where(DeadlinePreset.code == code)
        return self.session.scalar(statement)

    def get_by_name(self, name: str) -> DeadlinePreset | None:
        statement = select(DeadlinePreset).where(DeadlinePreset.name == name)
        return self.session.scalar(statement)

    def list_all(self, *, include_inactive: bool = False) -> list[DeadlinePreset]:
        statement = select(DeadlinePreset)
        if not include_inactive:
            statement = statement.where(DeadlinePreset.is_active.is_(True))
        statement = statement.order_by(
            DeadlinePreset.is_system.desc(),
            DeadlinePreset.name.asc(),
            DeadlinePreset.id.asc(),
        )
        return list(self.session.scalars(statement))

    def count_attached_folders(self, *, preset_id: int) -> int:
        statement = select(func.count(EquipmentFolder.id)).where(
            EquipmentFolder.deadline_preset_id == preset_id
        )
        return int(self.session.scalar(statement) or 0)

    def delete(self, preset: DeadlinePreset) -> None:
        self.session.delete(preset)


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

    def normalize_transient_statuses(self) -> None:
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
        statement = (
            update(Equipment)
            .where(
                Equipment.status.in_([EquipmentStatus.IN_REPAIR, EquipmentStatus.IN_VERIFICATION]),
                ~active_repair_exists,
                ~active_verification_exists,
            )
            .values(status=EquipmentStatus.IN_WORK)
        )
        self.session.execute(statement)

    def get_by_id(self, equipment_id: int) -> Equipment | None:
        self.normalize_transient_statuses()
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

    def _build_filtered_equipment_id_statement(
        self,
        *,
        folder_id: int | None = None,
        group_id: int | None = None,
        equipment_ids: list[int] | None = None,
        query: str | None = None,
        object_name: str | None = None,
        current_location_manual: str | None = None,
        status: EquipmentStatus | None = None,
        equipment_type: EquipmentType | None = None,
        allowed_folder_ids: set[int] | None = None,
    ):
        statement = select(Equipment.id)

        if folder_id is not None:
            statement = statement.where(Equipment.folder_id == folder_id)

        if group_id is not None:
            statement = statement.where(Equipment.group_id == group_id)

        if equipment_ids:
            statement = statement.where(Equipment.id.in_(list(dict.fromkeys(equipment_ids))))

        if allowed_folder_ids is not None:
            if not allowed_folder_ids:
                return statement.where(false())
            statement = statement.where(Equipment.folder_id.in_(sorted(allowed_folder_ids)))

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

        if object_name:
            statement = statement.where(
                func.lower(func.trim(Equipment.object_name)) == object_name.strip().lower()
            )

        if current_location_manual:
            statement = statement.where(
                func.lower(func.trim(func.coalesce(Equipment.current_location_manual, "")))
                == current_location_manual.strip().lower()
            )

        return statement

    def _list_by_ids_in_order(self, equipment_ids: list[int]) -> list[Equipment]:
        if not equipment_ids:
            return []

        statement = (
            select(Equipment)
            .options(
                selectinload(Equipment.si_verification),
                selectinload(Equipment.active_repair),
                selectinload(Equipment.active_verification),
            )
            .where(Equipment.id.in_(equipment_ids))
        )
        items = list(self.session.scalars(statement))
        items_by_id = {item.id: item for item in items}
        return [
            items_by_id[equipment_id]
            for equipment_id in equipment_ids
            if equipment_id in items_by_id
        ]

    def _build_next_due_order_expression(self):
        dialect_name = self.session.get_bind().dialect.name
        compliance_next_due_expression = None

        if dialect_name == "postgresql":
            compliance_next_due_expression = cast(
                Equipment.compliance_date
                + func.make_interval(0, Equipment.compliance_interval_months),
                String,
            )
        elif dialect_name == "sqlite":
            compliance_next_due_expression = func.date(
                Equipment.compliance_date,
                func.printf("+%s months", Equipment.compliance_interval_months),
            )

        return case(
            (
                Equipment.equipment_type.in_([EquipmentType.SI, EquipmentType.ESI]),
                cast(SIVerification.valid_date, String),
            ),
            (
                Equipment.equipment_type.in_([EquipmentType.IO, EquipmentType.VO]),
                compliance_next_due_expression,
            ),
            else_=None,
        )

    def _build_equipment_sort_expression(self, *, sort_key: EquipmentSortKey):
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

        if sort_key == "equipmentType":
            return case(
                (Equipment.equipment_type == EquipmentType.SI, 0),
                (Equipment.equipment_type == EquipmentType.ESI, 1),
                (Equipment.equipment_type == EquipmentType.IO, 2),
                (Equipment.equipment_type == EquipmentType.VO, 3),
                (Equipment.equipment_type == EquipmentType.OTHER, 4),
                else_=999,
            )
        if sort_key == "status":
            return case(
                (active_repair_exists & active_verification_exists, 3),
                (active_verification_exists, 1),
                (active_repair_exists, 2),
                (Equipment.status == EquipmentStatus.IN_WORK, 0),
                (Equipment.status == EquipmentStatus.ARCHIVED, 4),
                else_=999,
            )
        if sort_key == "manufactureYear":
            return Equipment.manufacture_year
        if sort_key == "name":
            return func.lower(
                func.trim(Equipment.name + literal(" ") + func.coalesce(Equipment.modification, ""))
            )
        if sort_key == "serialNumber":
            return func.lower(func.coalesce(Equipment.serial_number, ""))
        if sort_key == "objectName":
            return func.lower(Equipment.object_name)
        if sort_key == "currentLocationManual":
            return func.lower(func.coalesce(Equipment.current_location_manual, ""))
        if sort_key == "validFrom":
            return case(
                (
                    Equipment.equipment_type.in_([EquipmentType.SI, EquipmentType.ESI]),
                    cast(SIVerification.verification_date, String),
                ),
                (
                    Equipment.equipment_type.in_([EquipmentType.IO, EquipmentType.VO]),
                    cast(Equipment.compliance_date, String),
                ),
                else_=None,
            )
        if sort_key == "validTo":
            return self._build_next_due_order_expression()
        raise ValueError(f"Unsupported equipment sort key: {sort_key}")

    def _apply_ordering_to_equipment_id_statement(
        self,
        statement,
        *,
        sort_key: EquipmentSortKey | None = None,
        sort_direction: EquipmentSortDirection = "asc",
    ):
        if sort_key in {"validFrom", "validTo"}:
            statement = statement.outerjoin(
                SIVerification,
                SIVerification.equipment_id == Equipment.id,
            )

        if sort_key is None:
            return statement.order_by(Equipment.created_at.desc(), Equipment.id.desc())

        sort_expression = self._build_equipment_sort_expression(sort_key=sort_key)
        if sort_key in {"manufactureYear", "validFrom", "validTo"}:
            null_ordering = (
                sort_expression.is_(None).desc()
                if sort_direction == "desc"
                else sort_expression.is_(None).asc()
            )
            value_ordering = (
                sort_expression.desc() if sort_direction == "desc" else sort_expression.asc()
            )
            return statement.order_by(
                null_ordering,
                value_ordering,
                Equipment.created_at.desc(),
                Equipment.id.desc(),
            )

        return statement.order_by(
            sort_expression.desc() if sort_direction == "desc" else sort_expression.asc(),
            Equipment.created_at.desc(),
            Equipment.id.desc(),
        )

    def list_all(
        self,
        *,
        folder_id: int | None = None,
        group_id: int | None = None,
        equipment_ids: list[int] | None = None,
        query: str | None = None,
        object_name: str | None = None,
        current_location_manual: str | None = None,
        status: EquipmentStatus | None = None,
        equipment_type: EquipmentType | None = None,
        allowed_folder_ids: set[int] | None = None,
    ) -> list[Equipment]:
        self.normalize_transient_statuses()
        equipment_id_statement = self._build_filtered_equipment_id_statement(
            folder_id=folder_id,
            group_id=group_id,
            equipment_ids=equipment_ids,
            query=query,
            object_name=object_name,
            current_location_manual=current_location_manual,
            status=status,
            equipment_type=equipment_type,
            allowed_folder_ids=allowed_folder_ids,
        ).order_by(Equipment.created_at.desc(), Equipment.id.desc())
        equipment_ids_in_order = list(self.session.scalars(equipment_id_statement))
        return self._list_by_ids_in_order(equipment_ids_in_order)

    def list_page(
        self,
        *,
        folder_id: int | None = None,
        group_id: int | None = None,
        equipment_ids: list[int] | None = None,
        query: str | None = None,
        object_name: str | None = None,
        current_location_manual: str | None = None,
        status: EquipmentStatus | None = None,
        equipment_type: EquipmentType | None = None,
        allowed_folder_ids: set[int] | None = None,
        limit: int = 100,
        offset: int = 0,
        sort_key: EquipmentSortKey | None = None,
        sort_direction: EquipmentSortDirection = "asc",
    ) -> tuple[list[Equipment], int]:
        self.normalize_transient_statuses()
        filtered_equipment_id_statement = self._build_filtered_equipment_id_statement(
            folder_id=folder_id,
            group_id=group_id,
            equipment_ids=equipment_ids,
            query=query,
            object_name=object_name,
            current_location_manual=current_location_manual,
            status=status,
            equipment_type=equipment_type,
            allowed_folder_ids=allowed_folder_ids,
        )
        total = (
            self.session.scalar(
                select(func.count()).select_from(filtered_equipment_id_statement.subquery())
            )
            or 0
        )
        page_equipment_ids = list(
            self.session.scalars(
                self._apply_ordering_to_equipment_id_statement(
                    filtered_equipment_id_statement,
                    sort_key=sort_key,
                    sort_direction=sort_direction,
                )
                .limit(limit)
                .offset(offset)
            )
        )
        return self._list_by_ids_in_order(page_equipment_ids), total

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

    def list_distinct_measurement_units(self, *, folder_id: int) -> list[str]:
        statement = (
            select(distinct(Equipment.measurement_unit))
            .where(
                Equipment.folder_id == folder_id,
                Equipment.equipment_type.in_([EquipmentType.SI, EquipmentType.ESI]),
                Equipment.measurement_unit.is_not(None),
                Equipment.measurement_unit != "",
            )
            .order_by(Equipment.measurement_unit.asc())
        )
        return [value for value in self.session.scalars(statement) if value]

    def list_folder_ids_by_equipment_ids(self, *, equipment_ids: list[int]) -> list[int]:
        normalized_ids = list(dict.fromkeys(equipment_ids))
        if not normalized_ids:
            return []

        statement = (
            select(distinct(Equipment.folder_id))
            .where(
                Equipment.id.in_(normalized_ids),
                Equipment.folder_id.is_not(None),
            )
            .order_by(Equipment.folder_id.asc())
        )
        return [int(value) for value in self.session.scalars(statement) if value is not None]

    def clear_group_for_group_id(self, *, group_id: int) -> None:
        statement = update(Equipment).where(Equipment.group_id == group_id).values(group_id=None)
        self.session.execute(statement)

    def delete_by_folder_id(self, *, folder_id: int) -> None:
        statement = delete(Equipment).where(Equipment.folder_id == folder_id)
        self.session.execute(statement)


class EquipmentProcessSubscriptionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, subscription: EquipmentProcessSubscription) -> EquipmentProcessSubscription:
        self.session.add(subscription)
        self.session.flush()
        return subscription

    def get_by_equipment_and_user(
        self,
        *,
        equipment_id: int,
        user_id: int,
    ) -> EquipmentProcessSubscription | None:
        statement = select(EquipmentProcessSubscription).where(
            EquipmentProcessSubscription.equipment_id == equipment_id,
            EquipmentProcessSubscription.user_id == user_id,
        )
        return self.session.scalar(statement)

    def is_enabled(self, *, equipment_id: int, user_id: int) -> bool:
        statement = (
            select(EquipmentProcessSubscription.id)
            .where(
                EquipmentProcessSubscription.equipment_id == equipment_id,
                EquipmentProcessSubscription.user_id == user_id,
            )
            .limit(1)
        )
        return self.session.scalar(statement) is not None

    def list_active_users_by_equipment_ids(self, *, equipment_ids: list[int]) -> list[User]:
        normalized_ids = list(dict.fromkeys(equipment_ids))
        if not normalized_ids:
            return []

        subscribed_user_ids = (
            select(EquipmentProcessSubscription.user_id)
            .where(EquipmentProcessSubscription.equipment_id.in_(normalized_ids))
            .distinct()
        )
        statement = (
            select(User)
            .where(
                User.is_active.is_(True),
                User.id.in_(subscribed_user_ids),
            )
            .order_by(User.last_name.asc(), User.first_name.asc(), User.id.asc())
        )
        return list(self.session.scalars(statement))

    def delete(self, subscription: EquipmentProcessSubscription) -> None:
        self.session.delete(subscription)
        self.session.flush()

    def delete_by_equipment_id(self, *, equipment_id: int) -> None:
        self.session.execute(
            delete(EquipmentProcessSubscription).where(
                EquipmentProcessSubscription.equipment_id == equipment_id
            )
        )

    def delete_by_folder_id(self, *, folder_id: int) -> None:
        equipment_ids = select(Equipment.id).where(Equipment.folder_id == folder_id)
        self.session.execute(
            delete(EquipmentProcessSubscription).where(
                EquipmentProcessSubscription.equipment_id.in_(equipment_ids)
            )
        )


class FolderProcessSubscriptionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, subscription: FolderProcessSubscription) -> FolderProcessSubscription:
        self.session.add(subscription)
        self.session.flush()
        return subscription

    def list_by_folder_id(self, *, folder_id: int) -> list[FolderProcessSubscription]:
        statement = select(FolderProcessSubscription).where(
            FolderProcessSubscription.folder_id == folder_id
        )
        return list(self.session.scalars(statement))

    def list_subscribed_user_ids_by_folder_id(self, *, folder_id: int) -> set[int]:
        statement = select(FolderProcessSubscription.user_id).where(
            FolderProcessSubscription.folder_id == folder_id
        )
        return {int(value) for value in self.session.scalars(statement)}

    def list_active_users_by_folder_ids(self, *, folder_ids: list[int]) -> list[User]:
        normalized_ids = list(dict.fromkeys(folder_ids))
        if not normalized_ids:
            return []

        subscribed_user_ids = (
            select(FolderProcessSubscription.user_id)
            .where(FolderProcessSubscription.folder_id.in_(normalized_ids))
            .distinct()
        )
        statement = (
            select(User)
            .where(
                User.is_active.is_(True),
                User.id.in_(subscribed_user_ids),
            )
            .order_by(User.last_name.asc(), User.first_name.asc(), User.id.asc())
        )
        return list(self.session.scalars(statement))

    def delete(self, subscription: FolderProcessSubscription) -> None:
        self.session.delete(subscription)
        self.session.flush()

    def delete_by_folder_id(self, *, folder_id: int) -> None:
        self.session.execute(
            delete(FolderProcessSubscription).where(
                FolderProcessSubscription.folder_id == folder_id
            )
        )


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
        statement = (
            select(EquipmentComment)
            .options(selectinload(EquipmentComment.attachments))
            .where(EquipmentComment.id == comment_id)
        )
        return self.session.scalar(statement)

    def list_by_equipment(
        self,
        *,
        equipment_id: int,
        include_private: bool = True,
    ) -> list[EquipmentComment]:
        statement = (
            select(EquipmentComment)
            .options(selectinload(EquipmentComment.attachments))
            .where(EquipmentComment.equipment_id == equipment_id)
            .order_by(EquipmentComment.created_at.asc(), EquipmentComment.id.asc())
        )
        if not include_private:
            statement = statement.where(EquipmentComment.is_private.is_(False))
        return list(self.session.scalars(statement))

    def delete(self, comment: EquipmentComment) -> None:
        self.session.delete(comment)


class EquipmentCommentAttachmentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, attachment: EquipmentCommentAttachment) -> EquipmentCommentAttachment:
        self.session.add(attachment)
        self.session.flush()
        return attachment

    def get_by_id(self, attachment_id: int) -> EquipmentCommentAttachment | None:
        statement = select(EquipmentCommentAttachment).where(
            EquipmentCommentAttachment.id == attachment_id
        )
        return self.session.scalar(statement)

    def delete(self, attachment: EquipmentCommentAttachment) -> None:
        self.session.delete(attachment)


class RepairRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def _build_queue_rows_statement(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
        folder_id: int | None = None,
        allowed_folder_ids: set[int] | None = None,
    ):
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
            statement = statement.where(Repair.closed_at.is_(None))
        else:
            statement = statement.where(Repair.closed_at.is_not(None))

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
                    Repair.batch_name.ilike(pattern),
                    Repair.route_city.ilike(pattern),
                    Repair.route_destination.ilike(pattern),
                )
            )

        if folder_id is not None:
            statement = statement.where(Equipment.folder_id == folder_id)

        if allowed_folder_ids is not None:
            statement = statement.where(Equipment.folder_id.in_(sorted(allowed_folder_ids)))

        return statement

    def _build_queue_groups_statement(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
        folder_id: int | None = None,
        allowed_folder_ids: set[int] | None = None,
    ):
        group_key = func.coalesce(Repair.batch_key, cast(Repair.id, String))
        statement = (
            select(
                group_key.label("group_key"),
                func.count(Repair.id).label("group_size"),
            )
            .select_from(Repair)
            .join(Equipment, Equipment.id == Repair.equipment_id)
            .outerjoin(SIVerification, SIVerification.equipment_id == Equipment.id)
        )

        if lifecycle_status == "active":
            statement = (
                statement.where(Repair.closed_at.is_(None))
                .group_by(group_key)
                .order_by(
                    func.max(Repair.sent_to_repair_at).desc(),
                    func.max(Repair.created_at).desc(),
                    func.max(Repair.id).desc(),
                )
            )
        else:
            statement = (
                statement.where(Repair.closed_at.is_not(None))
                .group_by(group_key)
                .order_by(
                    func.max(Repair.closed_at).desc(),
                    func.max(Repair.updated_at).desc(),
                    func.max(Repair.id).desc(),
                )
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
                    Repair.batch_name.ilike(pattern),
                    Repair.route_city.ilike(pattern),
                    Repair.route_destination.ilike(pattern),
                )
            )

        if folder_id is not None:
            statement = statement.where(Equipment.folder_id == folder_id)

        if allowed_folder_ids is not None:
            statement = statement.where(Equipment.folder_id.in_(sorted(allowed_folder_ids)))

        return statement

    def _apply_queue_ordering(self, statement, *, lifecycle_status: str):
        if lifecycle_status == "active":
            return statement.order_by(
                Repair.sent_to_repair_at.desc(),
                Repair.created_at.desc(),
                Repair.id.desc(),
            )
        return statement.order_by(
            Repair.closed_at.desc(),
            Repair.updated_at.desc(),
            Repair.id.desc(),
        )

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

    def delete(self, repair: Repair) -> None:
        self.session.delete(repair)

    def list_active_by_batch_key(self, *, batch_key: str) -> list[Repair]:
        statement = (
            select(Repair)
            .where(
                Repair.batch_key == batch_key,
                Repair.closed_at.is_(None),
            )
            .order_by(Repair.id.asc())
        )
        return list(self.session.scalars(statement))

    def list_archived_by_batch_key(self, *, batch_key: str) -> list[Repair]:
        statement = (
            select(Repair)
            .where(
                Repair.batch_key == batch_key,
                Repair.closed_at.is_not(None),
            )
            .order_by(Repair.id.asc())
        )
        return list(self.session.scalars(statement))

    def list_archived_by_equipment_id(
        self,
        *,
        equipment_id: int,
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
            .where(
                Repair.equipment_id == equipment_id,
                Repair.closed_at.is_not(None),
            )
            .order_by(Repair.closed_at.desc(), Repair.id.desc())
        )
        rows = self.session.execute(statement).all()
        return [(row[0], row[1], row[2], bool(row[3])) for row in rows]

    def list_queue_items(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
        folder_id: int | None = None,
        allowed_folder_ids: set[int] | None = None,
        target_id: int | None = None,
        target_batch_key: str | None = None,
        target_equipment_id: int | None = None,
    ) -> list[tuple[Repair, Equipment, SIVerification | None, bool]]:
        if allowed_folder_ids is not None:
            if not allowed_folder_ids:
                return []
        statement = self._build_queue_rows_statement(
            lifecycle_status=lifecycle_status,
            query=query,
            folder_id=folder_id,
            allowed_folder_ids=allowed_folder_ids,
        )
        target_keys = _queue_target_group_keys(
            batch_key_column=Repair.batch_key,
            id_column=Repair.id,
            equipment_id_column=Repair.equipment_id,
            target_id=target_id,
            target_batch_key=target_batch_key,
            target_equipment_id=target_equipment_id,
        )
        if target_keys is not None:
            group_key = func.coalesce(Repair.batch_key, cast(Repair.id, String))
            statement = statement.where(group_key.in_(target_keys))
        statement = self._apply_queue_ordering(statement, lifecycle_status=lifecycle_status)
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

    def list_queue_page_items(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
        folder_id: int | None = None,
        allowed_folder_ids: set[int] | None = None,
        limit: int,
        offset: int,
    ) -> tuple[list[tuple[Repair, Equipment, SIVerification | None, bool]], int, int]:
        if allowed_folder_ids is not None and not allowed_folder_ids:
            return [], 0, 0

        groups_statement = self._build_queue_groups_statement(
            lifecycle_status=lifecycle_status,
            query=query,
            folder_id=folder_id,
            allowed_folder_ids=allowed_folder_ids,
        )
        grouped_rows = groups_statement.order_by(None).subquery()
        total_groups, total_items = self.session.execute(
            select(
                func.count().label("total_groups"),
                func.coalesce(func.sum(grouped_rows.c.group_size), 0).label("total_items"),
            ).select_from(grouped_rows)
        ).one()
        total_groups = int(total_groups or 0)
        total_items = int(total_items or 0)
        if total_groups == 0 or total_items == 0:
            return [], total_groups, total_items

        page_group_keys = list(self.session.scalars(groups_statement.offset(offset).limit(limit)))
        if not page_group_keys:
            return [], total_groups, total_items

        group_key = func.coalesce(Repair.batch_key, cast(Repair.id, String))
        statement = self._build_queue_rows_statement(
            lifecycle_status=lifecycle_status,
            query=query,
            folder_id=folder_id,
            allowed_folder_ids=allowed_folder_ids,
        ).where(group_key.in_(page_group_keys))
        statement = self._apply_queue_ordering(statement, lifecycle_status=lifecycle_status)

        rows = self.session.execute(statement).all()
        return (
            [
                (
                    row[0],
                    row[1],
                    row[2],
                    bool(row[3]),
                )
                for row in rows
            ],
            total_groups,
            total_items,
        )

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

    def list_distinct_batch_names(self, *, folder_id: int) -> list[str]:
        statement = (
            select(distinct(Repair.batch_name))
            .join(Equipment, Equipment.id == Repair.equipment_id)
            .where(
                Equipment.folder_id == folder_id,
                Repair.batch_name.is_not(None),
                Repair.batch_name != "",
            )
            .order_by(Repair.batch_name.asc())
        )
        return [value for value in self.session.scalars(statement) if value]


class RepairMessageRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, message: RepairMessage) -> RepairMessage:
        self.session.add(message)
        self.session.flush()
        return message

    def list_by_repair(
        self,
        *,
        repair_id: int,
        include_private: bool = True,
    ) -> list[RepairMessage]:
        statement = (
            select(RepairMessage)
            .options(selectinload(RepairMessage.attachments))
            .where(RepairMessage.repair_id == repair_id)
            .order_by(RepairMessage.created_at.asc(), RepairMessage.id.asc())
        )
        if not include_private:
            statement = statement.where(RepairMessage.is_private.is_(False))
        return list(self.session.scalars(statement))

    def list_by_batch_key(
        self,
        *,
        batch_key: str,
        include_private: bool = True,
    ) -> list[RepairMessage]:
        statement = (
            select(RepairMessage)
            .options(selectinload(RepairMessage.attachments))
            .where(RepairMessage.batch_key == batch_key)
            .order_by(RepairMessage.created_at.asc(), RepairMessage.id.asc())
        )
        if not include_private:
            statement = statement.where(RepairMessage.is_private.is_(False))
        return list(self.session.scalars(statement))

    def count_by_repair(
        self,
        *,
        repair_id: int,
        include_private: bool = True,
    ) -> int:
        statement = select(func.count()).where(RepairMessage.repair_id == repair_id)
        if not include_private:
            statement = statement.where(RepairMessage.is_private.is_(False))
        return int(self.session.scalar(statement) or 0)

    def count_by_batch_key(
        self,
        *,
        batch_key: str,
        include_private: bool = True,
    ) -> int:
        statement = select(func.count()).where(RepairMessage.batch_key == batch_key)
        if not include_private:
            statement = statement.where(RepairMessage.is_private.is_(False))
        return int(self.session.scalar(statement) or 0)

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

    def _build_queue_rows_statement(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
        folder_id: int | None = None,
        allowed_folder_ids: set[int] | None = None,
    ):
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
            .where(Equipment.equipment_type.in_([EquipmentType.SI, EquipmentType.ESI]))
        )

        if lifecycle_status == "active":
            statement = statement.where(Verification.closed_at.is_(None))
        else:
            statement = statement.where(Verification.closed_at.is_not(None))

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

        if folder_id is not None:
            statement = statement.where(Equipment.folder_id == folder_id)

        if allowed_folder_ids is not None:
            statement = statement.where(Equipment.folder_id.in_(sorted(allowed_folder_ids)))

        return statement

    def _build_queue_groups_statement(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
        folder_id: int | None = None,
        allowed_folder_ids: set[int] | None = None,
    ):
        group_key = func.coalesce(Verification.batch_key, cast(Verification.id, String))
        statement = (
            select(
                group_key.label("group_key"),
                func.count(Verification.id).label("group_size"),
            )
            .select_from(Verification)
            .join(Equipment, Equipment.id == Verification.equipment_id)
            .outerjoin(SIVerification, SIVerification.equipment_id == Equipment.id)
            .where(Equipment.equipment_type.in_([EquipmentType.SI, EquipmentType.ESI]))
        )

        if lifecycle_status == "active":
            statement = (
                statement.where(Verification.closed_at.is_(None))
                .group_by(group_key)
                .order_by(
                    func.max(Verification.sent_to_verification_at).desc(),
                    func.max(Verification.created_at).desc(),
                    func.max(Verification.id).desc(),
                )
            )
        else:
            statement = (
                statement.where(Verification.closed_at.is_not(None))
                .group_by(group_key)
                .order_by(
                    func.max(Verification.closed_at).desc(),
                    func.max(Verification.updated_at).desc(),
                    func.max(Verification.id).desc(),
                )
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

        if folder_id is not None:
            statement = statement.where(Equipment.folder_id == folder_id)

        if allowed_folder_ids is not None:
            statement = statement.where(Equipment.folder_id.in_(sorted(allowed_folder_ids)))

        return statement

    def _apply_queue_ordering(self, statement, *, lifecycle_status: str):
        if lifecycle_status == "active":
            return statement.order_by(
                Verification.sent_to_verification_at.desc(),
                Verification.created_at.desc(),
                Verification.id.desc(),
            )
        return statement.order_by(
            Verification.closed_at.desc(),
            Verification.updated_at.desc(),
            Verification.id.desc(),
        )

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

    def delete(self, verification: Verification) -> None:
        self.session.delete(verification)

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

    def list_archived_by_batch_key(self, *, batch_key: str) -> list[Verification]:
        statement = (
            select(Verification)
            .where(
                Verification.batch_key == batch_key,
                Verification.closed_at.is_not(None),
            )
            .order_by(Verification.id.asc())
        )
        return list(self.session.scalars(statement))

    def list_queue_items(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
        folder_id: int | None = None,
        allowed_folder_ids: set[int] | None = None,
        target_id: int | None = None,
        target_batch_key: str | None = None,
        target_equipment_id: int | None = None,
    ) -> list[tuple[Verification, Equipment, SIVerification | None, bool]]:
        if allowed_folder_ids is not None:
            if not allowed_folder_ids:
                return []
        statement = self._build_queue_rows_statement(
            lifecycle_status=lifecycle_status,
            query=query,
            folder_id=folder_id,
            allowed_folder_ids=allowed_folder_ids,
        )
        target_keys = _queue_target_group_keys(
            batch_key_column=Verification.batch_key,
            id_column=Verification.id,
            equipment_id_column=Verification.equipment_id,
            target_id=target_id,
            target_batch_key=target_batch_key,
            target_equipment_id=target_equipment_id,
        )
        if target_keys is not None:
            group_key = func.coalesce(Verification.batch_key, cast(Verification.id, String))
            statement = statement.where(group_key.in_(target_keys))
        statement = self._apply_queue_ordering(statement, lifecycle_status=lifecycle_status)
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

    def list_queue_page_items(
        self,
        *,
        lifecycle_status: str,
        query: str | None = None,
        folder_id: int | None = None,
        allowed_folder_ids: set[int] | None = None,
        limit: int,
        offset: int,
    ) -> tuple[list[tuple[Verification, Equipment, SIVerification | None, bool]], int, int]:
        if allowed_folder_ids is not None and not allowed_folder_ids:
            return [], 0, 0

        groups_statement = self._build_queue_groups_statement(
            lifecycle_status=lifecycle_status,
            query=query,
            folder_id=folder_id,
            allowed_folder_ids=allowed_folder_ids,
        )
        grouped_rows = groups_statement.order_by(None).subquery()
        total_groups, total_items = self.session.execute(
            select(
                func.count().label("total_groups"),
                func.coalesce(func.sum(grouped_rows.c.group_size), 0).label("total_items"),
            ).select_from(grouped_rows)
        ).one()
        total_groups = int(total_groups or 0)
        total_items = int(total_items or 0)
        if total_groups == 0 or total_items == 0:
            return [], total_groups, total_items

        page_group_keys = list(self.session.scalars(groups_statement.offset(offset).limit(limit)))
        if not page_group_keys:
            return [], total_groups, total_items

        group_key = func.coalesce(Verification.batch_key, cast(Verification.id, String))
        statement = self._build_queue_rows_statement(
            lifecycle_status=lifecycle_status,
            query=query,
            folder_id=folder_id,
            allowed_folder_ids=allowed_folder_ids,
        ).where(group_key.in_(page_group_keys))
        statement = self._apply_queue_ordering(statement, lifecycle_status=lifecycle_status)

        rows = self.session.execute(statement).all()
        return (
            [
                (
                    row[0],
                    row[1],
                    row[2],
                    bool(row[3]),
                )
                for row in rows
            ],
            total_groups,
            total_items,
        )

    def list_distinct_batch_names(self, *, folder_id: int) -> list[str]:
        statement = (
            select(distinct(Verification.batch_name))
            .join(Equipment, Equipment.id == Verification.equipment_id)
            .where(
                Equipment.folder_id == folder_id,
                Verification.batch_name.is_not(None),
                Verification.batch_name != "",
            )
            .order_by(Verification.batch_name.asc())
        )
        return [value for value in self.session.scalars(statement) if value]


class VerificationMessageRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, message: VerificationMessage) -> VerificationMessage:
        self.session.add(message)
        self.session.flush()
        return message

    def list_by_verification(
        self,
        *,
        verification_id: int,
        include_private: bool = True,
    ) -> list[VerificationMessage]:
        statement = (
            select(VerificationMessage)
            .options(selectinload(VerificationMessage.attachments))
            .where(VerificationMessage.verification_id == verification_id)
            .order_by(VerificationMessage.created_at.asc(), VerificationMessage.id.asc())
        )
        if not include_private:
            statement = statement.where(VerificationMessage.is_private.is_(False))
        return list(self.session.scalars(statement))

    def list_by_batch_key(
        self,
        *,
        batch_key: str,
        include_private: bool = True,
    ) -> list[VerificationMessage]:
        statement = (
            select(VerificationMessage)
            .options(selectinload(VerificationMessage.attachments))
            .where(VerificationMessage.batch_key == batch_key)
            .order_by(VerificationMessage.created_at.asc(), VerificationMessage.id.asc())
        )
        if not include_private:
            statement = statement.where(VerificationMessage.is_private.is_(False))
        return list(self.session.scalars(statement))

    def count_by_verification(
        self,
        *,
        verification_id: int,
        include_private: bool = True,
    ) -> int:
        statement = select(func.count()).where(
            VerificationMessage.verification_id == verification_id
        )
        if not include_private:
            statement = statement.where(VerificationMessage.is_private.is_(False))
        return int(self.session.scalar(statement) or 0)

    def count_by_batch_key(
        self,
        *,
        batch_key: str,
        include_private: bool = True,
    ) -> int:
        statement = select(func.count()).where(VerificationMessage.batch_key == batch_key)
        if not include_private:
            statement = statement.where(VerificationMessage.is_private.is_(False))
        return int(self.session.scalar(statement) or 0)

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


class EquipmentESICompositionRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(
        self,
        entry: EquipmentESICompositionEntry,
    ) -> EquipmentESICompositionEntry:
        self.session.add(entry)
        self.session.flush()
        return entry

    def list_by_equipment_id(self, *, equipment_id: int) -> list[EquipmentESICompositionEntry]:
        statement = (
            select(EquipmentESICompositionEntry)
            .where(EquipmentESICompositionEntry.equipment_id == equipment_id)
            .order_by(
                EquipmentESICompositionEntry.sort_order.asc(),
                EquipmentESICompositionEntry.created_at.asc(),
                EquipmentESICompositionEntry.id.asc(),
            )
        )
        return list(self.session.scalars(statement))

    def list_by_equipment_id_and_kind(
        self,
        *,
        equipment_id: int,
        module_kind: ESIModuleKind,
    ) -> list[EquipmentESICompositionEntry]:
        statement = (
            select(EquipmentESICompositionEntry)
            .where(
                EquipmentESICompositionEntry.equipment_id == equipment_id,
                EquipmentESICompositionEntry.module_kind == module_kind,
            )
            .order_by(
                EquipmentESICompositionEntry.sort_order.asc(),
                EquipmentESICompositionEntry.created_at.asc(),
                EquipmentESICompositionEntry.id.asc(),
            )
        )
        return list(self.session.scalars(statement))

    def get_by_equipment_and_vri_id(
        self,
        *,
        equipment_id: int,
        vri_id: str,
    ) -> EquipmentESICompositionEntry | None:
        statement = select(EquipmentESICompositionEntry).where(
            EquipmentESICompositionEntry.equipment_id == equipment_id,
            EquipmentESICompositionEntry.vri_id == vri_id,
        )
        return self.session.scalar(statement)

    def get_by_id(self, *, entry_id: int) -> EquipmentESICompositionEntry | None:
        statement = select(EquipmentESICompositionEntry).where(
            EquipmentESICompositionEntry.id == entry_id
        )
        return self.session.scalar(statement)

    def delete(self, entry: EquipmentESICompositionEntry) -> None:
        self.session.delete(entry)


class EquipmentFolderRefreshTaskRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, task: EquipmentFolderRefreshTask) -> EquipmentFolderRefreshTask:
        self.session.add(task)
        self.session.flush()
        return task

    def get_by_id(self, *, task_id: int) -> EquipmentFolderRefreshTask | None:
        statement = select(EquipmentFolderRefreshTask).where(
            EquipmentFolderRefreshTask.id == task_id
        )
        return self.session.scalar(statement)

    def list_latest_by_folder_id(
        self,
        *,
        folder_id: int,
        limit: int = 10,
    ) -> list[EquipmentFolderRefreshTask]:
        statement = (
            select(EquipmentFolderRefreshTask)
            .where(EquipmentFolderRefreshTask.folder_id == folder_id)
            .order_by(
                EquipmentFolderRefreshTask.created_at.desc(),
                EquipmentFolderRefreshTask.id.desc(),
            )
            .limit(limit)
        )
        return list(self.session.scalars(statement))


class EquipmentFolderRefreshRowRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, row: EquipmentFolderRefreshRow) -> EquipmentFolderRefreshRow:
        self.session.add(row)
        self.session.flush()
        return row

    def list_by_task_id(self, *, task_id: int) -> list[EquipmentFolderRefreshRow]:
        statement = (
            select(EquipmentFolderRefreshRow)
            .where(EquipmentFolderRefreshRow.task_id == task_id)
            .order_by(
                EquipmentFolderRefreshRow.sort_order.asc(),
                EquipmentFolderRefreshRow.id.asc(),
            )
        )
        return list(self.session.scalars(statement))

    def list_by_task_id_and_ids(
        self,
        *,
        task_id: int,
        row_ids: list[int],
    ) -> list[EquipmentFolderRefreshRow]:
        normalized_ids = list(dict.fromkeys(row_ids))
        if not normalized_ids:
            return []
        statement = (
            select(EquipmentFolderRefreshRow)
            .where(
                EquipmentFolderRefreshRow.task_id == task_id,
                EquipmentFolderRefreshRow.id.in_(normalized_ids),
            )
            .order_by(
                EquipmentFolderRefreshRow.sort_order.asc(),
                EquipmentFolderRefreshRow.id.asc(),
            )
        )
        return list(self.session.scalars(statement))

    def delete_by_task_id(self, *, task_id: int) -> None:
        self.session.execute(
            delete(EquipmentFolderRefreshRow).where(EquipmentFolderRefreshRow.task_id == task_id)
        )
