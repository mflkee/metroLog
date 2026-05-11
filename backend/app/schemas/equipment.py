from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.equipment import (
    EquipmentFolderRefreshRowStatus,
    EquipmentFolderRefreshTargetKind,
    EquipmentFolderRefreshTaskStatus,
    EquipmentStatus,
    EquipmentType,
    ESIModuleKind,
    VerificationFlowMode,
)
from app.models.user import UserRole

EquipmentSortKey = Literal[
    "name",
    "equipmentType",
    "status",
    "serialNumber",
    "manufactureYear",
    "objectName",
    "currentLocationManual",
    "validFrom",
    "validTo",
]
EquipmentSortDirection = Literal["asc", "desc"]
DateType = date


class DeadlinePresetSnapshotRead(BaseModel):
    repair_total_days: int
    registration_after_arrival_days: int
    incoming_control_after_receipt_days: int
    payment_after_control_days: int
    repair_stage_templates_json: dict | None = None
    verification_stage_templates_json: dict | None = None


class ProcessStageTemplateItemRead(BaseModel):
    key: str
    label: str
    enabled: bool = True
    required: bool = False


class RepairStageTemplatesRead(BaseModel):
    offsite: list[ProcessStageTemplateItemRead]
    on_site: list[ProcessStageTemplateItemRead]


class VerificationStageTemplatesRead(BaseModel):
    offsite_with_demolition: list[ProcessStageTemplateItemRead]
    on_site_with_demolition: list[ProcessStageTemplateItemRead]
    on_site_without_demolition: list[ProcessStageTemplateItemRead]


class ProcessStageTemplateItemCreateRequest(BaseModel):
    key: str
    label: str
    enabled: bool = True


class ProcessCustomStageItemRead(BaseModel):
    id: str
    after_key: str
    label: str
    date: DateType | None = None
    deadline_days: int | None = None
    sort_order: int = 0


class ProcessCustomStageItemUpdateRequest(BaseModel):
    id: str | None = None
    after_key: str
    label: str
    date: DateType | None = None
    deadline_days: int | None = None
    sort_order: int = 0


class RepairStageTemplatesCreateRequest(BaseModel):
    offsite: list[ProcessStageTemplateItemCreateRequest] | None = None
    on_site: list[ProcessStageTemplateItemCreateRequest] | None = None


class VerificationStageTemplatesCreateRequest(BaseModel):
    offsite_with_demolition: list[ProcessStageTemplateItemCreateRequest] | None = None
    on_site_with_demolition: list[ProcessStageTemplateItemCreateRequest] | None = None
    on_site_without_demolition: list[ProcessStageTemplateItemCreateRequest] | None = None


class DeadlinePresetRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    description: str | None
    is_active: bool
    is_system: bool
    sort_order: int
    repair_total_days: int
    registration_after_arrival_days: int
    incoming_control_after_receipt_days: int
    payment_after_control_days: int
    repair_stage_templates_json: dict | None = None
    verification_stage_templates_json: dict | None = None
    created_at: datetime
    updated_at: datetime


class DeadlinePresetCreateRequest(BaseModel):
    name: str
    description: str | None = None
    is_active: bool = True
    sort_order: int = 0
    repair_total_days: int
    registration_after_arrival_days: int
    incoming_control_after_receipt_days: int
    payment_after_control_days: int
    repair_stage_templates_json: dict | None = None
    verification_stage_templates_json: dict | None = None


class DeadlinePresetUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    sort_order: int | None = None
    repair_total_days: int | None = None
    registration_after_arrival_days: int | None = None
    incoming_control_after_receipt_days: int | None = None
    payment_after_control_days: int | None = None
    repair_stage_templates_json: dict | None = None
    verification_stage_templates_json: dict | None = None


class EquipmentFolderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    sort_order: int
    deadline_preset_id: int | None
    deadline_preset_name: str | None
    deadline_preset_snapshot_json: DeadlinePresetSnapshotRead | None = None
    created_at: datetime
    updated_at: datetime


class EquipmentFolderSuggestionsRead(BaseModel):
    object_names: list[str]
    current_locations: list[str]
    measurement_units: list[str]
    repair_route_cities: list[str]
    repair_route_destinations: list[str]
    process_batch_names: list[str]


class FolderProcessSubscriptionUserRead(BaseModel):
    user_id: int
    display_name: str
    email: str
    role: UserRole
    organization: str | None = None
    position: str | None = None
    facility: str | None = None
    enabled: bool


