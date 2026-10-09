
import { fetchEquipmentFolderSuggestions, fetchEquipmentFolders, fetchFolderProcessSubscriptions, fetchFolderRefreshTaskDetails } from "@/api/equipment/folders";
import { EquipmentStatus, EquipmentType, fetchDeadlinePresets, fetchEquipment, fetchEquipmentPage } from "@/api/equipment/registry";
import { fetchMentionUsers } from "@/api/users";
import { EquipmentSortState, equipmentPageSize } from "@/lib/equipmentRegistry";
import { useQuery } from "@tanstack/react-query";

type UseEquipmentRegistryQueriesParams = {
  token: string | null,
  canManage: boolean,
  selectedFolderId: number | null,
  /** Folder of the tracked Arshin rescan; falls back to the selected folder. */
  folderRefreshFolderId?: number | null,
  searchQuery: string | null,
  objectNameFilter: string | null,
  locationFilter: string | null,
  statusFilter: EquipmentStatus | "ALL",
  typeFilter: EquipmentType | "ALL",
  sortState: EquipmentSortState | null,
  page: number,
  selectedEquipmentIds: number[],
  folderSubscriptionModalOpen: boolean,
  folderRefreshTaskId: number | null,
};

/** Registry queries of the equipment page. */
export function useEquipmentRegistryQueries({
  token,
  canManage,
  selectedFolderId,
  folderRefreshFolderId,
  searchQuery,
  objectNameFilter,
  locationFilter,
  statusFilter,
  typeFilter,
  sortState,
  page,
  selectedEquipmentIds,
  folderSubscriptionModalOpen,
  folderRefreshTaskId,
}: UseEquipmentRegistryQueriesParams) {




  const foldersQuery = useQuery({
    queryKey: ["equipment-folders"],
    queryFn: () => fetchEquipmentFolders(token ?? ""),
    enabled: Boolean(token),
  });

  const deadlinePresetsQuery = useQuery({
    queryKey: ["deadline-presets", "folders"],
    queryFn: () => fetchDeadlinePresets(token ?? "", { includeInactive: true }),
    enabled: Boolean(token) && canManage,
  });

  const equipmentPageQuery = useQuery({
    queryKey: [
      "equipment-items-page",
      selectedFolderId ?? "none",
      searchQuery,
      objectNameFilter,
      locationFilter,
      statusFilter,
      typeFilter,
      sortState?.key ?? "default-order",
      sortState?.direction ?? "default-direction",
      page,
      equipmentPageSize,
    ],
    queryFn: () =>
      fetchEquipmentPage(token ?? "", {
        folderId: selectedFolderId,
        groupId: null,
        query: searchQuery ?? undefined,
        objectName: objectNameFilter,
        currentLocationManual: locationFilter,
        status: statusFilter === "ALL" ? null : statusFilter,
        equipmentType: typeFilter === "ALL" ? null : typeFilter,
        sortKey: sortState?.key ?? null,
        sortDirection: sortState?.direction ?? null,
        limit: equipmentPageSize,
        offset: (page - 1) * equipmentPageSize,
      }),
    enabled: Boolean(token) && selectedFolderId !== null,
  });

  const selectedEquipmentQuery = useQuery({
    queryKey: [
      "equipment-selected-items",
      selectedFolderId ?? "none",
      ...selectedEquipmentIds,
    ],
    queryFn: () =>
      fetchEquipment(token ?? "", {
        folderId: selectedFolderId,
        groupId: null,
        equipmentIds: selectedEquipmentIds,
      }),
    enabled:
      Boolean(token)
      && selectedFolderId !== null
      && selectedEquipmentIds.length > 0,
  });

  const folderSuggestionsQuery = useQuery({
    queryKey: ["equipment-folder-suggestions", selectedFolderId ?? "none"],
    queryFn: () => fetchEquipmentFolderSuggestions(token ?? "", selectedFolderId ?? 0),
    enabled: Boolean(token) && selectedFolderId !== null,
  });

  const folderProcessSubscriptionsQuery = useQuery({
    queryKey: ["folder-process-subscriptions", selectedFolderId ?? "none"],
    queryFn: () => fetchFolderProcessSubscriptions(token ?? "", selectedFolderId ?? 0),
    enabled: Boolean(token) && canManage && selectedFolderId !== null && folderSubscriptionModalOpen,
  });

  const refreshFolderId = folderRefreshFolderId ?? selectedFolderId;
  const folderRefreshTaskQuery = useQuery({
    queryKey: [
      "equipment-folder-refresh-task",
      refreshFolderId ?? "none",
      folderRefreshTaskId ?? "none",
    ],
    queryFn: () => fetchFolderRefreshTaskDetails(token ?? "", refreshFolderId ?? 0, folderRefreshTaskId ?? 0),
    enabled:
      Boolean(token)
      && canManage
      && refreshFolderId !== null
      && folderRefreshTaskId !== null,
    refetchInterval: (query) => {
      const taskStatus = query.state.data?.task.status;
      return taskStatus === "PENDING" || taskStatus === "PROCESSING" ? 2_000 : false;
    },
  });

  const mentionUsersQuery = useQuery({
    queryKey: ["mention-users"],
    queryFn: () => fetchMentionUsers(token ?? ""),
    enabled: Boolean(token),
  });

  return {
    foldersQuery,
    deadlinePresetsQuery,
    equipmentPageQuery,
    selectedEquipmentQuery,
    folderSuggestionsQuery,
    folderProcessSubscriptionsQuery,
    folderRefreshTaskQuery,
    mentionUsersQuery,
  };
}
