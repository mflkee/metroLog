import type { UserRole } from "@/api/auth";
import type { ArshinSearchResult, ArshinVriDetail } from "@/api/arshin";
import { ApiError, apiBaseUrl, apiRequest, getResponseErrorMessage } from "@/api/client";

export type EquipmentType = "SI" | "ESI" | "IO" | "VO" | "OTHER";
export type EquipmentStatus = "IN_WORK" | "IN_VERIFICATION" | "IN_REPAIR" | "ARCHIVED";
export type ESIModuleKind = "INTERNAL" | "EXTERNAL";
export type VerificationFlowMode =
  | "OFFSITE_WITH_DEMOLITION"
  | "ONSITE_WITH_DEMOLITION"
  | "ONSITE_WITHOUT_DEMOLITION";
export type EquipmentSortKey =
  | "name"
  | "equipmentType"
  | "status"
  | "serialNumber"
  | "manufactureYear"
  | "objectName"
  | "currentLocationManual"
  | "validFrom"
  | "validTo";
export type EquipmentSortDirection = "asc" | "desc";

type RawProcessStageTemplateItem = {
  key: string;
  label: string;
  enabled: boolean;
  required: boolean;
};

type RawProcessCustomStage = {
  id: string;
  after_key: string;
  label: string;
  date: string | null;
  deadline_days?: number | null;
  sort_order: number;
};

type RawLegacyRepairStageTemplates = {
  offsite: RawProcessStageTemplateItem[];
  on_site: RawProcessStageTemplateItem[];
};

type RawLegacyVerificationStageTemplates = {
  offsite_with_demolition: RawProcessStageTemplateItem[];
  on_site_with_demolition: RawProcessStageTemplateItem[];
  on_site_without_demolition: RawProcessStageTemplateItem[];
};

type RawProcessVariantStageTemplateItem = {
  id: string;
  label: string;
  deadline_days?: number | null;
  sort_order?: number;
};

type RawProcessStageTemplateVariant = {
  id: string;
  name: string;
  route_kind?: ProcessStageTemplateRouteKind;
  flow_mode?: VerificationFlowMode | null;
  stages?: RawProcessVariantStageTemplateItem[];
  sort_order?: number;
};

type RawProcessStageTemplateVariants = {
  variants: RawProcessStageTemplateVariant[];
};

type RawRepairStageTemplates = RawLegacyRepairStageTemplates | RawProcessStageTemplateVariants;
type RawVerificationStageTemplates =
  | RawLegacyVerificationStageTemplates
  | RawProcessStageTemplateVariants;

type RawDeadlinePresetSnapshot = {
  repair_total_days: number;
  registration_after_arrival_days: number;
  incoming_control_after_receipt_days: number;
  payment_after_control_days: number;
  repair_stage_templates_json?: RawRepairStageTemplates | null;
  verification_stage_templates_json?: RawVerificationStageTemplates | null;
};

type RawDeadlinePreset = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  repair_total_days: number;
  registration_after_arrival_days: number;
  incoming_control_after_receipt_days: number;
  payment_after_control_days: number;
  repair_stage_templates_json: RawRepairStageTemplates | null;
  verification_stage_templates_json: RawVerificationStageTemplates | null;
  created_at: string;
  updated_at: string;
};

type RawEquipmentFolder = {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
  deadline_preset_id: number | null;
  deadline_preset_name: string | null;
  deadline_preset_snapshot_json: RawDeadlinePresetSnapshot | null;
  created_at: string;
  updated_at: string;
};