class FolderProcessSubscriptionRead(BaseModel):
    folder_id: int
    users: list[FolderProcessSubscriptionUserRead]


class FolderProcessSubscriptionUpdateRequest(BaseModel):
    user_ids: list[int]


class EquipmentShareRecipientRead(BaseModel):
    user_id: int
    display_name: str
    email: str
    role: UserRole
    organization: str | None = None
    position: str | None = None
    facility: str | None = None


class EquipmentShareRecipientsRead(BaseModel):
    equipment_id: int
    folder_id: int
    users: list[EquipmentShareRecipientRead]


class EquipmentShareRequest(BaseModel):
    user_ids: list[int]


class EquipmentShareResultRead(BaseModel):
    status: str = "ok"
    message: str
    recipient_count: int


class EquipmentFolderRefreshTaskRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    folder_id: int
    created_by_user_id: int | None
    status: EquipmentFolderRefreshTaskStatus
    progress: int
    total_rows: int
    processed_rows: int
    summary_json: dict | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class EquipmentFolderRefreshRowRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    equipment_id: int
    composition_entry_id: int | None = None
    sort_order: int
    target_kind: EquipmentFolderRefreshTargetKind
    module_kind: ESIModuleKind | None = None
    equipment_name: str
    equipment_modification: str | None = None
    equipment_serial_number: str | None = None
    target_title: str | None = None
    target_serial_number: str | None = None
    target_registry_number: str | None = None
    measurement_limit: str | None = None
    current_certificate_number: str | None = None
    current_verification_date: datetime | None = None
    current_valid_date: datetime | None = None
    status: EquipmentFolderRefreshRowStatus
    uncertain_update: bool
    stage2_successful: bool | None = None
    modification_relaxed: bool | None = None
    notation_relaxed: bool | None = None
    notes: str | None = None
    matched_vri_id: str | None = None
    matched_arshin_url: str | None = None
    matched_registry_number: str | None = None
    matched_certificate_number: str | None = None
    matched_verification_date: datetime | None = None
    matched_valid_date: datetime | None = None
    created_at: datetime
    updated_at: datetime


class EquipmentFolderRefreshTaskDetailsRead(BaseModel):
    task: EquipmentFolderRefreshTaskRead
    rows: list[EquipmentFolderRefreshRowRead]


class EquipmentFolderRefreshTaskStartRequest(BaseModel):
    equipment_ids: list[int] = Field(default_factory=list)


class EquipmentFolderRefreshApplyRequest(BaseModel):
    row_ids: list[int]


class EquipmentFolderRefreshApplyRowResultRead(BaseModel):
    row_id: int
    equipment_id: int
    composition_entry_id: int | None = None
    applied: bool
    message: str | None = None


class EquipmentFolderRefreshApplyResultRead(BaseModel):
    applied_count: int
    failed_count: int
    results: list[EquipmentFolderRefreshApplyRowResultRead]


class EquipmentFolderCreateRequest(BaseModel):
    name: str
    description: str | None = None
    sort_order: int = 0
    deadline_preset_id: int | None = None


class EquipmentFolderUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    sort_order: int | None = None
    deadline_preset_id: int | None = None


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
    certificate_number: str | None = None
    result_docnum: str | None
    verification_date: datetime | None
    valid_date: datetime | None
    raw_payload_json: dict | None = None
    detail_payload_json: dict | None = None
    created_at: datetime
    updated_at: datetime


class EquipmentESICompositionEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    module_kind: ESIModuleKind
    vri_id: str
    measurement_limit: str | None = None
    sort_order: int
    arshin_url: str | None
    org_title: str | None
    mit_number: str | None
    mit_title: str | None
    mit_notation: str | None
    mi_number: str | None
    result_docnum: str | None
    verification_date: datetime | None
    valid_date: datetime | None
    raw_payload_json: dict | None = None
    detail_payload_json: dict | None = None
    created_at: datetime
    updated_at: datetime


class RepairRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    batch_key: str | None
    batch_name: str | None
    is_on_site: bool = False
    stage_template: list[ProcessStageTemplateItemRead] = []
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
    custom_stages: list[ProcessCustomStageItemRead] = []
    closed_at: date | None
    created_at: datetime
    updated_at: datetime


class VerificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    batch_key: str | None
    batch_name: str | None
    is_on_site: bool = False
    flow_mode: VerificationFlowMode = VerificationFlowMode.OFFSITE_WITH_DEMOLITION
    stage_template: list[ProcessStageTemplateItemRead] = []
    route_city: str
    route_destination: str
    sent_to_verification_at: date
    received_at_destination_at: date | None
    handed_to_csm_at: date | None
    verification_completed_at: date | None
    picked_up_from_csm_at: date | None
    shipped_back_at: date | None
    returned_from_verification_at: date | None
    custom_stages: list[ProcessCustomStageItemRead] = []
    closed_at: date | None
    created_at: datetime
    updated_at: datetime


class VerificationQueueItemRead(BaseModel):
    equipment_id: int
    verification_id: int
    batch_key: str | None
    batch_name: str | None
    is_on_site: bool = False
    flow_mode: VerificationFlowMode = VerificationFlowMode.OFFSITE_WITH_DEMOLITION
    stage_template: list[ProcessStageTemplateItemRead] = []
    folder_id: int | None
    object_name: str
    equipment_type: EquipmentType
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
    custom_stages: list[ProcessCustomStageItemRead] = []
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
    is_on_site: bool = False
    stage_template: list[ProcessStageTemplateItemRead] = []
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
    custom_stages: list[ProcessCustomStageItemRead] = []
    closed_at: date | None
    has_active_verification: bool
    result_docnum: str | None
    arshin_url: str | None = None
    current_stage_label: str
    repair_overdue_days: int
    registration_overdue_days: int
    control_overdue_days: int
    payment_overdue_days: int
    max_overdue_days: int
    created_at: datetime
    updated_at: datetime


class VerificationQueuePageRead(BaseModel):
    items: list[VerificationQueueItemRead]
    total_groups: int
    total_items: int
    limit: int
    offset: int


class RepairQueuePageRead(BaseModel):
    items: list[RepairQueueItemRead]
    total_groups: int
    total_items: int
    limit: int
    offset: int


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
    measurement_range_start: str | None = None
    measurement_range_end: str | None = None
    measurement_unit: str | None = None
    status: EquipmentStatus
    created_manually: bool = False
    exclude_from_arshin_refresh: bool = False
    current_location_manual: str | None
    compliance_date: date | None = None
    compliance_interval_months: int | None = None
    manual_verification_interval_months: int | None = None
    active_repair: RepairRead | None = None
    active_verification: VerificationRead | None = None
    si_verification: SIVerificationRead | None = None
    created_at: datetime
    updated_at: datetime


class EquipmentPageRead(BaseModel):
    items: list[EquipmentRead]
    total: int
    limit: int
    offset: int


class EquipmentDetailsRead(BaseModel):
    equipment: EquipmentRead
    process_subscription_enabled: bool
    active_repair_message_count: int
    active_verification_message_count: int
    esi_composition_entries: list[EquipmentESICompositionEntryRead]
    attachments: list[EquipmentAttachmentRead]
    comments: list[EquipmentCommentRead]
    repair_history: list[RepairQueueItemRead]
    verification_history: list[VerificationQueueItemRead]


class EquipmentProcessSubscriptionRead(BaseModel):
    enabled: bool


class EquipmentProcessSubscriptionUpdateRequest(BaseModel):
    enabled: bool


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


class EquipmentCommentAttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_comment_id: int
    uploaded_by_user_id: int | None
    uploaded_by_display_name: str
    file_name: str
    file_mime_type: str | None
    file_size: int
    created_at: datetime


class EquipmentCommentDraftAttachmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    upload_token: str
    file_name: str
    file_mime_type: str | None
    file_size: int


class EquipmentCommentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    author_user_id: int | None
    author_display_name: str
    text: str
    is_private: bool = False
    created_at: datetime
    attachments: list[EquipmentCommentAttachmentRead]


class EquipmentCommentCreateRequest(BaseModel):
    text: str | None = None
    is_private: bool = False
    uploaded_attachment_tokens: list[str] = Field(default_factory=list)


class EquipmentCommentUpdateRequest(BaseModel):
    text: str


class RepairCreateRequest(BaseModel):
    batch_key: str | None = None
    batch_name: str | None = None
    is_on_site: bool = False
    stage_template_variant_id: str | None = None
    route_city: str
    route_destination: str
    sent_to_repair_at: date
    initial_message_text: str | None = None
    initial_message_is_private: bool = False


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
    is_private: bool = False
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
    is_private: bool = False
    created_at: datetime
    attachments: list[VerificationMessageAttachmentRead] = []


