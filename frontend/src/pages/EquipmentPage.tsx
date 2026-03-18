import { type FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

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

type FolderColor =
  | "white" | "gray-100" | "gray-200" | "gray-300" | "gray-800" | "gray-900"
  | "red" | "orange" | "amber" | "yellow" | "lime"
  | "green" | "emerald" | "teal" | "cyan" | "blue" | "indigo" | "violet";

const folderColors: Record<FolderColor, string> = {
  // Neutral colors
  "white": "var(--folder-white)",
  "gray-100": "var(--folder-gray-100)",
  "gray-200": "var(--folder-gray-200)",
  "gray-300": "var(--folder-gray-300)",
  "gray-800": "var(--folder-gray-800)",
  "gray-900": "var(--folder-gray-900)",
  // Warm colors
  "red": "var(--folder-red)",
  "orange": "var(--folder-orange)",
  "amber": "var(--folder-amber)",
  "yellow": "var(--folder-yellow)",
  "lime": "var(--folder-lime)",
  // Cool colors
  "green": "var(--folder-green)",
  "emerald": "var(--folder-emerald)",
  "teal": "var(--folder-teal)",
  "cyan": "var(--folder-cyan)",
  "blue": "var(--folder-blue)",
  "indigo": "var(--folder-indigo)",
  "violet": "var(--folder-violet)",
};

// Dark folder colors that need white text (on all themes)
const darkFolderColors: FolderColor[] = ["gray-800", "gray-900"];

function getFolderTextColor(color: FolderColor | null): string {
  if (color && darkFolderColors.includes(color)) {
    return "text-white";
  }
  return "text-[#1a1a1a]";
}

function getFolderDescriptionColor(color: FolderColor | null): string {
  if (color && darkFolderColors.includes(color)) {
    return "text-gray-300";
  }
  return "text-[#4a4a4a]";
}

type FolderFormState = {
  name: string;
  description: string;
  sortOrder: number;
  color: FolderColor;
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
  | { kind: "equipment"; mode: "create" | "edit"; equipmentId?: number }
  | { kind: "folderColor"; folderId: number };

const defaultFolderForm: FolderFormState = {
  name: "",
  description: "",
  sortOrder: 0,
  color: "gray-100",
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
  const [searchParams] = useSearchParams();
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(() => {
    const folderIdFromUrl = searchParams.get("folderId");
    return folderIdFromUrl ? Number(folderIdFromUrl) : null;
  });
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

  const equipmentQuery = useQuery({
    queryKey: [
      "equipment-items",
      selectedFolderId ?? "none",
      deferredSearchQuery,
      statusFilter,
      typeFilter,
    ],
    queryFn: () =>
      fetchEquipment(token ?? "", {
        folderId: selectedFolderId,
        groupId: null,
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
        color: folderForm.color,
      }),
    onSuccess: async (folder) => {
      closeFolderModal();
      setSelectedFolderId(folder.id);
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
        color: folderForm.color,
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
      }
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["equipment-folders"] });
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
  const equipmentItems = equipmentQuery.data ?? [];

  useEffect(() => {
    if (selectedFolderId === null) {
      return;
    }

    if (!folders.some((folder) => folder.id === selectedFolderId)) {
      setSelectedFolderId(null);
    }
  }, [folders, selectedFolderId]);

  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId],
  );

  if (!token) {
    return null;
  }

  function closeFolderModal() {
    setFolderForm(defaultFolderForm);
    setActiveModal(null);
  }

  function closeEquipmentModal() {
    setEquipmentForm(defaultEquipmentForm);
    setActiveModal(null);
  }

  function leaveFolderWorkspace() {
    setSelectedFolderId(null);
    setSearchQuery("");
    setStatusFilter("ALL");
    setTypeFilter("ALL");
    searchParams.delete("folderId");
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
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
      color: (folder.color as FolderColor) || "gray-100",
    });
    setActiveModal({ kind: "folder", mode: "edit", folderId: folder.id });
  }

  function openCreateEquipmentModal() {
    setEquipmentForm(defaultEquipmentForm);
    setActiveModal({ kind: "equipment", mode: "create" });
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
        description="Общий реестр оборудования: сначала папка, затем рабочая таблица приборов."
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
              <div className="flex items-center gap-3">
                <button
                  aria-label="Редактировать папку"
                  className="icon-action-button"
                  title="Редактировать папку"
                  type="button"
                  onClick={() => openEditFolderModal(selectedFolder)}
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                  </svg>
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
                        "Удалить эту папку? Все приборы внутри нее тоже будут удалены.",
                    })
                  }
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                </button>
                <button className={subtleButtonClass} type="button" onClick={openCreateEquipmentModal}>
                  Новый прибор
                </button>
              </div>
            ) : null}
          </div>

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
              <div className="rounded-3xl border border-dashed border-line bg-[var(--bg-secondary)] px-5 py-10 text-center">
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
                      <th className="px-3 py-2">Серийный</th>
                      <th className="px-3 py-2">Год выпуска</th>
                      <th className="px-3 py-2">Объект</th>
                      <th className="px-3 py-2">Локация</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipmentItems.map((item) => (
                      <EquipmentRow
                        key={item.id}
                        item={item}
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
                Сначала выбирается рабочая папка, а уже внутри открывается таблица приборов.
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
            <div className="rounded-3xl border border-dashed border-line bg-[var(--bg-secondary)] px-5 py-10 text-center">
              <p className="text-base font-semibold text-ink">Папок пока нет.</p>
              <p className="mt-2 text-sm text-steel">
                Создай первую папку, чтобы собрать внутри общий список приборов.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {folders.map((folder) => (
              <div
                key={folder.id}
                className="relative rounded-[26px] border border-line p-5 transition hover:border-signal-info"
                style={{ backgroundColor: folderColors[(folder.color as FolderColor) || "slate"] }}
              >
                {canManage ? (
                  <div className="absolute right-4 top-4 flex gap-2">
                    <button
                      aria-label={`Выбрать цвет папки ${folder.name}`}
                      className="icon-action-button"
                      title="Выбрать цвет папки"
                      type="button"
                      onClick={() => setActiveModal({ kind: "folderColor", folderId: folder.id })}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.629c5.056-3.278 5.056-8.622 5.056-8.622s-5.366 0-8.622 5.056a15.99 15.99 0 0 0-1.629 3.388Z" />
                      </svg>
                    </button>
                    <button
                      aria-label={`Редактировать папку ${folder.name}`}
                      className="icon-action-button"
                      title="Редактировать папку"
                      type="button"
                      onClick={() => openEditFolderModal(folder)}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                      </svg>
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
                            "Удалить эту папку? Все приборы внутри нее тоже будут удалены.",
                        })
                      }
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    </button>
                  </div>
                ) : null}
                <button className="block w-full text-left" type="button" onClick={() => setSelectedFolderId(folder.id)}>
                  <div className={`text-lg font-semibold ${getFolderTextColor(folder.color as FolderColor)}`}>{folder.name}</div>
                  <p className={`mt-2 text-sm ${getFolderDescriptionColor(folder.color as FolderColor)}`}>
                    {folder.description || "Открой папку, чтобы работать с приборами."}
                  </p>
                </button>
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
          <label className="block text-sm text-steel">
            Цвет папки
            <div className="mt-2 grid grid-cols-6 gap-2">
              {(Object.keys(folderColors) as FolderColor[]).map((color) => (
                <button
                  key={color}
                  aria-label={`Выбрать цвет ${color}`}
                  className={[
                    "h-8 w-full rounded border transition hover:scale-105",
                    folderForm.color === color ? "border-ink ring-2 ring-signal-info" : "border-line",
                  ].join(" ")}
                  style={{ backgroundColor: folderColors[color] }}
                  type="button"
                  onClick={() => setFolderForm((current) => ({ ...current, color }))}
                />
              ))}
            </div>
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

      {activeModal?.kind === "folderColor" ? (
        <Modal
          description="Выбери цвет для папки."
          open={true}
          title="Цвет папки"
          onClose={() => setActiveModal(null)}
        >
          <div className="grid grid-cols-6 gap-2">
            {(Object.keys(folderColors) as FolderColor[]).map((color) => (
              <button
                key={color}
                aria-label={`Выбрать цвет ${color}`}
                className="h-8 w-full rounded border border-line transition hover:scale-105"
                style={{ backgroundColor: folderColors[color] }}
                type="button"
                onClick={async () => {
                  const response = await fetch(`/api/v1/equipment/folders/${activeModal.folderId}`, {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ color }),
                  });
                  if (response.ok) {
                    await queryClient.invalidateQueries({ queryKey: ["equipment-folders"] });
                  }
                  setActiveModal(null);
                }}
              />
            ))}
          </div>
        </Modal>
      ) : null}

      <Modal
        description={
          activeModal?.kind === "equipment" && activeModal.mode === "edit"
            ? "Измени базовые данные прибора прямо из реестра."
            : selectedFolder
              ? `Прибор будет добавлен в папку «${selectedFolder.name}».`
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
}: {
  item: EquipmentItem;
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
      <td className="px-3 py-3 align-top">{item.serialNumber || "—"}</td>
      <td className="px-3 py-3 align-top">{item.manufactureYear || "—"}</td>
      <td className="px-3 py-3 align-top">{item.objectName}</td>
      <td className="px-3 py-3 align-top rounded-r-2xl">{item.currentLocationManual || "Не указано"}</td>
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
