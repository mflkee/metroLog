import { apiBaseUrl, ApiError, apiRequest } from "@/api/client";

export type TaskStatus = "NEW" | "IN_PROGRESS" | "ON_HOLD" | "DONE" | "CANCELLED" | "ARCHIVED";
export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
export type TaskParticipantRole = "RESPONSIBLE" | "ASSIGNEE" | "OBSERVER";

export type TaskParticipant = {
  userId: number;
  role: TaskParticipantRole;
  displayName: string;
  email: string | null;
};

export type TaskEquipmentLink = {
  equipmentId: number;
  note: string | null;
  sortOrder: number;
  objectName: string | null;
  name: string | null;
  modification: string | null;
  serialNumber: string | null;
  equipmentType: string | null;
};

export type TaskChecklistItem = {
  id: number;
  label: string;
  isDone: boolean;
  sortOrder: number;
};

export type Task = {
  id: number;
  folderId: number | null;
  folderName: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  kind: string | null;
  tags: string[];
  dueDate: string | null;
  createdByUserId: number | null;
  createdByDisplayName: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
  /** Mirrors the API rule: operators, the author and RESPONSIBLE/ASSIGNEE may change the task. */
  canMutate: boolean;
  participants: TaskParticipant[];
  equipment: TaskEquipmentLink[];
  checklist: TaskChecklistItem[];
  checklistDone: number;
  checklistTotal: number;
};

export type TaskListItem = {
  id: number;
  folderId: number | null;
  folderName: string | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  kind: string | null;
  tags: string[];
  dueDate: string | null;
  responsibleDisplayName: string | null;
  assigneeCount: number;
  observerCount: number;
  equipmentCount: number;
  checklistDone: number;
  checklistTotal: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
  canMutate: boolean;
};

