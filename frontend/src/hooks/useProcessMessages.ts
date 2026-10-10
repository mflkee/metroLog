import { useRef, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  createEquipmentRepairMessage,
  createEquipmentVerificationMessage,
  deleteEquipmentRepairMessage,
  deleteEquipmentVerificationMessage,
  updateEquipmentRepairMessage,
  updateEquipmentVerificationMessage,
} from "@/api/equipment";

type UseProcessMessagesParams = {
  token: string | null;
  equipmentId: number;
};

/**
 * Repair and verification discussion slices: composer state, draft refs and the
 * create/update/delete mutations for both processes. Members keep their original names so
 * the page body and JSX stay unchanged.
 */
export function useProcessMessages({ token, equipmentId }: UseProcessMessagesParams) {
  const queryClient = useQueryClient();

  const [repairActionError, setRepairActionError] = useState<string | null>(null);
  const [repairMessageDraft, setRepairMessageDraft] = useState("");
  const [repairMessageDraftIsPrivate, setRepairMessageDraftIsPrivate] = useState(false);
  const [repairMessageFiles, setRepairMessageFiles] = useState<File[]>([]);
  const [repairExpanded, setRepairExpanded] = useState(false);
  const [repairDialogExpanded, setRepairDialogExpanded] = useState(false);
  const [editingRepairMessageId, setEditingRepairMessageId] = useState<number | null>(null);
  const [repairMessageEditDraft, setRepairMessageEditDraft] = useState("");
  const [repairMessageToDeleteId, setRepairMessageToDeleteId] = useState<number | null>(null);
  const [downloadingRepairAttachmentId, setDownloadingRepairAttachmentId] = useState<number | null>(null);
  const [verificationActionError, setVerificationActionError] = useState<string | null>(null);
  const [verificationMessageDraft, setVerificationMessageDraft] = useState("");
  const [verificationMessageDraftIsPrivate, setVerificationMessageDraftIsPrivate] = useState(false);
  const [verificationMessageFiles, setVerificationMessageFiles] = useState<File[]>([]);
  const [verificationExpanded, setVerificationExpanded] = useState(false);
  const [verificationDialogExpanded, setVerificationDialogExpanded] = useState(false);
  const [editingVerificationMessageId, setEditingVerificationMessageId] = useState<number | null>(null);
  const [verificationMessageEditDraft, setVerificationMessageEditDraft] = useState("");
  const [verificationMessageToDeleteId, setVerificationMessageToDeleteId] = useState<number | null>(null);
  const [downloadingVerificationAttachmentId, setDownloadingVerificationAttachmentId] = useState<number | null>(null);

  const repairMessageFilesInputRef = useRef<HTMLInputElement | null>(null);
  const verificationMessageFilesInputRef = useRef<HTMLInputElement | null>(null);

  const createRepairMessageMutation = useMutation({
    mutationFn: () =>
      createEquipmentRepairMessage(token ?? "", equipmentId, {
        text: repairMessageDraft,
        isPrivate: repairMessageDraftIsPrivate,
        files: repairMessageFiles,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-repair-messages", equipmentId] });
      setRepairActionError(null);
      setRepairMessageDraft("");
      setRepairMessageDraftIsPrivate(false);
      setRepairMessageFiles([]);
      if (repairMessageFilesInputRef.current) {
        repairMessageFilesInputRef.current.value = "";
      }
    },
  });

  const deleteRepairMessageMutation = useMutation({
    mutationFn: (messageId: number) =>
      deleteEquipmentRepairMessage(token ?? "", equipmentId, messageId),
    onSuccess: async () => {
      setRepairActionError(null);
      setRepairMessageToDeleteId(null);
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-repair-messages", equipmentId] });
    },
  });

  const updateRepairMessageMutation = useMutation({
    mutationFn: ({
      messageId,
      text,
    }: {
      messageId: number;
      text: string;
    }) => updateEquipmentRepairMessage(token ?? "", equipmentId, messageId, { text }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-repair-messages", equipmentId] });
      setEditingRepairMessageId(null);
      setRepairMessageEditDraft("");
      setRepairActionError(null);
    },
  });

  const createVerificationMessageMutation = useMutation({
    mutationFn: () =>
      createEquipmentVerificationMessage(token ?? "", equipmentId, {
        text: verificationMessageDraft,
        isPrivate: verificationMessageDraftIsPrivate,
        files: verificationMessageFiles,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      await queryClient.invalidateQueries({
        queryKey: ["equipment-verification-messages", equipmentId],
      });
      setVerificationActionError(null);
      setVerificationMessageDraft("");
      setVerificationMessageDraftIsPrivate(false);
      setVerificationMessageFiles([]);
      if (verificationMessageFilesInputRef.current) {
        verificationMessageFilesInputRef.current.value = "";
      }
    },
  });

  const deleteVerificationMessageMutation = useMutation({
    mutationFn: (messageId: number) =>
      deleteEquipmentVerificationMessage(token ?? "", equipmentId, messageId),
    onSuccess: async () => {
      setVerificationActionError(null);
      setVerificationMessageToDeleteId(null);
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      await queryClient.invalidateQueries({
        queryKey: ["equipment-verification-messages", equipmentId],
      });
    },
  });

  const updateVerificationMessageMutation = useMutation({
    mutationFn: ({
      messageId,
      text,
    }: {
      messageId: number;
      text: string;
    }) =>
      updateEquipmentVerificationMessage(token ?? "", equipmentId, messageId, { text }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      await queryClient.invalidateQueries({
        queryKey: ["equipment-verification-messages", equipmentId],
      });
      setEditingVerificationMessageId(null);
      setVerificationMessageEditDraft("");
      setVerificationActionError(null);
    },
  });

  return {
    repairActionError,
    setRepairActionError,
    repairMessageDraft,
    setRepairMessageDraft,
    repairMessageDraftIsPrivate,
    setRepairMessageDraftIsPrivate,
    repairMessageFiles,
    setRepairMessageFiles,
    repairExpanded,
    setRepairExpanded,
    repairDialogExpanded,
    setRepairDialogExpanded,
    editingRepairMessageId,
    setEditingRepairMessageId,
    repairMessageEditDraft,
    setRepairMessageEditDraft,
    repairMessageToDeleteId,
    setRepairMessageToDeleteId,
    downloadingRepairAttachmentId,
    setDownloadingRepairAttachmentId,
    verificationActionError,
    setVerificationActionError,
    verificationMessageDraft,
    setVerificationMessageDraft,
    verificationMessageDraftIsPrivate,
    setVerificationMessageDraftIsPrivate,
    verificationMessageFiles,
    setVerificationMessageFiles,
    verificationExpanded,
    setVerificationExpanded,
    verificationDialogExpanded,
    setVerificationDialogExpanded,
    editingVerificationMessageId,
    setEditingVerificationMessageId,
    verificationMessageEditDraft,
    setVerificationMessageEditDraft,
    verificationMessageToDeleteId,
    setVerificationMessageToDeleteId,
    downloadingVerificationAttachmentId,
    setDownloadingVerificationAttachmentId,
    repairMessageFilesInputRef,
    verificationMessageFilesInputRef,
    createRepairMessageMutation,
    deleteRepairMessageMutation,
    updateRepairMessageMutation,
    createVerificationMessageMutation,
    deleteVerificationMessageMutation,
    updateVerificationMessageMutation,
  };
}
