import { create } from "zustand";

/**
 * A folder Arshin rescan outlives the registry page: the user may start it, minimise the panel and
 * walk into other sections while it runs. Keeping the tracked task here (instead of in the page
 * component, which unmounts on navigation) is what lets the docked panel follow the user around.
 */
type FolderRefreshState = {
  taskId: number | null;
  folderId: number | null;
  scopeEquipmentIds: number[];
  minimized: boolean;
  modalOpen: boolean;
  setTaskId: (taskId: number | null) => void;
  setMinimized: (minimized: boolean) => void;
  setModalOpen: (modalOpen: boolean) => void;
  track: (params: {
    taskId: number;
    folderId: number | null;
    scopeEquipmentIds: number[];
  }) => void;
  clear: () => void;
};

export const useFolderRefreshStore = create<FolderRefreshState>((set) => ({
  taskId: null,
  folderId: null,
  scopeEquipmentIds: [],
  minimized: false,
  modalOpen: false,
  setTaskId: (taskId) =>
    set(taskId === null ? { taskId: null, folderId: null, scopeEquipmentIds: [] } : { taskId }),
  setMinimized: (minimized) => set({ minimized }),
  setModalOpen: (modalOpen) => set({ modalOpen }),
  track: ({ taskId, folderId, scopeEquipmentIds }) =>
    set({ taskId, folderId, scopeEquipmentIds }),
  clear: () =>
    set({
      taskId: null,
      folderId: null,
      scopeEquipmentIds: [],
      minimized: false,
      modalOpen: false,
    }),
}));
