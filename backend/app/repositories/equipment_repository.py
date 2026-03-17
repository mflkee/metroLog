from __future__ import annotations

from sqlalchemy import delete, or_, select, update
from sqlalchemy.orm import Session

from app.models.equipment import Equipment, EquipmentFolder, EquipmentGroup, EquipmentStatus, EquipmentType


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
        statement = select(Equipment).where(Equipment.id == equipment_id)
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
        statement = select(Equipment).order_by(Equipment.created_at.desc(), Equipment.id.desc())

        if folder_id is not None:
            statement = statement.where(Equipment.folder_id == folder_id)

        if group_id is not None:
            statement = statement.where(Equipment.group_id == group_id)

        if status is not None:
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

    def clear_group_for_group_id(self, *, group_id: int) -> None:
        statement = update(Equipment).where(Equipment.group_id == group_id).values(group_id=None)
        self.session.execute(statement)

    def delete_by_folder_id(self, *, folder_id: int) -> None:
        statement = delete(Equipment).where(Equipment.folder_id == folder_id)
        self.session.execute(statement)
