from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.arshin import (
    ArshinESIDetailRequest,
    ArshinSearchRequest,
    ArshinSearchResultRead,
    ArshinStatusRead,
    ArshinVriDetailRead,
)
from app.services.arshin_service import ArshinService

router = APIRouter(prefix="/arshin")


@router.get("/status", response_model=ArshinStatusRead)
async def get_arshin_status(
    _: CurrentUser,
    __: DbSession,
) -> ArshinStatusRead:
    return await ArshinService().get_status()


@router.post("/search", response_model=list[ArshinSearchResultRead])
async def search_arshin(
    payload: ArshinSearchRequest,
    _: CurrentUser,
    __: DbSession,
) -> list[ArshinSearchResultRead]:
    return await ArshinService().search(payload=payload)


@router.get("/vri/{vri_id}", response_model=ArshinVriDetailRead)
async def get_arshin_vri_detail(
    vri_id: str,
    _: CurrentUser,
    __: DbSession,
) -> ArshinVriDetailRead:
    return await ArshinService().get_vri_detail(vri_id=vri_id)


@router.post("/esi/detail", response_model=ArshinVriDetailRead)
async def get_arshin_esi_detail(
    payload: ArshinESIDetailRequest,
    _: CurrentUser,
    __: DbSession,
) -> ArshinVriDetailRead:
    return await ArshinService().get_esi_detail(payload=payload)
