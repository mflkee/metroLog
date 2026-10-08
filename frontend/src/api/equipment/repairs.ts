// Split out of the former single src/api/equipment.ts module.
// Re-exported by src/api/equipment.ts so existing imports keep working.

import { RawRepairMessageAttachment, mapRepairMessageAttachment } from "./comments";
import { FetchProcessQueueFilters, RawProcessCustomStage, RawProcessStageTemplateItem, RawProcessStageTemplateVariants, buildVariantFromLegacyStages, isRawProcessStageTemplateVariants, mapProcessCustomStage, mapProcessCustomStagesToApi, mapProcessStageTemplateItem, mapProcessStageTemplateVariants, mapProcessStageTemplateVariantsToApi, normalizeDateForApi, normalizeOptionalDateForApi, parseContentDispositionFileName } from "./registry";

import { ApiError, apiBaseUrl, apiRequest, getResponseErrorMessage } from "@/api/client";
import { RepairMessageAttachment } from "./comments";
import { EquipmentType, ProcessCustomStage, ProcessStageTemplateItem, ProcessStageTemplateVariants, UpdateProcessBatchItemsPayload } from "./registry";

type RawLegacyRepairStageTemplates = {
  offsite: RawProcessStageTemplateItem[];
  on_site: RawProcessStageTemplateItem[];
};

export type RawRepairStageTemplates = RawLegacyRepairStageTemplates | RawProcessStageTemplateVariants;

export type RawEquipmentRepair = {
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

export type RepairStageTemplates = ProcessStageTemplateVariants;

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

export type RepairQueuePageResult = {
  items: RepairQueueItem[];
  totalGroups: number;
  totalItems: number;
  limit: number;
  offset: number;
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

export type RawRepairQueueItem = {
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

type RawRepairQueuePage = {
  items: RawRepairQueueItem[];
  total_groups: number;
  total_items: number;
  limit: number;
  offset: number;
};

export async function fetchRepairQueue(
  token: string,
  { lifecycleStatus, query, folderId, processId, batchKey, targetEquipmentId }: FetchProcessQueueFilters,
): Promise<RepairQueueItem[]> {
  const search = new URLSearchParams();
  search.set("lifecycle_status", lifecycleStatus);
  if (query?.trim()) {
    search.set("query", query.trim());
  }
  if (Number.isInteger(folderId) && (folderId ?? 0) > 0) {
    search.set("folder_id", String(folderId));
  }
  if (Number.isInteger(processId) && (processId ?? 0) > 0) {
    search.set("repair_id", String(processId));
  }
  if (batchKey?.trim()) {
    search.set("batch_key", batchKey.trim());
  }
  if (Number.isInteger(targetEquipmentId) && (targetEquipmentId ?? 0) > 0) {
    search.set("equipment_id", String(targetEquipmentId));
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

export function getRepairProgressLabel(
  repair: Pick<RepairQueueItem, "closedAt" | "currentStageLabel">,
): string {
  if (repair.closedAt) {
    return "Ремонт завершен";
  }
  return repair.currentStageLabel;
}

export function mapRepairStageTemplates(
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

export function mapRepairStageTemplatesToApi(
  templates: RepairStageTemplates,
): RawProcessStageTemplateVariants {
  return mapProcessStageTemplateVariantsToApi(templates);
}

export function mapEquipmentRepair(repair: RawEquipmentRepair): EquipmentRepair {
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

export function mapRepairQueueItem(item: RawRepairQueueItem): RepairQueueItem {
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
