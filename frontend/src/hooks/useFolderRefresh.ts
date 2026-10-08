import {
  EquipmentFolderRefreshApplyResult,
  EquipmentFolderRefreshRowStatus,
  applyFolderRefreshRows,
  startFolderRefreshTask,
} from "@/api/equipment/folders";
import { updateEquipmentArshinRefreshExclusion } from "@/api/equipment/refresh";
import { invalidateEquipmentRegistryQueries } from "@/lib/equipmentQueries";
import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

type UseFolderRefreshParams = {
  folderId: number | null,
  token: string | null,
};

/** Folder-level Arshin rescan state and actions of the registry page. */
export function useFolderRefresh({
  folderId,
  token,
}: UseFolderRefreshParams) {
  const queryClient = useQueryClient();

  const [folderRefreshModalOpen, setFolderRefreshModalOpen] = useState(false);
  const [folderRefreshTaskId, setFolderRefreshTaskId] = useState<number | null>(null);
  const [folderRefreshMinimized, setFolderRefreshMinimized] = useState(false);
  const [folderRefreshScopeEquipmentIds, setFolderRefreshScopeEquipmentIds] = useState<number[]>([]);
  const [selectedFolderRefreshRowIds, setSelectedFolderRefreshRowIds] = useState<number[]>([]);
  const [folderRefreshApplyResult, setFolderRefreshApplyResult] = useState<EquipmentFolderRefreshApplyResult | null>(null);
  const [folderRefreshActionMessage, setFolderRefreshActionMessage] = useState<string | null>(null);
  const [folderRefreshStatusFilter, setFolderRefreshStatusFilter] = useState<"ALL" | EquipmentFolderRefreshRowStatus>("ALL");
  const [folderRefreshSearchQuery, setFolderRefreshSearchQuery] = useState("");



  const startFolderRefreshMutation = useMutation({
    mutationFn: (equipmentIds: number[]) =>
      startFolderRefreshTask(token ?? "", folderId ?? 0, equipmentIds),
    onSuccess: (task) => {
      setFolderRefreshTaskId(task.id);
      setSelectedFolderRefreshRowIds([]);
      setFolderRefreshApplyResult(null);
    },
  });

  const applyFolderRefreshMutation = useMutation({
    mutationFn: (rowIds: number[]) =>
      applyFolderRefreshRows(token ?? "", folderId ?? 0, folderRefreshTaskId ?? 0, rowIds),
    onSuccess: async (result) => {
      setFolderRefreshApplyResult(result);
      setSelectedFolderRefreshRowIds([]);
      setFolderRefreshActionMessage(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            "equipment-folder-refresh-task",
            folderId ?? "none",
            folderRefreshTaskId ?? "none",
          ],
        }),
        invalidateEquipmentRegistryQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: ["equipment-item"] }),
        queryClient.invalidateQueries({ queryKey: ["equipment-esi-monitoring", folderId ?? "none"] }),
      ]);
    },
  });

  const excludeFolderRefreshSelectionMutation = useMutation({
    mutationFn: async (equipmentIds: number[]) => {
      const uniqueEquipmentIds = Array.from(new Set(equipmentIds));
      const results = await Promise.allSettled(
        uniqueEquipmentIds.map((equipmentId) =>
          updateEquipmentArshinRefreshExclusion(token ?? "", equipmentId, true),
        ),
      );
      const updatedCount = results.filter((result) => result.status === "fulfilled").length;
      const failedCount = results.length - updatedCount;
      if (updatedCount === 0) {
        throw new Error("Не удалось исключить выбранные приборы из следующих проверок.");
      }
      return { updatedCount, failedCount };
    },
    onSuccess: async ({ updatedCount, failedCount }) => {
      setFolderRefreshApplyResult(null);
      setSelectedFolderRefreshRowIds([]);
      setFolderRefreshActionMessage(
        failedCount > 0
          ? `Исключено из следующих проверок: ${updatedCount}. Ошибок: ${failedCount}.`
          : `Исключено из следующих проверок: ${updatedCount}.`,
      );
      await Promise.all([
        invalidateEquipmentRegistryQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: ["dashboard-equipment"] }),
        queryClient.invalidateQueries({ queryKey: ["equipment-details"] }),
      ]);
    },
  });

  return {
    folderRefreshModalOpen,
    setFolderRefreshModalOpen,
    folderRefreshTaskId,
    setFolderRefreshTaskId,
    folderRefreshMinimized,
    setFolderRefreshMinimized,
    folderRefreshScopeEquipmentIds,
    setFolderRefreshScopeEquipmentIds,
    selectedFolderRefreshRowIds,
    setSelectedFolderRefreshRowIds,
    folderRefreshApplyResult,
    setFolderRefreshApplyResult,
    folderRefreshActionMessage,
    setFolderRefreshActionMessage,
    folderRefreshStatusFilter,
    setFolderRefreshStatusFilter,
    folderRefreshSearchQuery,
    setFolderRefreshSearchQuery,
    startFolderRefreshMutation,
    applyFolderRefreshMutation,
    excludeFolderRefreshSelectionMutation,
  };
}
