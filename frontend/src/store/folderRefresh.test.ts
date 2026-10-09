import { useFolderRefreshStore } from "@/store/folderRefresh";

/**
 * The panel follows the user into other sections, so the state has to outlive the registry page and
 * collapse back to nothing in one step.
 */
describe("folder refresh store", () => {
  it("keeps the tracked task, its folder and the docked state", () => {
    useFolderRefreshStore.getState().track({ taskId: 7, folderId: 3, scopeEquipmentIds: [1, 2] });
    useFolderRefreshStore.getState().setMinimized(true);

    expect(useFolderRefreshStore.getState()).toMatchObject({
      taskId: 7,
      folderId: 3,
      scopeEquipmentIds: [1, 2],
      minimized: true,
      modalOpen: false,
    });

    useFolderRefreshStore.getState().setModalOpen(true);
    expect(useFolderRefreshStore.getState().modalOpen).toBe(true);
  });

  it("forgets the folder as soon as the task is dropped", () => {
    useFolderRefreshStore.getState().track({ taskId: 7, folderId: 3, scopeEquipmentIds: [1] });
    useFolderRefreshStore.getState().setTaskId(null);

    expect(useFolderRefreshStore.getState()).toMatchObject({
      taskId: null,
      folderId: null,
      scopeEquipmentIds: [],
    });
  });

  it("clears everything at once", () => {
    useFolderRefreshStore.getState().track({ taskId: 9, folderId: 4, scopeEquipmentIds: [5] });
    useFolderRefreshStore.getState().setMinimized(true);
    useFolderRefreshStore.getState().setModalOpen(true);

    useFolderRefreshStore.getState().clear();

    expect(useFolderRefreshStore.getState()).toMatchObject({
      taskId: null,
      folderId: null,
      scopeEquipmentIds: [],
      minimized: false,
      modalOpen: false,
    });
  });
});
