import {
  createEquipmentFolder,
  deleteEquipmentFolder,
  updateEquipmentFolder,
  updateFolderProcessSubscriptions,
} from "@/api/equipment/folders";
import { invalidateEquipmentRegistryQueries } from "@/lib/equipmentQueries";
import {
  ActiveModal,
  DeleteTarget,
  FolderFormState,
  defaultFolderForm,
} from "@/lib/equipmentRegistry";
import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

type UseFolderActionsParams = {
  token: string | null,
  folderId: number | null,
  activeModal: ActiveModal | null,
  setDeleteTarget: (target: DeleteTarget | null) => void,
  setActiveModal: (value: ActiveModal | null) => void,
  setFolderSelection: (folderId: number | null) => void,
};

/** Folder CRUD and folder subscription actions of the registry page. */
export function useFolderActions({
  token,
  folderId,
  activeModal,
  setDeleteTarget,
  setActiveModal,
  setFolderSelection,
}: UseFolderActionsParams) {
  const queryClient = useQueryClient();

  const [folderForm, setFolderForm] = useState<FolderFormState>(defaultFolderForm);
  const [folderSubscriptionModalOpen, setFolderSubscriptionModalOpen] = useState(false);
  const [selectedFolderSubscriptionUserIds, setSelectedFolderSubscriptionUserIds] = useState<number[]>([]);
  const [folderSubscriptionUserSearchQuery, setFolderSubscriptionUserSearchQuery] = useState("");



  function closeFolderModal(): void {
    setFolderForm(defaultFolderForm);
    setActiveModal(null);
  }

  function closeFolderSubscriptionModal(): void {
    setFolderSubscriptionModalOpen(false);
    setSelectedFolderSubscriptionUserIds([]);
    setFolderSubscriptionUserSearchQuery("");
    updateFolderProcessSubscriptionsMutation.reset();
  }

  const createFolderMutation = useMutation({
    mutationFn: () =>
      createEquipmentFolder(token ?? "", {
        name: folderForm.name,
        description: folderForm.description,
        sortOrder: folderForm.sortOrder,
        deadlinePresetId: folderForm.deadlinePresetId,
      }),
    onSuccess: async (folder) => {
      closeFolderModal();
      setFolderSelection(folder.id);
      await queryClient.invalidateQueries({ queryKey: ["equipment-folders"] });
    },
  });

  const updateFolderMutation = useMutation({
    mutationFn: () => {
      if (activeModal?.kind !== "folder" || activeModal.mode !== "edit" || !activeModal.folderId) {
        throw new Error("Папка для редактирования не выбрана.");
      }
      return updateEquipmentFolder(token ?? "", activeModal.folderId, {
        name: folderForm.name,
        description: folderForm.description,
        sortOrder: folderForm.sortOrder,
        deadlinePresetId: folderForm.deadlinePresetId,
      });
    },
    onSuccess: async () => {
      closeFolderModal();
      await queryClient.invalidateQueries({ queryKey: ["equipment-folders"] });
    },
  });

  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: number) => deleteEquipmentFolder(token ?? "", folderId),
    onSuccess: async (_, folderId) => {
      if (folderId === folderId) {
        setFolderSelection(null);
      }
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["equipment-folders"] });
      await invalidateEquipmentRegistryQueries(queryClient);
    },
  });

  const updateFolderProcessSubscriptionsMutation = useMutation({
    mutationFn: (userIds: number[]) =>
      updateFolderProcessSubscriptions(token ?? "", folderId ?? 0, userIds),
    onSuccess: (result) => {
      setSelectedFolderSubscriptionUserIds(
        result.users.filter((userItem) => userItem.enabled).map((userItem) => userItem.userId),
      );
      queryClient.setQueryData(["folder-process-subscriptions", folderId ?? "none"], result);
      setFolderSubscriptionModalOpen(false);
    },
  });

  return {
    folderForm,
    setFolderForm,
    folderSubscriptionModalOpen,
    setFolderSubscriptionModalOpen,
    selectedFolderSubscriptionUserIds,
    setSelectedFolderSubscriptionUserIds,
    folderSubscriptionUserSearchQuery,
    setFolderSubscriptionUserSearchQuery,
    createFolderMutation,
    updateFolderMutation,
    deleteFolderMutation,
    updateFolderProcessSubscriptionsMutation,
    closeFolderModal,
    closeFolderSubscriptionModal,
  };
}
