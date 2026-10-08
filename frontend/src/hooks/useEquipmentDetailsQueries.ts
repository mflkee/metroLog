import { useQuery } from "@tanstack/react-query";

import {
  fetchDeadlinePresets,
  fetchEquipmentDetails,
  fetchEquipmentFolderSuggestions,
  fetchEquipmentFolders,
  fetchEquipmentRepairMessages,
  fetchEquipmentShareRecipients,
  fetchEquipmentVerificationMessages,
} from "@/api/equipment";
import { fetchMentionUsers } from "@/api/users";

type UseEquipmentDetailsQueriesParams = {
  token: string | null;
  equipmentId: number;
  canManage: boolean;
  formFolderId: string | number | null | undefined;
  shareModalOpen: boolean;
  repairExpanded: boolean;
  repairDialogExpanded: boolean;
  verificationExpanded: boolean;
  verificationDialogExpanded: boolean;
};

/**
 * Read-only queries of the equipment card. Extracted from the page so the component keeps
 * only state, mutations and JSX.
 */
export function useEquipmentDetailsQueries({
  token,
  equipmentId,
  canManage,
  formFolderId,
  shareModalOpen,
  repairExpanded,
  repairDialogExpanded,
  verificationExpanded,
  verificationDialogExpanded,
}: UseEquipmentDetailsQueriesParams) {
  const hasEquipmentId = Number.isInteger(equipmentId) && equipmentId > 0;

  const equipmentQuery = useQuery({
    queryKey: ["equipment-details", equipmentId],
    queryFn: () => fetchEquipmentDetails(token ?? "", equipmentId),
    enabled: Boolean(token) && hasEquipmentId,
  });

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders"],
    queryFn: () => fetchEquipmentFolders(token ?? ""),
    enabled: Boolean(token),
  });

  const deadlinePresetsQuery = useQuery({
    queryKey: ["deadline-presets", "equipment-details"],
    queryFn: () => fetchDeadlinePresets(token ?? "", { includeInactive: true }),
    enabled: Boolean(token) && canManage,
  });

  const suggestionsFolderId = Number(formFolderId ?? equipmentQuery.data?.equipment.folderId ?? 0);
  const folderSuggestionsQuery = useQuery({
    queryKey: ["equipment-folder-suggestions", suggestionsFolderId || "none"],
    queryFn: () => fetchEquipmentFolderSuggestions(token ?? "", suggestionsFolderId),
    enabled: Boolean(token) && suggestionsFolderId > 0,
  });

  const mentionUsersQuery = useQuery({
    queryKey: ["mention-users"],
    queryFn: () => fetchMentionUsers(token ?? ""),
    enabled: Boolean(token),
  });

  const shareRecipientsQuery = useQuery({
    queryKey: ["equipment-share-recipients", equipmentId],
    queryFn: () => fetchEquipmentShareRecipients(token ?? "", equipmentId),
    enabled: Boolean(token) && hasEquipmentId && shareModalOpen,
  });

  const repairMessagesQuery = useQuery({
    queryKey: ["equipment-repair-messages", equipmentId],
    queryFn: () => fetchEquipmentRepairMessages(token ?? "", equipmentId),
    enabled:
      Boolean(token)
      && hasEquipmentId
      && Boolean(equipmentQuery.data?.equipment.activeRepair)
      && repairExpanded
      && repairDialogExpanded,
  });

  const verificationMessagesQuery = useQuery({
    queryKey: ["equipment-verification-messages", equipmentId],
    queryFn: () => fetchEquipmentVerificationMessages(token ?? "", equipmentId),
    enabled:
      Boolean(token)
      && hasEquipmentId
      && Boolean(equipmentQuery.data?.equipment.activeVerification)
      && verificationExpanded
      && verificationDialogExpanded,
  });

  return {
    equipmentQuery,
    foldersQuery,
    deadlinePresetsQuery,
    folderSuggestionsQuery,
    mentionUsersQuery,
    shareRecipientsQuery,
    repairMessagesQuery,
    verificationMessagesQuery,
  };
}
