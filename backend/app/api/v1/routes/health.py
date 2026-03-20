from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from app.api.deps import DbSession
from app.core.config import settings
from app.schemas.health import HealthStatus, ReadinessStatus

router = APIRouter()


@router.get("/health", response_model=HealthStatus)
async def healthcheck() -> HealthStatus:
    return HealthStatus(status="ok", service="backend", environment=settings.app_env)


@router.get("/health/ready", response_model=ReadinessStatus)
async def readiness_check(db: DbSession) -> ReadinessStatus:
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed.",
        ) from exc

    return ReadinessStatus(status="ready", database="ok", redis="not_checked")