export type TaskPage = {
  items: TaskListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type TaskMessageAttachment = {
  id: number;
  fileName: string;
  fileMimeType: string | null;
  fileSize: number;
  uploadedByDisplayName: string;
  createdAt: string;
};

export type TaskMessage = {
  id: number;
  authorUserId: number | null;
  authorDisplayName: string;
  text: string | null;
  isPrivate: boolean;
  createdAt: string;
  updatedAt: string;
  attachments: TaskMessageAttachment[];
};

export type TaskAttachment = {
  id: number;
  fileName: string;
  fileMimeType: string | null;
  fileSize: number;
  uploadedByUserId: number | null;
  uploadedByDisplayName: string;
  createdAt: string;
};

export type TaskListFilters = {
  folderId?: number | null;
  statuses?: TaskStatus[];
  priorities?: TaskPriority[];
  responsibleUserId?: number | null;
  assigneeUserId?: number | null;
  equipmentId?: number | null;
  query?: string | null;
  overdueOnly?: boolean;
  sort?: string | null;
  limit?: number;
  offset?: number;
};

export type TaskCreatePayload = {
  /** Omitted in the UI: the API takes the folder from the attached equipment. */
  folderId?: number | null;
  title: string;
  description?: string | null;
  priority?: TaskPriority;
  kind?: string | null;
  tags?: string[];
  dueDate?: string | null;
  responsibleUserId: number;
  assigneeUserIds?: number[];
  observerUserIds?: number[];
  equipmentIds?: number[];
};

export type TaskUpdatePayload = {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  kind?: string | null;
  tags?: string[];
  dueDate?: string | null;
  responsibleUserId?: number;
  assigneeUserIds?: number[];
  observerUserIds?: number[];
  equipmentIds?: number[];
};

export const TASK_STATUSES: TaskStatus[] = [
  "NEW",
  "IN_PROGRESS",
  "ON_HOLD",
  "DONE",
  "CANCELLED",
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  NEW: "Новая",
  IN_PROGRESS: "В работе",
  ON_HOLD: "Приостановлена",
  DONE: "Выполнена",
  CANCELLED: "Отменена",
  ARCHIVED: "В архиве",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Низкий",
  NORMAL: "Обычный",
  HIGH: "Высокий",
  CRITICAL: "Критичный",
};

type RawParticipant = {
  user_id: number;
  role: TaskParticipantRole;
  display_name: string;
  email: string | null;
};

type RawEquipmentLink = {
  equipment_id: number;
  note: string | null;
  sort_order: number;
  object_name: string | null;
  name: string | null;
  modification: string | null;
  serial_number: string | null;
  equipment_type: string | null;
};

type RawChecklistItem = {
  id: number;
  label: string;
  is_done: boolean;
  sort_order: number;
};

type RawTask = {
  id: number;
  folder_id: number | null;
  folder_name: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  kind: string | null;
  tags: string[];
  due_date: string | null;
  created_by_user_id: number | null;
  created_by_display_name: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  is_overdue: boolean;
  can_mutate: boolean;
  participants: RawParticipant[];
  equipment: RawEquipmentLink[];
  checklist: RawChecklistItem[];
  checklist_done: number;
  checklist_total: number;
};

type RawTaskListItem = {
  id: number;
  folder_id: number | null;
  folder_name: string | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  kind: string | null;
  tags: string[];
  due_date: string | null;
  responsible_display_name: string | null;
  assignee_count: number;
  observer_count: number;
  equipment_count: number;
  checklist_done: number;
  checklist_total: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  is_overdue: boolean;
  can_mutate: boolean;
};

type RawTaskPage = {
  items: RawTaskListItem[];
  total: number;
  limit: number;
  offset: number;
};

type RawMessageAttachment = {
  id: number;
  file_name: string;
  file_mime_type: string | null;
  file_size: number;
  uploaded_by_display_name: string;
  created_at: string;
};

type RawMessage = {
  id: number;
  author_user_id: number | null;
  author_display_name: string;
  text: string | null;
  is_private: boolean;
  created_at: string;
  updated_at: string;
  attachments: RawMessageAttachment[];
};

type RawAttachment = {
  id: number;
  file_name: string;
  file_mime_type: string | null;
  file_size: number;
  uploaded_by_user_id: number | null;
  uploaded_by_display_name: string;
  created_at: string;
};

function mapParticipant(raw: RawParticipant): TaskParticipant {
  return {
    userId: raw.user_id,
    role: raw.role,
    displayName: raw.display_name,
    email: raw.email,
  };
}

function mapEquipmentLink(raw: RawEquipmentLink): TaskEquipmentLink {
  return {
    equipmentId: raw.equipment_id,
    note: raw.note,
    sortOrder: raw.sort_order,
    objectName: raw.object_name,
    name: raw.name,
    modification: raw.modification,
    serialNumber: raw.serial_number,
    equipmentType: raw.equipment_type,
  };
}

function mapChecklistItem(raw: RawChecklistItem): TaskChecklistItem {
  return { id: raw.id, label: raw.label, isDone: raw.is_done, sortOrder: raw.sort_order };
}

export function mapTask(raw: RawTask): Task {
  return {
    id: raw.id,
    folderId: raw.folder_id,
    folderName: raw.folder_name,
    title: raw.title,
    description: raw.description,
    status: raw.status,
    priority: raw.priority,
    kind: raw.kind,
    tags: raw.tags,
    dueDate: raw.due_date,
    createdByUserId: raw.created_by_user_id,
    createdByDisplayName: raw.created_by_display_name,
    completedAt: raw.completed_at,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    isOverdue: raw.is_overdue,
    canMutate: raw.can_mutate ?? false,
    participants: raw.participants.map(mapParticipant),
    equipment: raw.equipment.map(mapEquipmentLink),
    checklist: raw.checklist.map(mapChecklistItem),
    checklistDone: raw.checklist_done,
    checklistTotal: raw.checklist_total,
  };
}

function mapTaskListItem(raw: RawTaskListItem): TaskListItem {
  return {
    id: raw.id,
    folderId: raw.folder_id,
    folderName: raw.folder_name,
    title: raw.title,
    status: raw.status,
    priority: raw.priority,
    kind: raw.kind,
    tags: raw.tags,
    dueDate: raw.due_date,
    responsibleDisplayName: raw.responsible_display_name,
    assigneeCount: raw.assignee_count,
    observerCount: raw.observer_count,
    equipmentCount: raw.equipment_count,
    checklistDone: raw.checklist_done,
    checklistTotal: raw.checklist_total,
    completedAt: raw.completed_at,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    isOverdue: raw.is_overdue,
    canMutate: raw.can_mutate ?? false,
  };
}

function mapMessage(raw: RawMessage): TaskMessage {
  return {
    id: raw.id,
    authorUserId: raw.author_user_id,
    authorDisplayName: raw.author_display_name,
    text: raw.text,
    isPrivate: raw.is_private,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    attachments: raw.attachments.map((attachment) => ({
      id: attachment.id,
      fileName: attachment.file_name,
      fileMimeType: attachment.file_mime_type,
      fileSize: attachment.file_size,
      uploadedByDisplayName: attachment.uploaded_by_display_name,
      createdAt: attachment.created_at,
    })),
  };
}

function mapAttachment(raw: RawAttachment): TaskAttachment {
  return {
    id: raw.id,
    fileName: raw.file_name,
    fileMimeType: raw.file_mime_type,
    fileSize: raw.file_size,
    uploadedByUserId: raw.uploaded_by_user_id ?? null,
    uploadedByDisplayName: raw.uploaded_by_display_name,
    createdAt: raw.created_at,
  };
}

function buildListQuery(filters: TaskListFilters): string {
  const params = new URLSearchParams();
  if (filters.folderId) params.set("folder_id", String(filters.folderId));
  for (const status of filters.statuses ?? []) params.append("status", status);
  for (const priority of filters.priorities ?? []) params.append("priority", priority);
  if (filters.responsibleUserId) params.set("responsible_user_id", String(filters.responsibleUserId));
  if (filters.assigneeUserId) params.set("assignee_user_id", String(filters.assigneeUserId));
  if (filters.equipmentId) params.set("equipment_id", String(filters.equipmentId));
  if (filters.query) params.set("query", filters.query);
  if (filters.overdueOnly) params.set("overdue_only", "true");
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.offset) params.set("offset", String(filters.offset));
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fetchTasks(token: string, filters: TaskListFilters = {}): Promise<TaskPage> {
  const response = await apiRequest<RawTaskPage>(`/tasks${buildListQuery(filters)}`, {
    method: "GET",
    token,
  });
  return {
    items: response.items.map(mapTaskListItem),
    total: response.total,
    limit: response.limit,
    offset: response.offset,
  };
}

export async function fetchTask(token: string, taskId: number): Promise<Task> {
  const response = await apiRequest<RawTask>(`/tasks/${taskId}`, { method: "GET", token });
  return mapTask(response);
}

export async function createTask(token: string, payload: TaskCreatePayload): Promise<Task> {
  const response = await apiRequest<RawTask>("/tasks", {
    method: "POST",
    token,
    body: {
      folder_id: payload.folderId ?? null,
      title: payload.title,
      description: payload.description ?? null,
      priority: payload.priority ?? "NORMAL",
      kind: payload.kind ?? null,
      tags: payload.tags ?? [],
      due_date: payload.dueDate ?? null,
      responsible_user_id: payload.responsibleUserId,
      assignee_user_ids: payload.assigneeUserIds ?? [],
      observer_user_ids: payload.observerUserIds ?? [],
      equipment_ids: payload.equipmentIds ?? [],
    },
  });
  return mapTask(response);
}

export async function updateTask(
  token: string,
  taskId: number,
  payload: TaskUpdatePayload,
): Promise<Task> {
  const body: Record<string, unknown> = {};
  if (payload.title !== undefined) body.title = payload.title;
  if (payload.description !== undefined) body.description = payload.description;
  if (payload.status !== undefined) body.status = payload.status;
  if (payload.priority !== undefined) body.priority = payload.priority;
  if (payload.kind !== undefined) body.kind = payload.kind;
  if (payload.tags !== undefined) body.tags = payload.tags;
  if (payload.dueDate !== undefined) body.due_date = payload.dueDate;
  if (payload.equipmentIds !== undefined) body.equipment_ids = payload.equipmentIds;
  const participantsTouched =
    payload.responsibleUserId !== undefined ||
    payload.assigneeUserIds !== undefined ||
    payload.observerUserIds !== undefined;
  if (participantsTouched) {
    body.responsible_user_id = payload.responsibleUserId;
    body.assignee_user_ids = payload.assigneeUserIds ?? [];
    body.observer_user_ids = payload.observerUserIds ?? [];
  }
  const response = await apiRequest<RawTask>(`/tasks/${taskId}`, {
    method: "PATCH",
    token,
    body,
  });
  return mapTask(response);
}

export async function deleteTask(token: string, taskId: number): Promise<void> {
  await apiRequest<unknown>(`/tasks/${taskId}`, { method: "DELETE", token });
}

export async function addChecklistItem(token: string, taskId: number, label: string): Promise<Task> {
  const response = await apiRequest<RawTask>(`/tasks/${taskId}/checklist`, {
    method: "POST",
    token,
    body: { label },
  });
  return mapTask(response);
}

export async function updateChecklistItem(
  token: string,
  taskId: number,
  itemId: number,
  payload: { label?: string; isDone?: boolean },
): Promise<Task> {
  const body: Record<string, unknown> = {};
  if (payload.label !== undefined) body.label = payload.label;
  if (payload.isDone !== undefined) body.is_done = payload.isDone;
  const response = await apiRequest<RawTask>(`/tasks/${taskId}/checklist/${itemId}`, {
    method: "PATCH",
    token,
    body,
  });
  return mapTask(response);
}

export async function deleteChecklistItem(
  token: string,
  taskId: number,
  itemId: number,
): Promise<Task> {
  const response = await apiRequest<RawTask>(`/tasks/${taskId}/checklist/${itemId}`, {
    method: "DELETE",
    token,
  });
  return mapTask(response);
}

export async function fetchTaskMessages(token: string, taskId: number): Promise<TaskMessage[]> {
  const response = await apiRequest<RawMessage[]>(`/tasks/${taskId}/messages`, {
    method: "GET",
    token,
  });
  return response.map(mapMessage);
}

export async function createTaskMessage(
  token: string,
  taskId: number,
  payload: { text?: string | null; isPrivate?: boolean },
  files: File[] = [],
): Promise<TaskMessage> {
  const form = new FormData();
  if (payload.text) form.set("text", payload.text);
  form.set("is_private", payload.isPrivate ? "true" : "false");
  for (const file of files) form.append("files", file);
  const response = await apiRequest<RawMessage>(`/tasks/${taskId}/messages`, {
    method: "POST",
    token,
    body: form,
  });
  return mapMessage(response);
}

export async function deleteTaskMessage(
  token: string,
  taskId: number,
  messageId: number,
): Promise<void> {
  await apiRequest<unknown>(`/tasks/${taskId}/messages/${messageId}`, { method: "DELETE", token });
}

export async function fetchTaskAttachments(
  token: string,
  taskId: number,
): Promise<TaskAttachment[]> {
  const response = await apiRequest<RawAttachment[]>(`/tasks/${taskId}/attachments`, {
    method: "GET",
    token,
  });
  return response.map(mapAttachment);
}

export async function uploadTaskAttachments(
  token: string,
  taskId: number,
  files: File[],
): Promise<TaskAttachment[]> {
  const form = new FormData();
  for (const file of files) form.append("files", file);
  const response = await apiRequest<RawAttachment[]>(`/tasks/${taskId}/attachments`, {
    method: "POST",
    token,
    body: form,
  });
  return response.map(mapAttachment);
}

export async function deleteTaskAttachment(
  token: string,
  taskId: number,
  attachmentId: number,
): Promise<void> {
  await apiRequest<unknown>(`/tasks/${taskId}/attachments/${attachmentId}`, {
    method: "DELETE",
    token,
  });
}

export async function fetchTaskAttachmentBlob(
  token: string,
  taskId: number,
  attachmentId: number,
): Promise<Blob> {
  return fetchTaskBlob(`${apiBaseUrl}/tasks/${taskId}/attachments/${attachmentId}`, token);
}

export async function fetchTaskMessageAttachmentBlob(
  token: string,
  taskId: number,
  messageId: number,
  attachmentId: number,
): Promise<Blob> {
  return fetchTaskBlob(
    `${apiBaseUrl}/tasks/${taskId}/messages/${messageId}/attachments/${attachmentId}`,
    token,
  );
}

async function fetchTaskBlob(url: string, token: string): Promise<Blob> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    throw new ApiError(response.status, "Не удалось загрузить файл.");
  }
  return response.blob();
}

export async function fetchTaskSubscription(
  token: string,
  taskId: number,
): Promise<{ isSubscribed: boolean }> {
  const response = await apiRequest<{ is_subscribed: boolean }>(`/tasks/${taskId}/subscription`, {
    method: "GET",
    token,
  });
  return { isSubscribed: response.is_subscribed };
}

export async function setTaskSubscription(
  token: string,
  taskId: number,
  subscribed: boolean,
): Promise<{ isSubscribed: boolean }> {
  const response = await apiRequest<{ is_subscribed: boolean }>(`/tasks/${taskId}/subscription`, {
    method: subscribed ? "POST" : "DELETE",
    token,
  });
  return { isSubscribed: response.is_subscribed };
}
