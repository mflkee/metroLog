from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ArshinSearchRequest(BaseModel):
    certificate_number: str
    year: int | None = None


class ArshinSearchResultRead(BaseModel):
    vri_id: str
    arshin_url: str
    org_title: str | None = None
    mit_number: str | None = None
    mit_title: str | None = None
    mit_notation: str | None = None
    mi_modification: str | None = None
    mi_number: str | None = None
    result_docnum: str | None = None
    verification_date: datetime | None = None
    valid_date: datetime | None = None
    raw_payload_json: dict | None = None


class ArshinVriDetailRead(BaseModel):
    vri_id: str
    arshin_url: str
    certificate_number: str | None = None
    organization: str | None = None
    reg_number: str | None = None
    type_designation: str | None = None
    type_name: str | None = None
    serial_number: str | None = None
    manufacture_year: int | None = None
    modification: str | None = None
    owner_name: str | None = None
    verification_mark_cipher: str | None = None
    verification_type: str | None = None
    verification_date: str | None = None
    valid_until: str | None = None
    document_title: str | None = None
    is_usable: bool | None = None
    passport_mark: bool | None = None
    device_mark: bool | None = None
    reduced_scope: bool | None = None
    etalon_lines: list[str] = []
    means_lines: list[str] = []
    raw_payload_json: dict | None = None
