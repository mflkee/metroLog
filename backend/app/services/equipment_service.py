from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.equipment import (
    Equipment,
    EquipmentFolder,
    EquipmentGroup,
    EquipmentStatus,
    EquipmentType,
)
from app.repositories.equipment_repository import (
    EquipmentFolderRepository,
    EquipmentGroupRepository,
    EquipmentRepository,
)
from app.schemas.equipment import (
    EquipmentCreateRequest,
    EquipmentFolderCreateRequest,
    EquipmentFolderUpdateRequest,
    EquipmentUpdateRequest,
)


class EquipmentService:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.folders = EquipmentFolderRepository(session)
        self.groups = EquipmentGroupRepository(session)
        self.equipment = EquipmentRepository(session)

    def list_folders(self) -> list[EquipmentFolder]:
        return self.folders.list_all()

    def create_folder(self, payload: EquipmentFolderCreateRequest) -> EquipmentFolder:
        name = _normalize_required_text(payload.name, field_label="Folder name")
        description = _normalize_optional_text(payload.description)
        if self.folders.get_by_name(name) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A folder with this name already exists.",
            )

        folder = EquipmentFolder(
            name=name,
            description=description,
            sort_order=payload.sort_order,
        )
        self.folders.add(folder)
        self.session.commit()
        self.session.refresh(folder)
        return folder

    def update_folder(
        self,
        *,
        folder_id: int,
        payload: EquipmentFolderUpdateRequest,
    ) -> EquipmentFolder:
        folder = self._get_folder(folder_id)

        if "name" in payload.model_fields_set:
            name = _normalize_required_text(payload.name, field_label="Folder name")
            existing = self.folders.get_by_name(name)
            if existing is not None and existing.id != folder.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A folder with this name already exists.",
                )
            folder.name = name

        if "description" in payload.model_fields_set:
            folder.description = _normalize_optional_text(payload.description)

        if "sort_order" in payload.model_fields_set:
            folder.sort_order = payload.sort_order

        self.session.commit()
        self.session.refresh(folder)
        return folder

    def delete_folder(self, *, folder_id: int) -> None:
        folder = self._get_folder(folder_id)
        self.equipment.delete_by_folder_id(folder_id=folder.id)
        self.folders.delete(folder)
        self.session.commit()

    def list_groups(self, *, folder_id: int | None = None) -> list[EquipmentGroup]:
        if folder_id is not None:
            self._get_folder(folder_id)
        return self.groups.list_by_folder(folder_id=folder_id)

    def list_equipment(
        self,
        *,
        folder_id: int | None = None,
        group_id: int | None = None,
        query: str | None = None,
        status: EquipmentStatus | None = None,
        equipment_type: EquipmentType | None = None,
    ) -> list[Equipment]:
        if folder_id is not None:
            self._get_folder(folder_id)
        if group_id is not None:
            self._get_group(group_id)
        return self.equipment.list_all(
            folder_id=folder_id,
            group_id=group_id,
            query=query.strip() if query else None,
            status=status,
            equipment_type=equipment_type,
        )

    def get_equipment(self, *, equipment_id: int) -> Equipment:
        equipment = self.equipment.get_by_id(equipment_id)
        if equipment is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Equipment not found.",
            )
        return equipment

    def create_equipment(self, payload: EquipmentCreateRequest) -> Equipment:
        folder = self._get_folder(payload.folder_id)
        group = self._get_group(payload.group_id) if payload.group_id is not None else None
        if group is not None and group.folder_id != folder.id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Group does not belong to the selected folder.",
            )

        equipment = Equipment(
            folder_id=folder.id,
            group_id=payload.group_id,
            object_name=_normalize_required_text(payload.object_name, field_label="Object name"),
            equipment_type=payload.equipment_type,
            name=_normalize_required_text(payload.name, field_label="Equipment name"),
            modification=_normalize_optional_text(payload.modification),
            serial_number=_normalize_optional_text(payload.serial_number),
            manufacture_year=_validate_manufacture_year(payload.manufacture_year),
            status=payload.status,
            current_location_manual=_normalize_optional_text(payload.current_location_manual),
        )
        self.equipment.add(equipment)
        self.session.commit()
        self.session.refresh(equipment)
        return equipment

    def update_equipment(
        self,
        *,
        equipment_id: int,
        payload: EquipmentUpdateRequest,
    ) -> Equipment:
        equipment = self.get_equipment(equipment_id=equipment_id)
        next_folder_id = equipment.folder_id
        next_group_id = equipment.group_id

        if "folder_id" in payload.model_fields_set:
            if payload.folder_id is None:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Equipment folder_id must not be empty.",
                )
            self._get_folder(payload.folder_id)
            next_folder_id = payload.folder_id

        if "group_id" in payload.model_fields_set:
            if payload.group_id is not None:
                self._get_group(payload.group_id)
            next_group_id = payload.group_id

        if next_group_id is not None:
            next_group = self._get_group(next_group_id)
            if next_folder_id is None:
                next_folder_id = next_group.folder_id
            if next_group.folder_id != next_folder_id:
                if "folder_id" in payload.model_fields_set and "group_id" not in payload.model_fields_set:
                    next_group_id = None
                else:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Group does not belong to the selected folder.",
                    )

        equipment.folder_id = next_folder_id
        equipment.group_id = next_group_id

        if "object_name" in payload.model_fields_set:
            equipment.object_name = _normalize_required_text(
                payload.object_name,
                field_label="Object name",
            )

        if "equipment_type" in payload.model_fields_set:
            equipment.equipment_type = payload.equipment_type

        if "name" in payload.model_fields_set:
            equipment.name = _normalize_required_text(payload.name, field_label="Equipment name")

        if "modification" in payload.model_fields_set:
            equipment.modification = _normalize_optional_text(payload.modification)

        if "serial_number" in payload.model_fields_set:
            equipment.serial_number = _normalize_optional_text(payload.serial_number)

        if "manufacture_year" in payload.model_fields_set:
            equipment.manufacture_year = _validate_manufacture_year(payload.manufacture_year)

        if "status" in payload.model_fields_set:
            equipment.status = payload.status

        if "current_location_manual" in payload.model_fields_set:
            equipment.current_location_manual = _normalize_optional_text(
                payload.current_location_manual
            )

        self.session.commit()
        self.session.refresh(equipment)
        return equipment

    def delete_equipment(self, *, equipment_id: int) -> None:
        equipment = self.get_equipment(equipment_id=equipment_id)
        self.equipment.delete(equipment)
        self.session.commit()

    def _get_folder(self, folder_id: int) -> EquipmentFolder:
        folder = self.folders.get_by_id(folder_id)
        if folder is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Folder not found.",
            )
        return folder

    def _get_group(self, group_id: int) -> EquipmentGroup:
        group = self.groups.get_by_id(group_id)
        if group is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Group not found.",
            )
        return group


def _normalize_required_text(value: str | None, *, field_label: str) -> str:
    if value is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_label} must not be empty.",
        )
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


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    if not normalized:
        return None
    if len(normalized) > 255:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Field is too long. Maximum length is 255 characters.",
        )
    return normalized


def _validate_manufacture_year(value: int | None) -> int | None:
    if value is None:
        return None
    if value < 1900 or value > 2100:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Manufacture year must be between 1900 and 2100.",
        )
    return value
