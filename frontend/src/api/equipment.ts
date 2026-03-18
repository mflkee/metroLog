import { apiRequest } from "@/api/client";

export type EquipmentType = "SI" | "IO" | "VO" | "OTHER";
export type EquipmentStatus = "ACTIVE" | "IN_REPAIR" | "ARCHIVED";

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
  created_at: string;
  updated_at: string;
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
  createdAt: string;
  updatedAt: string;
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
};

export type UpdateEquipmentPayload = CreateEquipmentPayload;

type FetchEquipmentFilters = {
  folderId?: number | null;
  groupId?: number | null;
  query?: string;
  status?: EquipmentStatus | null;
  equipmentType?: EquipmentType | null;
};

export async function fetchEquipmentFolders(token: string): Promise<EquipmentFolder[]> {
  const response = await apiRequest<RawEquipmentFolder[]>("/equipment/folders", {
    method: "GET",
    token,
  });
  return response.map(mapEquipmentFolder);
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
  const search = params.toString() ? `?${params.toString()}` : "";
  const response = await apiRequest<RawEquipment[]>(`/equipment${search}`, {
    method: "GET",
    token,
  });
  return response.map(mapEquipment);
}

export async function fetchEquipmentById(token: string, equipmentId: number): Promise<EquipmentItem> {
  const response = await apiRequest<RawEquipment>(`/equipment/${equipmentId}`, {
    method: "GET",
    token,
  });
  return mapEquipment(response);
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
  ACTIVE: "Активно",
  IN_REPAIR: "В ремонте",
  ARCHIVED: "Архив",
};

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
    status: item.status,
    currentLocationManual: item.current_location_manual,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function emptyToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}
