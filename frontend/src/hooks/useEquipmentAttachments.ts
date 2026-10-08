import { useRef, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  deleteEquipmentAttachment,
  uploadEquipmentAttachment,
  type EquipmentAttachment,
  type EquipmentDetailsResult,
} from "@/api/equipment";
import { buildPendingFileKey, mergeEquipmentAttachments } from "@/lib/attachments";

type UseEquipmentAttachmentsParams = {
  token: string | null;
  equipmentId: number;
};

/**
 * The equipment-card attachment slice: upload/delete mutations plus the composer bookkeeping.
 * Members keep their original names so the page body and JSX stay unchanged.
 */
export function useEquipmentAttachments({ token, equipmentId }: UseEquipmentAttachmentsParams) {
  const queryClient = useQueryClient();
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<number | null>(null);
  const [attachmentActionError, setAttachmentActionError] = useState<string | null>(null);
  const [attachmentToDelete, setAttachmentToDelete] = useState<EquipmentAttachment | null>(null);
  const [pendingAttachmentFiles, setPendingAttachmentFiles] = useState<File[]>([]);
  const [uploadingAttachmentFileKeys, setUploadingAttachmentFileKeys] = useState<string[]>([]);
  const [attachmentUploadErrorsByKey, setAttachmentUploadErrorsByKey] = useState<
    Record<string, string>
  >({});
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);

  const uploadAttachmentMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const uploadedKeys: string[] = [];
      const uploadedAttachments: EquipmentAttachment[] = [];
      const failedUploads: Array<{ fileKey: string; fileName: string; message: string }> = [];

      for (const file of files) {
        try {
          const uploadedAttachment = await uploadEquipmentAttachment(token ?? "", equipmentId, file);
          uploadedKeys.push(buildPendingFileKey(file));
          uploadedAttachments.push(uploadedAttachment);
        } catch (error) {
          failedUploads.push({
            fileKey: buildPendingFileKey(file),
            fileName: file.name,
            message:
              error instanceof Error ? error.message : "Не удалось загрузить вложение.",
          });
        }
      }

      return { uploadedAttachments, uploadedKeys, failedUploads };
    },
    onMutate: (files) => {
      setAttachmentActionError(null);
      setUploadingAttachmentFileKeys(files.map((file) => buildPendingFileKey(file)));
      setAttachmentUploadErrorsByKey((current) => {
        const next = { ...current };
        for (const file of files) {
          delete next[buildPendingFileKey(file)];
        }
        return next;
      });
    },
    onSuccess: async ({ failedUploads, uploadedAttachments, uploadedKeys }) => {
      if (uploadedKeys.length) {
        setPendingAttachmentFiles((current) =>
          current.filter((file) => !uploadedKeys.includes(buildPendingFileKey(file))),
        );
        if (attachmentInputRef.current) {
          attachmentInputRef.current.value = "";
        }
      }

      if (uploadedAttachments.length) {
        queryClient.setQueryData<EquipmentDetailsResult | undefined>(
          ["equipment-details", equipmentId],
          (current) =>
            current
              ? {
                  ...current,
                  attachments: mergeEquipmentAttachments(current.attachments, uploadedAttachments),
                }
              : current,
        );
        await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      }

      if (!failedUploads.length) {
        setAttachmentUploadErrorsByKey((current) => {
          const next = { ...current };
          for (const uploadedKey of uploadedKeys) {
            delete next[uploadedKey];
          }
          return next;
        });
        setAttachmentActionError(null);
        return;
      }

      setAttachmentUploadErrorsByKey((current) => {
        const next = { ...current };
        for (const uploadedKey of uploadedKeys) {
          delete next[uploadedKey];
        }
        for (const failedUpload of failedUploads) {
          next[failedUpload.fileKey] = failedUpload.message;
        }
        return next;
      });
      setAttachmentActionError(
        failedUploads.length === 1
          ? `Не удалось загрузить файл ${failedUploads[0].fileName}: ${failedUploads[0].message}`
          : `Не удалось загрузить ${failedUploads.length} файлов. Проверь сообщения у проблемных вложений.`,
      );
    },
    onSettled: () => {
      setUploadingAttachmentFileKeys([]);
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: number) =>
      deleteEquipmentAttachment(token ?? "", equipmentId, attachmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      setAttachmentToDelete(null);
    },
  });

  return {
    downloadingAttachmentId,
    setDownloadingAttachmentId,
    attachmentActionError,
    setAttachmentActionError,
    attachmentToDelete,
    setAttachmentToDelete,
    pendingAttachmentFiles,
    setPendingAttachmentFiles,
    uploadingAttachmentFileKeys,
    setUploadingAttachmentFileKeys,
    attachmentUploadErrorsByKey,
    setAttachmentUploadErrorsByKey,
    attachmentInputRef,
    uploadAttachmentMutation,
    deleteAttachmentMutation,
  };
}
