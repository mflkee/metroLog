from fastapi import APIRouter, HTTPException, status

from app.core.config import settings
from app.db.session import check_database_connection
from app.schemas.health import HealthStatus, ReadinessStatus

router = APIRouter()


@router.get("/health", response_model=HealthStatus)
def healthcheck() -> HealthStatus:
    return HealthStatus(status="ok", service="backend", environment=settings.app_env)


@router.get("/health/ready", response_model=ReadinessStatus)
def readiness_check() -> ReadinessStatus:
    database_ok = check_database_connection()
    if not database_ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database connection failed.",
        )

    return ReadinessStatus(status="ready", database="ok", redis="not_checked")
