// Split out of the former single src/api/equipment.ts module.
// Re-exported by src/api/equipment.ts so existing imports keep working.

import { parseContentDispositionFileName } from "./registry";





import { ApiError, apiBaseUrl, apiRequest, getResponseErrorMessage } from "@/api/client";

export type RawRepairMessageAttachment = {
  id: number;
  repair_message_id: number;
  uploaded_by_user_id: number | null;
  uploaded_by_display_name: string;
  file_name: string;
  file_mime_type: string | null;
  file_size: number;
  created_at: string;
};

export type RawVerificationMessageAttachment = {
  id: number;
  verification_message_id: number;
  uploaded_by_user_id: number | null;
  uploaded_by_display_name: string;
  file_name: string;
  file_mime_type: string | null;
  file_size: number;
  created_at: string;
};

export type RawEquipmentAttachment = {
  id: number;
  equipment_id: number;
  uploaded_by_user_id: number | null;
  uploaded_by_display_name: string;
  file_name: string;
  file_mime_type: string | null;
  file_size: number;
  created_at: string;
};

export type RawEquipmentComment = {
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

export type CreateEquipmentCommentPayload = {
  text: string;
  isPrivate?: boolean;
  files?: File[];
  uploadedAttachmentTokens?: string[];
};

export type UpdateEquipmentCommentPayload = {
  text: string;
};

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

export function mapRepairMessageAttachment(
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

export function mapVerificationMessageAttachment(
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

export function mapEquipmentAttachment(attachment: RawEquipmentAttachment): EquipmentAttachment {
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

export function mapEquipmentComment(comment: RawEquipmentComment): EquipmentComment {
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
