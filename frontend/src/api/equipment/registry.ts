// Split out of the former single src/api/equipment.ts module.
// Re-exported by src/api/equipment.ts so existing imports keep working.

import { RawEquipmentAttachment, RawEquipmentComment, mapEquipmentAttachment, mapEquipmentComment } from "./comments";
import { RawEquipmentESICompositionEntry, mapEquipmentESICompositionEntry } from "./esi";
import { RawEquipmentRepair, RawRepairQueueItem, RawRepairStageTemplates, mapEquipmentRepair, mapRepairQueueItem, mapRepairStageTemplates, mapRepairStageTemplatesToApi } from "./repairs";
import { RawEquipmentVerification, RawSIVerification, RawVerificationQueueItem, RawVerificationStageTemplates, mapEquipmentSIVerification, mapEquipmentVerification, mapSIVerificationPayload, mapVerificationQueueItem, mapVerificationStageTemplates, mapVerificationStageTemplatesToApi } from "./verifications";

import { apiRequest } from "@/api/client";
import { UserRole } from "@/api/auth";
import { EquipmentAttachment, EquipmentComment } from "./comments";
import { ESIInternalModuleMeasurementPayload, EquipmentESICompositionEntry } from "./esi";
import { EquipmentRepair, RepairQueueItem, RepairStageTemplates } from "./repairs";
import { CreateEquipmentSIVerificationPayload, EquipmentSIVerification, EquipmentVerification, VerificationFlowMode, VerificationQueueItem, VerificationStageTemplates } from "./verifications";

export type EquipmentType = "SI" | "ESI" | "IO" | "VO" | "OTHER";

export type EquipmentStatus = "IN_WORK" | "IN_VERIFICATION" | "IN_REPAIR" | "REPAIRED" | "NOT_REPAIRABLE" | "ARCHIVED";

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

export type RawProcessStageTemplateItem = {
  key: string;
  label: string;
  enabled: boolean;
  required: boolean;
};

export type RawProcessCustomStage = {
  id: string;
  after_key: string;
  label: string;
  date: string | null;
  deadline_days?: number | null;
  sort_order: number;
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

export type RawProcessStageTemplateVariants = {
  variants: RawProcessStageTemplateVariant[];
};

export type RawDeadlinePresetSnapshot = {
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

export type RawEquipment = {
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

export type FetchProcessQueueFilters = {
  lifecycleStatus: "active" | "archived";
  query?: string;
  folderId?: number | null;
  /** Deep-link target: the process id (repair or verification), its batch key, or its equipment. */
  processId?: number | null;
  batchKey?: string | null;
  targetEquipmentId?: number | null;
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

export type UpdateProcessBatchItemsPayload = {
  addEquipmentIds?: number[];
  removeEquipmentIds?: number[];
};

export type FetchEquipmentFilters = {
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
  REPAIRED: "Отремонтировано",
  NOT_REPAIRABLE: "Неремонтопригодно",
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

export function getEquipmentStatusColor(item: Pick<EquipmentItem, "status" | "activeRepair" | "activeVerification">): string {
  if (item.activeRepair) {
    return "var(--status-repair)";
  }
  if (item.activeVerification) {
    return "var(--status-verification)";
  }
  switch (item.status) {
    case "IN_WORK":
      return "var(--status-in-work)";
    case "IN_VERIFICATION":
      return "var(--status-verification)";
    case "IN_REPAIR":
      return "var(--status-repair)";
    case "REPAIRED":
      return "var(--status-repaired)";
    case "NOT_REPAIRABLE":
      return "var(--status-not-repairable)";
    case "ARCHIVED":
      return "var(--status-archived)";
  }
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

export function getLatestCompletedStageLabel(
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

export function mapProcessStageTemplateItem(
  item: RawProcessStageTemplateItem,
): ProcessStageTemplateItem {
  return {
    key: item.key,
    label: item.label,
    enabled: item.enabled,
    required: item.required,
  };
}

export function mapProcessCustomStage(item: RawProcessCustomStage): ProcessCustomStage {
  return {
    id: item.id,
    afterKey: item.after_key,
    label: item.label,
    date: item.date,
    deadlineDays: typeof item.deadline_days === "number" ? item.deadline_days : null,
    sortOrder: item.sort_order,
  };
}

export function mapProcessCustomStagesToApi(
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

export function isRawProcessStageTemplateVariants(
  templates: RawRepairStageTemplates | RawVerificationStageTemplates,
): templates is RawProcessStageTemplateVariants {
  return Array.isArray((templates as RawProcessStageTemplateVariants).variants);
}

export function buildVariantFromLegacyStages(
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

export function mapProcessStageTemplateVariants(
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

export function mapProcessStageTemplateVariantsToApi(
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

export function mapDeadlinePresetSnapshot(snapshot: RawDeadlinePresetSnapshot): DeadlinePresetSnapshot {
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

export function mapEquipment(item: RawEquipment): EquipmentItem {
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

export function emptyToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function normalizeDateForApi(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return normalized;
  }

  return parseDateInputToIso(normalized) ?? normalized;
}

export function normalizeOptionalDateForApi(value: string | null | undefined): string | null {
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

export function buildEquipmentFilterSearch(filters: FetchEquipmentFilters = {}): string {
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

export function parseContentDispositionFileName(contentDisposition: string): string | null {
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
