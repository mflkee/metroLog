from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.event import EventCategory, EventLog
from app.repositories.search import search_condition


class EventLogRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def add(self, event: EventLog) -> EventLog:
        self.session.add(event)
        self.session.flush()
        return event

    def list_all(
        self,
        *,
        query: str | None = None,
        category: EventCategory | None = None,
        folder_id: int | None = None,
        allowed_folder_ids: set[int] | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        limit: int = 200,
    ) -> list[EventLog]:
        statement = select(EventLog).order_by(EventLog.created_at.desc(), EventLog.id.desc())

        if category is not None:
            statement = statement.where(EventLog.category == category)

        if folder_id is not None:
            statement = statement.where(EventLog.folder_id == folder_id)

        if allowed_folder_ids is not None:
            if not allowed_folder_ids:
                return []
            statement = statement.where(EventLog.folder_id.in_(sorted(allowed_folder_ids)))

        if date_from is not None:
            statement = statement.where(EventLog.event_date >= date_from)

        if date_to is not None:
            statement = statement.where(EventLog.event_date <= date_to)

        if query:
            search = search_condition(
                [
                    EventLog.title,
                    EventLog.description,
                    EventLog.user_display_name,
                    EventLog.equipment_name,
                    EventLog.folder_name,
                    EventLog.batch_key,
                ],
                query,
            )
            if search is not None:
                statement = statement.where(search)

        statement = statement.limit(max(1, min(limit, 500)))
        return list(self.session.scalars(statement))
