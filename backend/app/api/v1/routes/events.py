from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Query
from fastapi.responses import Response
from starlette.types import Receive, Scope, Send

from app.api.deps import CurrentUser, DbSession
from app.models.event import EventCategory
from app.models.user import User
from app.schemas.event import EventLogRead
from app.services.event_service import EventService

router = APIRouter(prefix="/events")
EXPORT_READ_CHUNK_SIZE_BYTES = 1024 * 1024


def _event_service(db: DbSession, current_user: User) -> EventService:
    return EventService(db, access_user=current_user)


def _cleanup_temp_file(file_path: Path) -> None:
    file_path.unlink(missing_ok=True)


class FileBackedResponse(Response):
    def __init__(
        self,
        *,
        file_path: Path,
        media_type: str,
        headers: dict[str, str],
        cleanup_after_send: bool,
    ) -> None:
        self.file_path = file_path
        self.cleanup_after_send = cleanup_after_send
        super().__init__(content=b"", media_type=media_type, headers=headers)

    async def __call__(self, scope: Scope, _receive: Receive, send: Send) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": self.status_code,
                "headers": self.raw_headers,
            }
        )
        try:
            with self.file_path.open("rb") as source:
                while chunk := source.read(EXPORT_READ_CHUNK_SIZE_BYTES):
                    await send(
                        {
                            "type": "http.response.body",
                            "body": chunk,
                            "more_body": True,
                        }
                    )
            await send({"type": "http.response.body", "body": b"", "more_body": False})
        finally:
            if self.cleanup_after_send:
                _cleanup_temp_file(self.file_path)


@router.get("", response_model=list[EventLogRead])
async def list_events(
    current_user: CurrentUser,
    db: DbSession,
    query: Annotated[str | None, Query()] = None,
    category: Annotated[EventCategory | None, Query()] = None,
    folder_id: Annotated[int | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
) -> list[EventLogRead]:
    return _event_service(db, current_user).list_events(
        query=query,
        category=category,
        folder_id=folder_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    )


@router.get("/export/xlsx")
async def export_events_xlsx(
    current_user: CurrentUser,
    db: DbSession,
    query: Annotated[str | None, Query()] = None,
    category: Annotated[EventCategory | None, Query()] = None,
    folder_id: Annotated[int | None, Query()] = None,
    date_from: Annotated[date | None, Query()] = None,
    date_to: Annotated[date | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=5000)] = 5000,
) -> Response:
    file_path = _event_service(db, current_user).export_events_xlsx(
        query=query,
        category=category,
        folder_id=folder_id,
        date_from=date_from,
        date_to=date_to,
        limit=limit,
    )
    file_name = f"Журнал событий {date.today().strftime('%d.%m.%Y')}.xlsx"
    return FileBackedResponse(
        file_path=file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                'attachment; filename="events.xlsx"; '
                f"filename*=UTF-8''{quote(file_name, safe='')}"
            ),
            "Content-Length": str(file_path.stat().st_size),
        },
        cleanup_after_send=True,
    )
