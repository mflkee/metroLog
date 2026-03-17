from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession, OperatorUser
from app.models.equipment import EquipmentStatus, EquipmentType
from app.schemas.equipment import (
    EquipmentCreateRequest,
    EquipmentFolderCreateRequest,
    EquipmentFolderRead,
    EquipmentFolderUpdateRequest,
    EquipmentGroupCreateRequest,
    EquipmentGroupRead,
    EquipmentGroupUpdateRequest,
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
    folder_id: int | None = Query(default=None),
) -> list[EquipmentGroupRead]:
    groups = EquipmentService(db).list_groups(folder_id=folder_id)
    return [EquipmentGroupRead.model_validate(group) for group in groups]


@router.post("/groups", response_model=EquipmentGroupRead, status_code=201)
async def create_group(
    payload: EquipmentGroupCreateRequest,
    _: OperatorUser,
    db: DbSession,
) -> EquipmentGroupRead:
    group = EquipmentService(db).create_group(payload)
    return EquipmentGroupRead.model_validate(group)


@router.patch("/groups/{group_id}", response_model=EquipmentGroupRead)
async def update_group(
    group_id: int,
    payload: EquipmentGroupUpdateRequest,
    _: OperatorUser,
    db: DbSession,
) -> EquipmentGroupRead:
    group = EquipmentService(db).update_group(group_id=group_id, payload=payload)
    return EquipmentGroupRead.model_validate(group)


@router.delete("/groups/{group_id}", status_code=204)
async def delete_group(
    group_id: int,
    _: OperatorUser,
    db: DbSession,
) -> None:
    EquipmentService(db).delete_group(group_id=group_id)


@router.get("", response_model=list[EquipmentRead])
async def list_equipment(
    _: CurrentUser,
    db: DbSession,
    folder_id: int | None = Query(default=None),
    group_id: int | None = Query(default=None),
    query: str | None = Query(default=None),
    status: EquipmentStatus | None = Query(default=None),
    equipment_type: EquipmentType | None = Query(default=None),
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