type RawEquipmentGroup = {
  id: number;
  folder_id: number;
  name: string;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type RawEquipmentFolderSuggestions = {
  object_names: string[];
  current_locations: string[];
  measurement_units: string[];
  repair_route_cities: string[];
  repair_route_destinations: string[];
  process_batch_names: string[];
};

type RawEquipment = {
  id: number;
  folder_id: number | null;
  group_id: number | null;
  object_name: string;
  equipment_type: EquipmentType;
  name: string;
  modification: string | null;
  serial_number: string | null;
  manufacture_year: number | null;
  measurement_range_start: string | null;
  measurement_range_end: string | null;
  measurement_unit: string | null;
  status: EquipmentStatus;
  created_manually: boolean;
  exclude_from_arshin_refresh: boolean;
  current_location_manual: string | null;
  compliance_date: string | null;
  compliance_interval_months: number | null;
  manual_verification_interval_months: number | null;
  active_repair: RawEquipmentRepair | null;
  active_verification: RawEquipmentVerification | null;
  si_verification: RawSIVerification | null;
  created_at: string;
  updated_at: string;
};

type RawEquipmentPage = {
  items: RawEquipment[];
  total: number;
  limit: number;
  offset: number;
};

type RawEquipmentDetails = {
  equipment: RawEquipment;
  process_subscription_enabled: boolean;
  active_repair_message_count: number;
  active_verification_message_count: number;
  esi_composition_entries: RawEquipmentESICompositionEntry[];
  attachments: RawEquipmentAttachment[];
  comments: RawEquipmentComment[];
  repair_history: RawRepairQueueItem[];
  verification_history: RawVerificationQueueItem[];
};

type RawEquipmentRepair = {
  id: number;
  equipment_id: number;
  batch_key: string | null;
  batch_name: string | null;
  is_on_site: boolean;
  stage_template: RawProcessStageTemplateItem[];
  route_city: string;
  route_destination: string;
  sent_to_repair_at: string;
  repair_deadline_at: string;
  arrived_to_destination_at: string | null;
  sent_from_repair_at: string | null;
  sent_from_irkutsk_at: string | null;
  arrived_to_lensk_at: string | null;
  actually_received_at: string | null;
  incoming_control_at: string | null;
  paid_at: string | null;
  custom_stages: RawProcessCustomStage[];
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RawEquipmentVerification = {
  id: number;
  equipment_id: number;
  batch_key: string | null;
  batch_name: string | null;
  is_on_site: boolean;
  flow_mode: VerificationFlowMode;
  stage_template: RawProcessStageTemplateItem[];
  route_city: string;
  route_destination: string;
  sent_to_verification_at: string;
  received_at_destination_at: string | null;
  handed_to_csm_at: string | null;
  verification_completed_at: string | null;
  picked_up_from_csm_at: string | null;
  shipped_back_at: string | null;
  returned_from_verification_at: string | null;
  custom_stages: RawProcessCustomStage[];
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RawRepairMessageAttachment = {
  id: number;
  repair_message_id: number;
  uploaded_by_user_id: number | null;
  uploaded_by_display_name: string;
  file_name: string;
  file_mime_type: string | null;
  file_size: number;
  created_at: string;
};

type RawRepairMessage = {
  id: number;
  repair_id: number;
  author_user_id: number | null;
  author_display_name: string;
  text: string | null;
  is_private: boolean;
  created_at: string;
  attachments: RawRepairMessageAttachment[];
};

type RawVerificationMessageAttachment = {
  id: number;
  verification_message_id: number;
  uploaded_by_user_id: number | null;
  uploaded_by_display_name: string;
  file_name: string;
  file_mime_type: string | null;
  file_size: number;
  created_at: string;
};

type RawVerificationMessage = {
  id: number;
  verification_id: number;
  author_user_id: number | null;
  author_display_name: string;
  text: string | null;
  is_private: boolean;
  created_at: string;
  attachments: RawVerificationMessageAttachment[];
};

type RawSIVerification = {
  id: number;
  equipment_id: number;
  vri_id: string;
  arshin_url: string | null;
  org_title: string | null;
  mit_number: string | null;
  mit_title: string | null;
  mit_notation: string | null;
  mi_number: string | null;
  certificate_number: string | null;
  result_docnum: string | null;
  verification_date: string | null;
  valid_date: string | null;
  raw_payload_json: Record<string, unknown> | null;
  detail_payload_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

type RawEquipmentESICompositionEntry = RawSIVerification & {
  module_kind: ESIModuleKind;
  measurement_limit: string | null;
  sort_order: number;
};

type RawESIEquipmentMonitoringModule = {
  entry_id: number | null;
  module_kind: ESIModuleKind;
  vri_id: string | null;
  registry_number: string | null;
  rank: string | null;
  name: string | null;
  modification: string | null;
  serial_number: string | null;
  measurement_limit: string | null;
  verification_date: string | null;
  valid_until: string | null;
  certificate_number: string | null;
  arshin_url: string | null;
  verification_arshin_url: string | null;
};

type RawESIEquipmentMonitoringItem = {
  equipment_id: number;
  folder_id: number | null;
  equipment_name: string;
  equipment_modification: string | null;
  equipment_serial_number: string | null;
  modules: RawESIEquipmentMonitoringModule[];
};

type RawEquipmentAttachment = {
  id: number;
  equipment_id: number;
  uploaded_by_user_id: number | null;
  uploaded_by_display_name: string;
  file_name: string;
  file_mime_type: string | null;
  file_size: number;
  created_at: string;
};

type RawEquipmentComment = {
  id: number;
  equipment_id: number;
  author_user_id: number | null;
  author_display_name: string;
  text: string;
  is_private: boolean;
  created_at: string;
  attachments: RawEquipmentCommentAttachment[];
};

type RawEquipmentCommentAttachment = {
  id: number;
  equipment_comment_id: number;
  uploaded_by_user_id: number | null;
  uploaded_by_display_name: string;
  file_name: string;
  file_mime_type: string | null;
  file_size: number;
  created_at: string;
};

type RawEquipmentCommentDraftAttachment = {
  upload_token: string;
  file_name: string;
  file_mime_type: string | null;
  file_size: number;
};

type RawEquipmentProcessSubscription = {
  enabled: boolean;
};

type RawEquipmentShareRecipient = {
  user_id: number;
  display_name: string;
  email: string;
  role: UserRole;
  organization: string | null;
  position: string | null;
  facility: string | null;
};

type RawEquipmentShareRecipients = {
  equipment_id: number;
  folder_id: number;
  users: RawEquipmentShareRecipient[];
};

type RawEquipmentShareResult = {
  status: string;
  message: string;
  recipient_count: number;
};

type RawFolderProcessSubscriptionUser = {
  user_id: number;
  display_name: string;
  email: string;
  role: UserRole;
  organization: string | null;
  position: string | null;
  facility: string | null;
  enabled: boolean;
};

type RawFolderProcessSubscription = {
  folder_id: number;
  users: RawFolderProcessSubscriptionUser[];
};

type RawEquipmentFolderRefreshTask = {
  id: number;
  folder_id: number;
  created_by_user_id: number | null;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  progress: number;
  total_rows: number;
  processed_rows: number;
  summary_json: Record<string, number> | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RawEquipmentFolderRefreshRow = {
  id: number;
  task_id: number;
  equipment_id: number;
  composition_entry_id: number | null;
  sort_order: number;
  target_kind: "SI" | "ESI" | "ESI_INTERNAL" | "ESI_EXTERNAL";
  module_kind: ESIModuleKind | null;
  equipment_name: string;
  equipment_modification: string | null;
  equipment_serial_number: string | null;
  target_title: string | null;
  target_serial_number: string | null;
  target_registry_number: string | null;
  measurement_limit: string | null;
  current_certificate_number: string | null;
  current_verification_date: string | null;
  current_valid_date: string | null;
  status: "UPDATED" | "UPDATED_UNCERTAIN" | "UNCHANGED" | "NOT_FOUND" | "ERROR";
  uncertain_update: boolean;
  stage2_successful: boolean | null;
  modification_relaxed: boolean | null;
  notation_relaxed: boolean | null;
  notes: string | null;
  matched_vri_id: string | null;
  matched_arshin_url: string | null;
  matched_registry_number: string | null;
  matched_certificate_number: string | null;
  matched_verification_date: string | null;
  matched_valid_date: string | null;
  created_at: string;
  updated_at: string;
};

type RawEquipmentFolderRefreshTaskDetails = {
  task: RawEquipmentFolderRefreshTask;
  rows: RawEquipmentFolderRefreshRow[];
};

type RawEquipmentFolderRefreshApplyRowResult = {
  row_id: number;
  equipment_id: number;
  composition_entry_id: number | null;
  applied: boolean;
  message: string | null;
};

type RawEquipmentFolderRefreshApplyResult = {
  applied_count: number;
  failed_count: number;
  results: RawEquipmentFolderRefreshApplyRowResult[];
};

export type EquipmentFolder = {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  deadlinePresetId: number | null;
  deadlinePresetName: string | null;
  deadlinePresetSnapshot: DeadlinePresetSnapshot | null;
  createdAt: string;
  updatedAt: string;
};

export type DeadlinePresetSnapshot = {
  repairTotalDays: number;
  registrationAfterArrivalDays: number;
  incomingControlAfterReceiptDays: number;
  paymentAfterControlDays: number;
  repairStageTemplates: RepairStageTemplates | null;
  verificationStageTemplates: VerificationStageTemplates | null;
};

export type ProcessStageTemplateItem = {
  key: string;
  label: string;
  enabled: boolean;
  required: boolean;
};

export type ProcessCustomStage = {
  id: string;
  afterKey: string;
  label: string;
  date: string | null;
  deadlineDays: number | null;
  sortOrder: number;
};

export type ProcessStageTemplateRouteKind = "offsite" | "on_site";

export type ProcessVariantStageTemplateItem = {
  id: string;
  label: string;
  deadlineDays: number | null;
  sortOrder: number;
};

export type ProcessStageTemplateVariant = {
  id: string;
  name: string;
  routeKind: ProcessStageTemplateRouteKind;
  flowMode: VerificationFlowMode | null;
  stages: ProcessVariantStageTemplateItem[];
  sortOrder: number;
};

export type ProcessStageTemplateVariants = {
  variants: ProcessStageTemplateVariant[];
};

export type RepairStageTemplates = ProcessStageTemplateVariants;

export type VerificationStageTemplates = ProcessStageTemplateVariants;

export type DeadlinePreset = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
  repairTotalDays: number;
  registrationAfterArrivalDays: number;
  incomingControlAfterReceiptDays: number;
  paymentAfterControlDays: number;
  repairStageTemplates: RepairStageTemplates | null;
  verificationStageTemplates: VerificationStageTemplates | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentGroup = {
  id: number;
  folderId: number;
  name: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentFolderSuggestions = {
  objectNames: string[];
  currentLocations: string[];
  measurementUnits: string[];
  repairRouteCities: string[];
  repairRouteDestinations: string[];
  processBatchNames: string[];
};

export type FolderProcessSubscriptionUser = {
  userId: number;
  displayName: string;
  email: string;
  role: UserRole;
  organization: string | null;
  position: string | null;
  facility: string | null;
  enabled: boolean;
};

export type FolderProcessSubscription = {
  folderId: number;
  users: FolderProcessSubscriptionUser[];
};

export type EquipmentShareRecipient = {
  userId: number;
  displayName: string;
  email: string;
  role: UserRole;
  organization: string | null;
  position: string | null;
  facility: string | null;
};

export type EquipmentShareRecipients = {
  equipmentId: number;
  folderId: number;
  users: EquipmentShareRecipient[];
};

export type EquipmentShareResult = {
  status: string;
  message: string;
  recipientCount: number;
};

export type EquipmentFolderRefreshTaskStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
export type EquipmentFolderRefreshRowStatus =
  | "UPDATED"
  | "UPDATED_UNCERTAIN"
  | "UNCHANGED"
  | "NOT_FOUND"
  | "ERROR";
export type EquipmentFolderRefreshTargetKind = "SI" | "ESI" | "ESI_INTERNAL" | "ESI_EXTERNAL";

export type EquipmentFolderRefreshTask = {
  id: number;
  folderId: number;
  createdByUserId: number | null;
  status: EquipmentFolderRefreshTaskStatus;
  progress: number;
  totalRows: number;
  processedRows: number;
  summary: Record<string, number> | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentFolderRefreshRow = {
  id: number;
  taskId: number;
  equipmentId: number;
  compositionEntryId: number | null;
  sortOrder: number;
  targetKind: EquipmentFolderRefreshTargetKind;
  moduleKind: ESIModuleKind | null;
  equipmentName: string;
  equipmentModification: string | null;
  equipmentSerialNumber: string | null;
  targetTitle: string | null;
  targetSerialNumber: string | null;
  targetRegistryNumber: string | null;
  measurementLimit: string | null;
  currentCertificateNumber: string | null;
  currentVerificationDate: string | null;
  currentValidDate: string | null;
  status: EquipmentFolderRefreshRowStatus;
  uncertainUpdate: boolean;
  stage2Successful: boolean | null;
  modificationRelaxed: boolean | null;
  notationRelaxed: boolean | null;
  notes: string | null;
  matchedVriId: string | null;
  matchedArshinUrl: string | null;
  matchedRegistryNumber: string | null;
  matchedCertificateNumber: string | null;
  matchedVerificationDate: string | null;
  matchedValidDate: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentFolderRefreshTaskDetails = {
  task: EquipmentFolderRefreshTask;
  rows: EquipmentFolderRefreshRow[];
};

export type EquipmentFolderRefreshApplyRowResult = {
  rowId: number;
  equipmentId: number;
  compositionEntryId: number | null;
  applied: boolean;
  message: string | null;
};

export type EquipmentFolderRefreshApplyResult = {
  appliedCount: number;
  failedCount: number;
  results: EquipmentFolderRefreshApplyRowResult[];
};

export type EquipmentItem = {
  id: number;
  folderId: number | null;
  groupId: number | null;
  objectName: string;
  equipmentType: EquipmentType;
  name: string;
  modification: string | null;
  serialNumber: string | null;
  manufactureYear: number | null;
  measurementRangeStart: string | null;
  measurementRangeEnd: string | null;
  measurementUnit: string | null;
  status: EquipmentStatus;
  createdManually: boolean;
  excludeFromArshinRefresh: boolean;
  currentLocationManual: string | null;
  complianceDate: string | null;
  complianceIntervalMonths: number | null;
  manualVerificationIntervalMonths: number | null;
  activeRepair: EquipmentRepair | null;
  activeVerification: EquipmentVerification | null;
  siVerification: EquipmentSIVerification | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentPageResult = {
  items: EquipmentItem[];
  total: number;
  limit: number;
  offset: number;
};

export type EquipmentDetailsResult = {
  equipment: EquipmentItem;
  processSubscriptionEnabled: boolean;
  activeRepairMessageCount: number;
  activeVerificationMessageCount: number;
  esiCompositionEntries: EquipmentESICompositionEntry[];
  attachments: EquipmentAttachment[];
  comments: EquipmentComment[];
  repairHistory: RepairQueueItem[];
  verificationHistory: VerificationQueueItem[];
};

export type EquipmentRepair = {
  id: number;
  equipmentId: number;
  batchKey: string | null;
  batchName: string | null;
  isOnSite: boolean;
  stageTemplate: ProcessStageTemplateItem[];
  routeCity: string;
  routeDestination: string;
  sentToRepairAt: string;
  repairDeadlineAt: string;
  arrivedToDestinationAt: string | null;
  sentFromRepairAt: string | null;
  sentFromIrkutskAt: string | null;
  arrivedToLenskAt: string | null;
  actuallyReceivedAt: string | null;
  incomingControlAt: string | null;
  paidAt: string | null;
  customStages: ProcessCustomStage[];
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentVerification = {
  id: number;
  equipmentId: number;
  batchKey: string | null;
  batchName: string | null;
  isOnSite: boolean;
  flowMode: VerificationFlowMode;
  stageTemplate: ProcessStageTemplateItem[];
  routeCity: string;
  routeDestination: string;
  sentToVerificationAt: string;
  receivedAtDestinationAt: string | null;
  handedToCsmAt: string | null;
  verificationCompletedAt: string | null;
  pickedUpFromCsmAt: string | null;
  shippedBackAt: string | null;
  returnedFromVerificationAt: string | null;
  customStages: ProcessCustomStage[];
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VerificationQueueItem = {
  equipmentId: number;
  verificationId: number;
  batchKey: string | null;
  batchName: string | null;
  isOnSite: boolean;
  flowMode: VerificationFlowMode;
  stageTemplate: ProcessStageTemplateItem[];
  folderId: number | null;
  objectName: string;
  equipmentType: EquipmentType;
  equipmentName: string;
  modification: string | null;
  serialNumber: string | null;
  manufactureYear: number | null;
  routeCity: string;
  routeDestination: string;
  sentToVerificationAt: string;
  receivedAtDestinationAt: string | null;
  handedToCsmAt: string | null;
  verificationCompletedAt: string | null;
  pickedUpFromCsmAt: string | null;
  shippedBackAt: string | null;
  returnedFromVerificationAt: string | null;
  customStages: ProcessCustomStage[];
  closedAt: string | null;
  hasActiveRepair: boolean;
  resultDocnum: string | null;
  validDate: string | null;
  arshinUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RepairQueueItem = {
  repairId: number;
  equipmentId: number;
  batchKey: string | null;
  batchName: string | null;
  isOnSite: boolean;
  stageTemplate: ProcessStageTemplateItem[];
  folderId: number | null;
  objectName: string;
  equipmentType: EquipmentType;
  equipmentName: string;
  modification: string | null;
  serialNumber: string | null;
  manufactureYear: number | null;
  currentLocationManual: string | null;
  routeCity: string;
  routeDestination: string;
  sentToRepairAt: string;
  repairDeadlineAt: string;
  arrivedToDestinationAt: string | null;
  sentFromRepairAt: string | null;
  sentFromIrkutskAt: string | null;
  arrivedToLenskAt: string | null;
  registrationDeadlineAt: string | null;
  actuallyReceivedAt: string | null;
  controlDeadlineAt: string | null;
  incomingControlAt: string | null;
  paymentDeadlineAt: string | null;
  paidAt: string | null;
  customStages: ProcessCustomStage[];
  closedAt: string | null;
  hasActiveVerification: boolean;
  resultDocnum: string | null;
  arshinUrl: string | null;
  currentStageLabel: string;
  repairOverdueDays: number;
  registrationOverdueDays: number;
  controlOverdueDays: number;
  paymentOverdueDays: number;
  maxOverdueDays: number;
  createdAt: string;
  updatedAt: string;
};

export type VerificationQueuePageResult = {
  items: VerificationQueueItem[];
  totalGroups: number;
  totalItems: number;
  limit: number;
  offset: number;
};

export type RepairQueuePageResult = {
  items: RepairQueueItem[];
  totalGroups: number;
  totalItems: number;
  limit: number;
  offset: number;
};

type FetchProcessQueueFilters = {
  lifecycleStatus: "active" | "archived";
  query?: string;
  folderId?: number | null;
};

export type RepairMessageAttachment = {
  id: number;
  repairMessageId: number;
  uploadedByUserId: number | null;
  uploadedByDisplayName: string;
  fileName: string;
  fileMimeType: string | null;
  fileSize: number;
  createdAt: string;
};

export type RepairMessage = {
  id: number;
  repairId: number;
  authorUserId: number | null;
  authorDisplayName: string;
  text: string | null;
  isPrivate: boolean;
  createdAt: string;
  attachments: RepairMessageAttachment[];
};

export type VerificationMessageAttachment = {
  id: number;
  verificationMessageId: number;
  uploadedByUserId: number | null;
  uploadedByDisplayName: string;
  fileName: string;
  fileMimeType: string | null;
  fileSize: number;
  createdAt: string;
};

export type VerificationMessage = {
  id: number;
  verificationId: number;
  authorUserId: number | null;
  authorDisplayName: string;
  text: string | null;
  isPrivate: boolean;
  createdAt: string;
  attachments: VerificationMessageAttachment[];
};

export type EquipmentSIVerification = {
  id: number;
  equipmentId: number;
  vriId: string;
  arshinUrl: string | null;
  orgTitle: string | null;
  mitNumber: string | null;
  mitTitle: string | null;
  mitNotation: string | null;
  miNumber: string | null;
  certificateNumber: string | null;
  resultDocnum: string | null;
  verificationDate: string | null;
  validDate: string | null;
  rawPayloadJson: Record<string, unknown> | null;
  detailPayloadJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentESICompositionEntry = EquipmentSIVerification & {
  moduleKind: ESIModuleKind;
  measurementLimit: string | null;
  sortOrder: number;
};

export type ESIEquipmentMonitoringModule = {
  entryId: number | null;
  moduleKind: ESIModuleKind;
  vriId: string | null;
  registryNumber: string | null;
  rank: string | null;
  name: string | null;
  modification: string | null;
  serialNumber: string | null;
  measurementLimit: string | null;
  verificationDate: string | null;
  validUntil: string | null;
  certificateNumber: string | null;
  arshinUrl: string | null;
  verificationArshinUrl: string | null;
};

export type ESIEquipmentMonitoringItem = {
  equipmentId: number;
  folderId: number | null;
  equipmentName: string;
  equipmentModification: string | null;
  equipmentSerialNumber: string | null;
  modules: ESIEquipmentMonitoringModule[];
};

export type EquipmentAttachment = {
  id: number;
  equipmentId: number;
  uploadedByUserId: number | null;
  uploadedByDisplayName: string;
  fileName: string;
  fileMimeType: string | null;
  fileSize: number;
  createdAt: string;
};

export type EquipmentComment = {
  id: number;
  equipmentId: number;
  authorUserId: number | null;
  authorDisplayName: string;
  text: string;
  isPrivate: boolean;
  createdAt: string;
  attachments: EquipmentCommentAttachment[];
};

export type EquipmentCommentAttachment = {
  id: number;
  equipmentCommentId: number;
  uploadedByUserId: number | null;
  uploadedByDisplayName: string;
  fileName: string;
  fileMimeType: string | null;
  fileSize: number;
  createdAt: string;
};

export type EquipmentCommentDraftAttachment = {
  uploadToken: string;
  fileName: string;
  fileMimeType: string | null;
  fileSize: number;
};

export type CreateEquipmentFolderPayload = {
  name: string;
  description: string;
  sortOrder: number;
  deadlinePresetId: number | null;
};

export type CreateDeadlinePresetPayload = {
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  repairTotalDays: number;
  registrationAfterArrivalDays: number;
  incomingControlAfterReceiptDays: number;
  paymentAfterControlDays: number;
  repairStageTemplates: RepairStageTemplates;
  verificationStageTemplates: VerificationStageTemplates;
};

export type UpdateDeadlinePresetPayload = Partial<CreateDeadlinePresetPayload>;
export async function fetchDeadlinePresets(
  token: string,
  options?: { includeInactive?: boolean },
): Promise<DeadlinePreset[]> {
  const query = options?.includeInactive ? "?include_inactive=true" : "";
  const response = await apiRequest<RawDeadlinePreset[]>(`/equipment/deadline-presets${query}`, {
    method: "GET",
    token,
  });
  return response.map(mapDeadlinePreset);
}

export async function createDeadlinePreset(
  token: string,
  payload: CreateDeadlinePresetPayload,
): Promise<DeadlinePreset> {
  const response = await apiRequest<RawDeadlinePreset>("/equipment/deadline-presets", {
    method: "POST",
    token,
    body: {
      name: payload.name,
      description: payload.description,
      sort_order: payload.sortOrder,
      is_active: payload.isActive,
      repair_total_days: payload.repairTotalDays,
      registration_after_arrival_days: payload.registrationAfterArrivalDays,
      incoming_control_after_receipt_days: payload.incomingControlAfterReceiptDays,
      payment_after_control_days: payload.paymentAfterControlDays,
      repair_stage_templates_json: mapRepairStageTemplatesToApi(payload.repairStageTemplates),
      verification_stage_templates_json: mapVerificationStageTemplatesToApi(
        payload.verificationStageTemplates,
      ),
    },
  });
  return mapDeadlinePreset(response);
}

export async function updateDeadlinePreset(
  token: string,
  presetId: number,
  payload: UpdateDeadlinePresetPayload,
): Promise<DeadlinePreset> {
  const body: Record<string, unknown> = {};
  if (payload.name !== undefined) {
    body.name = payload.name;
  }
  if (payload.description !== undefined) {
    body.description = payload.description;
  }
  if (payload.sortOrder !== undefined) {
    body.sort_order = payload.sortOrder;
  }
  if (payload.isActive !== undefined) {
    body.is_active = payload.isActive;
  }
  if (payload.repairTotalDays !== undefined) {
    body.repair_total_days = payload.repairTotalDays;
  }
  if (payload.registrationAfterArrivalDays !== undefined) {
    body.registration_after_arrival_days = payload.registrationAfterArrivalDays;
  }
  if (payload.incomingControlAfterReceiptDays !== undefined) {
    body.incoming_control_after_receipt_days = payload.incomingControlAfterReceiptDays;
  }
  if (payload.paymentAfterControlDays !== undefined) {
    body.payment_after_control_days = payload.paymentAfterControlDays;
  }
  if (payload.repairStageTemplates !== undefined) {
    body.repair_stage_templates_json = mapRepairStageTemplatesToApi(payload.repairStageTemplates);
  }
  if (payload.verificationStageTemplates !== undefined) {
    body.verification_stage_templates_json = mapVerificationStageTemplatesToApi(
      payload.verificationStageTemplates,
    );
  }
  const response = await apiRequest<RawDeadlinePreset>(`/equipment/deadline-presets/${presetId}`, {
    method: "PATCH",
    token,
    body,
  });
  return mapDeadlinePreset(response);
}

export async function deleteDeadlinePreset(token: string, presetId: number): Promise<void> {
  await apiRequest(`/equipment/deadline-presets/${presetId}`, {
    method: "DELETE",
    token,
  });
};

export type CreateEquipmentPayload = {
  folderId: number;
  groupId?: number | null;
  objectName: string;
  equipmentType: EquipmentType;
  name: string;
  modification: string;
  serialNumber: string;
  manufactureYear: number | null;
  measurementRangeStart: string;
  measurementRangeEnd: string;
  measurementUnit: string;
  status: EquipmentStatus;
  createdManually: boolean;
  excludeFromArshinRefresh: boolean;
  currentLocationManual: string;
  complianceDate: string | null;
  complianceIntervalMonths: number | null;
  manualVerificationIntervalMonths: number | null;
  siVerification?: CreateEquipmentSIVerificationPayload | null;
  esiInternalModules?: ESIInternalModuleMeasurementPayload[];
};

export type UpdateEquipmentPayload = {
  folderId: number;
  groupId?: number | null;
  objectName: string;
  equipmentType: EquipmentType;
  name: string;
  modification: string;
  serialNumber: string;
  manufactureYear: number | null;
  measurementRangeStart: string;
  measurementRangeEnd: string;
  measurementUnit: string;
  status: EquipmentStatus;
  createdManually: boolean;
  excludeFromArshinRefresh: boolean;
  currentLocationManual: string;
  complianceDate: string | null;
  complianceIntervalMonths: number | null;
  manualVerificationIntervalMonths: number | null;
  siVerification?: CreateEquipmentSIVerificationPayload | null;
  esiInternalModules?: ESIInternalModuleMeasurementPayload[];
};

export type ESIInternalModuleMeasurementPayload = {
  registryNumber: string;
  measurementLimit: string;
};

export type CreateEquipmentSIVerificationPayload = {
  vriId: string | null;
  arshinUrl: string | null;
  orgTitle: string | null;
  mitNumber: string | null;
  mitTitle: string | null;
  mitNotation: string | null;
  miNumber: string | null;
  certificateNumber: string | null;
  resultDocnum: string | null;
  verificationDate: string | null;
  validDate: string | null;
  rawPayloadJson: Record<string, unknown> | null;
  detailPayloadJson: Record<string, unknown> | null;
};

export type CreateEquipmentESICompositionEntryPayload = {
  moduleKind?: ESIModuleKind;
  measurementLimit?: string;
  siVerification: CreateEquipmentSIVerificationPayload;
};

export type UpdateEquipmentESICompositionEntryPayload = {
  measurementLimit: string;
};

export type CreateEquipmentCommentPayload = {
  text: string;
  isPrivate?: boolean;
  files?: File[];
  uploadedAttachmentTokens?: string[];
};

export type UpdateEquipmentCommentPayload = {
  text: string;
};

export type CreateEquipmentRepairPayload = {
  isOnSite?: boolean;
  stageTemplateVariantId?: string | null;
  routeCity: string;
  routeDestination: string;
  sentToRepairAt: string;
  initialMessageText: string;
  initialMessageIsPrivate?: boolean;
  files: File[];
};

export type CreateRepairBatchPayload = {
  equipmentIds: number[];
  batchName: string;
  isOnSite?: boolean;
  stageTemplateVariantId?: string | null;
  routeCity: string;
  routeDestination: string;
  sentToRepairAt: string;
  initialMessageText: string;
  initialMessageIsPrivate?: boolean;
  files: File[];
};

export type CreateRepairMessagePayload = {
  text: string;
  isPrivate?: boolean;
  files: File[];
};

export type UpdateRepairMessagePayload = {
  text: string;
};

export type UpdateRepairMilestonesPayload = {
  sentToRepairAt?: string | null;
  arrivedToDestinationAt?: string | null;
  sentFromRepairAt?: string | null;
  sentFromIrkutskAt?: string | null;
  arrivedToLenskAt?: string | null;
  actuallyReceivedAt?: string | null;
  incomingControlAt?: string | null;
  paidAt?: string | null;
  customStages?: ProcessCustomStage[] | null;
};

export type UpdateProcessBatchItemsPayload = {
  addEquipmentIds?: number[];
  removeEquipmentIds?: number[];
};

export type CreateEquipmentVerificationPayload = {
  flowMode?: VerificationFlowMode;
  stageTemplateVariantId?: string | null;
  routeCity: string;
  routeDestination: string;
  sentToVerificationAt: string;
  initialMessageText: string;
  initialMessageIsPrivate?: boolean;
  files: File[];
};

export type CreateVerificationBatchPayload = {
  equipmentIds: number[];
  batchName: string;
  flowMode?: VerificationFlowMode;
  stageTemplateVariantId?: string | null;
  routeCity: string;
  routeDestination: string;
  sentToVerificationAt: string;
  initialMessageText: string;
  initialMessageIsPrivate?: boolean;
  files: File[];
};

export type UpdateEquipmentVerificationMilestonesPayload = {
  receivedAtDestinationAt?: string | null;
  handedToCsmAt?: string | null;
  verificationCompletedAt?: string | null;
  pickedUpFromCsmAt?: string | null;
  shippedBackAt?: string | null;
  returnedFromVerificationAt?: string | null;
  customStages?: ProcessCustomStage[] | null;
};

export type CreateVerificationMessagePayload = {
  text: string;
  isPrivate?: boolean;
  files: File[];
};

export type UpdateVerificationMessagePayload = {
  text: string;
};

export type ImportSIExcelPayload = {
  folderId: number;
  objectName: string;
  status: EquipmentStatus;
  currentLocationManual: string;
  file: File;
};

export type EquipmentSIBulkImportRow = {
  rowNumber: number;
  certificateNumber: string;
  status: "created" | "skipped" | "error";
  message: string;
  equipmentId: number | null;
  equipmentName: string | null;
  vriId: string | null;
};

export type EquipmentSIBulkImportResult = {
  totalRows: number;
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  rows: EquipmentSIBulkImportRow[];
};

type FetchEquipmentFilters = {
  folderId?: number | null;
  groupId?: number | null;
  equipmentIds?: number[];
  query?: string;
  objectName?: string | null;
  currentLocationManual?: string | null;
  status?: EquipmentStatus | null;
  equipmentType?: EquipmentType | null;
  sortKey?: EquipmentSortKey | null;
  sortDirection?: EquipmentSortDirection | null;
};

type RawVerificationQueueItem = {
  equipment_id: number;
  verification_id: number;
  batch_key: string | null;
  batch_name: string | null;
  is_on_site: boolean;
  flow_mode: VerificationFlowMode;
  stage_template: RawProcessStageTemplateItem[];
  folder_id: number | null;
  object_name: string;
  equipment_type: EquipmentType;
  equipment_name: string;
  modification: string | null;
  serial_number: string | null;
  manufacture_year: number | null;
  route_city: string;
  route_destination: string;
  sent_to_verification_at: string;
  received_at_destination_at: string | null;
  handed_to_csm_at: string | null;
  verification_completed_at: string | null;
  picked_up_from_csm_at: string | null;
  shipped_back_at: string | null;
  returned_from_verification_at: string | null;
  custom_stages: RawProcessCustomStage[];
  closed_at: string | null;
  has_active_repair: boolean;
  result_docnum: string | null;
  valid_date: string | null;
  arshin_url: string | null;
  created_at: string;
  updated_at: string;
};

type RawRepairQueueItem = {
  repair_id: number;
  equipment_id: number;
  batch_key: string | null;
  batch_name: string | null;
  is_on_site: boolean;
  stage_template: RawProcessStageTemplateItem[];
  folder_id: number | null;
  object_name: string;
  equipment_type: EquipmentType;
  equipment_name: string;
  modification: string | null;
  serial_number: string | null;
  manufacture_year: number | null;
  current_location_manual: string | null;
  route_city: string;
  route_destination: string;
  sent_to_repair_at: string;
  repair_deadline_at: string;
  arrived_to_destination_at: string | null;
  sent_from_repair_at: string | null;
  sent_from_irkutsk_at: string | null;
  arrived_to_lensk_at: string | null;
  registration_deadline_at: string | null;
  actually_received_at: string | null;
  control_deadline_at: string | null;
  incoming_control_at: string | null;
  payment_deadline_at: string | null;
  paid_at: string | null;
  custom_stages: RawProcessCustomStage[];
  closed_at: string | null;
  has_active_verification: boolean;
  result_docnum: string | null;
  arshin_url: string | null;
  current_stage_label: string;
  repair_overdue_days: number;
  registration_overdue_days: number;
  control_overdue_days: number;
  payment_overdue_days: number;
  max_overdue_days: number;
  created_at: string;
  updated_at: string;
};

type RawVerificationQueuePage = {
  items: RawVerificationQueueItem[];
  total_groups: number;
  total_items: number;
  limit: number;
  offset: number;
};

type RawRepairQueuePage = {
  items: RawRepairQueueItem[];
  total_groups: number;
  total_items: number;
  limit: number;
  offset: number;
};

type RawEquipmentSIBulkImportRow = {
  row_number: number;
  certificate_number: string;
  status: "created" | "skipped" | "error";
  message: string;
  equipment_id: number | null;
  equipment_name: string | null;
  vri_id: string | null;
};

type RawEquipmentSIBulkImportResult = {
  total_rows: number;
  created_count: number;
  skipped_count: number;
  error_count: number;
  rows: RawEquipmentSIBulkImportRow[];
};

export async function fetchEquipmentFolders(token: string): Promise<EquipmentFolder[]> {
  const response = await apiRequest<RawEquipmentFolder[]>("/equipment/folders", {
    method: "GET",
    token,
  });
  return response.map(mapEquipmentFolder);
}

export async function fetchEquipmentFolderSuggestions(
  token: string,
  folderId: number,
): Promise<EquipmentFolderSuggestions> {
  const response = await apiRequest<RawEquipmentFolderSuggestions>(
    `/equipment/folders/${folderId}/suggestions`,
    {
      method: "GET",
      token,
    },
  );
  return {
    objectNames: response.object_names,
    currentLocations: response.current_locations,
    measurementUnits: response.measurement_units,
    repairRouteCities: response.repair_route_cities,
    repairRouteDestinations: response.repair_route_destinations,
    processBatchNames: response.process_batch_names,
  };
}

export async function fetchFolderEsiMonitoring(
  token: string,
  folderId: number,
): Promise<ESIEquipmentMonitoringItem[]> {
  const response = await apiRequest<RawESIEquipmentMonitoringItem[]>(
    `/equipment/folders/${folderId}/esi-monitoring`,
    {
      method: "GET",
      token,
    },
  );
  return response.map(mapEsiEquipmentMonitoringItem);
}

export async function startFolderRefreshTask(
  token: string,
  folderId: number,
  equipmentIds: number[] = [],
): Promise<EquipmentFolderRefreshTask> {
  const response = await apiRequest<RawEquipmentFolderRefreshTask>(
    `/equipment/folders/${folderId}/refresh-tasks`,
    {
      method: "POST",
      token,
      body: {
        equipment_ids: equipmentIds,
      },
    },
  );
  return mapEquipmentFolderRefreshTask(response);
}

export async function fetchFolderRefreshTaskDetails(
  token: string,
  folderId: number,
  taskId: number,
): Promise<EquipmentFolderRefreshTaskDetails> {
  const response = await apiRequest<RawEquipmentFolderRefreshTaskDetails>(
    `/equipment/folders/${folderId}/refresh-tasks/${taskId}`,
    {
      method: "GET",
      token,
    },
  );
  return {
    task: mapEquipmentFolderRefreshTask(response.task),
    rows: response.rows.map(mapEquipmentFolderRefreshRow),
  };
}

export async function applyFolderRefreshRows(
  token: string,
  folderId: number,
  taskId: number,
  rowIds: number[],
): Promise<EquipmentFolderRefreshApplyResult> {
  const response = await apiRequest<RawEquipmentFolderRefreshApplyResult>(
    `/equipment/folders/${folderId}/refresh-tasks/${taskId}/apply`,
    {
      method: "POST",
      token,
      body: {
        row_ids: rowIds,
      },
    },
  );
  return {
    appliedCount: response.applied_count,
    failedCount: response.failed_count,
    results: response.results.map((item) => ({
      rowId: item.row_id,
      equipmentId: item.equipment_id,
      compositionEntryId: item.composition_entry_id,
      applied: item.applied,
      message: item.message,
    })),
  };
}

export async function fetchFolderProcessSubscriptions(
  token: string,
  folderId: number,
): Promise<FolderProcessSubscription> {
  const response = await apiRequest<RawFolderProcessSubscription>(
    `/equipment/folders/${folderId}/process-subscriptions`,
    {
      method: "GET",
      token,
    },
  );
  return {
    folderId: response.folder_id,
    users: response.users.map((user) => ({
      userId: user.user_id,
      displayName: user.display_name,
      email: user.email,
      role: user.role,
      organization: user.organization,
      position: user.position,
      facility: user.facility,
      enabled: user.enabled,
    })),
  };
}

export async function updateFolderProcessSubscriptions(
  token: string,
  folderId: number,
  userIds: number[],
): Promise<FolderProcessSubscription> {
  const response = await apiRequest<RawFolderProcessSubscription>(
    `/equipment/folders/${folderId}/process-subscriptions`,
    {
      method: "PUT",
      token,
      body: {
        user_ids: userIds,
      },
    },
  );
  return {
    folderId: response.folder_id,
    users: response.users.map((user) => ({
      userId: user.user_id,
      displayName: user.display_name,
      email: user.email,
      role: user.role,
      organization: user.organization,
      position: user.position,
      facility: user.facility,
      enabled: user.enabled,
    })),
  };
}

export async function createEquipmentFolder(
  token: string,
  payload: CreateEquipmentFolderPayload,
): Promise<EquipmentFolder> {
  const response = await apiRequest<RawEquipmentFolder>("/equipment/folders", {
    method: "POST",
    token,
    body: {
      name: payload.name,
      description: payload.description,
      sort_order: payload.sortOrder,
      deadline_preset_id: payload.deadlinePresetId,
    },
  });
  return mapEquipmentFolder(response);
}

export async function updateEquipmentFolder(
  token: string,
  folderId: number,
  payload: CreateEquipmentFolderPayload,
): Promise<EquipmentFolder> {
  const response = await apiRequest<RawEquipmentFolder>(`/equipment/folders/${folderId}`, {
    method: "PATCH",
    token,
    body: {
      name: payload.name,
      description: payload.description,
      sort_order: payload.sortOrder,
      deadline_preset_id: payload.deadlinePresetId,
    },
  });
  return mapEquipmentFolder(response);
}

export async function deleteEquipmentFolder(token: string, folderId: number): Promise<void> {
  await apiRequest(`/equipment/folders/${folderId}`, {
    method: "DELETE",
    token,
  });
}

export async function fetchEquipmentGroups(
  token: string,
  folderId?: number | null,
): Promise<EquipmentGroup[]> {
  const search = folderId ? `?folder_id=${folderId}` : "";
  const response = await apiRequest<RawEquipmentGroup[]>(`/equipment/groups${search}`, {
    method: "GET",
    token,
  });
  return response.map(mapEquipmentGroup);
}

export async function fetchEquipment(
  token: string,
  filters: FetchEquipmentFilters = {},
): Promise<EquipmentItem[]> {
  const search = buildEquipmentFilterSearch(filters);
  const response = await apiRequest<RawEquipment[]>(`/equipment${search}`, {
    method: "GET",
    token,
  });
  return response.map(mapEquipment);
}

export async function fetchEquipmentPage(
  token: string,
  filters: FetchEquipmentFilters & {
    limit: number;
    offset: number;
  },
): Promise<EquipmentPageResult> {
  const searchParams = buildEquipmentFilterSearchParams(filters);
  searchParams.set("limit", String(filters.limit));
  searchParams.set("offset", String(filters.offset));
  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const response = await apiRequest<RawEquipmentPage>(`/equipment/page${suffix}`, {
    method: "GET",
    token,
  });
  return {
    items: response.items.map(mapEquipment),
    total: response.total,
    limit: response.limit,
    offset: response.offset,
  };
}

export async function fetchVerificationQueue(
  token: string,
  { lifecycleStatus, query, folderId }: FetchProcessQueueFilters,
): Promise<VerificationQueueItem[]> {
  const search = new URLSearchParams();
  search.set("lifecycle_status", lifecycleStatus);
  if (query?.trim()) {
    search.set("query", query.trim());
  }
  if (Number.isInteger(folderId) && (folderId ?? 0) > 0) {
    search.set("folder_id", String(folderId));
  }

  const response = await apiRequest<RawVerificationQueueItem[]>(
    `/equipment/verifications?${search.toString()}`,
    {
      method: "GET",
      token,
    },
  );
  return response.map(mapVerificationQueueItem);
}

export async function fetchVerificationQueuePage(
  token: string,
  filters: FetchProcessQueueFilters & {
    limit: number;
    offset: number;
  },
): Promise<VerificationQueuePageResult> {
  const search = new URLSearchParams();
  search.set("lifecycle_status", filters.lifecycleStatus);
  search.set("limit", String(filters.limit));
  search.set("offset", String(filters.offset));
  if (filters.query?.trim()) {
    search.set("query", filters.query.trim());
  }
  if (Number.isInteger(filters.folderId) && (filters.folderId ?? 0) > 0) {
    search.set("folder_id", String(filters.folderId));
  }

  const response = await apiRequest<RawVerificationQueuePage>(
    `/equipment/verifications/page?${search.toString()}`,
    {
      method: "GET",
      token,
    },
  );
  return {
    items: response.items.map(mapVerificationQueueItem),
    totalGroups: response.total_groups,
    totalItems: response.total_items,
    limit: response.limit,
    offset: response.offset,
  };
}

export async function fetchRepairQueue(
  token: string,
  { lifecycleStatus, query, folderId }: FetchProcessQueueFilters,
): Promise<RepairQueueItem[]> {
  const search = new URLSearchParams();
  search.set("lifecycle_status", lifecycleStatus);
  if (query?.trim()) {
    search.set("query", query.trim());
  }
  if (Number.isInteger(folderId) && (folderId ?? 0) > 0) {
    search.set("folder_id", String(folderId));
  }
  const response = await apiRequest<RawRepairQueueItem[]>(`/equipment/repairs?${search.toString()}`, {
    method: "GET",
    token,
  });
  return response.map(mapRepairQueueItem);
}

export async function fetchRepairQueuePage(
  token: string,
  filters: FetchProcessQueueFilters & {
    limit: number;
    offset: number;
  },
): Promise<RepairQueuePageResult> {
  const search = new URLSearchParams();
  search.set("lifecycle_status", filters.lifecycleStatus);
  search.set("limit", String(filters.limit));
  search.set("offset", String(filters.offset));
  if (filters.query?.trim()) {
    search.set("query", filters.query.trim());
  }
  if (Number.isInteger(filters.folderId) && (filters.folderId ?? 0) > 0) {
    search.set("folder_id", String(filters.folderId));
  }
  const response = await apiRequest<RawRepairQueuePage>(
    `/equipment/repairs/page?${search.toString()}`,
    {
      method: "GET",
      token,
    },
  );
  return {
    items: response.items.map(mapRepairQueueItem),
    totalGroups: response.total_groups,
    totalItems: response.total_items,
    limit: response.limit,
    offset: response.offset,
  };
}

export async function fetchEquipmentVerificationHistory(
  token: string,
  equipmentId: number,
): Promise<VerificationQueueItem[]> {
  const response = await apiRequest<RawVerificationQueueItem[]>(
    `/equipment/${equipmentId}/verification/history`,
    {
      method: "GET",
      token,
    },
  );
  return response.map(mapVerificationQueueItem);
}

export async function fetchEquipmentRepairHistory(
  token: string,
  equipmentId: number,
): Promise<RepairQueueItem[]> {
  const response = await apiRequest<RawRepairQueueItem[]>(
    `/equipment/${equipmentId}/repair/history`,
    {
      method: "GET",
      token,
    },
  );
  return response.map(mapRepairQueueItem);
}

export async function exportEquipmentRegistryXlsx(
  token: string,
  filters: FetchEquipmentFilters = {},
): Promise<{ blob: Blob; fileName: string }> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/equipment/export/xlsx${buildEquipmentFilterSearch(filters)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new ApiError(
      0,
      "Не удалось связаться с сервером. Проверь доступность приложения и настройки API.",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      await getResponseErrorMessage(response, "Не удалось выгрузить Excel-файл."),
    );
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileName = parseContentDispositionFileName(contentDisposition) ?? "equipment-registry.xlsx";
  return { blob, fileName };
}

export async function exportRepairQueueXlsx(
  token: string,
  { lifecycleStatus, query, folderId }: FetchProcessQueueFilters,
): Promise<{ blob: Blob; fileName: string }> {
  const search = new URLSearchParams();
  search.set("lifecycle_status", lifecycleStatus);
  if (query?.trim()) {
    search.set("query", query.trim());
  }
  if (Number.isInteger(folderId) && (folderId ?? 0) > 0) {
    search.set("folder_id", String(folderId));
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/equipment/repairs/export/xlsx?${search.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new ApiError(
      0,
      "Не удалось связаться с сервером. Проверь доступность приложения и настройки API.",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      await getResponseErrorMessage(response, "Не удалось выгрузить Excel-файл ремонтов."),
    );
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileName = parseContentDispositionFileName(contentDisposition) ?? "repairs.xlsx";
  return { blob, fileName };
}

export async function exportVerificationQueueXlsx(
  token: string,
  { lifecycleStatus, query, folderId }: FetchProcessQueueFilters,
): Promise<{ blob: Blob; fileName: string }> {
  const search = new URLSearchParams();
  search.set("lifecycle_status", lifecycleStatus);
  if (query?.trim()) {
    search.set("query", query.trim());
  }
  if (Number.isInteger(folderId) && (folderId ?? 0) > 0) {
    search.set("folder_id", String(folderId));
  }

  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}/equipment/verifications/export/xlsx?${search.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
  } catch {
    throw new ApiError(
      0,
      "Не удалось связаться с сервером. Проверь доступность приложения и настройки API.",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      await getResponseErrorMessage(response, "Не удалось выгрузить Excel-файл поверок."),
    );
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileName = parseContentDispositionFileName(contentDisposition) ?? "verification.xlsx";
  return { blob, fileName };
}

export async function fetchEquipmentById(token: string, equipmentId: number): Promise<EquipmentItem> {
  const response = await apiRequest<RawEquipment>(`/equipment/${equipmentId}`, {
    method: "GET",
    token,
  });
  return mapEquipment(response);
}

export async function fetchEquipmentDetails(
  token: string,
  equipmentId: number,
): Promise<EquipmentDetailsResult> {
  const response = await apiRequest<RawEquipmentDetails>(`/equipment/${equipmentId}/details`, {
    method: "GET",
    token,
  });
  return mapEquipmentDetails(response);
}

export async function fetchEquipmentProcessSubscription(
  token: string,
  equipmentId: number,
): Promise<boolean> {
  const response = await apiRequest<RawEquipmentProcessSubscription>(
    `/equipment/${equipmentId}/process-subscription`,
    {
      method: "GET",
      token,
    },
  );
  return response.enabled;
}

export async function fetchEquipmentShareRecipients(
  token: string,
  equipmentId: number,
): Promise<EquipmentShareRecipients> {
  const response = await apiRequest<RawEquipmentShareRecipients>(
    `/equipment/${equipmentId}/share-recipients`,
    {
      method: "GET",
      token,
    },
  );
  return {
    equipmentId: response.equipment_id,
    folderId: response.folder_id,
    users: response.users.map((user) => ({
      userId: user.user_id,
      displayName: user.display_name,
      email: user.email,
      role: user.role,
      organization: user.organization,
      position: user.position,
      facility: user.facility,
    })),
  };
}

export async function shareEquipment(
  token: string,
  equipmentId: number,
  userIds: number[],
): Promise<EquipmentShareResult> {
  const response = await apiRequest<RawEquipmentShareResult>(`/equipment/${equipmentId}/share`, {
    method: "POST",
    token,
    body: {
      user_ids: userIds,
    },
  });
  return {
    status: response.status,
    message: response.message,
    recipientCount: response.recipient_count,
  };
}

export async function updateEquipmentProcessSubscription(
  token: string,
  equipmentId: number,
  enabled: boolean,
): Promise<boolean> {
  const response = await apiRequest<RawEquipmentProcessSubscription>(
    `/equipment/${equipmentId}/process-subscription`,
    {
      method: "PUT",
      token,
      body: { enabled },
    },
  );
  return response.enabled;
}

export async function createEquipmentRepair(
  token: string,
  equipmentId: number,
  payload: CreateEquipmentRepairPayload,
): Promise<EquipmentRepair> {
  const formData = new FormData();
  if (payload.isOnSite) {
    formData.set("is_on_site", "true");
  }
  if (payload.stageTemplateVariantId) {
    formData.set("stage_template_variant_id", payload.stageTemplateVariantId);
  }
  formData.set("route_city", payload.routeCity);
  formData.set("route_destination", payload.routeDestination);
  formData.set("sent_to_repair_at", normalizeDateForApi(payload.sentToRepairAt));
  if (payload.initialMessageText.trim()) {
    formData.set("initial_message_text", payload.initialMessageText.trim());
  }
  if (payload.initialMessageIsPrivate) {
    formData.set("initial_message_is_private", "true");
  }
  for (const file of payload.files) {
    formData.append("files", file);
  }

  const response = await apiRequest<RawEquipmentRepair>(`/equipment/${equipmentId}/repair`, {
    method: "POST",
    token,
    body: formData,
  });
  return mapEquipmentRepair(response);
}

export async function createRepairBatch(
  token: string,
  payload: CreateRepairBatchPayload,
): Promise<EquipmentRepair[]> {
  const formData = new FormData();
  for (const equipmentId of payload.equipmentIds) {
    formData.append("equipment_ids", String(equipmentId));
  }
  formData.set("batch_name", payload.batchName);
  if (payload.isOnSite) {
    formData.set("is_on_site", "true");
  }
  if (payload.stageTemplateVariantId) {
    formData.set("stage_template_variant_id", payload.stageTemplateVariantId);
  }
  formData.set("route_city", payload.routeCity);
  formData.set("route_destination", payload.routeDestination);
  formData.set("sent_to_repair_at", normalizeDateForApi(payload.sentToRepairAt));
  if (payload.initialMessageText.trim()) {
    formData.set("initial_message_text", payload.initialMessageText.trim());
  }
  if (payload.initialMessageIsPrivate) {
    formData.set("initial_message_is_private", "true");
  }
  for (const file of payload.files) {
    formData.append("files", file);
  }

  const response = await apiRequest<RawEquipmentRepair[]>("/equipment/repairs/bulk", {
    method: "POST",
    token,
    body: formData,
  });
  return response.map(mapEquipmentRepair);
}

export async function updateEquipmentRepairMilestones(
  token: string,
  equipmentId: number,
  payload: UpdateRepairMilestonesPayload,
): Promise<EquipmentRepair> {
  const response = await apiRequest<RawEquipmentRepair>(`/equipment/${equipmentId}/repair`, {
    method: "PATCH",
    token,
    body: {
      sent_to_repair_at: normalizeOptionalDateForApi(payload.sentToRepairAt),
      arrived_to_destination_at: normalizeOptionalDateForApi(payload.arrivedToDestinationAt),
      sent_from_repair_at: normalizeOptionalDateForApi(payload.sentFromRepairAt),
      sent_from_irkutsk_at: normalizeOptionalDateForApi(payload.sentFromIrkutskAt),
      arrived_to_lensk_at: normalizeOptionalDateForApi(payload.arrivedToLenskAt),
      actually_received_at: normalizeOptionalDateForApi(payload.actuallyReceivedAt),
      incoming_control_at: normalizeOptionalDateForApi(payload.incomingControlAt),
      paid_at: normalizeOptionalDateForApi(payload.paidAt),
      custom_stages: mapProcessCustomStagesToApi(payload.customStages),
    },
  });
  return mapEquipmentRepair(response);
}

export async function updateRepairBatchMilestones(
  token: string,
  batchKey: string,
  payload: UpdateRepairMilestonesPayload,
): Promise<EquipmentRepair[]> {
  const response = await apiRequest<RawEquipmentRepair[]>(
    `/equipment/repairs/batch/${batchKey}`,
    {
      method: "PATCH",
      token,
      body: {
        sent_to_repair_at: normalizeOptionalDateForApi(payload.sentToRepairAt),
        arrived_to_destination_at: normalizeOptionalDateForApi(payload.arrivedToDestinationAt),
        sent_from_repair_at: normalizeOptionalDateForApi(payload.sentFromRepairAt),
        sent_from_irkutsk_at: normalizeOptionalDateForApi(payload.sentFromIrkutskAt),
        arrived_to_lensk_at: normalizeOptionalDateForApi(payload.arrivedToLenskAt),
        actually_received_at: normalizeOptionalDateForApi(payload.actuallyReceivedAt),
        incoming_control_at: normalizeOptionalDateForApi(payload.incomingControlAt),
        paid_at: normalizeOptionalDateForApi(payload.paidAt),
        custom_stages: mapProcessCustomStagesToApi(payload.customStages),
      },
    },
  );
  return response.map(mapEquipmentRepair);
}

export async function closeEquipmentRepair(
  token: string,
  equipmentId: number,
): Promise<EquipmentRepair> {
  const response = await apiRequest<RawEquipmentRepair>(`/equipment/${equipmentId}/repair/close`, {
    method: "POST",
    token,
  });
  return mapEquipmentRepair(response);
}

export async function closeRepairBatch(
  token: string,
  batchKey: string,
): Promise<EquipmentRepair[]> {
  const response = await apiRequest<RawEquipmentRepair[]>(
    `/equipment/repairs/batch/${batchKey}/close`,
    {
      method: "POST",
      token,
    },
  );
  return response.map(mapEquipmentRepair);
}

export async function deleteRepairArchive(
  token: string,
  repairId: number,
): Promise<void> {
  await apiRequest(`/equipment/repairs/${repairId}`, {
    method: "DELETE",
    token,
  });
}

export async function updateRepairBatchItems(
  token: string,
  batchKey: string,
  payload: UpdateProcessBatchItemsPayload,
): Promise<EquipmentRepair[]> {
  const response = await apiRequest<RawEquipmentRepair[]>(
    `/equipment/repairs/batch/${batchKey}/items`,
    {
      method: "PATCH",
      token,
      body: {
        add_equipment_ids: payload.addEquipmentIds ?? [],
        remove_equipment_ids: payload.removeEquipmentIds ?? [],
      },
    },
  );
  return response.map(mapEquipmentRepair);
}

export async function createEquipmentVerification(
  token: string,
  equipmentId: number,
  payload: CreateEquipmentVerificationPayload,
): Promise<EquipmentVerification> {
  const formData = new FormData();
  if (payload.flowMode) {
    formData.set("flow_mode", payload.flowMode);
  }
  if (payload.stageTemplateVariantId) {
    formData.set("stage_template_variant_id", payload.stageTemplateVariantId);
  }
  formData.set("route_city", payload.routeCity);
  formData.set("route_destination", payload.routeDestination);
  formData.set("sent_to_verification_at", normalizeDateForApi(payload.sentToVerificationAt));
  if (payload.initialMessageText.trim()) {
    formData.set("initial_message_text", payload.initialMessageText.trim());
  }
  if (payload.initialMessageIsPrivate) {
    formData.set("initial_message_is_private", "true");
  }
  for (const file of payload.files) {
    formData.append("files", file);
  }

  const response = await apiRequest<RawEquipmentVerification>(
    `/equipment/${equipmentId}/verification`,
    {
      method: "POST",
      token,
      body: formData,
    },
  );
  return mapEquipmentVerification(response);
}

export async function createVerificationBatch(
  token: string,
  payload: CreateVerificationBatchPayload,
): Promise<EquipmentVerification[]> {
  const formData = new FormData();
  for (const equipmentId of payload.equipmentIds) {
    formData.append("equipment_ids", String(equipmentId));
  }
  formData.set("batch_name", payload.batchName);
  if (payload.flowMode) {
    formData.set("flow_mode", payload.flowMode);
  }
  if (payload.stageTemplateVariantId) {
    formData.set("stage_template_variant_id", payload.stageTemplateVariantId);
  }
  formData.set("route_city", payload.routeCity);
  formData.set("route_destination", payload.routeDestination);
  formData.set("sent_to_verification_at", normalizeDateForApi(payload.sentToVerificationAt));
  if (payload.initialMessageText.trim()) {
    formData.set("initial_message_text", payload.initialMessageText.trim());
  }
  if (payload.initialMessageIsPrivate) {
    formData.set("initial_message_is_private", "true");
  }
  for (const file of payload.files) {
    formData.append("files", file);
  }

  const response = await apiRequest<RawEquipmentVerification[]>("/equipment/verifications/bulk", {
    method: "POST",
    token,
    body: formData,
  });
  return response.map(mapEquipmentVerification);
}

export async function updateEquipmentVerificationMilestones(
  token: string,
  equipmentId: number,
  payload: UpdateEquipmentVerificationMilestonesPayload,
): Promise<EquipmentVerification> {
  const response = await apiRequest<RawEquipmentVerification>(
    `/equipment/${equipmentId}/verification`,
    {
      method: "PATCH",
      token,
      body: {
        received_at_destination_at: normalizeOptionalDateForApi(payload.receivedAtDestinationAt),
        handed_to_csm_at: normalizeOptionalDateForApi(payload.handedToCsmAt),
        verification_completed_at: normalizeOptionalDateForApi(payload.verificationCompletedAt),
        picked_up_from_csm_at: normalizeOptionalDateForApi(payload.pickedUpFromCsmAt),
        shipped_back_at: normalizeOptionalDateForApi(payload.shippedBackAt),
        returned_from_verification_at: normalizeOptionalDateForApi(payload.returnedFromVerificationAt),
        custom_stages: mapProcessCustomStagesToApi(payload.customStages),
      },
    },
  );
  return mapEquipmentVerification(response);
}

export async function updateVerificationBatchMilestones(
  token: string,
  batchKey: string,
  payload: UpdateEquipmentVerificationMilestonesPayload,
): Promise<EquipmentVerification[]> {
  const response = await apiRequest<RawEquipmentVerification[]>(
    `/equipment/verifications/batch/${batchKey}`,
    {
      method: "PATCH",
      token,
      body: {
        received_at_destination_at: normalizeOptionalDateForApi(payload.receivedAtDestinationAt),
        handed_to_csm_at: normalizeOptionalDateForApi(payload.handedToCsmAt),
        verification_completed_at: normalizeOptionalDateForApi(payload.verificationCompletedAt),
        picked_up_from_csm_at: normalizeOptionalDateForApi(payload.pickedUpFromCsmAt),
        shipped_back_at: normalizeOptionalDateForApi(payload.shippedBackAt),
        returned_from_verification_at: normalizeOptionalDateForApi(payload.returnedFromVerificationAt),
        custom_stages: mapProcessCustomStagesToApi(payload.customStages),
      },
    },
  );
  return response.map(mapEquipmentVerification);
}

export async function closeEquipmentVerification(
  token: string,
  equipmentId: number,
): Promise<EquipmentVerification> {
  const response = await apiRequest<RawEquipmentVerification>(
    `/equipment/${equipmentId}/verification/close`,
    {
      method: "POST",
      token,
    },
  );
  return mapEquipmentVerification(response);
}

export async function closeVerificationBatch(
  token: string,
  batchKey: string,
): Promise<EquipmentVerification[]> {
  const response = await apiRequest<RawEquipmentVerification[]>(
    `/equipment/verifications/batch/${batchKey}/close`,
    {
      method: "POST",
      token,
    },
  );
  return response.map(mapEquipmentVerification);
}

export async function deleteVerificationArchive(
  token: string,
  verificationId: number,
): Promise<void> {
  await apiRequest(`/equipment/verifications/${verificationId}`, {
    method: "DELETE",
    token,
  });
}

export async function updateVerificationBatchItems(
  token: string,
  batchKey: string,
  payload: UpdateProcessBatchItemsPayload,
): Promise<EquipmentVerification[]> {
  const response = await apiRequest<RawEquipmentVerification[]>(
    `/equipment/verifications/batch/${batchKey}/items`,
    {
      method: "PATCH",
      token,
      body: {
        add_equipment_ids: payload.addEquipmentIds ?? [],
        remove_equipment_ids: payload.removeEquipmentIds ?? [],
      },
    },
  );
  return response.map(mapEquipmentVerification);
}

export async function fetchEquipmentRepairMessages(
  token: string,
  equipmentId: number,
): Promise<RepairMessage[]> {
  const response = await apiRequest<RawRepairMessage[]>(`/equipment/${equipmentId}/repair/messages`, {
    method: "GET",
    token,
  });
  return response.map(mapRepairMessage);
}

export async function fetchEquipmentVerificationMessages(
  token: string,
  equipmentId: number,
): Promise<VerificationMessage[]> {
  const response = await apiRequest<RawVerificationMessage[]>(
    `/equipment/${equipmentId}/verification/messages`,
    {
      method: "GET",
      token,
    },
  );
  return response.map(mapVerificationMessage);
}

export async function createEquipmentRepairMessage(
  token: string,
  equipmentId: number,
  payload: CreateRepairMessagePayload,
): Promise<RepairMessage> {
  const formData = new FormData();
  if (payload.text.trim()) {
    formData.set("text", payload.text.trim());
  }
  if (payload.isPrivate) {
    formData.set("is_private", "true");
  }
  for (const file of payload.files) {
    formData.append("files", file);
  }

  const response = await apiRequest<RawRepairMessage>(`/equipment/${equipmentId}/repair/messages`, {
    method: "POST",
    token,
    body: formData,
  });
  return mapRepairMessage(response);
}

export async function createEquipmentVerificationMessage(
  token: string,
  equipmentId: number,
  payload: CreateVerificationMessagePayload,
): Promise<VerificationMessage> {
  const formData = new FormData();
  if (payload.text.trim()) {
    formData.set("text", payload.text.trim());
  }
  if (payload.isPrivate) {
    formData.set("is_private", "true");
  }
  for (const file of payload.files) {
    formData.append("files", file);
  }

  const response = await apiRequest<RawVerificationMessage>(
    `/equipment/${equipmentId}/verification/messages`,
    {
      method: "POST",
      token,
      body: formData,
    },
  );
  return mapVerificationMessage(response);
}

export async function updateEquipmentRepairMessage(
  token: string,
  equipmentId: number,
  messageId: number,
  payload: UpdateRepairMessagePayload,
): Promise<RepairMessage> {
  const response = await apiRequest<RawRepairMessage>(
    `/equipment/${equipmentId}/repair/messages/${messageId}`,
    {
      method: "PATCH",
      token,
      body: {
        text: payload.text,
      },
    },
  );
  return mapRepairMessage(response);
}

export async function updateEquipmentVerificationMessage(
  token: string,
  equipmentId: number,
  messageId: number,
  payload: UpdateVerificationMessagePayload,
): Promise<VerificationMessage> {
  const response = await apiRequest<RawVerificationMessage>(
    `/equipment/${equipmentId}/verification/messages/${messageId}`,
    {
      method: "PATCH",
      token,
      body: {
        text: payload.text,
      },
    },
  );
  return mapVerificationMessage(response);
}

export async function deleteEquipmentRepairMessage(
  token: string,
  equipmentId: number,
  messageId: number,
): Promise<void> {
  await apiRequest(`/equipment/${equipmentId}/repair/messages/${messageId}`, {
    method: "DELETE",
    token,
  });
}

export async function deleteEquipmentVerificationMessage(
  token: string,
  equipmentId: number,
  messageId: number,
): Promise<void> {
  await apiRequest(`/equipment/${equipmentId}/verification/messages/${messageId}`, {
    method: "DELETE",
    token,
  });
}

export async function downloadRepairMessageAttachment(
  token: string,
  equipmentId: number,
  messageId: number,
  attachmentId: number,
): Promise<{ blob: Blob; fileName: string }> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}/equipment/${equipmentId}/repair/messages/${messageId}/attachments/${attachmentId}/download`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
  } catch {
    throw new ApiError(
      0,
      "Не удалось связаться с сервером. Проверь доступность приложения и настройки API.",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      await getResponseErrorMessage(response, "Не удалось скачать вложение ремонта."),
    );
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileName =
    parseContentDispositionFileName(contentDisposition) ?? `repair-attachment-${attachmentId}`;
  return { blob, fileName };
}

export async function downloadVerificationMessageAttachment(
  token: string,
  equipmentId: number,
  messageId: number,
  attachmentId: number,
): Promise<{ blob: Blob; fileName: string }> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}/equipment/${equipmentId}/verification/messages/${messageId}/attachments/${attachmentId}/download`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
  } catch {
    throw new ApiError(
      0,
      "Не удалось связаться с сервером. Проверь доступность приложения и настройки API.",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      await getResponseErrorMessage(response, "Не удалось скачать вложение поверки."),
    );
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileName =
    parseContentDispositionFileName(contentDisposition) ?? `verification-attachment-${attachmentId}`;
  return { blob, fileName };
}

export async function downloadVerificationArchiveZip(
  token: string,
  verificationId: number,
): Promise<{ blob: Blob; fileName: string }> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/equipment/verifications/${verificationId}/archive.zip`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new ApiError(
      0,
      "Не удалось связаться с сервером. Проверь доступность приложения и настройки API.",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      await getResponseErrorMessage(response, "Не удалось скачать архив поверки."),
    );
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileName =
    parseContentDispositionFileName(contentDisposition) ?? `verification-archive-${verificationId}.zip`;
  return { blob, fileName };
}

export async function downloadRepairArchiveZip(
  token: string,
  repairId: number,
): Promise<{ blob: Blob; fileName: string }> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/equipment/repairs/${repairId}/archive.zip`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new ApiError(
      0,
      "Не удалось связаться с сервером. Проверь доступность приложения и настройки API.",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      await getResponseErrorMessage(response, "Не удалось скачать архив ремонта."),
    );
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileName =
    parseContentDispositionFileName(contentDisposition) ?? `repair-archive-${repairId}.zip`;
  return { blob, fileName };
}

export async function fetchEquipmentAttachments(
  token: string,
  equipmentId: number,
): Promise<EquipmentAttachment[]> {
  const response = await apiRequest<RawEquipmentAttachment[]>(
    `/equipment/${equipmentId}/attachments`,
    {
      method: "GET",
      token,
    },
  );
  return response.map(mapEquipmentAttachment);
}

export async function fetchEquipmentComments(
  token: string,
  equipmentId: number,
): Promise<EquipmentComment[]> {
  const response = await apiRequest<RawEquipmentComment[]>(`/equipment/${equipmentId}/comments`, {
    method: "GET",
    token,
  });
  return response.map(mapEquipmentComment);
}

export async function createEquipmentComment(
  token: string,
  equipmentId: number,
  payload: CreateEquipmentCommentPayload,
): Promise<EquipmentComment> {
  const formData = new FormData();
  formData.set("text", payload.text);
  if (payload.isPrivate) {
    formData.set("is_private", "true");
  }
  for (const file of payload.files ?? []) {
    formData.append("files", file);
  }
  for (const uploadToken of payload.uploadedAttachmentTokens ?? []) {
    formData.append("uploaded_attachment_tokens", uploadToken);
  }
  const response = await apiRequest<RawEquipmentComment>(`/equipment/${equipmentId}/comments`, {
    method: "POST",
    token,
    body: formData,
  });
  return mapEquipmentComment(response);
}

export async function uploadEquipmentCommentDraftAttachment(
  token: string,
  equipmentId: number,
  file: File,
): Promise<EquipmentCommentDraftAttachment> {
  const formData = new FormData();
  formData.set("file", file);
  const response = await apiRequest<RawEquipmentCommentDraftAttachment>(
    `/equipment/${equipmentId}/comment-uploads`,
    {
      method: "POST",
      token,
      body: formData,
    },
  );
  return mapEquipmentCommentDraftAttachment(response);
}

export async function deleteEquipmentCommentDraftAttachment(
  token: string,
  equipmentId: number,
  uploadToken: string,
): Promise<void> {
  await apiRequest(`/equipment/${equipmentId}/comment-uploads/${uploadToken}`, {
    method: "DELETE",
    token,
  });
}

export async function updateEquipmentComment(
  token: string,
  equipmentId: number,
  commentId: number,
  payload: UpdateEquipmentCommentPayload,
): Promise<EquipmentComment> {
  const response = await apiRequest<RawEquipmentComment>(
    `/equipment/${equipmentId}/comments/${commentId}`,
    {
      method: "PATCH",
      token,
      body: {
        text: payload.text,
      },
    },
  );
  return mapEquipmentComment(response);
}

export async function deleteEquipmentComment(
  token: string,
  equipmentId: number,
  commentId: number,
): Promise<void> {
  await apiRequest(`/equipment/${equipmentId}/comments/${commentId}`, {
    method: "DELETE",
    token,
  });
}

export async function downloadEquipmentCommentAttachment(
  token: string,
  equipmentId: number,
  commentId: number,
  attachmentId: number,
): Promise<{ blob: Blob; fileName: string }> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}/equipment/${equipmentId}/comments/${commentId}/attachments/${attachmentId}/download`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
  } catch {
    throw new ApiError(
      0,
      "Не удалось связаться с сервером. Проверь доступность приложения и настройки API.",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      await getResponseErrorMessage(response, "Не удалось скачать вложение комментария."),
    );
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileName =
    parseContentDispositionFileName(contentDisposition) ?? `comment-attachment-${attachmentId}`;
  return { blob, fileName };
}

export async function uploadEquipmentAttachment(
  token: string,
  equipmentId: number,
  file: File,
): Promise<EquipmentAttachment> {
  const formData = new FormData();
  formData.set("file", file);
  const response = await apiRequest<RawEquipmentAttachment>(
    `/equipment/${equipmentId}/attachments`,
    {
      method: "POST",
      token,
      body: formData,
    },
  );
  return mapEquipmentAttachment(response);
}

export async function downloadEquipmentAttachment(
  token: string,
  equipmentId: number,
  attachmentId: number,
): Promise<{ blob: Blob; fileName: string }> {
  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl}/equipment/${equipmentId}/attachments/${attachmentId}/download`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );
  } catch {
    throw new ApiError(
      0,
      "Не удалось связаться с сервером. Проверь доступность приложения и настройки API.",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      await getResponseErrorMessage(response, "Не удалось скачать вложение."),
    );
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileName = parseContentDispositionFileName(contentDisposition) ?? `attachment-${attachmentId}`;
  return { blob, fileName };
}

export async function deleteEquipmentAttachment(
  token: string,
  equipmentId: number,
  attachmentId: number,
): Promise<void> {
  await apiRequest(`/equipment/${equipmentId}/attachments/${attachmentId}`, {
    method: "DELETE",
    token,
  });
}

export async function refreshEquipmentSi(
  token: string,
  equipmentId: number,
  payload: CreateEquipmentSIVerificationPayload,
): Promise<EquipmentItem> {
  const response = await apiRequest<RawEquipment>(`/equipment/${equipmentId}/si/refresh`, {
    method: "POST",
    token,
    body: {
      si_verification: mapSIVerificationPayload(payload),
    },
  });
  return mapEquipment(response);
}

export async function createEquipmentEsiCompositionEntry(
  token: string,
  equipmentId: number,
  payload: CreateEquipmentESICompositionEntryPayload,
): Promise<EquipmentESICompositionEntry> {
  const response = await apiRequest<RawEquipmentESICompositionEntry>(
    `/equipment/${equipmentId}/esi-composition`,
    {
      method: "POST",
      token,
      body: {
        module_kind: payload.moduleKind ?? "EXTERNAL",
        measurement_limit: emptyToNull(payload.measurementLimit ?? ""),
        si_verification: mapSIVerificationPayload(payload.siVerification),
      },
    },
  );
  return mapEquipmentESICompositionEntry(response);
}

export async function updateEquipmentEsiCompositionEntry(
  token: string,
  equipmentId: number,
  entryId: number,
  payload: UpdateEquipmentESICompositionEntryPayload,
): Promise<EquipmentESICompositionEntry> {
  const response = await apiRequest<RawEquipmentESICompositionEntry>(
    `/equipment/${equipmentId}/esi-composition/${entryId}`,
    {
      method: "PATCH",
      token,
      body: {
        measurement_limit: emptyToNull(payload.measurementLimit),
      },
    },
  );
  return mapEquipmentESICompositionEntry(response);
}

export async function deleteEquipmentEsiCompositionEntry(
  token: string,
  equipmentId: number,
  entryId: number,
): Promise<void> {
  await apiRequest(`/equipment/${equipmentId}/esi-composition/${entryId}`, {
    method: "DELETE",
    token,
  });
}

export async function importSIEquipmentExcel(
  token: string,
  payload: ImportSIExcelPayload,
): Promise<EquipmentSIBulkImportResult> {
  const formData = new FormData();
  formData.set("folder_id", String(payload.folderId));
  formData.set("object_name", payload.objectName);
  formData.set("status_value", payload.status);
  formData.set("current_location_manual", payload.currentLocationManual);
  formData.set("file", payload.file);

  const response = await apiRequest<RawEquipmentSIBulkImportResult>("/equipment/si/import", {
    method: "POST",
    token,
    body: formData,
  });
  return mapEquipmentSIBulkImportResult(response);
}

export async function createEquipment(
  token: string,
  payload: CreateEquipmentPayload,
): Promise<EquipmentItem> {
  const response = await apiRequest<RawEquipment>("/equipment", {
    method: "POST",
    token,
    body: {
      folder_id: payload.folderId,
      group_id: payload.groupId,
      object_name: payload.objectName,
      equipment_type: payload.equipmentType,
      name: payload.name,
      modification: emptyToNull(payload.modification),
      serial_number: emptyToNull(payload.serialNumber),
      manufacture_year: payload.manufactureYear,
      measurement_range_start: emptyToNull(payload.measurementRangeStart),
      measurement_range_end: emptyToNull(payload.measurementRangeEnd),
      measurement_unit: emptyToNull(payload.measurementUnit),
      status: payload.status,
      created_manually: payload.createdManually,
      exclude_from_arshin_refresh: payload.excludeFromArshinRefresh,
      current_location_manual: emptyToNull(payload.currentLocationManual),
      compliance_date: emptyToNull(payload.complianceDate),
      compliance_interval_months: payload.complianceIntervalMonths,
      manual_verification_interval_months: payload.manualVerificationIntervalMonths,
      si_verification: payload.siVerification ? mapSIVerificationPayload(payload.siVerification) : null,
      esi_internal_modules:
        payload.esiInternalModules?.map((item) => ({
          registry_number: item.registryNumber,
          measurement_limit: emptyToNull(item.measurementLimit),
        })) ?? [],
    },
  });
  return mapEquipment(response);
}

export async function updateEquipment(
  token: string,
  equipmentId: number,
  payload: UpdateEquipmentPayload,
): Promise<EquipmentItem> {
  const response = await apiRequest<RawEquipment>(`/equipment/${equipmentId}`, {
    method: "PATCH",
    token,
    body: {
      folder_id: payload.folderId,
      group_id: payload.groupId,
      object_name: payload.objectName,
      equipment_type: payload.equipmentType,
      name: payload.name,
      modification: emptyToNull(payload.modification),
      serial_number: emptyToNull(payload.serialNumber),
      manufacture_year: payload.manufactureYear,
      measurement_range_start: emptyToNull(payload.measurementRangeStart),
      measurement_range_end: emptyToNull(payload.measurementRangeEnd),
      measurement_unit: emptyToNull(payload.measurementUnit),
      status: payload.status,
      current_location_manual: emptyToNull(payload.currentLocationManual),
      compliance_date: emptyToNull(payload.complianceDate),
      compliance_interval_months: payload.complianceIntervalMonths,
      manual_verification_interval_months: payload.manualVerificationIntervalMonths,
    },
  });
  return mapEquipment(response);
}

export async function updateEquipmentArshinRefreshExclusion(
  token: string,
  equipmentId: number,
  excludeFromArshinRefresh: boolean,
): Promise<EquipmentItem> {
  const response = await apiRequest<RawEquipment>(`/equipment/${equipmentId}`, {
    method: "PATCH",
    token,
    body: {
      exclude_from_arshin_refresh: excludeFromArshinRefresh,
    },
  });
  return mapEquipment(response);
}

export async function deleteEquipment(token: string, equipmentId: number): Promise<void> {
  await apiRequest(`/equipment/${equipmentId}`, {
    method: "DELETE",
    token,
  });
}

export async function deleteEquipmentBatch(
  token: string,
  equipmentIds: number[],
): Promise<void> {
  await apiRequest("/equipment/delete-batch", {
    method: "POST",
    token,
    body: {
      equipment_ids: equipmentIds,
    },
  });
}

export const equipmentTypeLabels: Record<EquipmentType, string> = {
  SI: "СИ",
  ESI: "ЭСИ",
  IO: "ИО",
  VO: "ВО",
  OTHER: "Др.",
};

export const equipmentTypeSelectionLabels: Record<EquipmentType, string> = {
  SI: "СИ (Средство измерения)",
  ESI: "ЭСИ (Эталонное средство измерения)",
  IO: "ИО (Испытательное оборудование)",
  VO: "ВО (Вспомогательное оборудование)",
  OTHER: "Др. (Прочее оборудование)",
};

export const equipmentStatusLabels: Record<EquipmentStatus, string> = {
  IN_WORK: "В работе",
  IN_VERIFICATION: "В поверке",
  IN_REPAIR: "В ремонте",
  ARCHIVED: "Архив",
};

export function getEquipmentStatusLabel(item: Pick<EquipmentItem, "status" | "activeRepair" | "activeVerification">): string {
  if (item.activeRepair && item.activeVerification) {
    return "В ремонте/поверке";
  }
  if (item.activeRepair) {
    return equipmentStatusLabels.IN_REPAIR;
  }
  if (item.activeVerification) {
    return equipmentStatusLabels.IN_VERIFICATION;
  }
  return equipmentStatusLabels[item.status];
}

export function getEquipmentNextDueDate(
  item: Pick<EquipmentItem, "equipmentType" | "complianceDate" | "complianceIntervalMonths" | "siVerification">,
): string | null {
  if (isArshinEquipmentType(item.equipmentType)) {
    return item.siVerification?.validDate ?? null;
  }

  if (item.equipmentType !== "IO" && item.equipmentType !== "VO") {
    return null;
  }

  if (!item.complianceDate || !item.complianceIntervalMonths) {
    return null;
  }

  return addMonthsToIsoDate(item.complianceDate, item.complianceIntervalMonths);
}

export function getEquipmentValidFromDate(
  item: Pick<EquipmentItem, "equipmentType" | "complianceDate" | "siVerification">,
): string | null {
  if (isArshinEquipmentType(item.equipmentType)) {
    return item.siVerification?.verificationDate ?? null;
  }

  if (item.equipmentType !== "IO" && item.equipmentType !== "VO") {
    return null;
  }

  return item.complianceDate ?? null;
}

export function getEquipmentNextDueColumnLabel(
  item: Pick<EquipmentItem, "equipmentType">,
): string | null {
  if (isArshinEquipmentType(item.equipmentType)) {
    return "След. поверка";
  }
  if (item.equipmentType === "IO") {
    return "След. аттестация";
  }
  if (item.equipmentType === "VO") {
    return "След. освид.";
  }
  return null;
}

export function getEquipmentComplianceDateLabel(
  equipmentType: EquipmentType,
): string | null {
  if (equipmentType === "IO") {
    return "Дата последней аттестации";
  }
  if (equipmentType === "VO") {
    return "Дата последнего тех. освидетельствования";
  }
  return null;
}

export function getEquipmentCompliancePeriodLabel(
  equipmentType: EquipmentType,
): string | null {
  if (equipmentType === "IO") {
    return "До следующей аттестации";
  }
  if (equipmentType === "VO") {
    return "До следующего тех. освидетельствования";
  }
  return null;
}

export function isArshinEquipmentType(equipmentType: EquipmentType): boolean {
  return equipmentType === "SI" || equipmentType === "ESI";
}

export function canChangeEquipmentTypeAfterCreation(equipmentType: EquipmentType): boolean {
  return equipmentType === "OTHER";
}

export function getEditableEquipmentTypeOptions(equipmentType: EquipmentType): EquipmentType[] {
  if (!canChangeEquipmentTypeAfterCreation(equipmentType)) {
    return [equipmentType];
  }
  return ["OTHER", "SI", "IO", "VO"];
}

export function supportsVerification(equipmentType: EquipmentType): boolean {
  return isArshinEquipmentType(equipmentType);
}

export function getArshinDocumentLabel(equipmentType: EquipmentType): string {
  return equipmentType === "ESI" ? "Номер в перечне" : "Номер свидетельства";
}

export function getArshinDocumentShortLabel(equipmentType: EquipmentType): string {
  return equipmentType === "ESI" ? "перечень" : "свид.";
}

export function formatComplianceIntervalMonths(value: number | null): string {
  if (!value) {
    return "—";
  }
  const years = value / 12;
  if (Number.isInteger(years)) {
    const wholeYears = Number(years);
    if (wholeYears === 1) {
      return "1 год";
    }
    if (wholeYears >= 2 && wholeYears <= 4) {
      return `${wholeYears} года`;
    }
    return `${wholeYears} лет`;
  }
  return `${value} мес.`;
}

function getLatestCompletedStageLabel(
  stageTemplate: ProcessStageTemplateItem[],
  valueByKey: Record<string, string | null | undefined>,
  customStages: ProcessCustomStage[] = [],
): string {
  const candidates: Array<{
    label: string;
    timestamp: number;
    order: number;
  }> = [];

  function consider(label: string, value: string | null | undefined, order: number) {
    if (!value) {
      return;
    }
    const timestamp = Date.parse(`${value.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(timestamp)) {
      return;
    }
    candidates.push({ label, timestamp, order });
  }

  const stageOrderByKey = new Map<string, number>();
  for (const [index, stage] of stageTemplate.entries()) {
    stageOrderByKey.set(stage.key, index);
    consider(stage.label, valueByKey[stage.key], index * 10000);
  }

  for (const [index, customStage] of customStages.entries()) {
    const anchorOrder = stageOrderByKey.get(customStage.afterKey);
    if (anchorOrder === undefined) {
      continue;
    }
    consider(
      customStage.label,
      customStage.date,
      anchorOrder * 10000 + customStage.sortOrder * 100 + index + 1,
    );
  }

  const latest = candidates.reduce<(typeof candidates)[number] | null>((current, candidate) => {
    if (
      !current
      || candidate.timestamp > current.timestamp
      || (candidate.timestamp === current.timestamp && candidate.order > current.order)
    ) {
      return candidate;
    }
    return current;
  }, null);
  if (latest) {
    return latest.label;
  }

  for (let index = stageTemplate.length - 1; index >= 0; index -= 1) {
    const stage = stageTemplate[index];
    if (valueByKey[stage.key]) {
      return stage.label;
    }
  }
  return stageTemplate[0]?.label ?? "Этап";
}

export function getVerificationProgressLabel(
  verification: Pick<
    EquipmentVerification,
    | "stageTemplate"
    | "sentToVerificationAt"
    | "receivedAtDestinationAt"
    | "handedToCsmAt"
    | "verificationCompletedAt"
    | "pickedUpFromCsmAt"
    | "shippedBackAt"
    | "returnedFromVerificationAt"
    | "customStages"
    | "closedAt"
  >,
): string {
  if (verification.closedAt) {
    return "Поверка завершена";
  }
  return getLatestCompletedStageLabel(
    verification.stageTemplate,
    {
      sent_to_verification_at: verification.sentToVerificationAt,
      received_at_destination_at: verification.receivedAtDestinationAt,
      handed_to_csm_at: verification.handedToCsmAt,
      verification_completed_at: verification.verificationCompletedAt,
      picked_up_from_csm_at: verification.pickedUpFromCsmAt,
      shipped_back_at: verification.shippedBackAt,
      returned_from_verification_at: verification.returnedFromVerificationAt,
    },
    verification.customStages,
  );
}

export function getRepairProgressLabel(
  repair: Pick<RepairQueueItem, "closedAt" | "currentStageLabel">,
): string {
  if (repair.closedAt) {
    return "Ремонт завершен";
  }
  return repair.currentStageLabel;
}

export function buildSIVerificationPayloadFromArshin(
  result: ArshinSearchResult,
  detail: ArshinVriDetail | null,
): CreateEquipmentSIVerificationPayload {
  return {
    vriId: result.vriId,
    arshinUrl: result.arshinUrl ?? detail?.arshinUrl ?? null,
    orgTitle: result.orgTitle,
    mitNumber: result.mitNumber,
    mitTitle: result.mitTitle,
    mitNotation: result.mitNotation,
    miNumber: result.miNumber,
    certificateNumber: detail?.certificateNumber ?? result.resultDocnum,
    resultDocnum: result.resultDocnum,
    verificationDate: detail?.verificationDate ?? result.verificationDate,
    validDate: detail?.validUntil ?? result.validDate,
    rawPayloadJson: result.rawPayloadJson,
    detailPayloadJson: detail?.rawPayloadJson ?? null,
  };
}

function mapEquipmentFolder(folder: RawEquipmentFolder): EquipmentFolder {
  return {
    id: folder.id,
    name: folder.name,
    description: folder.description,
    sortOrder: folder.sort_order,
    deadlinePresetId: folder.deadline_preset_id,
    deadlinePresetName: folder.deadline_preset_name,
    deadlinePresetSnapshot: folder.deadline_preset_snapshot_json
      ? mapDeadlinePresetSnapshot(folder.deadline_preset_snapshot_json)
      : null,
    createdAt: folder.created_at,
    updatedAt: folder.updated_at,
  };
}

function mapProcessStageTemplateItem(
  item: RawProcessStageTemplateItem,
): ProcessStageTemplateItem {
  return {
    key: item.key,
    label: item.label,
    enabled: item.enabled,
    required: item.required,
  };
}

function mapProcessCustomStage(item: RawProcessCustomStage): ProcessCustomStage {
  return {
    id: item.id,
    afterKey: item.after_key,
    label: item.label,
    date: item.date,
    deadlineDays: typeof item.deadline_days === "number" ? item.deadline_days : null,
    sortOrder: item.sort_order,
  };
}

function mapProcessCustomStagesToApi(
  items: ProcessCustomStage[] | null | undefined,
): RawProcessCustomStage[] | null | undefined {
  if (typeof items === "undefined") {
    return undefined;
  }
  if (items === null) {
    return null;
  }
  return items.map((item) => ({
    id: item.id,
    after_key: item.afterKey,
    label: item.label,
    date: normalizeOptionalDateForApi(item.date),
    deadline_days: item.deadlineDays,
    sort_order: item.sortOrder,
  }));
}

function isRawProcessStageTemplateVariants(
  templates: RawRepairStageTemplates | RawVerificationStageTemplates,
): templates is RawProcessStageTemplateVariants {
  return Array.isArray((templates as RawProcessStageTemplateVariants).variants);
}

function buildVariantFromLegacyStages(
  id: string,
  name: string,
  routeKind: ProcessStageTemplateRouteKind,
  items: RawProcessStageTemplateItem[] | undefined,
  flowMode: VerificationFlowMode | null = null,
): ProcessStageTemplateVariant {
  return {
    id,
    name,
    routeKind,
    flowMode,
    stages: (items ?? [])
      .filter((item) => item.enabled)
      .map((item, index) => ({
        id: item.key,
        label: item.label,
        deadlineDays: null,
        sortOrder: index,
      })),
    sortOrder: 0,
  };
}

function mapProcessStageTemplateVariants(
  templates: RawProcessStageTemplateVariants,
): ProcessStageTemplateVariants {
  return {
    variants: (templates.variants ?? [])
      .map((variant, index) => ({
        id: variant.id,
        name: variant.name,
        routeKind: variant.route_kind ?? "offsite",
        flowMode: variant.flow_mode ?? null,
        stages: (variant.stages ?? [])
          .map((stage, stageIndex) => ({
            id: stage.id,
            label: stage.label,
            deadlineDays:
              typeof stage.deadline_days === "number" ? stage.deadline_days : null,
            sortOrder: Number.isFinite(stage.sort_order) ? Number(stage.sort_order) : stageIndex,
          }))
          .sort((left, right) => left.sortOrder - right.sortOrder),
        sortOrder: Number.isFinite(variant.sort_order) ? Number(variant.sort_order) : index,
      }))
      .sort((left, right) => left.sortOrder - right.sortOrder),
  };
}

function mapRepairStageTemplates(
  templates: RawRepairStageTemplates,
): RepairStageTemplates {
  if (isRawProcessStageTemplateVariants(templates)) {
    return mapProcessStageTemplateVariants(templates);
  }
  return {
    variants: [
      buildVariantFromLegacyStages("on_site", "По месту", "on_site", templates.on_site),
      buildVariantFromLegacyStages("offsite", "С отправкой", "offsite", templates.offsite),
    ].filter((variant) => variant.stages.length > 0),
  };
}

function mapVerificationStageTemplates(
  templates: RawVerificationStageTemplates,
): VerificationStageTemplates {
  if (isRawProcessStageTemplateVariants(templates)) {
    return mapProcessStageTemplateVariants(templates);
  }
  return {
    variants: [
      buildVariantFromLegacyStages(
        "offsite_with_demolition",
        "С отправкой",
        "offsite",
        templates.offsite_with_demolition,
        "OFFSITE_WITH_DEMOLITION",
      ),
      buildVariantFromLegacyStages(
        "on_site_with_demolition",
        "По месту",
        "on_site",
        templates.on_site_with_demolition,
        "ONSITE_WITH_DEMOLITION",
      ),
      buildVariantFromLegacyStages(
        "on_site_without_demolition",
        "По месту без демонтажа",
        "on_site",
        templates.on_site_without_demolition,
        "ONSITE_WITHOUT_DEMOLITION",
      ),
    ].filter((variant) => variant.stages.length > 0),
  };
}

function mapProcessStageTemplateVariantsToApi(
  templates: ProcessStageTemplateVariants,
): RawProcessStageTemplateVariants {
  return {
    variants: templates.variants.map((variant, index) => ({
      id: variant.id,
      name: variant.name,
      route_kind: variant.routeKind,
      flow_mode: variant.flowMode,
      sort_order: index,
      stages: variant.stages.map((stage, stageIndex) => ({
        id: stage.id,
        label: stage.label,
        deadline_days: stage.deadlineDays,
        sort_order: stageIndex,
      })),
    })),
  };
}

function mapRepairStageTemplatesToApi(
  templates: RepairStageTemplates,
): RawProcessStageTemplateVariants {
  return mapProcessStageTemplateVariantsToApi(templates);
}

function mapVerificationStageTemplatesToApi(
  templates: VerificationStageTemplates,
): RawProcessStageTemplateVariants {
  return mapProcessStageTemplateVariantsToApi(templates);
}

function mapDeadlinePresetSnapshot(snapshot: RawDeadlinePresetSnapshot): DeadlinePresetSnapshot {
  return {
    repairTotalDays: snapshot.repair_total_days,
    registrationAfterArrivalDays: snapshot.registration_after_arrival_days,
    incomingControlAfterReceiptDays: snapshot.incoming_control_after_receipt_days,
    paymentAfterControlDays: snapshot.payment_after_control_days,
    repairStageTemplates: snapshot.repair_stage_templates_json
      ? mapRepairStageTemplates(snapshot.repair_stage_templates_json)
      : null,
    verificationStageTemplates: snapshot.verification_stage_templates_json
      ? mapVerificationStageTemplates(snapshot.verification_stage_templates_json)
      : null,
  };
}

function mapDeadlinePreset(preset: RawDeadlinePreset): DeadlinePreset {
  return {
    id: preset.id,
    code: preset.code,
    name: preset.name,
    description: preset.description,
    isActive: preset.is_active,
    isSystem: preset.is_system,
    sortOrder: preset.sort_order,
    repairTotalDays: preset.repair_total_days,
    registrationAfterArrivalDays: preset.registration_after_arrival_days,
    incomingControlAfterReceiptDays: preset.incoming_control_after_receipt_days,
    paymentAfterControlDays: preset.payment_after_control_days,
    repairStageTemplates: preset.repair_stage_templates_json
      ? mapRepairStageTemplates(preset.repair_stage_templates_json)
      : null,
    verificationStageTemplates: preset.verification_stage_templates_json
      ? mapVerificationStageTemplates(preset.verification_stage_templates_json)
      : null,
    createdAt: preset.created_at,
    updatedAt: preset.updated_at,
  };
}

function mapEquipmentGroup(group: RawEquipmentGroup): EquipmentGroup {
  return {
    id: group.id,
    folderId: group.folder_id,
    name: group.name,
    description: group.description,
    sortOrder: group.sort_order,
    createdAt: group.created_at,
    updatedAt: group.updated_at,
  };
}

function mapEquipment(item: RawEquipment): EquipmentItem {
  const activeRepair = item.active_repair ? mapEquipmentRepair(item.active_repair) : null;
  const activeVerification = item.active_verification
    ? mapEquipmentVerification(item.active_verification)
    : null;
  const resolvedStatus =
    activeRepair
      ? "IN_REPAIR"
      : activeVerification
        ? "IN_VERIFICATION"
        : item.status === "IN_REPAIR" || item.status === "IN_VERIFICATION"
          ? "IN_WORK"
          : item.status;
  return {
    id: item.id,
    folderId: item.folder_id,
    groupId: item.group_id,
    objectName: item.object_name,
    equipmentType: item.equipment_type,
    name: item.name,
    modification: item.modification,
    serialNumber: item.serial_number,
    manufactureYear: item.manufacture_year,
    measurementRangeStart: item.measurement_range_start,
    measurementRangeEnd: item.measurement_range_end,
    measurementUnit: item.measurement_unit,
    status: resolvedStatus,
    createdManually: item.created_manually,
    excludeFromArshinRefresh: item.exclude_from_arshin_refresh,
    currentLocationManual: item.current_location_manual,
    complianceDate: item.compliance_date,
    complianceIntervalMonths: item.compliance_interval_months,
    manualVerificationIntervalMonths: item.manual_verification_interval_months,
    activeRepair,
    activeVerification,
    siVerification: item.si_verification ? mapEquipmentSIVerification(item.si_verification) : null,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function mapEquipmentDetails(details: RawEquipmentDetails): EquipmentDetailsResult {
  return {
    equipment: mapEquipment(details.equipment),
    processSubscriptionEnabled: details.process_subscription_enabled,
    activeRepairMessageCount: details.active_repair_message_count,
    activeVerificationMessageCount: details.active_verification_message_count,
    esiCompositionEntries: (details.esi_composition_entries ?? []).map(
      mapEquipmentESICompositionEntry,
    ),
    attachments: details.attachments.map(mapEquipmentAttachment),
    comments: details.comments.map(mapEquipmentComment),
    repairHistory: details.repair_history.map(mapRepairQueueItem),
    verificationHistory: details.verification_history.map(mapVerificationQueueItem),
  };
}

function mapEquipmentRepair(repair: RawEquipmentRepair): EquipmentRepair {
  return {
    id: repair.id,
    equipmentId: repair.equipment_id,
    batchKey: repair.batch_key,
    batchName: repair.batch_name,
    isOnSite: repair.is_on_site,
    stageTemplate: repair.stage_template.map(mapProcessStageTemplateItem),
    routeCity: repair.route_city,
    routeDestination: repair.route_destination,
    sentToRepairAt: repair.sent_to_repair_at,
    repairDeadlineAt: repair.repair_deadline_at,
    arrivedToDestinationAt: repair.arrived_to_destination_at,
    sentFromRepairAt: repair.sent_from_repair_at,
    sentFromIrkutskAt: repair.sent_from_irkutsk_at,
    arrivedToLenskAt: repair.arrived_to_lensk_at,
    actuallyReceivedAt: repair.actually_received_at,
    incomingControlAt: repair.incoming_control_at,
    paidAt: repair.paid_at,
    customStages: (repair.custom_stages ?? []).map(mapProcessCustomStage),
    closedAt: repair.closed_at,
    createdAt: repair.created_at,
    updatedAt: repair.updated_at,
  };
}

function mapEquipmentVerification(
  verification: RawEquipmentVerification,
): EquipmentVerification {
  return {
    id: verification.id,
    equipmentId: verification.equipment_id,
    batchKey: verification.batch_key,
    batchName: verification.batch_name,
    isOnSite: verification.is_on_site,
    flowMode: verification.flow_mode,
    stageTemplate: verification.stage_template.map(mapProcessStageTemplateItem),
    routeCity: verification.route_city,
    routeDestination: verification.route_destination,
    sentToVerificationAt: verification.sent_to_verification_at,
    receivedAtDestinationAt: verification.received_at_destination_at,
    handedToCsmAt: verification.handed_to_csm_at,
    verificationCompletedAt: verification.verification_completed_at,
    pickedUpFromCsmAt: verification.picked_up_from_csm_at,
    shippedBackAt: verification.shipped_back_at,
    returnedFromVerificationAt: verification.returned_from_verification_at,
    customStages: (verification.custom_stages ?? []).map(mapProcessCustomStage),
    closedAt: verification.closed_at,
    createdAt: verification.created_at,
    updatedAt: verification.updated_at,
  };
}

function addMonthsToIsoDate(isoDate: string, months: number): string | null {
  if (!isoDate || !months) {
    return null;
  }

  const [yearString, monthString, dayString] = isoDate.slice(0, 10).split("-");
  const year = Number(yearString);
  const month = Number(monthString);
  const day = Number(dayString);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const totalMonths = month - 1 + months;
  const nextYear = year + Math.floor(totalMonths / 12);
  const nextMonth = (totalMonths % 12) + 1;
  const daysInMonth = new Date(nextYear, nextMonth, 0).getDate();
  const nextDay = Math.min(day, daysInMonth);
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-${String(nextDay).padStart(2, "0")}`;
}

function mapRepairMessageAttachment(
  attachment: RawRepairMessageAttachment,
): RepairMessageAttachment {
  return {
    id: attachment.id,
    repairMessageId: attachment.repair_message_id,
    uploadedByUserId: attachment.uploaded_by_user_id,
    uploadedByDisplayName: attachment.uploaded_by_display_name,
    fileName: attachment.file_name,
    fileMimeType: attachment.file_mime_type,
    fileSize: attachment.file_size,
    createdAt: attachment.created_at,
  };
}

function mapVerificationQueueItem(item: RawVerificationQueueItem): VerificationQueueItem {
  return {
    equipmentId: item.equipment_id,
    verificationId: item.verification_id,
    batchKey: item.batch_key,
    batchName: item.batch_name,
    isOnSite: item.is_on_site,
    flowMode: item.flow_mode,
    stageTemplate: item.stage_template.map(mapProcessStageTemplateItem),
    folderId: item.folder_id,
    objectName: item.object_name,
    equipmentType: item.equipment_type,
    equipmentName: item.equipment_name,
    modification: item.modification,
    serialNumber: item.serial_number,
    manufactureYear: item.manufacture_year,
    routeCity: item.route_city,
    routeDestination: item.route_destination,
    sentToVerificationAt: item.sent_to_verification_at,
    receivedAtDestinationAt: item.received_at_destination_at,
    handedToCsmAt: item.handed_to_csm_at,
    verificationCompletedAt: item.verification_completed_at,
    pickedUpFromCsmAt: item.picked_up_from_csm_at,
    shippedBackAt: item.shipped_back_at,
    returnedFromVerificationAt: item.returned_from_verification_at,
    customStages: (item.custom_stages ?? []).map(mapProcessCustomStage),
    closedAt: item.closed_at,
    hasActiveRepair: item.has_active_repair,
    resultDocnum: item.result_docnum,
    validDate: item.valid_date,
    arshinUrl: item.arshin_url,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function mapRepairQueueItem(item: RawRepairQueueItem): RepairQueueItem {
  return {
    repairId: item.repair_id,
    equipmentId: item.equipment_id,
    batchKey: item.batch_key,
    batchName: item.batch_name,
    isOnSite: item.is_on_site,
    stageTemplate: item.stage_template.map(mapProcessStageTemplateItem),
    folderId: item.folder_id,
    objectName: item.object_name,
    equipmentType: item.equipment_type,
    equipmentName: item.equipment_name,
    modification: item.modification,
    serialNumber: item.serial_number,
    manufactureYear: item.manufacture_year,
    currentLocationManual: item.current_location_manual,
    routeCity: item.route_city,
    routeDestination: item.route_destination,
    sentToRepairAt: item.sent_to_repair_at,
    repairDeadlineAt: item.repair_deadline_at,
    arrivedToDestinationAt: item.arrived_to_destination_at,
    sentFromRepairAt: item.sent_from_repair_at,
    sentFromIrkutskAt: item.sent_from_irkutsk_at,
    arrivedToLenskAt: item.arrived_to_lensk_at,
    registrationDeadlineAt: item.registration_deadline_at,
    actuallyReceivedAt: item.actually_received_at,
    controlDeadlineAt: item.control_deadline_at,
    incomingControlAt: item.incoming_control_at,
    paymentDeadlineAt: item.payment_deadline_at,
    paidAt: item.paid_at,
    customStages: (item.custom_stages ?? []).map(mapProcessCustomStage),
    closedAt: item.closed_at,
    hasActiveVerification: item.has_active_verification,
    resultDocnum: item.result_docnum,
    arshinUrl: item.arshin_url,
    currentStageLabel: item.current_stage_label,
    repairOverdueDays: item.repair_overdue_days,
    registrationOverdueDays: item.registration_overdue_days,
    controlOverdueDays: item.control_overdue_days,
    paymentOverdueDays: item.payment_overdue_days,
    maxOverdueDays: item.max_overdue_days,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function mapRepairMessage(message: RawRepairMessage): RepairMessage {
  return {
    id: message.id,
    repairId: message.repair_id,
    authorUserId: message.author_user_id,
    authorDisplayName: message.author_display_name,
    text: message.text,
    isPrivate: message.is_private,
    createdAt: message.created_at,
    attachments: message.attachments.map(mapRepairMessageAttachment),
  };
}

function mapVerificationMessageAttachment(
  attachment: RawVerificationMessageAttachment,
): VerificationMessageAttachment {
  return {
    id: attachment.id,
    verificationMessageId: attachment.verification_message_id,
    uploadedByUserId: attachment.uploaded_by_user_id,
    uploadedByDisplayName: attachment.uploaded_by_display_name,
    fileName: attachment.file_name,
    fileMimeType: attachment.file_mime_type,
    fileSize: attachment.file_size,
    createdAt: attachment.created_at,
  };
}

function mapVerificationMessage(message: RawVerificationMessage): VerificationMessage {
  return {
    id: message.id,
    verificationId: message.verification_id,
    authorUserId: message.author_user_id,
    authorDisplayName: message.author_display_name,
    text: message.text,
    isPrivate: message.is_private,
    createdAt: message.created_at,
    attachments: message.attachments.map(mapVerificationMessageAttachment),
  };
}

function mapEquipmentSIVerification(
  siVerification: RawSIVerification,
): EquipmentSIVerification {
  return {
    id: siVerification.id,
    equipmentId: siVerification.equipment_id,
    vriId: siVerification.vri_id,
    arshinUrl: siVerification.arshin_url,
    orgTitle: siVerification.org_title,
    mitNumber: siVerification.mit_number,
    mitTitle: siVerification.mit_title,
    mitNotation: siVerification.mit_notation,
    miNumber: siVerification.mi_number,
    certificateNumber: siVerification.certificate_number,
    resultDocnum: siVerification.result_docnum,
    verificationDate: siVerification.verification_date,
    validDate: siVerification.valid_date,
    rawPayloadJson: siVerification.raw_payload_json,
    detailPayloadJson: siVerification.detail_payload_json,
    createdAt: siVerification.created_at,
    updatedAt: siVerification.updated_at,
  };
}

function mapEquipmentESICompositionEntry(
  entry: RawEquipmentESICompositionEntry,
): EquipmentESICompositionEntry {
  return {
    ...mapEquipmentSIVerification(entry),
    moduleKind: entry.module_kind,
    measurementLimit: entry.measurement_limit,
    sortOrder: entry.sort_order,
  };
}

function mapEsiEquipmentMonitoringItem(
  item: RawESIEquipmentMonitoringItem,
): ESIEquipmentMonitoringItem {
  return {
    equipmentId: item.equipment_id,
    folderId: item.folder_id,
    equipmentName: item.equipment_name,
    equipmentModification: item.equipment_modification,
    equipmentSerialNumber: item.equipment_serial_number,
    modules: item.modules.map((module) => ({
      entryId: module.entry_id,
      moduleKind: module.module_kind,
      vriId: module.vri_id,
      registryNumber: module.registry_number,
      rank: module.rank,
      name: module.name,
      modification: module.modification,
      serialNumber: module.serial_number,
      measurementLimit: module.measurement_limit,
      verificationDate: module.verification_date,
      validUntil: module.valid_until,
      certificateNumber: module.certificate_number,
      arshinUrl: module.arshin_url,
      verificationArshinUrl: module.verification_arshin_url,
    })),
  };
}

function mapEquipmentFolderRefreshTask(
  task: RawEquipmentFolderRefreshTask,
): EquipmentFolderRefreshTask {
  return {
    id: task.id,
    folderId: task.folder_id,
    createdByUserId: task.created_by_user_id,
    status: task.status,
    progress: task.progress,
    totalRows: task.total_rows,
    processedRows: task.processed_rows,
    summary: task.summary_json,
    errorMessage: task.error_message,
    startedAt: task.started_at,
    completedAt: task.completed_at,
    createdAt: task.created_at,
    updatedAt: task.updated_at,
  };
}

function mapEquipmentFolderRefreshRow(
  row: RawEquipmentFolderRefreshRow,
): EquipmentFolderRefreshRow {
  return {
    id: row.id,
    taskId: row.task_id,
    equipmentId: row.equipment_id,
    compositionEntryId: row.composition_entry_id,
    sortOrder: row.sort_order,
    targetKind: row.target_kind,
    moduleKind: row.module_kind,
    equipmentName: row.equipment_name,
    equipmentModification: row.equipment_modification,
    equipmentSerialNumber: row.equipment_serial_number,
    targetTitle: row.target_title,
    targetSerialNumber: row.target_serial_number,
    targetRegistryNumber: row.target_registry_number,
    measurementLimit: row.measurement_limit,
    currentCertificateNumber: row.current_certificate_number,
    currentVerificationDate: row.current_verification_date,
    currentValidDate: row.current_valid_date,
    status: row.status,
    uncertainUpdate: row.uncertain_update,
    stage2Successful: row.stage2_successful,
    modificationRelaxed: row.modification_relaxed,
    notationRelaxed: row.notation_relaxed,
    notes: row.notes,
    matchedVriId: row.matched_vri_id,
    matchedArshinUrl: row.matched_arshin_url,
    matchedRegistryNumber: row.matched_registry_number,
    matchedCertificateNumber: row.matched_certificate_number,
    matchedVerificationDate: row.matched_verification_date,
    matchedValidDate: row.matched_valid_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapEquipmentAttachment(attachment: RawEquipmentAttachment): EquipmentAttachment {
  return {
    id: attachment.id,
    equipmentId: attachment.equipment_id,
    uploadedByUserId: attachment.uploaded_by_user_id,
    uploadedByDisplayName: attachment.uploaded_by_display_name,
    fileName: attachment.file_name,
    fileMimeType: attachment.file_mime_type,
    fileSize: attachment.file_size,
    createdAt: attachment.created_at,
  };
}

function mapEquipmentCommentAttachment(
  attachment: RawEquipmentCommentAttachment,
): EquipmentCommentAttachment {
  return {
    id: attachment.id,
    equipmentCommentId: attachment.equipment_comment_id,
    uploadedByUserId: attachment.uploaded_by_user_id,
    uploadedByDisplayName: attachment.uploaded_by_display_name,
    fileName: attachment.file_name,
    fileMimeType: attachment.file_mime_type,
    fileSize: attachment.file_size,
    createdAt: attachment.created_at,
  };
}

function mapEquipmentCommentDraftAttachment(
  attachment: RawEquipmentCommentDraftAttachment,
): EquipmentCommentDraftAttachment {
  return {
    uploadToken: attachment.upload_token,
    fileName: attachment.file_name,
    fileMimeType: attachment.file_mime_type,
    fileSize: attachment.file_size,
  };
}

function mapEquipmentComment(comment: RawEquipmentComment): EquipmentComment {
  return {
    id: comment.id,
    equipmentId: comment.equipment_id,
    authorUserId: comment.author_user_id,
    authorDisplayName: comment.author_display_name,
    text: comment.text,
    isPrivate: comment.is_private,
    createdAt: comment.created_at,
    attachments: comment.attachments.map(mapEquipmentCommentAttachment),
  };
}

function mapEquipmentSIBulkImportResult(
  result: RawEquipmentSIBulkImportResult,
): EquipmentSIBulkImportResult {
  return {
    totalRows: result.total_rows,
    createdCount: result.created_count,
    skippedCount: result.skipped_count,
    errorCount: result.error_count,
    rows: result.rows.map((row) => ({
      rowNumber: row.row_number,
      certificateNumber: row.certificate_number,
      status: row.status,
      message: row.message,
      equipmentId: row.equipment_id,
      equipmentName: row.equipment_name,
      vriId: row.vri_id,
    })),
  };
}

function mapSIVerificationPayload(payload: CreateEquipmentSIVerificationPayload) {
  return {
    vri_id: payload.vriId,
    arshin_url: payload.arshinUrl,
    org_title: payload.orgTitle,
    mit_number: payload.mitNumber,
    mit_title: payload.mitTitle,
    mit_notation: payload.mitNotation,
    mi_number: payload.miNumber,
    certificate_number: payload.certificateNumber,
    result_docnum: payload.resultDocnum,
    verification_date: payload.verificationDate ? normalizeDateForApi(payload.verificationDate) : null,
    valid_date: payload.validDate ? normalizeDateForApi(payload.validDate) : null,
    raw_payload_json: payload.rawPayloadJson,
    detail_payload_json: payload.detailPayloadJson,
  };
}

function emptyToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeDateForApi(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return normalized;
  }

  return parseDateInputToIso(normalized) ?? normalized;
}

function normalizeOptionalDateForApi(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return parseDateInputToIso(normalized) ?? normalized;
}

function parseDateInputToIso(value: string): string | null {
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return isValidDateParts(isoMatch[1], isoMatch[2], isoMatch[3])
      ? `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
      : null;
  }

  const displayMatch = value.match(/^(\d{1,2})[.\-/ ](\d{1,2})[.\-/ ](\d{4})$/);
  if (displayMatch) {
    const day = displayMatch[1].padStart(2, "0");
    const month = displayMatch[2].padStart(2, "0");
    const year = displayMatch[3];
    return isValidDateParts(year, month, day) ? `${year}-${month}-${day}` : null;
  }

  return null;
}

function isValidDateParts(year: string, month: string, day: string): boolean {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);

  if (
    !Number.isInteger(numericYear)
    || !Number.isInteger(numericMonth)
    || !Number.isInteger(numericDay)
  ) {
    return false;
  }

  if (numericMonth < 1 || numericMonth > 12 || numericDay < 1 || numericDay > 31) {
    return false;
  }

  const candidate = new Date(Date.UTC(numericYear, numericMonth - 1, numericDay));
  return (
    candidate.getUTCFullYear() === numericYear
    && candidate.getUTCMonth() === numericMonth - 1
    && candidate.getUTCDate() === numericDay
  );
}

function buildEquipmentFilterSearch(filters: FetchEquipmentFilters = {}): string {
  const queryString = buildEquipmentFilterSearchParams(filters).toString();
  return queryString ? `?${queryString}` : "";
}

function buildEquipmentFilterSearchParams(
  filters: FetchEquipmentFilters = {},
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.folderId) {
    params.set("folder_id", String(filters.folderId));
  }
  if (filters.groupId) {
    params.set("group_id", String(filters.groupId));
  }
  if (filters.equipmentIds?.length) {
    filters.equipmentIds.forEach((equipmentId) => {
      params.append("equipment_ids", String(equipmentId));
    });
  }
  if (filters.query?.trim()) {
    params.set("query", filters.query.trim());
  }
  if (filters.objectName?.trim()) {
    params.set("object_name", filters.objectName.trim());
  }
  if (filters.currentLocationManual?.trim()) {
    params.set("current_location_manual", filters.currentLocationManual.trim());
  }
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.equipmentType) {
    params.set("equipment_type", filters.equipmentType);
  }
  if (filters.sortKey) {
    params.set("sort_key", filters.sortKey);
  }
  if (filters.sortDirection) {
    params.set("sort_direction", filters.sortDirection);
  }
  return params;
}

function parseContentDispositionFileName(contentDisposition: string): string | null {
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const simpleMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (simpleMatch?.[1]) {
    return simpleMatch[1];
  }

  return null;
}
