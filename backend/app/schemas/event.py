from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.event import EventCategory


class EventLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category: EventCategory
    action: str
    title: str
    description: str | None
    user_id: int | None
    user_display_name: str
    equipment_id: int | None
    equipment_name: str | None
    equipment_modification: str | None
    equipment_serial_number: str | None
    folder_id: int | None
    folder_name: str | None
    batch_key: str | None
    event_date: date
    created_at: datetime