class RepairMessageCreateRequest(BaseModel):
    text: str | None = None
    is_private: bool = False


class RepairMessageUpdateRequest(BaseModel):
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
    custom_stages: list[ProcessCustomStageItemUpdateRequest] | None = None


class VerificationCreateRequest(BaseModel):
    batch_key: str | None = None
    batch_name: str | None = None
    is_on_site: bool = False
    flow_mode: VerificationFlowMode = VerificationFlowMode.OFFSITE_WITH_DEMOLITION
    stage_template_variant_id: str | None = None
    route_city: str
    route_destination: str
    sent_to_verification_at: date
    initial_message_text: str | None = None
    initial_message_is_private: bool = False


class RepairBulkCreateRequest(BaseModel):
    equipment_ids: list[int]
    batch_name: str
    is_on_site: bool = False
    stage_template_variant_id: str | None = None
    route_city: str
    route_destination: str
    sent_to_repair_at: date
    initial_message_text: str | None = None
    initial_message_is_private: bool = False


class VerificationBulkCreateRequest(BaseModel):
    equipment_ids: list[int]
    batch_name: str
    is_on_site: bool = False
    flow_mode: VerificationFlowMode = VerificationFlowMode.OFFSITE_WITH_DEMOLITION
    stage_template_variant_id: str | None = None
    route_city: str
    route_destination: str
    sent_to_verification_at: date
    initial_message_text: str | None = None
    initial_message_is_private: bool = False


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
    custom_stages: list[ProcessCustomStageItemUpdateRequest] | None = None


class VerificationMessageCreateRequest(BaseModel):
    text: str | None = None
    is_private: bool = False


class VerificationMessageUpdateRequest(BaseModel):
    text: str | None = None


class SIVerificationCreateRequest(BaseModel):
    vri_id: str | None = None
    arshin_url: str | None = None
    org_title: str | None = None
    mit_number: str | None = None
    mit_title: str | None = None
    mit_notation: str | None = None
    mi_number: str | None = None
    certificate_number: str | None = None
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
    measurement_range_start: str | None = None
    measurement_range_end: str | None = None
    measurement_unit: str | None = None
    status: EquipmentStatus = EquipmentStatus.IN_WORK
    created_manually: bool = False
    exclude_from_arshin_refresh: bool = False
    current_location_manual: str | None = None
    compliance_date: date | None = None
    compliance_interval_months: int | None = None
    manual_verification_interval_months: int | None = None
    si_verification: SIVerificationCreateRequest | None = None
    esi_internal_modules: list[ESIInternalModuleMeasurementRequest] = []


class EquipmentSIRefreshRequest(BaseModel):
    si_verification: SIVerificationCreateRequest


class ESIInternalModuleMeasurementRequest(BaseModel):
    registry_number: str
    measurement_limit: str | None = None


class EquipmentESICompositionEntryCreateRequest(BaseModel):
    module_kind: ESIModuleKind = ESIModuleKind.EXTERNAL
    measurement_limit: str | None = None
    si_verification: SIVerificationCreateRequest


class EquipmentESICompositionEntryUpdateRequest(BaseModel):
    measurement_limit: str | None = None


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
    measurement_range_start: str | None = None
    measurement_range_end: str | None = None
    measurement_unit: str | None = None
    status: EquipmentStatus | None = None
    exclude_from_arshin_refresh: bool | None = None
    current_location_manual: str | None = None
    compliance_date: date | None = None
    compliance_interval_months: int | None = None
    manual_verification_interval_months: int | None = None


class EquipmentBulkDeleteRequest(BaseModel):
    equipment_ids: list[int]


class ESIEquipmentMonitoringModuleRead(BaseModel):
    entry_id: int | None = None
    module_kind: ESIModuleKind
    vri_id: str | None = None
    registry_number: str | None = None
    rank: str | None = None
    name: str | None = None
    modification: str | None = None
    serial_number: str | None = None
    measurement_limit: str | None = None
    verification_date: str | None = None
    valid_until: str | None = None
    certificate_number: str | None = None
    arshin_url: str | None = None
    verification_arshin_url: str | None = None


class ESIEquipmentMonitoringItemRead(BaseModel):
    equipment_id: int
    folder_id: int | None = None
    equipment_name: str
    equipment_modification: str | None = None
    equipment_serial_number: str | None = None
    modules: list[ESIEquipmentMonitoringModuleRead]
