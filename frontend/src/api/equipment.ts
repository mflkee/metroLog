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
  batch_key: string | null;
  batch_name: string | null;
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
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RawEquipmentVerification = {
  id: number;
  equipment_id: number;
  batch_key: string | null;
  batch_name: string | null;
  route_city: string;
  route_destination: string;
  sent_to_verification_at: string;
  received_at_destination_at: string | null;
  handed_to_csm_at: string | null;
  verification_completed_at: string | null;
  picked_up_from_csm_at: string | null;
  shipped_back_at: string | null;
  returned_from_verification_at: string | null;
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
  processBatchNames: string[];
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
  batchKey: string | null;
  batchName: string | null;
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
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EquipmentVerification = {
  id: number;
  equipmentId: number;
  batchKey: string | null;
  batchName: string | null;
  routeCity: string;
  routeDestination: string;
  sentToVerificationAt: string;
  receivedAtDestinationAt: string | null;
  handedToCsmAt: string | null;
  verificationCompletedAt: string | null;
  pickedUpFromCsmAt: string | null;
  shippedBackAt: string | null;
  returnedFromVerificationAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VerificationQueueItem = {
  equipmentId: number;
  verificationId: number;
  batchKey: string | null;
  batchName: string | null;
  folderId: number | null;
  objectName: string;
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
  closedAt: string | null;
  hasActiveVerification: boolean;
  resultDocnum: string | null;
  currentStageLabel: string;
  repairOverdueDays: number;
  registrationOverdueDays: number;
  controlOverdueDays: number;
  paymentOverdueDays: number;
  maxOverdueDays: number;
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

export type CreateRepairBatchPayload = {
  equipmentIds: number[];
  batchName: string;
  routeCity: string;
  routeDestination: string;
  sentToRepairAt: string;
  initialMessageText: string;
};

export type CreateRepairMessagePayload = {
  text: string;
  files: File[];
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
};

export type UpdateProcessBatchItemsPayload = {
  addEquipmentIds?: number[];
  removeEquipmentIds?: number[];
};

export type CreateEquipmentVerificationPayload = {
  routeCity: string;
  routeDestination: string;
  sentToVerificationAt: string;
  initialMessageText: string;
  files: File[];
};

export type CreateVerificationBatchPayload = {
  equipmentIds: number[];
  batchName: string;
  routeCity: string;
  routeDestination: string;
  sentToVerificationAt: string;
  initialMessageText: string;
};

export type UpdateEquipmentVerificationMilestonesPayload = {
  receivedAtDestinationAt?: string | null;
  handedToCsmAt?: string | null;
  verificationCompletedAt?: string | null;
  pickedUpFromCsmAt?: string | null;
  shippedBackAt?: string | null;
  returnedFromVerificationAt?: string | null;
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

type RawVerificationQueueItem = {
  equipment_id: number;
  verification_id: number;
  batch_key: string | null;
  batch_name: string | null;
  folder_id: number | null;
  object_name: string;
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
  closed_at: string | null;
  has_active_verification: boolean;
  result_docnum: string | null;
  current_stage_label: string;
  repair_overdue_days: number;
  registration_overdue_days: number;
  control_overdue_days: number;
  payment_overdue_days: number;
  max_overdue_days: number;
  created_at: string;
  updated_at: string;
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
    processBatchNames: response.process_batch_names,
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

export async function fetchVerificationQueue(
  token: string,
  {
    lifecycleStatus,
    query,
  }: {
    lifecycleStatus: "active" | "archived";
    query?: string;
  },
): Promise<VerificationQueueItem[]> {
  const search = new URLSearchParams();
  search.set("lifecycle_status", lifecycleStatus);
  if (query?.trim()) {
    search.set("query", query.trim());
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

export async function fetchRepairQueue(
  token: string,
  {
    lifecycleStatus,
    query,
  }: {
    lifecycleStatus: "active" | "archived";
    query?: string;
  },
): Promise<RepairQueueItem[]> {
  const search = new URLSearchParams();
  search.set("lifecycle_status", lifecycleStatus);
  if (query?.trim()) {
    search.set("query", query.trim());
  }
  const response = await apiRequest<RawRepairQueueItem[]>(`/equipment/repairs?${search.toString()}`, {
    method: "GET",
    token,
  });
  return response.map(mapRepairQueueItem);
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
    throw new ApiError(response.status, "Не удалось выгрузить Excel-файл.");
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileName = parseContentDispositionFileName(contentDisposition) ?? "equipment-registry.xlsx";
  return { blob, fileName };
}

export async function exportRepairQueueXlsx(
  token: string,
  {
    lifecycleStatus,
    query,
  }: {
    lifecycleStatus: "active" | "archived";
    query?: string;
  },
): Promise<{ blob: Blob; fileName: string }> {
  const search = new URLSearchParams();
  search.set("lifecycle_status", lifecycleStatus);
  if (query?.trim()) {
    search.set("query", query.trim());
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
    throw new ApiError(response.status, "Не удалось выгрузить Excel-файл ремонтов.");
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileName = parseContentDispositionFileName(contentDisposition) ?? "repairs.xlsx";
  return { blob, fileName };
}

export async function exportVerificationQueueXlsx(
  token: string,
  {
    lifecycleStatus,
    query,
  }: {
    lifecycleStatus: "active" | "archived";
    query?: string;
  },
): Promise<{ blob: Blob; fileName: string }> {
  const search = new URLSearchParams();
  search.set("lifecycle_status", lifecycleStatus);
  if (query?.trim()) {
    search.set("query", query.trim());
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
    throw new ApiError(response.status, "Не удалось выгрузить Excel-файл поверок.");
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

export async function createEquipmentRepair(
  token: string,
  equipmentId: number,
  payload: CreateEquipmentRepairPayload,
): Promise<EquipmentRepair> {
  const formData = new FormData();
  formData.set("route_city", payload.routeCity);
  formData.set("route_destination", payload.routeDestination);
  formData.set("sent_to_repair_at", normalizeDateForApi(payload.sentToRepairAt));
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

export async function createRepairBatch(
  token: string,
  payload: CreateRepairBatchPayload,
): Promise<EquipmentRepair[]> {
  const response = await apiRequest<RawEquipmentRepair[]>("/equipment/repairs/bulk", {
    method: "POST",
    token,
    body: {
      equipment_ids: payload.equipmentIds,
      batch_name: payload.batchName,
      route_city: payload.routeCity,
      route_destination: payload.routeDestination,
      sent_to_repair_at: normalizeDateForApi(payload.sentToRepairAt),
      initial_message_text: payload.initialMessageText.trim() || null,
    },
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
  formData.set("route_city", payload.routeCity);
  formData.set("route_destination", payload.routeDestination);
  formData.set("sent_to_verification_at", normalizeDateForApi(payload.sentToVerificationAt));
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

export async function createVerificationBatch(
  token: string,
  payload: CreateVerificationBatchPayload,
): Promise<EquipmentVerification[]> {
  const response = await apiRequest<RawEquipmentVerification[]>("/equipment/verifications/bulk", {
    method: "POST",
    token,
    body: {
      equipment_ids: payload.equipmentIds,
      batch_name: payload.batchName,
      route_city: payload.routeCity,
      route_destination: payload.routeDestination,
      sent_to_verification_at: normalizeDateForApi(payload.sentToVerificationAt),
      initial_message_text: payload.initialMessageText.trim() || null,
    },
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
    throw new ApiError(response.status, "Не удалось скачать архив поверки.");
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
    throw new ApiError(response.status, "Не удалось скачать архив ремонта.");
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

export function getVerificationProgressLabel(
  verification: Pick<
    EquipmentVerification,
    | "routeDestination"
    | "receivedAtDestinationAt"
    | "handedToCsmAt"
    | "verificationCompletedAt"
    | "pickedUpFromCsmAt"
    | "shippedBackAt"
    | "returnedFromVerificationAt"
  >,
): string {
  if (verification.returnedFromVerificationAt) {
    return "Получено обратно";
  }
  if (verification.shippedBackAt) {
    return "Отправлено обратно";
  }
  if (verification.pickedUpFromCsmAt) {
    return "Получено в ЦСМ";
  }
  if (verification.verificationCompletedAt) {
    return "Поверка выполнена";
  }
  if (verification.handedToCsmAt) {
    return "В ЦСМ на поверке";
  }
  if (verification.receivedAtDestinationAt) {
    return "Получено в пункте назначения";
  }
  return "Ожидает получения в пункте назначения";
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
    status: resolvedStatus,
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
    batchKey: repair.batch_key,
    batchName: repair.batch_name,
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
    routeCity: verification.route_city,
    routeDestination: verification.route_destination,
    sentToVerificationAt: verification.sent_to_verification_at,
    receivedAtDestinationAt: verification.received_at_destination_at,
    handedToCsmAt: verification.handed_to_csm_at,
    verificationCompletedAt: verification.verification_completed_at,
    pickedUpFromCsmAt: verification.picked_up_from_csm_at,
    shippedBackAt: verification.shipped_back_at,
    returnedFromVerificationAt: verification.returned_from_verification_at,
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

function mapVerificationQueueItem(item: RawVerificationQueueItem): VerificationQueueItem {
  return {
    equipmentId: item.equipment_id,
    verificationId: item.verification_id,
    batchKey: item.batch_key,
    batchName: item.batch_name,
    folderId: item.folder_id,
    objectName: item.object_name,
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
    closedAt: item.closed_at,
    hasActiveVerification: item.has_active_verification,
    resultDocnum: item.result_docnum,
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
