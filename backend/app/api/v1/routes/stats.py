"""Эндпоинты статистики: сводка и группировки с учётом прав на папки."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.schemas.error import error_responses
from app.schemas.stats import (
    EquipmentStatsGroupBy,
    StatsGroupRead,
    StatsSummaryRead,
    VerificationStatsGroupBy,
)
from app.services.stats_service import StatsService

router = APIRouter(prefix="/stats")


@router.get(
    "/summary",
    response_model=StatsSummaryRead,
    summary="Сводка по реестру",
    description=(
        "Количество приборов, папок, групп, активных поверок, активных ремонтов и пользователей. "
        "Считаются только папки, доступные текущему пользователю."
    ),
    responses=error_responses(401),
)
async def get_stats_summary(
    current_user: CurrentUser,
    db: DbSession,
) -> StatsSummaryRead:
    return StatsService(db, access_user=current_user).summary()


@router.get(
    "/equipment",
    response_model=StatsGroupRead,
    summary="Статистика оборудования",
    description=(
        "Группировка приборов по статусу, типу или папке. Строки отсортированы по убыванию "
        "количества; агрегаты по скрытым папкам не попадают в ответ."
    ),
    responses=error_responses(401, 422),
)
async def get_equipment_stats(
    current_user: CurrentUser,
    db: DbSession,
    group_by: Annotated[
        EquipmentStatsGroupBy,
        Query(description="Поле группировки: status, equipment_type или folder_id."),
    ] = "status",
) -> StatsGroupRead:
    return StatsService(db, access_user=current_user).equipment_stats(group_by=group_by)


@router.get(
    "/verifications",
    response_model=StatsGroupRead,
    summary="Статистика поверок",
    description=(
        "Группировка поверок по статусу жизненного цикла: ACTIVE (не закрыта) и CLOSED "
        "(закрыта). Учитываются только доступные пользователю папки."
    ),
    responses=error_responses(401, 422),
)
async def get_verification_stats(
    current_user: CurrentUser,
    db: DbSession,
    group_by: Annotated[
        VerificationStatsGroupBy,
        Query(description="Поле группировки поверок: status."),
    ] = "status",
) -> StatsGroupRead:
    return StatsService(db, access_user=current_user).verification_stats(group_by=group_by)
