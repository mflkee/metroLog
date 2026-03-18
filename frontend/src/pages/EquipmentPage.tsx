import { type FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createEquipment,
  createEquipmentFolder,
  deleteEquipment,
  deleteEquipmentFolder,
  equipmentStatusLabels,
  equipmentTypeLabels,
  fetchEquipment,
  fetchEquipmentFolders,
  fetchEquipmentGroups,
  updateEquipment,
  updateEquipmentFolder,
  type EquipmentFolder,
  type EquipmentItem,
  type EquipmentStatus,
  type EquipmentType,
  type UpdateEquipmentPayload,
} from "@/api/equipment";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/store/auth";

const equipmentTypeOptions: EquipmentType[] = ["SI", "IO", "VO", "OTHER"];
const equipmentStatusOptions: EquipmentStatus[] = ["ACTIVE", "IN_REPAIR", "ARCHIVED"];
const subtleButtonClass =
  "rounded-full border border-line px-4 py-2 text-sm text-steel transition hover:border-signal-info hover:text-ink";

type FolderFormState = {
  name: string;
  description: string;
  sortOrder: number;
};

type EquipmentFormState = {
  groupId: string;
  objectName: string;
  equipmentType: EquipmentType;
  name: string;
  modification: string;
  serialNumber: string;
  manufactureYear: string;
  status: EquipmentStatus;
  currentLocationManual: string;
};

type DeleteTarget =
  | { kind: "folder"; id: number; title: string; message: string }
  | { kind: "equipment"; id: number; title: string; message: string };

type ActiveModal =
  | null
  | { kind: "folder"; mode: "create" | "edit"; folderId?: number }
  | { kind: "equipment"; mode: "create" | "edit"; equipmentId?: number };

const defaultFolderForm: FolderFormState = {
  name: "",
  description: "",
  sortOrder: 0,
};

const defaultEquipmentForm: EquipmentFormState = {
  groupId: "",
  objectName: "",
  equipmentType: "OTHER",
  name: "",
  modification: "",
  serialNumber: "",
  manufactureYear: "",
  status: "ACTIVE",
  currentLocationManual: "",
};

