import { useRef, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createEquipmentComment,
  deleteEquipmentComment,
  updateEquipmentComment,
  type EquipmentComment,
  type EquipmentCommentDraftAttachment,
} from "@/api/equipment";

type UseEquipmentCommentsParams = {
  token: string | null;
  equipmentId: number;
};

/**
 * The equipment-card discussion slice: composer state, draft-upload bookkeeping and the
 * comment mutations. Members are returned under their original names so the page keeps its
 * JSX unchanged while the component shrinks.
 */
export function useEquipmentComments({ token, equipmentId }: UseEquipmentCommentsParams) {
  const queryClient = useQueryClient();
  const [commentActionError, setCommentActionError] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentDraftIsPrivate, setCommentDraftIsPrivate] = useState(false);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [commentUploadedAttachments, setCommentUploadedAttachments] = useState<
    Record<string, EquipmentCommentDraftAttachment>
  >({});
  const [uploadingCommentFileKeys, setUploadingCommentFileKeys] = useState<string[]>([]);
  const [commentUploadErrorsByKey, setCommentUploadErrorsByKey] = useState<Record<string, string>>(
    {},
  );
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [commentEditDraft, setCommentEditDraft] = useState("");
  const [commentToDelete, setCommentToDelete] = useState<EquipmentComment | null>(null);

  const commentFilesInputRef = useRef<HTMLInputElement | null>(null);
  const commentFilesRef = useRef<File[]>([]);
  const commentUploadedAttachmentsRef = useRef<Record<string, EquipmentCommentDraftAttachment>>({});
  const commentUploadPromisesRef = useRef(
    new Map<string, Promise<EquipmentCommentDraftAttachment | null>>(),
  );

  const createCommentMutation = useMutation({
    mutationFn: ({
      text,
      isPrivate,
      uploadedAttachmentTokens,
    }: {
      text: string;
      isPrivate: boolean;
      uploadedAttachmentTokens: string[];
    }) => createEquipmentComment(token ?? "", equipmentId, { text, isPrivate, uploadedAttachmentTokens }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      setCommentDraft("");
      setCommentDraftIsPrivate(false);
      setCommentFiles([]);
      commentFilesRef.current = [];
      setCommentUploadedAttachments({});
      commentUploadedAttachmentsRef.current = {};
      setCommentUploadErrorsByKey({});
      setCommentActionError(null);
      if (commentFilesInputRef.current) {
        commentFilesInputRef.current.value = "";
      }
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: ({ commentId, text }: { commentId: number; text: string }) =>
      updateEquipmentComment(token ?? "", equipmentId, commentId, { text }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      setEditingCommentId(null);
      setCommentEditDraft("");
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: number) => deleteEquipmentComment(token ?? "", equipmentId, commentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      setCommentToDelete(null);
    },
  });

  return {
    commentActionError,
    setCommentActionError,
    commentDraft,
    setCommentDraft,
    commentDraftIsPrivate,
    setCommentDraftIsPrivate,
    commentFiles,
    setCommentFiles,
    commentUploadedAttachments,
    setCommentUploadedAttachments,
    uploadingCommentFileKeys,
    setUploadingCommentFileKeys,
    commentUploadErrorsByKey,
    setCommentUploadErrorsByKey,
    isSubmittingComment,
    setIsSubmittingComment,
    editingCommentId,
    setEditingCommentId,
    commentEditDraft,
    setCommentEditDraft,
    commentToDelete,
    setCommentToDelete,
    commentFilesInputRef,
    commentFilesRef,
    commentUploadedAttachmentsRef,
    commentUploadPromisesRef,
    createCommentMutation,
    updateCommentMutation,
    deleteCommentMutation,
  };
}
