import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import { fetchEquipmentFolders } from "@/api/equipment";
import { fetchFolderRefreshTaskDetails } from "@/api/equipment/folders";
import { getFolderRefreshTaskStatusLabel } from "@/lib/equipmentRegistry";
import { useAuthStore } from "@/store/auth";
import { useFolderRefreshStore } from "@/store/folderRefresh";

/**
 * The "refresh is still running" panel. It used to live inside the registry page, so walking into
 * another section both hid the progress and stopped the polling; it is rendered by the shell now
 * and keeps ticking wherever the user goes.
 */
export function FolderRefreshDock() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((state) => state.token) ?? "";
  const taskId = useFolderRefreshStore((state) => state.taskId);
  const folderId = useFolderRefreshStore((state) => state.folderId);
  const scopeEquipmentIds = useFolderRefreshStore((state) => state.scopeEquipmentIds);
  const minimized = useFolderRefreshStore((state) => state.minimized);
  const modalOpen = useFolderRefreshStore((state) => state.modalOpen);
  const setMinimized = useFolderRefreshStore((state) => state.setMinimized);
  const setModalOpen = useFolderRefreshStore((state) => state.setModalOpen);
  const clear = useFolderRefreshStore((state) => state.clear);

  // Same cache entry the registry page fills, so the panel knows the folder name anywhere.
  const foldersQuery = useQuery({
    queryKey: ["equipment-folders"],
    queryFn: () => fetchEquipmentFolders(token),
    enabled: Boolean(token) && folderId !== null,
  });

  const taskQuery = useQuery({
    queryKey: ["equipment-folder-refresh-task", folderId ?? "none", taskId ?? "none"],
    queryFn: () => fetchFolderRefreshTaskDetails(token, folderId ?? 0, taskId ?? 0),
    enabled: Boolean(token) && folderId !== null && taskId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.task.status;
      return status === "PENDING" || status === "PROCESSING" ? 2_000 : false;
    },
  });

  const task = taskQuery.data?.task ?? null;
  if (!minimized || modalOpen || taskId === null || folderId === null || task === null) {
    return null;
  }

  const folderName = foldersQuery.data?.find((folder) => folder.id === folderId)?.name ?? null;
  const isProcessing = task.status === "PENDING" || task.status === "PROCESSING";
  const scopeLabel =
    scopeEquipmentIds.length > 0
      ? `по ${scopeEquipmentIds.length} отмеченным приборам`
      : "по всей папке";

  return (
    // `pointer-events-auto` keeps the panel clickable while a modal dialog freezes the page behind.
    <aside className="tone-parent pointer-events-auto fixed bottom-4 right-4 z-40 w-[min(26rem,calc(100vw-2rem))] rounded-[24px] border border-line p-4 shadow-panel">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Обновление СИ</p>
            <p className="mt-1 text-xs text-steel">
              {folderName ? `Папка: ${folderName} • ${scopeLabel}` : "Выбранная папка"}
            </p>
          </div>
          <button
            className="btn-secondary btn-sm shrink-0"
            type="button"
            onClick={() => {
              setMinimized(false);
              setModalOpen(true);
              if (location.pathname !== "/equipment") {
                navigate("/equipment");
              }
            }}
          >
            Открыть
          </button>
        </div>

        <div className="tone-child rounded-2xl border border-line px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-ink">
                Статус: {getFolderRefreshTaskStatusLabel(task.status)}
              </div>
              <div className="mt-1 text-xs text-steel">
                {task.totalRows > 0
                  ? `Обработано ${task.processedRows} из ${task.totalRows}.`
                  : "Подготавливаем список приборов для проверки."}
              </div>
            </div>
            <div className="text-sm font-semibold text-ink">{task.progress}%</div>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--accent-soft)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${task.progress}%` }}
            />
          </div>
        </div>

        {task.summary ? (
          <div className="flex flex-wrap gap-2">
            {[
              ["Обновить", task.summary.updated ?? 0],
              ["Обновить?", task.summary.updatedUncertain ?? 0],
              ["Без изменений", task.summary.unchanged ?? 0],
              ["Не найдено", task.summary.notFound ?? 0],
              ["Ошибки", task.summary.error ?? 0],
            ].map(([label, value]) => (
              <span
                key={label}
                className="tone-child rounded-full border border-line px-3 py-1 text-xs text-ink"
              >
                {label}: {value}
              </span>
            ))}
          </div>
        ) : null}

        {task.errorMessage ? <p className="text-sm text-[#b04c43]">{task.errorMessage}</p> : null}

        {!isProcessing ? (
          <div className="flex justify-end">
            <button className="btn-secondary btn-sm" type="button" onClick={clear}>
              Убрать
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
