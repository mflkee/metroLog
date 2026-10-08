// Split out of the former single src/api/equipment.ts module.
// Re-exported by src/api/equipment.ts so existing imports keep working.

import { RawESIEquipmentMonitoringItem, mapEsiEquipmentMonitoringItem } from "./esi";
import { RawDeadlinePresetSnapshot, mapDeadlinePresetSnapshot } from "./registry";

import { apiRequest } from "@/api/client";
import { UserRole } from "@/api/auth";
import { ESIEquipmentMonitoringItem, ESIModuleKind } from "./esi";
import { DeadlinePresetSnapshot } from "./registry";

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

export type CreateEquipmentFolderPayload = {
  name: string;
  description: string;
  sortOrder: number;
  deadlinePresetId: number | null;
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
