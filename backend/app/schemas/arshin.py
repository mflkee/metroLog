from __future__ import annotations

from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class ArshinRegistryKind(StrEnum):
    SI = "SI"
    ESI = "ESI"


class ArshinSearchRequest(BaseModel):
    registry_kind: ArshinRegistryKind = ArshinRegistryKind.SI
    search: str | None = Field(default=None, max_length=255)
    org_title: str | None = Field(default=None, max_length=255)
    mit_number: str | None = Field(default=None, max_length=255)
    mit_title: str | None = Field(default=None, max_length=255)
    mit_notation: str | None = Field(default=None, max_length=255)
    mi_modification: str | None = Field(default=None, max_length=255)
    mi_number: str | None = Field(default=None, max_length=255)
    npe_number: str | None = Field(default=None, max_length=255)
    rank: str | None = Field(default=None, max_length=255)
    number: str | None = Field(default=None, max_length=255)
    result_docnum: str | None = Field(default=None, max_length=255)
    certificate_number: str | None = Field(default=None, max_length=255)
    applicability: bool | None = None
    verification_date: date | None = None
    valid_date: date | None = None
    year: int | None = None


class ArshinSearchResultRead(BaseModel):
    vri_id: str
    arshin_url: str | None = None
    org_title: str | None = None
    mit_number: str | None = None
    mit_title: str | None = None
    mit_notation: str | None = None
    mi_modification: str | None = None
    mi_number: str | None = None
    result_docnum: str | None = None
    applicability: bool | None = None
    verification_date: datetime | None = None
    valid_date: datetime | None = None
    raw_payload_json: dict | None = None


class ArshinESIDetailRequest(BaseModel):
    vri_id: str = Field(min_length=1, max_length=255)
    org_title: str | None = Field(default=None, max_length=255)
    mit_number: str | None = Field(default=None, max_length=255)
    mit_title: str | None = Field(default=None, max_length=255)
    mit_notation: str | None = Field(default=None, max_length=255)
    mi_modification: str | None = Field(default=None, max_length=255)
    mi_number: str | None = Field(default=None, max_length=255)
    result_docnum: str | None = Field(default=None, max_length=255)
    applicability: bool | None = None
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


class ArshinStatusRead(BaseModel):
    available: bool
    message: str | None = None
