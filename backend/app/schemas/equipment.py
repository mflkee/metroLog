from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.equipment import EquipmentStatus, EquipmentType


class EquipmentFolderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class EquipmentFolderCreateRequest(BaseModel):
    name: str
    description: str | None = None
    sort_order: int = 0


class EquipmentFolderUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    sort_order: int | None = None


class EquipmentGroupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    folder_id: int
    name: str
    description: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class EquipmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    folder_id: int | None
    group_id: int | None
    object_name: str
    equipment_type: EquipmentType
    name: str
    modification: str | None
    serial_number: str | None
    manufacture_year: int | None
    status: EquipmentStatus
    current_location_manual: str | None
    created_at: datetime
    updated_at: datetime


class EquipmentCreateRequest(BaseModel):
    folder_id: int
    group_id: int | None = None
    object_name: str
    equipment_type: EquipmentType = EquipmentType.OTHER
    name: str
    modification: str | None = None
    serial_number: str | None = None
    manufacture_year: int | None = None
    status: EquipmentStatus = EquipmentStatus.ACTIVE
    current_location_manual: str | None = None


class EquipmentUpdateRequest(BaseModel):
    folder_id: int | None = None
    group_id: int | None = None
    object_name: str | None = None
    equipment_type: EquipmentType | None = None
    name: str | None = None
    modification: str | None = None
    serial_number: str | None = None
    manufacture_year: int | None = None
    status: EquipmentStatus | None = None
    current_location_manual: str | None = None
