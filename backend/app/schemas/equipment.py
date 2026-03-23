from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models.equipment import EquipmentStatus, EquipmentType


class EquipmentFolderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class EquipmentFolderSuggestionsRead(BaseModel):
    object_names: list[str]
    current_locations: list[str]
    repair_route_cities: list[str]
    repair_route_destinations: list[str]
    process_batch_names: list[str]


class EquipmentFolderCreateRequest(BaseModel):
    name: str
    description: str | None = None
    sort_order: int = 0


class EquipmentFolderUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    sort_order: int | None = None


class EquipmentGroupRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    folder_id: int
    name: str
    description: str | None
    sort_order: int
    created_at: datetime
    updated_at: datetime


class SIVerificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    vri_id: str
    arshin_url: str | None
    org_title: str | None
    mit_number: str | None
    mit_title: str | None
    mit_notation: str | None
    mi_number: str | None
    result_docnum: str | None
    verification_date: datetime | None
    valid_date: datetime | None
    detail_payload_json: dict | None = None
    created_at: datetime
    updated_at: datetime


class RepairRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    batch_key: str | None
    batch_name: str | None
    route_city: str
    route_destination: str
    sent_to_repair_at: date
    repair_deadline_at: date
    arrived_to_destination_at: date | None = None
    sent_from_repair_at: date | None = None
    sent_from_irkutsk_at: date | None = None
    arrived_to_lensk_at: date | None = None
    actually_received_at: date | None = None
    incoming_control_at: date | None = None
    paid_at: date | None = None
    closed_at: date | None
    created_at: datetime
    updated_at: datetime


class VerificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    batch_key: str | None
    batch_name: str | None
    route_city: str
    route_destination: str
    sent_to_verification_at: date
    received_at_destination_at: date | None
    handed_to_csm_at: date | None
    verification_completed_at: date | None
    picked_up_from_csm_at: date | None
    shipped_back_at: date | None
    returned_from_verification_at: date | None
    closed_at: date | None
    created_at: datetime
    updated_at: datetime


class VerificationQueueItemRead(BaseModel):
    equipment_id: int
    verification_id: int
    batch_key: str | None
    batch_name: str | None
    folder_id: int | None
    object_name: str
    equipment_name: str
    modification: str | None
    serial_number: str | None
    manufacture_year: int | None
    route_city: str
    route_destination: str
    sent_to_verification_at: date
    received_at_destination_at: date | None
    handed_to_csm_at: date | None
    verification_completed_at: date | None
    picked_up_from_csm_at: date | None
    shipped_back_at: date | None
    returned_from_verification_at: date | None
    closed_at: date | None
    has_active_repair: bool
    result_docnum: str | None
    valid_date: datetime | None
    arshin_url: str | None
    created_at: datetime
    updated_at: datetime


class RepairQueueItemRead(BaseModel):
    repair_id: int
    equipment_id: int
    batch_key: str | None
    batch_name: str | None
    folder_id: int | None
    object_name: str
    equipment_type: EquipmentType
    equipment_name: str
    modification: str | None
    serial_number: str | None
    manufacture_year: int | None
    current_location_manual: str | None
    route_city: str
    route_destination: str
    sent_to_repair_at: date
    repair_deadline_at: date
    arrived_to_destination_at: date | None = None
    sent_from_repair_at: date | None = None
    sent_from_irkutsk_at: date | None = None
    arrived_to_lensk_at: date | None = None
    registration_deadline_at: date | None = None
    actually_received_at: date | None = None
    control_deadline_at: date | None = None
    incoming_control_at: date | None = None
    payment_deadline_at: date | None = None
    paid_at: date | None = None
    closed_at: date | None
    has_active_verification: bool
    result_docnum: str | None
    current_stage_label: str
    repair_overdue_days: int
    registration_overdue_days: int
    control_overdue_days: int
    payment_overdue_days: int
    max_overdue_days: int
    created_at: datetime
    updated_at: datetime


class EquipmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    folder_id: int | None
    group_id: int | None
    object_name: str
    equipment_type: EquipmentType
    name: str
    modification: str | None
    serial_number: str | None
    manufacture_year: int | None
    status: EquipmentStatus
    current_location_manual: str | None
    compliance_date: date | None = None
    compliance_interval_months: int | None = None
    active_repair: RepairRead | None = None
    active_verification: VerificationRead | None = None
    si_verification: SIVerificationRead | None = None
    created_at: datetime
    updated_at: datetime


class EquipmentAttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    uploaded_by_user_id: int | None
    uploaded_by_display_name: str
    file_name: str
    file_mime_type: str | None
    file_size: int
    created_at: datetime


class EquipmentCommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    author_user_id: int | None
    author_display_name: str
    text: str
    created_at: datetime


class EquipmentCommentCreateRequest(BaseModel):
    text: str


