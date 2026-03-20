from fastapi import APIRouter

from app.api.v1.routes.arshin import router as arshin_router
from app.api.v1.routes.auth import router as auth_router
from app.api.v1.routes.equipment import router as equipment_router
from app.api.v1.routes.events import router as events_router
from app.api.v1.routes.health import router as health_router
from app.api.v1.routes.users import router as users_router

api_router = APIRouter()
api_router.include_router(arshin_router, tags=["arshin"])
api_router.include_router(auth_router, tags=["auth"])
api_router.include_router(equipment_router, tags=["equipment"])
api_router.include_router(events_router, tags=["events"])
api_router.include_router(health_router, tags=["health"])
api_router.include_router(users_router, tags=["users"])
