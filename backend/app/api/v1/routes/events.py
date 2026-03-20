from __future__ import annotations

from datetime import date
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Query
from fastapi.responses import Response

from app.api.deps import DbSession, OperatorUser
from app.models.event import EventCategory
from app.schemas.event import EventLogRead
from app.services.event_service import EventService

router = APIRouter(prefix="/events")


@router.get("", response_model=list[EventLogRead])
async def list_events(
    _: OperatorUser,
    db: DbSession,
    query: Annotated[str | None, Query()] = None,
    category: Annotated[EventCategory | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[EventLogRead]:
    return EventService(db).list_events(
        query=query,
        category=category,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    )


@router.get("/export/xlsx")
async def export_events_xlsx(
    _: OperatorUser,
    db: DbSession,
    query: Annotated[str | None, Query()] = None,
    category: Annotated[EventCategory | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 5000,
) -> Response:
    content = EventService(db).export_events_xlsx(
        query=query,
        category=category,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    )
    file_name = f"Журнал событий {date.today().strftime('%d.%m.%Y')}.xlsx"
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                'attachment; filename="events.xlsx"; '
                f"filename*=UTF-8''{quote(file_name)}"
            ),
        },
    )
