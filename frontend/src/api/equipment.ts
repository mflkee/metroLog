import type { ArshinSearchResult, ArshinVriDetail } from "@/api/arshin";
import { ApiError, apiBaseUrl, apiRequest } from "@/api/client";

export type EquipmentType = "SI" | "IO" | "VO" | "OTHER";
export type EquipmentStatus = "IN_WORK" | "IN_VERIFICATION" | "IN_REPAIR" | "ARCHIVED";

type RawEquipmentFolder = {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
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
  repair_route_cities: string[];
  repair_route_destinations: string[];
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
  status: EquipmentStatus;
  current_location_manual: string | null;
  active_repair: RawEquipmentRepair | null;
  active_verification: RawEquipmentVerification | null;
  si_verification: RawSIVerification | null;
  created_at: string;
  updated_at: string;
};

type RawEquipmentRepair = {
  id: number;
  equipment_id: number;
  route_city: string;
  route_destination: string;
  sent_to_repair_at: string;
  repair_deadline_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RawEquipmentVerification = {
  id: number;
  equipment_id: number;
  route_city: string;
  route_destination: string;
  sent_to_verification_at: string;
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
  result_docnum: string | null;
  verification_date: string | null;
  valid_date: string | null;
  detail_payload_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
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
  created_at: string;
};

export type EquipmentFolder = {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
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
  repairRouteCities: string[];
  repairRouteDestinations: string[];
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
  status: EquipmentStatus;
  currentLocationManual: string | null;
  activeRepair: EquipmentRepair | null;
  activeVerification: EquipmentVerification | null;
  siVerification: EquipmentSIVerification | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentRepair = {
  id: number;
  equipmentId: number;
  routeCity: string;
  routeDestination: string;
  sentToRepairAt: string;
  repairDeadlineAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentVerification = {
  id: number;
  equipmentId: number;
  routeCity: string;
  routeDestination: string;
  sentToVerificationAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  resultDocnum: string | null;
  verificationDate: string | null;
  validDate: string | null;
  detailPayloadJson: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
};

export type CreateEquipmentFolderPayload = {
  name: string;
  description: string;
  sortOrder: number;
};

export type CreateEquipmentPayload = {
  folderId: number;
  groupId: number | null;
  objectName: string;
  equipmentType: EquipmentType;
  name: string;
  modification: string;
  serialNumber: string;
  manufactureYear: number | null;
  status: EquipmentStatus;
  currentLocationManual: string;
  siVerification?: CreateEquipmentSIVerificationPayload | null;
};

export type UpdateEquipmentPayload = CreateEquipmentPayload;

export type CreateEquipmentSIVerificationPayload = {
  vriId: string;
  arshinUrl: string | null;
  orgTitle: string | null;
  mitNumber: string | null;
  mitTitle: string | null;
  mitNotation: string | null;
  miNumber: string | null;
  resultDocnum: string | null;
  verificationDate: string | null;
  validDate: string | null;
  rawPayloadJson: Record<string, unknown> | null;
  detailPayloadJson: Record<string, unknown> | null;
};

export type CreateEquipmentCommentPayload = {
  text: string;
};

export type UpdateEquipmentCommentPayload = {
  text: string;
};

export type CreateEquipmentRepairPayload = {
  routeCity: string;
  routeDestination: string;
  sentToRepairAt: string;
  initialMessageText: string;
  files: File[];
};

export type CreateRepairMessagePayload = {
  text: string;
  files: File[];
};

export type CreateEquipmentVerificationPayload = {
  routeCity: string;
  routeDestination: string;
  sentToVerificationAt: string;
  initialMessageText: string;
  files: File[];
};

export type CreateVerificationMessagePayload = {
  text: string;
  files: File[];
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
  query?: string;
  status?: EquipmentStatus | null;
  equipmentType?: EquipmentType | null;
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
    repairRouteCities: response.repair_route_cities,
    repairRouteDestinations: response.repair_route_destinations,
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
    throw new ApiError(response.status, "Не удалось выгрузить Excel-файл.");
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileName = parseContentDispositionFileName(contentDisposition) ?? "equipment-registry.xlsx";
  return { blob, fileName };
}

export async function fetchEquipmentById(token: string, equipmentId: number): Promise<EquipmentItem> {
  const response = await apiRequest<RawEquipment>(`/equipment/${equipmentId}`, {
    method: "GET",
    token,
  });
  return mapEquipment(response);
}

export async function createEquipmentRepair(
  token: string,
  equipmentId: number,
  payload: CreateEquipmentRepairPayload,
): Promise<EquipmentRepair> {
  const formData = new FormData();
  formData.set("route_city", payload.routeCity);
  formData.set("route_destination", payload.routeDestination);
  formData.set("sent_to_repair_at", payload.sentToRepairAt);
  if (payload.initialMessageText.trim()) {
    formData.set("initial_message_text", payload.initialMessageText.trim());
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

export async function createEquipmentVerification(
  token: string,
  equipmentId: number,
  payload: CreateEquipmentVerificationPayload,
): Promise<EquipmentVerification> {
  const formData = new FormData();
  formData.set("route_city", payload.routeCity);
  formData.set("route_destination", payload.routeDestination);
  formData.set("sent_to_verification_at", payload.sentToVerificationAt);
  if (payload.initialMessageText.trim()) {
    formData.set("initial_message_text", payload.initialMessageText.trim());
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
    throw new ApiError(response.status, "Не удалось скачать вложение ремонта.");
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
    throw new ApiError(response.status, "Не удалось скачать вложение поверки.");
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileName =
    parseContentDispositionFileName(contentDisposition) ?? `verification-attachment-${attachmentId}`;
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
  const response = await apiRequest<RawEquipmentComment>(`/equipment/${equipmentId}/comments`, {
    method: "POST",
    token,
    body: {
      text: payload.text,
    },
  });
  return mapEquipmentComment(response);
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
    throw new ApiError(response.status, "Не удалось скачать вложение.");
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
      status: payload.status,
      current_location_manual: emptyToNull(payload.currentLocationManual),
      si_verification: payload.siVerification ? mapSIVerificationPayload(payload.siVerification) : null,
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
      status: payload.status,
      current_location_manual: emptyToNull(payload.currentLocationManual),
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

export const equipmentTypeLabels: Record<EquipmentType, string> = {
  SI: "СИ",
  IO: "ИО",
  VO: "ВО",
  OTHER: "Др.",
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

export function buildSIVerificationPayloadFromArshin(
  result: ArshinSearchResult,
  detail: ArshinVriDetail | null,
): CreateEquipmentSIVerificationPayload {
  return {
    vriId: result.vriId,
    arshinUrl: result.arshinUrl,
    orgTitle: result.orgTitle,
    mitNumber: result.mitNumber,
    mitTitle: result.mitTitle,
    mitNotation: result.mitNotation,
    miNumber: result.miNumber,
    resultDocnum: result.resultDocnum,
    verificationDate: result.verificationDate,
    validDate: result.validDate,
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
    createdAt: folder.created_at,
    updatedAt: folder.updated_at,
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
    status: activeRepair ? "IN_REPAIR" : activeVerification ? "IN_VERIFICATION" : item.status,
    currentLocationManual: item.current_location_manual,
    activeRepair,
    activeVerification,
    siVerification: item.si_verification ? mapEquipmentSIVerification(item.si_verification) : null,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function mapEquipmentRepair(repair: RawEquipmentRepair): EquipmentRepair {
  return {
    id: repair.id,
    equipmentId: repair.equipment_id,
    routeCity: repair.route_city,
    routeDestination: repair.route_destination,
    sentToRepairAt: repair.sent_to_repair_at,
    repairDeadlineAt: repair.repair_deadline_at,
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
    routeCity: verification.route_city,
    routeDestination: verification.route_destination,
    sentToVerificationAt: verification.sent_to_verification_at,
    closedAt: verification.closed_at,
    createdAt: verification.created_at,
    updatedAt: verification.updated_at,
  };
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

function mapRepairMessage(message: RawRepairMessage): RepairMessage {
  return {
    id: message.id,
    repairId: message.repair_id,
    authorUserId: message.author_user_id,
    authorDisplayName: message.author_display_name,
    text: message.text,
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
    resultDocnum: siVerification.result_docnum,
    verificationDate: siVerification.verification_date,
    validDate: siVerification.valid_date,
    detailPayloadJson: siVerification.detail_payload_json,
    createdAt: siVerification.created_at,
    updatedAt: siVerification.updated_at,
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

function mapEquipmentComment(comment: RawEquipmentComment): EquipmentComment {
  return {
    id: comment.id,
    equipmentId: comment.equipment_id,
    authorUserId: comment.author_user_id,
    authorDisplayName: comment.author_display_name,
    text: comment.text,
    createdAt: comment.created_at,
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
    result_docnum: payload.resultDocnum,
    verification_date: payload.verificationDate,
    valid_date: payload.validDate,
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

function buildEquipmentFilterSearch(filters: FetchEquipmentFilters = {}): string {
  const params = new URLSearchParams();
  if (filters.folderId) {
    params.set("folder_id", String(filters.folderId));
  }
  if (filters.groupId) {
    params.set("group_id", String(filters.groupId));
  }
  if (filters.query?.trim()) {
    params.set("query", filters.query.trim());
  }
  if (filters.status) {
    params.set("status", filters.status);
  }
  if (filters.equipmentType) {
    params.set("equipment_type", filters.equipmentType);
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
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
