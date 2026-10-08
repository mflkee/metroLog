// Split out of the former single src/api/equipment.ts module.
// Re-exported by src/api/equipment.ts so existing imports keep working.

import { RawVerificationMessageAttachment, mapVerificationMessageAttachment } from "./comments";
import { FetchProcessQueueFilters, RawProcessCustomStage, RawProcessStageTemplateItem, RawProcessStageTemplateVariants, buildVariantFromLegacyStages, getLatestCompletedStageLabel, isRawProcessStageTemplateVariants, mapProcessCustomStage, mapProcessCustomStagesToApi, mapProcessStageTemplateItem, mapProcessStageTemplateVariants, mapProcessStageTemplateVariantsToApi, normalizeDateForApi, normalizeOptionalDateForApi, parseContentDispositionFileName } from "./registry";

import { ApiError, apiBaseUrl, apiRequest, getResponseErrorMessage } from "@/api/client";
import { ArshinSearchResult, ArshinVriDetail } from "@/api/arshin";
import { VerificationMessageAttachment } from "./comments";
import { EquipmentType, ProcessCustomStage, ProcessStageTemplateItem, ProcessStageTemplateVariants, UpdateProcessBatchItemsPayload, isArshinEquipmentType } from "./registry";

export type VerificationFlowMode =
  | "OFFSITE_WITH_DEMOLITION"
  | "ONSITE_WITH_DEMOLITION"
  | "ONSITE_WITHOUT_DEMOLITION";

type RawLegacyVerificationStageTemplates = {
  offsite_with_demolition: RawProcessStageTemplateItem[];
  on_site_with_demolition: RawProcessStageTemplateItem[];
  on_site_without_demolition: RawProcessStageTemplateItem[];
};

export type RawVerificationStageTemplates =
  | RawLegacyVerificationStageTemplates
  | RawProcessStageTemplateVariants;

export type RawEquipmentVerification = {
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

export type RawSIVerification = {
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

export type VerificationStageTemplates = ProcessStageTemplateVariants;

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

export type VerificationQueuePageResult = {
  items: VerificationQueueItem[];
  totalGroups: number;
  totalItems: number;
  limit: number;
  offset: number;
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

export type RawVerificationQueueItem = {
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

type RawVerificationQueuePage = {
  items: RawVerificationQueueItem[];
  total_groups: number;
  total_items: number;
  limit: number;
  offset: number;
};

export async function fetchVerificationQueue(
  token: string,
  {
    lifecycleStatus,
    query,
    folderId,
    processId,
    batchKey,
    targetEquipmentId,
  }: FetchProcessQueueFilters,
): Promise<VerificationQueueItem[]> {
  const search = new URLSearchParams();
  search.set("lifecycle_status", lifecycleStatus);
  if (query?.trim()) {
    search.set("query", query.trim());
  }
  if (Number.isInteger(folderId) && (folderId ?? 0) > 0) {
    search.set("folder_id", String(folderId));
  }
  if (Number.isInteger(processId) && (processId ?? 0) > 0) {
    search.set("verification_id", String(processId));
  }
  if (batchKey?.trim()) {
    search.set("batch_key", batchKey.trim());
  }
  if (Number.isInteger(targetEquipmentId) && (targetEquipmentId ?? 0) > 0) {
    search.set("equipment_id", String(targetEquipmentId));
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

export function supportsVerification(equipmentType: EquipmentType): boolean {
  return isArshinEquipmentType(equipmentType);
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

export function mapVerificationStageTemplates(
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

export function mapVerificationStageTemplatesToApi(
  templates: VerificationStageTemplates,
): RawProcessStageTemplateVariants {
  return mapProcessStageTemplateVariantsToApi(templates);
}

export function mapEquipmentVerification(
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

export function mapVerificationQueueItem(item: RawVerificationQueueItem): VerificationQueueItem {
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

export function mapEquipmentSIVerification(
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

export function mapSIVerificationPayload(payload: CreateEquipmentSIVerificationPayload) {
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