class EquipmentCommentUpdateRequest(BaseModel):
    text: str


class RepairCreateRequest(BaseModel):
    batch_key: str | None = None
    batch_name: str | None = None
    route_city: str
    route_destination: str
    sent_to_repair_at: date
    initial_message_text: str | None = None


class RepairMessageAttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    repair_message_id: int
    uploaded_by_user_id: int | None
    uploaded_by_display_name: str
    file_name: str
    file_mime_type: str | None
    file_size: int
    created_at: datetime


class RepairMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    repair_id: int
    batch_key: str | None
    author_user_id: int | None
    author_display_name: str
    text: str | None
    created_at: datetime
    attachments: list[RepairMessageAttachmentRead] = []


class VerificationMessageAttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    verification_message_id: int
    uploaded_by_user_id: int | None
    uploaded_by_display_name: str
    file_name: str
    file_mime_type: str | None
    file_size: int
    created_at: datetime


class VerificationMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    verification_id: int
    author_user_id: int | None
    author_display_name: str
    text: str | None
    created_at: datetime
    attachments: list[VerificationMessageAttachmentRead] = []


class RepairMessageCreateRequest(BaseModel):
    text: str | None = None


class RepairMilestonesUpdateRequest(BaseModel):
    sent_to_repair_at: date | None = None
    arrived_to_destination_at: date | None = None
    sent_from_repair_at: date | None = None
    sent_from_irkutsk_at: date | None = None
    arrived_to_lensk_at: date | None = None
    actually_received_at: date | None = None
    incoming_control_at: date | None = None
    paid_at: date | None = None


class VerificationCreateRequest(BaseModel):
    batch_key: str | None = None
    batch_name: str | None = None
    route_city: str
    route_destination: str
    sent_to_verification_at: date
    initial_message_text: str | None = None


class RepairBulkCreateRequest(BaseModel):
    equipment_ids: list[int]
    batch_name: str
    route_city: str
    route_destination: str
    sent_to_repair_at: date
    initial_message_text: str | None = None


class VerificationBulkCreateRequest(BaseModel):
    equipment_ids: list[int]
    batch_name: str
    route_city: str
    route_destination: str
    sent_to_verification_at: date
    initial_message_text: str | None = None


class ProcessBatchMembershipUpdateRequest(BaseModel):
    add_equipment_ids: list[int] = []
    remove_equipment_ids: list[int] = []


class VerificationMilestonesUpdateRequest(BaseModel):
    received_at_destination_at: date | None = None
    handed_to_csm_at: date | None = None
    verification_completed_at: date | None = None
    picked_up_from_csm_at: date | None = None
    shipped_back_at: date | None = None
    returned_from_verification_at: date | None = None


class VerificationMessageCreateRequest(BaseModel):
    text: str | None = None


class SIVerificationCreateRequest(BaseModel):
    vri_id: str
    arshin_url: str | None = None
    org_title: str | None = None
    mit_number: str | None = None
    mit_title: str | None = None
    mit_notation: str | None = None
    mi_number: str | None = None
    result_docnum: str | None = None
    verification_date: datetime | None = None
    valid_date: datetime | None = None
    raw_payload_json: dict | None = None
    detail_payload_json: dict | None = None


class EquipmentCreateRequest(BaseModel):
    folder_id: int
    group_id: int | None = None
    object_name: str
    equipment_type: EquipmentType = EquipmentType.OTHER
    name: str
    modification: str | None = None
    serial_number: str | None = None
    manufacture_year: int | None = None
    status: EquipmentStatus = EquipmentStatus.IN_WORK
    current_location_manual: str | None = None
    compliance_date: date | None = None
    compliance_interval_months: int | None = None
    si_verification: SIVerificationCreateRequest | None = None


class EquipmentSIRefreshRequest(BaseModel):
    si_verification: SIVerificationCreateRequest


class EquipmentSIBulkImportRowRead(BaseModel):
    row_number: int
    certificate_number: str
    status: str
    message: str
    equipment_id: int | None = None
    equipment_name: str | None = None
    vri_id: str | None = None


class EquipmentSIBulkImportResultRead(BaseModel):
    total_rows: int
    created_count: int
    skipped_count: int
    error_count: int
    rows: list[EquipmentSIBulkImportRowRead]


class EquipmentUpdateRequest(BaseModel):
    folder_id: int | None = None
    group_id: int | None = None
    object_name: str | None = None
    equipment_type: EquipmentType | None = None
    name: str | None = None
    modification: str | None = None
    serial_number: str | None = None
    manufacture_year: int | None = None
    status: EquipmentStatus | None = None
    current_location_manual: str | None = None
    compliance_date: date | None = None
    compliance_interval_months: int | None = None


class EquipmentBulkDeleteRequest(BaseModel):
    equipment_ids: list[int]
