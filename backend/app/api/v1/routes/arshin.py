from fastapi import APIRouter

from app.api.deps import DbSession, OperatorUser
from app.schemas.arshin import (
    ArshinSearchRequest,
    ArshinSearchResultRead,
    ArshinVriDetailRead,
)
from app.services.arshin_service import ArshinService

router = APIRouter(prefix="/arshin")


@router.post("/search", response_model=list[ArshinSearchResultRead])
async def search_arshin(
    payload: ArshinSearchRequest,
    _: OperatorUser,
    __: DbSession,
) -> list[ArshinSearchResultRead]:
    return await ArshinService().search_by_certificate(
        certificate_number=payload.certificate_number,
        year=payload.year,
    )


@router.get("/vri/{vri_id}", response_model=ArshinVriDetailRead)
async def get_arshin_vri_detail(
    vri_id: str,
    _: OperatorUser,
    __: DbSession,
) -> ArshinVriDetailRead:
    return await ArshinService().get_vri_detail(vri_id=vri_id)