export function EquipmentPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<EquipmentType | "ALL">("ALL");
  const [folderForm, setFolderForm] = useState<FolderFormState>(defaultFolderForm);
  const [equipmentForm, setEquipmentForm] = useState<EquipmentFormState>(defaultEquipmentForm);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const canManage = user?.role === "ADMINISTRATOR" || user?.role === "MKAIR";

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders"],
    queryFn: () => fetchEquipmentFolders(token ?? ""),
    enabled: Boolean(token),
  });

  const groupsQuery = useQuery({
    queryKey: ["equipment-groups", selectedFolderId ?? "none"],
    queryFn: () => fetchEquipmentGroups(token ?? "", selectedFolderId),
    enabled: Boolean(token) && selectedFolderId !== null,
  });

  const equipmentQuery = useQuery({
    queryKey: [
      "equipment-items",
      selectedFolderId ?? "none",
      selectedGroupId ?? "all",
      deferredSearchQuery,
      statusFilter,
      typeFilter,
    ],
    queryFn: () =>
      fetchEquipment(token ?? "", {
        folderId: selectedFolderId,
        groupId: selectedGroupId,
        query: deferredSearchQuery,
        status: statusFilter === "ALL" ? null : statusFilter,
        equipmentType: typeFilter === "ALL" ? null : typeFilter,
      }),
    enabled: Boolean(token) && selectedFolderId !== null,
  });

  const createFolderMutation = useMutation({
    mutationFn: () =>
      createEquipmentFolder(token ?? "", {
        name: folderForm.name,
        description: folderForm.description,
        sortOrder: folderForm.sortOrder,
      }),
    onSuccess: async (folder) => {
      closeFolderModal();
      setSelectedFolderId(folder.id);
      setSelectedGroupId(null);
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
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
        setSelectedGroupId(null);
      }
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["equipment-folders"] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-groups"] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
    },
  });

  const createEquipmentMutation = useMutation({
    mutationFn: () =>
      createEquipment(token ?? "", mapEquipmentFormToPayload(equipmentForm, selectedFolderId ?? 0)),
    onSuccess: async (equipmentItem) => {
      closeEquipmentModal();
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", equipmentItem.id] });
    },
  });

  const updateEquipmentMutation = useMutation({
    mutationFn: () => {
      if (
        activeModal?.kind !== "equipment" ||
        activeModal.mode !== "edit" ||
        !activeModal.equipmentId ||
        selectedFolderId === null
      ) {
        throw new Error("Прибор для редактирования не выбран.");
      }
      return updateEquipment(
        token ?? "",
        activeModal.equipmentId,
        mapEquipmentFormToPayload(equipmentForm, selectedFolderId),
      );
    },
    onSuccess: async (equipmentItem) => {
      closeEquipmentModal();
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", equipmentItem.id] });
    },
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: (equipmentId: number) => deleteEquipment(token ?? "", equipmentId),
    onSuccess: async (_, equipmentId) => {
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", equipmentId] });
    },
  });

  const folders = foldersQuery.data ?? [];
  const groups = groupsQuery.data ?? [];
  const equipmentItems = equipmentQuery.data ?? [];

  useEffect(() => {
    if (selectedFolderId === null) {
      setSelectedGroupId(null);
      return;
    }

    if (!folders.some((folder) => folder.id === selectedFolderId)) {
      setSelectedFolderId(null);
      setSelectedGroupId(null);
    }
  }, [folders, selectedFolderId]);

  useEffect(() => {
    if (selectedGroupId === null) {
      return;
    }
    if (!groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(null);
    }
  }, [groups, selectedGroupId]);

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );

  const groupNameById = useMemo(
    () => new Map<number, string>(groups.map((group) => [group.id, group.name] as const)),
    [groups],
  );

  if (!token) {
    return null;
  }

  function closeFolderModal() {
    setFolderForm(defaultFolderForm);
    setActiveModal(null);
  }

  function closeEquipmentModal() {
    setEquipmentForm({
      ...defaultEquipmentForm,
      groupId: selectedGroupId ? String(selectedGroupId) : "",
    });
    setActiveModal(null);
  }

  function leaveFolderWorkspace() {
    setSelectedFolderId(null);
    setSelectedGroupId(null);
    setSearchQuery("");
    setStatusFilter("ALL");
    setTypeFilter("ALL");
  }

  function openCreateFolderModal() {
    setFolderForm(defaultFolderForm);
    setActiveModal({ kind: "folder", mode: "create" });
  }

  function openEditFolderModal(folder: EquipmentFolder) {
    setFolderForm({
      name: folder.name,
      description: folder.description ?? "",
      sortOrder: folder.sortOrder,
    });
    setActiveModal({ kind: "folder", mode: "edit", folderId: folder.id });
  }

  function openCreateEquipmentModal() {
    setEquipmentForm({
      ...defaultEquipmentForm,
      groupId: selectedGroupId ? String(selectedGroupId) : "",
    });
    setActiveModal({ kind: "equipment", mode: "create" });
  }

  function openEditEquipmentModal(item: EquipmentItem) {
    setEquipmentForm({
      groupId: item.groupId ? String(item.groupId) : "",
      objectName: item.objectName,
      equipmentType: item.equipmentType,
      name: item.name,
      modification: item.modification ?? "",
      serialNumber: item.serialNumber ?? "",
      manufactureYear: item.manufactureYear ? String(item.manufactureYear) : "",
      status: item.status,
      currentLocationManual: item.currentLocationManual ?? "",
    });
    setActiveModal({ kind: "equipment", mode: "edit", equipmentId: item.id });
  }

  async function handleFolderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeModal?.kind !== "folder") {
      return;
    }
    if (activeModal.mode === "create") {
      await createFolderMutation.mutateAsync();
      return;
    }
    await updateFolderMutation.mutateAsync();
  }

  async function handleEquipmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFolderId || activeModal?.kind !== "equipment") {
      return;
    }
    if (activeModal.mode === "create") {
      await createEquipmentMutation.mutateAsync();
      return;
    }
    await updateEquipmentMutation.mutateAsync();
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) {
      return;
    }

    if (deleteTarget.kind === "folder") {
      await deleteFolderMutation.mutateAsync(deleteTarget.id);
      return;
    }
    await deleteEquipmentMutation.mutateAsync(deleteTarget.id);
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title="Оборудование"
        description="Общий реестр оборудования: сначала папка, затем группы и уже внутри рабочая таблица приборов."
      />

      {selectedFolder ? (
        <section className="space-y-4 rounded-[30px] border border-line bg-white p-5 shadow-panel">
          <div className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <button className={subtleButtonClass} type="button" onClick={leaveFolderWorkspace}>
                Все папки
              </button>
              <div>
                <h2 className="text-2xl font-semibold text-ink">{selectedFolder.name}</h2>
                <p className="mt-1 max-w-3xl text-sm text-steel">
                  {selectedFolder.description || "Рабочая область папки без дополнительного описания."}
                </p>
              </div>
            </div>

            {canManage ? (
              <div className="flex flex-wrap gap-3">
                <button
                  aria-label="Редактировать папку"
                  className="icon-action-button"
                  title="Редактировать папку"
                  type="button"
                  onClick={() => openEditFolderModal(selectedFolder)}
                >
                  <span className="nf-icon text-base leading-none">󰏫</span>
                </button>
                <button
                  aria-label="Удалить папку"
                  className="icon-action-button"
                  title="Удалить папку"
                  type="button"
                  onClick={() =>
                    setDeleteTarget({
                      kind: "folder",
                      id: selectedFolder.id,
                      title: "Удалить папку",
                      message:
                        "Удалить эту папку? Все группы и приборы внутри нее тоже будут удалены.",
                    })
                  }
                >
                  <span className="nf-icon text-base leading-none">󰅖</span>
                </button>
                <button className={subtleButtonClass} type="button" onClick={openCreateEquipmentModal}>
                  Новый прибор
                </button>
              </div>
            ) : null}
          </div>

          <section className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-base font-semibold text-ink">Группы внутри папки</h3>
                <p className="mt-1 text-sm text-steel">
                  Можно смотреть все приборы сразу или сузиться до одной группы.
                </p>
              </div>
              <span className="rounded-full bg-[#edf2f5] px-3 py-1 text-xs font-semibold text-steel">
                {groups.length} групп
              </span>
            </div>

            {groupsQuery.isLoading ? <p className="text-sm text-steel">Загружаем группы...</p> : null}
            {groupsQuery.isError ? (
              <p className="text-sm text-[#b04c43]">
                {groupsQuery.error instanceof Error
                  ? groupsQuery.error.message
                  : "Не удалось загрузить группы."}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                className={[
                  "rounded-full border px-4 py-2 text-sm transition",
                  selectedGroupId === null
                    ? "border-signal-info bg-[#eaf4f8] text-ink"
                    : "border-line text-steel hover:border-signal-info hover:text-ink",
                ].join(" ")}
                type="button"
                onClick={() => setSelectedGroupId(null)}
              >
                Все группы
              </button>
              {groups.map((group) => (
                <button
                  key={group.id}
                  className={[
                    "rounded-full border px-4 py-2 text-sm transition",
                    selectedGroupId === group.id
                      ? "border-signal-info bg-[#eaf4f8] text-ink"
                      : "border-line text-steel hover:border-signal-info hover:text-ink",
                  ].join(" ")}
                  type="button"
                  onClick={() => setSelectedGroupId(group.id)}
                >
                  {group.name}
                </button>
              ))}
            </div>

            {!groupsQuery.isLoading && !groups.length ? (
              <p className="text-sm text-steel">
                Группы в этой папке пока не созданы. Это не мешает вести приборы напрямую внутри папки.
              </p>
            ) : null}
          </section>

          <section className="space-y-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-ink">Реестр приборов</h3>
                <p className="mt-1 text-sm text-steel">
                  Здесь только базовая информация, а расширенный состав данных открывается в карточке прибора.
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3 xl:min-w-[820px]">
                <label className="block text-sm text-steel">
                  Поиск
                  <input
                    className="form-input"
                    placeholder="Наименование, объект, серийный номер, локация"
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </label>
                <label className="block text-sm text-steel">
                  Статус
                  <select
                    className="form-input"
                    value={statusFilter}
                    onChange={(event) =>
                      setStatusFilter(event.target.value as EquipmentStatus | "ALL")
                    }
                  >
                    <option value="ALL">Все статусы</option>
                    {equipmentStatusOptions.map((status) => (
                      <option key={status} value={status}>
                        {equipmentStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-steel">
                  Категория
                  <select
                    className="form-input"
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value as EquipmentType | "ALL")}
                  >
                    <option value="ALL">Все категории</option>
                    {equipmentTypeOptions.map((type) => (
                      <option key={type} value={type}>
                        {equipmentTypeLabels[type]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {equipmentQuery.isLoading ? <p className="text-sm text-steel">Загружаем оборудование...</p> : null}
            {equipmentQuery.isError ? (
              <p className="text-sm text-[#b04c43]">
                {equipmentQuery.error instanceof Error
                  ? equipmentQuery.error.message
                  : "Не удалось загрузить оборудование."}
              </p>
            ) : null}

            {!equipmentQuery.isLoading && !equipmentItems.length ? (
              <div className="rounded-3xl border border-dashed border-line bg-[#f8fbfc] px-5 py-10 text-center">
                <p className="text-base font-semibold text-ink">Под текущие фильтры приборы не найдены.</p>
                <p className="mt-2 text-sm text-steel">
                  Измени фильтры или добавь первый прибор в выбранную папку.
                </p>
              </div>
            ) : null}

            {equipmentItems.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-[0.16em] text-steel">
                      <th className="px-3 py-2">Прибор</th>
                      <th className="px-3 py-2">Категория</th>
                      <th className="px-3 py-2">Статус</th>
                      <th className="px-3 py-2">Группа</th>
                      <th className="px-3 py-2">Серийный</th>
                      <th className="px-3 py-2">Объект</th>
                      <th className="px-3 py-2">Локация</th>
                      {canManage ? <th className="px-3 py-2">Действия</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {equipmentItems.map((item) => (
                      <EquipmentRow
                        key={item.id}
                        canManage={canManage}
                        groupName={item.groupId ? groupNameById.get(item.groupId) ?? "Без группы" : "Без группы"}
                        item={item}
                        onDelete={() =>
                          setDeleteTarget({
                            kind: "equipment",
                            id: item.id,
                            title: "Удалить прибор",
                            message: "Удалить этот прибор из реестра? Действие потребует подтверждения.",
                          })
                        }
                        onEdit={() => openEditEquipmentModal(item)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </section>
      ) : (
        <section className="space-y-4 rounded-[30px] border border-line bg-white p-5 shadow-panel">
          <div className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-ink">Папки оборудования</h2>
              <p className="mt-1 text-sm text-steel">
                Сначала выбирается рабочая папка, а уже внутри открывается таблица приборов и группы.
              </p>
            </div>
            {canManage ? (
              <button className={subtleButtonClass} type="button" onClick={openCreateFolderModal}>
                Новая папка
              </button>
            ) : null}
          </div>

          {foldersQuery.isLoading ? <p className="text-sm text-steel">Загружаем папки...</p> : null}
          {foldersQuery.isError ? (
            <p className="text-sm text-[#b04c43]">
              {foldersQuery.error instanceof Error
                ? foldersQuery.error.message
                : "Не удалось загрузить папки."}
            </p>
          ) : null}

          {!foldersQuery.isLoading && !folders.length ? (
            <div className="rounded-3xl border border-dashed border-line bg-[#f8fbfc] px-5 py-10 text-center">
              <p className="text-base font-semibold text-ink">Папок пока нет.</p>
              <p className="mt-2 text-sm text-steel">
                Создай первую папку, чтобы собрать внутри группы и общий список приборов.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="rounded-[26px] border border-line bg-white/85 p-5 transition hover:border-signal-info hover:bg-white"
              >
                <button className="block w-full text-left" type="button" onClick={() => setSelectedFolderId(folder.id)}>
                  <div className="text-lg font-semibold text-ink">{folder.name}</div>
                  <p className="mt-2 text-sm text-steel">
                    {folder.description || "Открой папку, чтобы работать с группами и приборами."}
                  </p>
                </button>
                {canManage ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      aria-label={`Редактировать папку ${folder.name}`}
                      className="icon-action-button"
                      title="Редактировать папку"
                      type="button"
                      onClick={() => openEditFolderModal(folder)}
                    >
                      <span className="nf-icon text-base leading-none">󰏫</span>
                    </button>
                    <button
                      aria-label={`Удалить папку ${folder.name}`}
                      className="icon-action-button"
                      title="Удалить папку"
                      type="button"
                      onClick={() =>
                        setDeleteTarget({
                          kind: "folder",
                          id: folder.id,
                          title: "Удалить папку",
                          message:
                            "Удалить эту папку? Все группы и приборы внутри нее тоже будут удалены.",
                        })
                      }
                    >
                      <span className="nf-icon text-base leading-none">󰅖</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal
        description={
          activeModal?.kind === "folder" && activeModal.mode === "edit"
            ? "Измени название или описание папки."
            : "Например лаборатория, участок или другая логическая область учета."
        }
        open={activeModal?.kind === "folder"}
        title={activeModal?.kind === "folder" && activeModal.mode === "edit" ? "Редактировать папку" : "Новая папка"}
        onClose={closeFolderModal}
      >
        <form className="space-y-4" onSubmit={(event) => void handleFolderSubmit(event)}>
          <label className="block text-sm text-steel">
            Название папки
            <input
              className="form-input"
              type="text"
              value={folderForm.name}
              onChange={(event) =>
                setFolderForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </label>
          <label className="block text-sm text-steel">
            Описание
            <input
              className="form-input"
              type="text"
              value={folderForm.description}
              onChange={(event) =>
                setFolderForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          {(createFolderMutation.isError || updateFolderMutation.isError) ? (
            <p className="text-sm text-[#b04c43]">
              {getMutationErrorMessage(createFolderMutation.error ?? updateFolderMutation.error, "Не удалось сохранить папку.")}
            </p>
          ) : null}
          <div className="flex justify-end">
            <button
              className="btn-primary disabled:opacity-60"
              disabled={createFolderMutation.isPending || updateFolderMutation.isPending}
              type="submit"
            >
              {createFolderMutation.isPending || updateFolderMutation.isPending
                ? "Сохраняем..."
                : activeModal?.kind === "folder" && activeModal.mode === "edit"
                  ? "Сохранить папку"
                  : "Создать папку"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        description={
          activeModal?.kind === "equipment" && activeModal.mode === "edit"
            ? "Измени базовые данные прибора прямо из реестра."
            : selectedFolder
              ? `Прибор будет добавлен в папку «${selectedFolder.name}». Группа указывается только при необходимости.`
              : "Сначала выбери папку."
        }
        open={activeModal?.kind === "equipment"}
        title={
          activeModal?.kind === "equipment" && activeModal.mode === "edit"
            ? "Редактировать прибор"
            : "Новый прибор"
        }
        onClose={closeEquipmentModal}
      >
        <form className="space-y-4" onSubmit={(event) => void handleEquipmentSubmit(event)}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm text-steel">
              Группа
              <select
                className="form-input"
                value={equipmentForm.groupId}
                onChange={(event) =>
                  setEquipmentForm((current) => ({ ...current, groupId: event.target.value }))
                }
              >
                <option value="">Без группы</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-steel">
              Категория
              <select
                className="form-input"
                value={equipmentForm.equipmentType}
                onChange={(event) =>
                  setEquipmentForm((current) => ({
                    ...current,
                    equipmentType: event.target.value as EquipmentType,
                  }))
                }
              >
                {equipmentTypeOptions.map((type) => (
                  <option key={type} value={type}>
                    {equipmentTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-steel">
              Объект
              <input
                className="form-input"
                type="text"
                value={equipmentForm.objectName}
                onChange={(event) =>
                  setEquipmentForm((current) => ({ ...current, objectName: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-steel">
              Наименование
              <input
                className="form-input"
                type="text"
                value={equipmentForm.name}
                onChange={(event) =>
                  setEquipmentForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-steel">
              Модификация
              <input
                className="form-input"
                type="text"
                value={equipmentForm.modification}
                onChange={(event) =>
                  setEquipmentForm((current) => ({ ...current, modification: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-steel">
              Серийный номер
              <input
                className="form-input"
                type="text"
                value={equipmentForm.serialNumber}
                onChange={(event) =>
                  setEquipmentForm((current) => ({ ...current, serialNumber: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-steel">
              Статус
              <select
                className="form-input"
                value={equipmentForm.status}
                onChange={(event) =>
                  setEquipmentForm((current) => ({
                    ...current,
                    status: event.target.value as EquipmentStatus,
                  }))
                }
              >
                {equipmentStatusOptions.map((status) => (
                  <option key={status} value={status}>
                    {equipmentStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-steel">
              Год выпуска
              <input
                className="form-input"
                type="number"
                value={equipmentForm.manufactureYear}
                onChange={(event) =>
                  setEquipmentForm((current) => ({
                    ...current,
                    manufactureYear: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label className="block text-sm text-steel">
            Текущее местоположение
            <input
              className="form-input"
              type="text"
              value={equipmentForm.currentLocationManual}
              onChange={(event) =>
                setEquipmentForm((current) => ({
                  ...current,
                  currentLocationManual: event.target.value,
                }))
              }
            />
          </label>
          {(createEquipmentMutation.isError || updateEquipmentMutation.isError) ? (
            <p className="text-sm text-[#b04c43]">
              {getMutationErrorMessage(createEquipmentMutation.error ?? updateEquipmentMutation.error, "Не удалось сохранить прибор.")}
            </p>
          ) : null}
          <div className="flex justify-end">
            <button
              className="btn-primary disabled:opacity-60"
              disabled={createEquipmentMutation.isPending || updateEquipmentMutation.isPending || !selectedFolder}
              type="submit"
            >
              {createEquipmentMutation.isPending || updateEquipmentMutation.isPending
                ? "Сохраняем..."
                : activeModal?.kind === "equipment" && activeModal.mode === "edit"
                  ? "Сохранить прибор"
                  : "Создать прибор"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        description={deleteTarget?.message}
        open={deleteTarget !== null}
        title={deleteTarget?.title ?? "Подтверждение удаления"}
        onClose={() => setDeleteTarget(null)}
      >
        <div className="space-y-4">
          {(deleteFolderMutation.isError || deleteEquipmentMutation.isError) ? (
            <p className="text-sm text-[#b04c43]">
              {getMutationErrorMessage(
                deleteFolderMutation.error ?? deleteEquipmentMutation.error,
                "Не удалось выполнить удаление.",
              )}
            </p>
          ) : null}
          <div className="flex justify-end gap-3">
            <button className={subtleButtonClass} type="button" onClick={() => setDeleteTarget(null)}>
              Отмена
            </button>
            <button
              className="btn-primary disabled:opacity-60"
              disabled={
                deleteFolderMutation.isPending ||
                deleteEquipmentMutation.isPending
              }
              type="button"
              onClick={() => void handleConfirmDelete()}
            >
              {deleteFolderMutation.isPending || deleteEquipmentMutation.isPending
                ? "Удаляем..."
                : "Подтвердить удаление"}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

function EquipmentRow({
  item,
  groupName,
  canManage,
  onEdit,
  onDelete,
}: {
  item: EquipmentItem;
  groupName: string;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <tr className="rounded-2xl border border-line bg-white/85 text-sm text-ink shadow-panel">
      <td className="rounded-l-2xl px-3 py-3 align-top">
        <Link className="font-semibold text-ink transition hover:text-signal-info" to={`/equipment/${item.id}`}>
          {item.name}
        </Link>
        <div className="mt-1 text-xs text-steel">{item.modification || "Без модификации"}</div>
      </td>
      <td className="px-3 py-3 align-top">
        <span className="rounded-full bg-[#edf2f5] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
          {equipmentTypeLabels[item.equipmentType]}
        </span>
      </td>
      <td className="px-3 py-3 align-top">{equipmentStatusLabels[item.status]}</td>
      <td className="px-3 py-3 align-top">{groupName}</td>
      <td className="px-3 py-3 align-top">{item.serialNumber || "—"}</td>
      <td className="px-3 py-3 align-top">{item.objectName}</td>
      <td className="px-3 py-3 align-top">{item.currentLocationManual || "Не указано"}</td>
      {canManage ? (
        <td className="rounded-r-2xl px-3 py-3 align-top">
          <div className="flex flex-wrap gap-2">
            <button
              aria-label={`Редактировать прибор ${item.name}`}
              className="icon-action-button"
              title="Редактировать прибор"
              type="button"
              onClick={onEdit}
            >
              <span className="nf-icon text-base leading-none">󰏫</span>
            </button>
            <button
              aria-label={`Удалить прибор ${item.name}`}
              className="icon-action-button"
              title="Удалить прибор"
              type="button"
              onClick={onDelete}
            >
              <span className="nf-icon text-base leading-none">󰅖</span>
            </button>
          </div>
        </td>
      ) : null}
    </tr>
  );
}

function mapEquipmentFormToPayload(
  form: EquipmentFormState,
  folderId: number,
): UpdateEquipmentPayload {
  return {
    folderId,
    groupId: form.groupId ? Number(form.groupId) : null,
    objectName: form.objectName,
    equipmentType: form.equipmentType,
    name: form.name,
    modification: form.modification,
    serialNumber: form.serialNumber,
    manufactureYear: form.manufactureYear ? Number(form.manufactureYear) : null,
    status: form.status,
    currentLocationManual: form.currentLocationManual,
  };
}

function getMutationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
