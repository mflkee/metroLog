from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession, OperatorUser
from app.models.equipment import EquipmentStatus, EquipmentType
from app.schemas.equipment import (
    EquipmentCreateRequest,
    EquipmentFolderCreateRequest,
    EquipmentFolderRead,
    EquipmentFolderUpdateRequest,
    EquipmentGroupRead,
    EquipmentRead,
    EquipmentUpdateRequest,
)
from app.services.equipment_service import EquipmentService

router = APIRouter(prefix="/equipment")


@router.get("/folders", response_model=list[EquipmentFolderRead])
async def list_folders(
    _: CurrentUser,
    db: DbSession,
) -> list[EquipmentFolderRead]:
    folders = EquipmentService(db).list_folders()
    return [EquipmentFolderRead.model_validate(folder) for folder in folders]


@router.post("/folders", response_model=EquipmentFolderRead, status_code=201)
async def create_folder(
    payload: EquipmentFolderCreateRequest,
    _: OperatorUser,
    db: DbSession,
) -> EquipmentFolderRead:
    folder = EquipmentService(db).create_folder(payload)
    return EquipmentFolderRead.model_validate(folder)


@router.patch("/folders/{folder_id}", response_model=EquipmentFolderRead)
async def update_folder(
    folder_id: int,
    payload: EquipmentFolderUpdateRequest,
    _: OperatorUser,
    db: DbSession,
) -> EquipmentFolderRead:
    folder = EquipmentService(db).update_folder(folder_id=folder_id, payload=payload)
    return EquipmentFolderRead.model_validate(folder)


@router.delete("/folders/{folder_id}", status_code=204)
async def delete_folder(
    folder_id: int,
    _: OperatorUser,
    db: DbSession,
) -> None:
    EquipmentService(db).delete_folder(folder_id=folder_id)


@router.get("/groups", response_model=list[EquipmentGroupRead])
async def list_groups(
    _: CurrentUser,
    db: DbSession,
    folder_id: Annotated[int | None, Query()] = None,
) -> list[EquipmentGroupRead]:
    groups = EquipmentService(db).list_groups(folder_id=folder_id)
    return [EquipmentGroupRead.model_validate(group) for group in groups]


@router.get("", response_model=list[EquipmentRead])
async def list_equipment(
    _: CurrentUser,
    db: DbSession,
    folder_id: Annotated[int | None, Query()] = None,
    group_id: Annotated[int | None, Query()] = None,
    query: Annotated[str | None, Query()] = None,
    status: Annotated[EquipmentStatus | None, Query()] = None,
    equipment_type: Annotated[EquipmentType | None, Query()] = None,
) -> list[EquipmentRead]:
    equipment_items = EquipmentService(db).list_equipment(
        folder_id=folder_id,
        group_id=group_id,
        query=query,
        status=status,
        equipment_type=equipment_type,
    )
    return [EquipmentRead.model_validate(item) for item in equipment_items]


@router.get("/{equipment_id}", response_model=EquipmentRead)
async def get_equipment(
    equipment_id: int,
    _: CurrentUser,
    db: DbSession,
) -> EquipmentRead:
    equipment_item = EquipmentService(db).get_equipment(equipment_id=equipment_id)
    return EquipmentRead.model_validate(equipment_item)


@router.post("", response_model=EquipmentRead, status_code=201)
async def create_equipment(
    payload: EquipmentCreateRequest,
    _: OperatorUser,
    db: DbSession,
) -> EquipmentRead:
    equipment_item = EquipmentService(db).create_equipment(payload)
    return EquipmentRead.model_validate(equipment_item)


@router.patch("/{equipment_id}", response_model=EquipmentRead)
async def update_equipment(
    equipment_id: int,
    payload: EquipmentUpdateRequest,
    _: OperatorUser,
    db: DbSession,
) -> EquipmentRead:
    equipment_item = EquipmentService(db).update_equipment(
        equipment_id=equipment_id,
        payload=payload,
    )
    return EquipmentRead.model_validate(equipment_item)


@router.delete("/{equipment_id}", status_code=204)
async def delete_equipment(
    equipment_id: int,
    _: OperatorUser,
    db: DbSession,
) -> None:
    EquipmentService(db).delete_equipment(equipment_id=equipment_id)
