import { type FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchArshinVriDetail,
  searchArshinByCertificate,
  type ArshinSearchResult,
  type ArshinVriDetail,
} from "@/api/arshin";
import {
  buildSIVerificationPayloadFromArshin,
  createEquipment,
  createEquipmentFolder,
  createEquipmentRepair,
  createEquipmentVerification,
  createRepairBatch,
  createVerificationBatch,
  deleteEquipmentBatch,
  deleteEquipment,
  deleteEquipmentFolder,
  exportEquipmentRegistryXlsx,
  equipmentStatusLabels,
  equipmentTypeLabels,
  fetchEquipment,
  fetchEquipmentFolderSuggestions,
  getEquipmentStatusLabel,
  fetchEquipmentFolders,
  importSIEquipmentExcel,
  updateEquipment,
  updateEquipmentFolder,
  type EquipmentFolder,
  type EquipmentItem,
  type EquipmentSIBulkImportResult,
  type EquipmentStatus,
  type EquipmentType,
  type UpdateEquipmentPayload,
} from "@/api/equipment";
import { DateInput } from "@/components/DateInput";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/store/auth";

const equipmentTypeOptions: EquipmentType[] = ["SI", "IO", "VO", "OTHER"];
const equipmentStatusOptions: EquipmentStatus[] = ["IN_WORK", "IN_VERIFICATION", "IN_REPAIR", "ARCHIVED"];
const subtleButtonClass = "btn-secondary";
const batchDangerButtonClass = "btn-danger";
const batchRepairButtonClass = "btn-secondary";
const batchVerificationButtonClass = "btn-accent";

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

type SISearchFormState = {
  certificateNumber: string;
};

type VerificationBatchFormState = {
  batchName: string;
  routeCity: string;
  routeDestination: string;
  sentToVerificationAt: string;
  initialMessageText: string;
};

type RepairBatchFormState = {
  routeCity: string;
  routeDestination: string;
  sentToRepairAt: string;
  initialMessageText: string;
};

type DeleteTarget =
  | { kind: "folder"; id: number; title: string; message: string }
  | { kind: "equipment"; id: number; title: string; message: string }
  | { kind: "equipment-batch"; ids: number[]; title: string; message: string };

type ActiveModal =
  | null
  | { kind: "folder"; mode: "create" | "edit"; folderId?: number }
  | { kind: "equipment"; mode: "create" | "edit"; equipmentId?: number }
  | { kind: "si-import" }
  | { kind: "repair-batch" }
  | { kind: "verification-batch" };

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
  status: "IN_WORK",
  currentLocationManual: "",
};

const defaultSISearchForm: SISearchFormState = {
  certificateNumber: "",
};

type SIImportFormState = {
  objectName: string;
  status: EquipmentStatus;
  currentLocationManual: string;
  file: File | null;
};

const defaultSIImportForm: SIImportFormState = {
  objectName: "",
  status: "IN_WORK",
  currentLocationManual: "",
  file: null,
};

const defaultVerificationBatchForm: VerificationBatchFormState = {
  batchName: "",
  routeCity: "",
  routeDestination: "",
  sentToVerificationAt: getTodayDateInputValue(),
  initialMessageText: "",
};

const defaultRepairBatchForm: RepairBatchFormState = {
  routeCity: "",
  routeDestination: "",
  sentToRepairAt: getTodayDateInputValue(),
  initialMessageText: "",
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
  const [folderSearchQuery, setFolderSearchQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<EquipmentType | "ALL">("ALL");
  const [folderForm, setFolderForm] = useState<FolderFormState>(defaultFolderForm);
  const [equipmentForm, setEquipmentForm] = useState<EquipmentFormState>(defaultEquipmentForm);
  const [siSearchForm, setSiSearchForm] = useState<SISearchFormState>(defaultSISearchForm);
  const [siSearchResults, setSiSearchResults] = useState<ArshinSearchResult[]>([]);
  const [selectedSiResult, setSelectedSiResult] = useState<ArshinSearchResult | null>(null);
  const [selectedSiDetail, setSelectedSiDetail] = useState<ArshinVriDetail | null>(null);
  const [siImportForm, setSiImportForm] = useState<SIImportFormState>(defaultSIImportForm);
  const [verificationBatchForm, setVerificationBatchForm] = useState<VerificationBatchFormState>(
    defaultVerificationBatchForm,
  );
  const [repairBatchForm, setRepairBatchForm] = useState<RepairBatchFormState>(
    defaultRepairBatchForm,
  );
  const [siImportResult, setSiImportResult] = useState<EquipmentSIBulkImportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<number[]>([]);
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

  const folderSuggestionsQuery = useQuery({
    queryKey: ["equipment-folder-suggestions", selectedFolderId ?? "none"],
    queryFn: () => fetchEquipmentFolderSuggestions(token ?? "", selectedFolderId ?? 0),
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
      }
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["equipment-folders"] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
    },
  });

  const siSearchMutation = useMutation({
    mutationFn: ({ certificateNumber }: { certificateNumber: string }) =>
      searchArshinByCertificate(token ?? "", {
        certificateNumber,
      }),
    onSuccess: (results) => {
      setSiSearchResults(results);
      setSelectedSiResult(null);
      setSelectedSiDetail(null);
    },
  });

  const siDetailMutation = useMutation({
    mutationFn: (vriId: string) => fetchArshinVriDetail(token ?? "", vriId),
    onSuccess: (detail) => {
      setSelectedSiDetail(detail);
      setEquipmentForm((current) => ({
        ...current,
        equipmentType: "SI",
        name: detail.typeName ?? current.name,
        modification: detail.modification ?? "",
        serialNumber: detail.serialNumber ?? "",
        manufactureYear: detail.manufactureYear ? String(detail.manufactureYear) : "",
      }));
    },
  });

  const createEquipmentMutation = useMutation({
    mutationFn: () =>
      createEquipment(
        token ?? "",
        mapEquipmentFormToPayload(
          equipmentForm,
          selectedFolderId ?? 0,
          selectedSiResult,
          selectedSiDetail,
        ),
      ),
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
        mapEquipmentFormToPayload(equipmentForm, selectedFolderId, null, null),
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

  const deleteEquipmentBatchMutation = useMutation({
    mutationFn: (equipmentIds: number[]) => deleteEquipmentBatch(token ?? "", equipmentIds),
    onSuccess: async () => {
      setDeleteTarget(null);
      setSelectedEquipmentIds([]);
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
    },
  });

  const importSIExcelMutation = useMutation({
    mutationFn: () => {
      if (!selectedFolderId) {
        throw new Error("Сначала выбери папку для импорта.");
      }
      if (!siImportForm.file) {
        throw new Error("Выбери Excel-файл для импорта.");
      }
      return importSIEquipmentExcel(token ?? "", {
        folderId: selectedFolderId,
        objectName: siImportForm.objectName,
        status: siImportForm.status,
        currentLocationManual: siImportForm.currentLocationManual,
        file: siImportForm.file,
      });
    },
    onSuccess: async (result) => {
      setSiImportResult(result);
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
    },
  });

  const exportEquipmentMutation = useMutation({
    mutationFn: () =>
      exportEquipmentRegistryXlsx(token ?? "", {
        folderId: selectedFolderId,
        query: deferredSearchQuery,
        status: statusFilter === "ALL" ? null : statusFilter,
        equipmentType: typeFilter === "ALL" ? null : typeFilter,
      }),
  });

  const createVerificationBatchMutation = useMutation<unknown, Error, void>({
    mutationFn: () => {
      if (selectedEquipmentIds.length === 1) {
        return createEquipmentVerification(token ?? "", selectedEquipmentIds[0], {
          routeCity: verificationBatchForm.routeCity,
          routeDestination: verificationBatchForm.routeDestination,
          sentToVerificationAt: verificationBatchForm.sentToVerificationAt,
          initialMessageText: verificationBatchForm.initialMessageText,
          files: [],
        });
      }

      return createVerificationBatch(token ?? "", {
        equipmentIds: selectedEquipmentIds,
        batchName: verificationBatchForm.batchName,
        routeCity: verificationBatchForm.routeCity,
        routeDestination: verificationBatchForm.routeDestination,
        sentToVerificationAt: verificationBatchForm.sentToVerificationAt,
        initialMessageText: verificationBatchForm.initialMessageText,
      });
    },
    onSuccess: async () => {
      setSelectedEquipmentIds([]);
      setVerificationBatchForm(defaultVerificationBatchForm);
      setActiveModal(null);
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
      await queryClient.invalidateQueries({ queryKey: ["verification-queue"] });
    },
  });

  const createRepairBatchMutation = useMutation<unknown, Error, void>({
    mutationFn: () => {
      if (selectedEquipmentIds.length === 1) {
        return createEquipmentRepair(token ?? "", selectedEquipmentIds[0], {
          routeCity: repairBatchForm.routeCity,
          routeDestination: repairBatchForm.routeDestination,
          sentToRepairAt: repairBatchForm.sentToRepairAt,
          initialMessageText: repairBatchForm.initialMessageText,
          files: [],
        });
      }

      return createRepairBatch(token ?? "", {
        equipmentIds: selectedEquipmentIds,
        routeCity: repairBatchForm.routeCity,
        routeDestination: repairBatchForm.routeDestination,
        sentToRepairAt: repairBatchForm.sentToRepairAt,
        initialMessageText: repairBatchForm.initialMessageText,
      });
    },
    onSuccess: async () => {
      setSelectedEquipmentIds([]);
      setRepairBatchForm(defaultRepairBatchForm);
      setActiveModal(null);
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
      await queryClient.invalidateQueries({ queryKey: ["repair-queue"] });
    },
  });

  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const equipmentItems = useMemo(() => equipmentQuery.data ?? [], [equipmentQuery.data]);
  const selectedEquipmentItems = useMemo(
    () => equipmentItems.filter((item) => selectedEquipmentIds.includes(item.id)),
    [equipmentItems, selectedEquipmentIds],
  );
  const visibleSelectedEquipmentIds = useMemo(
    () => equipmentItems.filter((item) => selectedEquipmentIds.includes(item.id)).map((item) => item.id),
    [equipmentItems, selectedEquipmentIds],
  );
  const areAllVisibleEquipmentSelected =
    equipmentItems.length > 0 && visibleSelectedEquipmentIds.length === equipmentItems.length;
  const areAllSelectedItemsSi =
    selectedEquipmentItems.length > 0
    && selectedEquipmentItems.every((item) => item.equipmentType === "SI");
  const hasSelectedItemsWithActiveRepair = selectedEquipmentItems.some(
    (item) => item.activeRepair !== null,
  );
  const hasSelectedItemsWithActiveVerification = selectedEquipmentItems.some(
    (item) => item.activeVerification !== null,
  );
  const deferredFolderSearchQuery = useDeferredValue(folderSearchQuery);

  const existingObjectNames = useMemo(() => {
    const names = new Set<string>();
    folderSuggestionsQuery.data?.objectNames.forEach((value) => names.add(value));
    equipmentItems.forEach((item) => {
      if (item.objectName) names.add(item.objectName);
    });
    return Array.from(names).sort();
  }, [equipmentItems, folderSuggestionsQuery.data?.objectNames]);

  const existingLocations = useMemo(() => {
    const locations = new Set<string>();
    folderSuggestionsQuery.data?.currentLocations.forEach((value) => locations.add(value));
    equipmentItems.forEach((item) => {
      if (item.currentLocationManual) locations.add(item.currentLocationManual);
    });
    return Array.from(locations).sort();
  }, [equipmentItems, folderSuggestionsQuery.data?.currentLocations]);

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
  const filteredFolders = useMemo(() => {
    const query = deferredFolderSearchQuery.trim().toLowerCase();
    if (!query) {
      return folders;
    }
    return folders.filter((folder) =>
      [folder.name, folder.description ?? ""].some((value) => value.toLowerCase().includes(query)),
    );
  }, [deferredFolderSearchQuery, folders]);
  const isSiCreateFlow =
    activeModal?.kind === "equipment" &&
    activeModal.mode === "create" &&
    equipmentForm.equipmentType === "SI";

  if (!token) {
    return null;
  }

  function closeFolderModal() {
    setFolderForm(defaultFolderForm);
    setActiveModal(null);
  }

  function resetSiSearchState() {
    setSiSearchForm(defaultSISearchForm);
    setSiSearchResults([]);
    setSelectedSiResult(null);
    setSelectedSiDetail(null);
    siSearchMutation.reset();
    siDetailMutation.reset();
  }

  function closeEquipmentModal() {
    setEquipmentForm(defaultEquipmentForm);
    resetSiSearchState();
    setActiveModal(null);
  }

  function closeSIImportModal() {
    setSiImportForm(defaultSIImportForm);
    setSiImportResult(null);
    importSIExcelMutation.reset();
    setActiveModal(null);
  }

  function closeVerificationBatchModal() {
    setVerificationBatchForm(defaultVerificationBatchForm);
    createVerificationBatchMutation.reset();
    setActiveModal(null);
  }

  function closeRepairBatchModal() {
    setRepairBatchForm(defaultRepairBatchForm);
    createRepairBatchMutation.reset();
    setActiveModal(null);
  }

  function leaveFolderWorkspace() {
    setSelectedFolderId(null);
    setSelectedEquipmentIds([]);
    setSearchQuery("");
    setStatusFilter("ALL");
    setTypeFilter("ALL");
    setExportError(null);
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
    });
    setActiveModal({ kind: "folder", mode: "edit", folderId: folder.id });
  }

  function openCreateEquipmentModal() {
    setEquipmentForm(defaultEquipmentForm);
    resetSiSearchState();
    setActiveModal({ kind: "equipment", mode: "create" });
  }

  function openSIImportModal() {
    setSiImportForm({
      objectName: selectedFolder?.name ?? "",
      status: "IN_WORK",
      currentLocationManual: "",
      file: null,
    });
    setSiImportResult(null);
    importSIExcelMutation.reset();
    setActiveModal({ kind: "si-import" });
  }

  function openVerificationBatchModal() {
    if (selectedEquipmentIds.length === 0 || hasSelectedItemsWithActiveVerification) {
      return;
    }
    setVerificationBatchForm({
      ...defaultVerificationBatchForm,
      batchName: selectedFolder ? `${selectedFolder.name} / поверка` : "",
    });
    createVerificationBatchMutation.reset();
    setActiveModal({ kind: "verification-batch" });
  }

  function openRepairBatchModal() {
    if (selectedEquipmentIds.length === 0 || hasSelectedItemsWithActiveRepair) {
      return;
    }
    setRepairBatchForm(defaultRepairBatchForm);
    createRepairBatchMutation.reset();
    setActiveModal({ kind: "repair-batch" });
  }

  function handleEquipmentTypeChange(nextType: EquipmentType) {
    setEquipmentForm((current) => ({
      ...current,
      equipmentType: nextType,
    }));

    if (nextType !== "SI") {
      resetSiSearchState();
    }
  }

  function handleSelectSiResult(result: ArshinSearchResult) {
    setSelectedSiResult(result);
    setSelectedSiDetail(null);
    setEquipmentForm((current) => ({
      ...current,
      equipmentType: "SI",
      name: result.mitTitle ?? current.name,
      modification: result.miModification ?? "",
      serialNumber: result.miNumber ?? "",
    }));
    void siDetailMutation.mutateAsync(result.vriId);
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
    if (equipmentForm.equipmentType === "SI" && (!selectedSiResult || !selectedSiDetail)) {
      return;
    }
    if (activeModal.mode === "create") {
      await createEquipmentMutation.mutateAsync();
      return;
    }
    await updateEquipmentMutation.mutateAsync();
  }

  async function handleSIImportSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await importSIExcelMutation.mutateAsync();
  }

  async function handleVerificationBatchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createVerificationBatchMutation.mutateAsync();
  }

  async function handleRepairBatchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createRepairBatchMutation.mutateAsync();
  }

  async function handleExportEquipment() {
    setExportError(null);
    try {
      const { blob, fileName } = await exportEquipmentMutation.mutateAsync();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Не удалось выгрузить Excel-файл.",
      );
    }
  }

  function triggerSiSearch() {
    void siSearchMutation.mutateAsync({
      certificateNumber: siSearchForm.certificateNumber,
    });
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) {
      return;
    }

    if (deleteTarget.kind === "folder") {
      await deleteFolderMutation.mutateAsync(deleteTarget.id);
      return;
    }
    if (deleteTarget.kind === "equipment-batch") {
      await deleteEquipmentBatchMutation.mutateAsync(deleteTarget.ids);
      return;
    }
    await deleteEquipmentMutation.mutateAsync(deleteTarget.id);
  }

  function toggleEquipmentSelection(equipmentId: number) {
    setSelectedEquipmentIds((current) =>
      current.includes(equipmentId)
        ? current.filter((value) => value !== equipmentId)
        : [...current, equipmentId],
    );
  }

  function toggleSelectAllEquipment() {
    setSelectedEquipmentIds((current) =>
      areAllVisibleEquipmentSelected
        ? current.filter((id) => !equipmentItems.some((item) => item.id === id))
        : Array.from(new Set([...current, ...equipmentItems.map((item) => item.id)])),
    );
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title={selectedFolder ? selectedFolder.name : "Оборудование"}
        description={selectedFolder ? "" : "Общий реестр оборудования"}
      />

      {!selectedFolder ? (
        <section className="folder-browser-panel space-y-4 rounded-[24px] p-4 shadow-panel">
          <div className="flex flex-col gap-4 border-b border-line pb-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-ink">Папки оборудования</h2>
              <p className="mt-1 text-sm text-steel">
                Выбери рабочую папку и открой оборудование этой области.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block min-w-[260px] text-sm text-steel">
                Поиск по папкам
                <input
                  className="form-input"
                  placeholder="Название или описание папки"
                  type="search"
                  value={folderSearchQuery}
                  onChange={(event) => setFolderSearchQuery(event.target.value)}
                />
              </label>
              {canManage ? (
                <button className={subtleButtonClass} type="button" onClick={openCreateFolderModal}>
                  <span className="sr-only">Новая папка</span>
                  <Icon className="h-4 w-4" name="plus" />
                </button>
              ) : null}
            </div>
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
            <div className="tone-parent rounded-3xl border border-dashed border-line px-5 py-10 text-center">
              <p className="text-base font-semibold text-ink">Папок пока нет.</p>
              <p className="mt-2 text-sm text-steel">
                Создай первую папку, чтобы собрать внутри общий список приборов.
              </p>
            </div>
          ) : null}

          {!foldersQuery.isLoading && folders.length > 0 && filteredFolders.length === 0 ? (
            <div className="tone-parent rounded-3xl border border-dashed border-line px-5 py-10 text-center">
              <p className="text-base font-semibold text-ink">По этому запросу папки не найдены.</p>
              <p className="mt-2 text-sm text-steel">
                Измени строку поиска или очисти фильтр, чтобы увидеть весь список.
              </p>
            </div>
          ) : null}

          {filteredFolders.length > 0 ? (
            <div className="folder-list">
              {filteredFolders.map((folder) => (
                <button
                  key={folder.id}
                  className="folder-list__item"
                  type="button"
                  onClick={() => setSelectedFolderId(folder.id)}
                >
                  <div className="folder-list__content">
                    <div className="folder-list__title">{folder.name}</div>
                    <p className="folder-list__description">
                      {folder.description || "Рабочая папка без дополнительного описания."}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="folder-list__actions">
                      <IconActionButton
                        icon={
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                          </svg>
                        }
                        label={`Редактировать папку ${folder.name}`}
                        size="tiny"
                        onClick={(event) => {
                          event.stopPropagation();
                          openEditFolderModal(folder);
                        }}
                      />
                      <IconActionButton
                        icon={
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        }
                        label={`Удалить папку ${folder.name}`}
                        size="tiny"
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget({
                            kind: "folder",
                            id: folder.id,
                            title: "Удалить папку",
                            message: "Удалить эту папку? Все приборы внутри нее тоже будут удалены.",
                          });
                        }}
                      />
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedFolder ? (
        <section className="space-y-4 rounded-[30px] border border-line bg-white p-5 shadow-panel">
          <div className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <button className={subtleButtonClass} type="button" onClick={leaveFolderWorkspace}>
                Все папки
              </button>
              <span className="rounded-full border border-line px-3 py-1 text-sm text-steel">
                {selectedFolder.name}
              </span>
            </div>

            {canManage ? (
              <div className="flex flex-wrap gap-3">
                <IconActionButton
                  className="h-10 w-10"
                  icon={
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                    </svg>
                  }
                  label="Редактировать папку"
                  onClick={() => openEditFolderModal(selectedFolder)}
                />
                <IconActionButton
                  className="h-10 w-10"
                  icon={
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  }
                  label="Удалить папку"
                  onClick={() =>
                    setDeleteTarget({
                      kind: "folder",
                      id: selectedFolder.id,
                      title: "Удалить папку",
                      message: "Удалить эту папку? Все приборы внутри нее тоже будут удалены.",
                    })
                  }
                />
                <IconActionButton
                  className="h-10 w-10"
                  icon={
                    exportEquipmentMutation.isPending ? (
                      <span className="text-sm leading-none">…</span>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4m-5 7.5h18" />
                      </svg>
                    )
                  }
                  label="Экспортировать текущий список в Excel"
                  onClick={() => void handleExportEquipment()}
                />
                <IconActionButton
                  className="h-10 w-10"
                  icon={
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 7.5v12m0-12 4 4m-4-4-4 4M4.5 18.75h15" />
                    </svg>
                  }
                  label="Импорт СИ из Excel"
                  onClick={openSIImportModal}
                />
                <IconActionButton
                  className="h-10 w-10"
                  icon={
                    <Icon className="h-4 w-4" name="plus" />
                  }
                  label="Добавить прибор"
                  onClick={openCreateEquipmentModal}
                />
              </div>
            ) : null}
          </div>

          <section className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
                <label className="block text-sm text-steel">
                  Поиск
                  <input
                    className="form-input"
                    placeholder="Наименование, объект, серийный номер, местонахождение"
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

            {equipmentQuery.isLoading ? <p className="text-sm text-steel">Загружаем оборудование...</p> : null}
            {equipmentQuery.isError ? (
              <p className="text-sm text-[#b04c43]">
                {equipmentQuery.error instanceof Error
                  ? equipmentQuery.error.message
                  : "Не удалось загрузить оборудование."}
              </p>
            ) : null}
            {exportError ? (
              <p className="text-sm text-[#b04c43]">{exportError}</p>
            ) : null}

            {canManage && equipmentItems.length ? (
              <div className="tone-parent flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <button className={subtleButtonClass} type="button" onClick={toggleSelectAllEquipment}>
                    {areAllVisibleEquipmentSelected ? "Снять все" : "Выделить все"}
                  </button>
                  <span className="text-sm text-steel">
                    Выбрано: {selectedEquipmentIds.length}
                  </span>
                  {selectedEquipmentIds.length > 0 && hasSelectedItemsWithActiveRepair ? (
                    <span className="text-sm text-steel">
                      В наборе уже есть приборы с активным ремонтом.
                    </span>
                  ) : null}
                  {selectedEquipmentIds.length > 0 && hasSelectedItemsWithActiveVerification ? (
                    <span className="text-sm text-steel">
                      В наборе уже есть приборы с активной поверкой.
                    </span>
                  ) : null}
                  {selectedEquipmentIds.length > 0 && !areAllSelectedItemsSi ? (
                    <span className="text-sm text-steel">
                      В поверку можно отправить только набор, где все приборы относятся к СИ.
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={batchDangerButtonClass}
                    disabled={selectedEquipmentIds.length === 0}
                    type="button"
                    onClick={() =>
                      setDeleteTarget({
                        kind: "equipment-batch",
                        ids: selectedEquipmentIds,
                        title: "Удалить отмеченные приборы",
                        message: `Удалить отмеченные приборы (${selectedEquipmentIds.length})?`,
                      })
                    }
                  >
                    Удалить отмеченные
                  </button>
                  <button
                    className={batchRepairButtonClass}
                    disabled={selectedEquipmentIds.length === 0 || hasSelectedItemsWithActiveRepair}
                    type="button"
                    onClick={openRepairBatchModal}
                  >
                    Отправить в ремонт
                  </button>
                  <button
                    className={batchVerificationButtonClass}
                    disabled={
                      selectedEquipmentIds.length === 0
                      || !areAllSelectedItemsSi
                      || hasSelectedItemsWithActiveVerification
                    }
                    type="button"
                    onClick={openVerificationBatchModal}
                  >
                    Отправить в поверку
                  </button>
                </div>
              </div>
            ) : null}

            {!equipmentQuery.isLoading && !equipmentItems.length ? (
              <div className="tone-parent rounded-3xl border border-dashed border-line px-5 py-10 text-center">
                <p className="text-base font-semibold text-ink">Под текущие фильтры приборы не найдены.</p>
                <p className="mt-2 text-sm text-steel">
                  Измени фильтры или добавь первый прибор в выбранную папку.
                </p>
              </div>
            ) : null}

            {equipmentItems.length ? (
              <div className="tone-parent overflow-x-auto rounded-3xl border border-line shadow-panel">
                <table className="min-w-full">
                  <thead>
                    <tr className="tone-child text-left text-xs uppercase tracking-[0.16em] text-steel">
                      {canManage ? (
                        <th className="px-3 py-2">
                          <input
                            checked={areAllVisibleEquipmentSelected}
                            className="h-4 w-4 accent-[var(--accent)]"
                            onChange={toggleSelectAllEquipment}
                            type="checkbox"
                          />
                        </th>
                      ) : null}
                      <th className="px-3 py-2">Прибор</th>
                      <th className="px-3 py-2">Категория</th>
                      <th className="px-3 py-2">Статус</th>
                      <th className="px-3 py-2">Серийный</th>
                      <th className="px-3 py-2">Год выпуска</th>
                      <th className="px-3 py-2">Объект</th>
                      <th className="px-3 py-2">Местонахождение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {equipmentItems.map((item, index) => (
                      <EquipmentRow
                        key={item.id}
                        item={item}
                        canManage={canManage}
                        isSelected={selectedEquipmentIds.includes(item.id)}
                        onToggleSelected={() => toggleEquipmentSelection(item.id)}
                        rowIndex={index}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </section>
      ) : null}

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
              aria-label={
                activeModal?.kind === "folder" && activeModal.mode === "edit"
                  ? "Сохранить папку"
                  : "Создать папку"
              }
              className="btn-primary disabled:opacity-60"
              disabled={createFolderMutation.isPending || updateFolderMutation.isPending}
              type="submit"
            >
              {createFolderMutation.isPending || updateFolderMutation.isPending ? (
                "…"
              ) : activeModal?.kind === "folder" && activeModal.mode === "edit" ? (
                <Icon className="h-4 w-4" name="check" />
              ) : (
                <Icon className="h-4 w-4" name="plus" />
              )}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        description={
          selectedFolder
            ? `Импорт номеров свидетельств в папку «${selectedFolder.name}». Создаются только однозначно найденные записи Аршина.`
            : "Сначала выбери папку."
        }
        open={activeModal?.kind === "si-import"}
        title="Импорт СИ из Excel"
        onClose={closeSIImportModal}
      >
        <form className="space-y-4" onSubmit={(event) => void handleSIImportSubmit(event)}>
          <label className="block text-sm text-steel">
            Объект
            <input
              className="form-input"
              type="text"
              value={siImportForm.objectName}
              onChange={(event) =>
                setSiImportForm((current) => ({ ...current, objectName: event.target.value }))
              }
            />
          </label>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm text-steel">
              Статус
              <select
                className="form-input"
                value={siImportForm.status}
                onChange={(event) =>
                  setSiImportForm((current) => ({
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
              Текущее местоположение
              <input
                className="form-input"
                type="text"
                value={siImportForm.currentLocationManual}
                onChange={(event) =>
                  setSiImportForm((current) => ({
                    ...current,
                    currentLocationManual: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label className="block text-sm text-steel">
            Excel-файл
            <input
              className="form-input"
              accept=".xlsx,.xlsm,.csv"
              type="file"
              onChange={(event) =>
                setSiImportForm((current) => ({
                  ...current,
                  file: event.target.files?.[0] ?? null,
                }))
              }
            />
            <span className="mt-1 block text-xs text-steel">
              Используй колонку с номерами свидетельств. Если есть заголовок со словом «свидетельство», он будет найден автоматически.
            </span>
          </label>
          {importSIExcelMutation.isError ? (
            <p className="text-sm text-[#b04c43]">
              {getMutationErrorMessage(importSIExcelMutation.error, "Не удалось импортировать Excel-файл.")}
            </p>
          ) : null}
          <div className="flex justify-end">
            <button
              aria-label="Запустить импорт СИ"
              className="btn-primary disabled:opacity-60"
              disabled={
                importSIExcelMutation.isPending
                || !selectedFolder
                || !siImportForm.file
                || !siImportForm.objectName.trim()
              }
              type="submit"
            >
              {importSIExcelMutation.isPending ? "Импорт..." : "Импортировать"}
            </button>
          </div>

          {siImportResult ? (
            <section className="tone-parent space-y-3 rounded-3xl border border-line p-4">
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  ["Строк", String(siImportResult.totalRows)],
                  ["Создано", String(siImportResult.createdCount)],
                  ["Пропущено", String(siImportResult.skippedCount)],
                  ["Ошибок", String(siImportResult.errorCount)],
                ].map(([label, value]) => (
                  <div key={label} className="tone-child rounded-2xl border border-line px-4 py-3">
                    <div className="text-xs uppercase tracking-[0.16em] text-steel">{label}</div>
                    <div className="mt-1 text-lg font-semibold text-ink">{value}</div>
                  </div>
                ))}
              </div>
              <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {siImportResult.rows.map((row) => (
                  <div key={`${row.rowNumber}-${row.certificateNumber}`} className="tone-child rounded-2xl border border-line px-4 py-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-ink">
                          Строка {row.rowNumber} · {row.certificateNumber}
                        </div>
                        <div className="mt-1 text-steel">{row.message}</div>
                        {row.equipmentId ? (
                          <Link className="mt-2 inline-block text-xs font-semibold text-signal-info hover:underline" to={`/equipment/${row.equipmentId}`}>
                            {row.equipmentName ?? `Прибор #${row.equipmentId}`}
                          </Link>
                        ) : null}
                      </div>
                      <span
                        className={[
                          "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]",
                          row.status === "created"
                            ? "bg-[#e7f3eb] text-[#2f7a4f]"
                            : row.status === "skipped"
                              ? "bg-[#f3efe5] text-[#8c6a2b]"
                              : "bg-[#f8e8e6] text-[#b04c43]",
                        ].join(" ")}
                      >
                        {row.status === "created"
                          ? "Создано"
                          : row.status === "skipped"
                            ? "Пропуск"
                            : "Ошибка"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </form>
      </Modal>

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
          {isSiCreateFlow ? (
            <section className="tone-parent space-y-3 rounded-3xl border border-line p-4">
              <div>
                <h3 className="text-sm font-semibold text-ink">Поиск СИ в Аршине</h3>
                <p className="mt-1 text-xs text-steel">
                  Для `SI` создание идет через номер свидетельства. После выбора записи
                  система подтянет детальные сведения по `vri_id`.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <label className="block text-sm text-steel">
                  Номер свидетельства
                  <input
                    className="form-input"
                    placeholder="Например С-АСГ/07-03-2026/509468383"
                    type="text"
                    value={siSearchForm.certificateNumber}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        triggerSiSearch();
                      }
                    }}
                    onChange={(event) => {
                      setSiSearchForm((current) => ({
                        ...current,
                        certificateNumber: event.target.value,
                      }));
                      setSiSearchResults([]);
                      setSelectedSiResult(null);
                      setSelectedSiDetail(null);
                    }}
                  />
                </label>
                <div className="flex items-end">
                  <button
                    aria-label="Найти СИ в Аршине"
                    className="btn-primary disabled:opacity-60"
                    disabled={siSearchMutation.isPending}
                    type="button"
                    onClick={triggerSiSearch}
                  >
                    {siSearchMutation.isPending ? (
                      "…"
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="m21 21-4.35-4.35m1.85-5.15a7 7 0 11-14 0 7 7 0 0114 0Z"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {siSearchMutation.isError ? (
                <p className="text-sm text-[#b04c43]">
                  {getMutationErrorMessage(siSearchMutation.error, "Не удалось выполнить поиск по Аршину.")}
                </p>
              ) : null}

              {siSearchMutation.isSuccess && siSearchResults.length === 0 ? (
                <p className="text-sm text-steel">
                  По этому свидетельству записи не найдены.
                </p>
              ) : null}

              {siSearchResults.length > 0 ? (
                <div className="space-y-2">
                  {siSearchResults.map((result) => {
                    const isSelected = selectedSiResult?.vriId === result.vriId;
                    return (
                      <button
                        key={result.vriId}
                        className={[
                          "w-full rounded-2xl border px-4 py-3 text-left transition",
                          isSelected
                            ? "border-signal-info bg-[var(--accent-soft)]"
                            : "tone-child border-line hover:border-signal-info/60",
                        ].join(" ")}
                        type="button"
                        onClick={() => handleSelectSiResult(result)}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold text-ink">
                              {result.mitTitle ?? "СИ без наименования"}
                            </div>
                            <div className="mt-1 text-xs text-steel">
                              {[
                                result.mitNotation || "без обозначения",
                                result.miModification || "без модификации",
                                result.miNumber || "без заводского номера",
                                result.resultDocnum || "без свидетельства",
                              ].join(" · ")}
                            </div>
                          </div>
                          {isSelected ? (
                            <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-signal-info">
                              Выбрано
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {selectedSiResult ? (
                <div className="tone-child rounded-2xl border border-line px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">
                    Выбранное СИ
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-ink">
                    <p className="font-semibold">
                      {selectedSiDetail?.typeName ?? selectedSiResult.mitTitle ?? "СИ"}
                    </p>
                    <p className="text-steel">
                      {[
                        selectedSiDetail?.typeDesignation ?? selectedSiResult.mitNotation,
                        selectedSiDetail?.modification ?? selectedSiResult.miModification,
                        selectedSiDetail?.serialNumber ?? selectedSiResult.miNumber,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {siDetailMutation.isPending ? (
                      <p className="text-steel">Загружаем детальные сведения по `vri_id`...</p>
                    ) : null}
                    {siDetailMutation.isError ? (
                      <p className="text-[#b04c43]">
                        {getMutationErrorMessage(
                          siDetailMutation.error,
                          "Не удалось загрузить детальные сведения СИ.",
                        )}
                      </p>
                    ) : null}
                    {selectedSiDetail ? (
                      <p className="text-steel">
                        {[
                          selectedSiDetail.regNumber ? `рег. номер ${selectedSiDetail.regNumber}` : null,
                          selectedSiDetail.manufactureYear
                            ? `год ${selectedSiDetail.manufactureYear}`
                            : null,
                          selectedSiDetail.certificateNumber
                            ? `свид. ${selectedSiDetail.certificateNumber}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm text-steel">
              Категория
              <select
                className="form-input"
                value={equipmentForm.equipmentType}
                onChange={(event) => handleEquipmentTypeChange(event.target.value as EquipmentType)}
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
                list="object-names"
              />
              <datalist id="object-names">
                {existingObjectNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label className="block text-sm text-steel">
              Наименование
              <input
                className="form-input"
                type="text"
                value={equipmentForm.name}
                readOnly={isSiCreateFlow}
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
                readOnly={isSiCreateFlow}
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
                readOnly={isSiCreateFlow}
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
              list="locations"
            />
            <datalist id="locations">
              {existingLocations.map((location) => (
                <option key={location} value={location} />
              ))}
            </datalist>
          </label>
          {(createEquipmentMutation.isError || updateEquipmentMutation.isError) ? (
            <p className="text-sm text-[#b04c43]">
              {getMutationErrorMessage(createEquipmentMutation.error ?? updateEquipmentMutation.error, "Не удалось сохранить прибор.")}
            </p>
          ) : null}
          {isSiCreateFlow && !selectedSiResult ? (
            <p className="text-sm text-steel">
              Для создания `SI` сначала выбери запись из поиска Аршина.
            </p>
          ) : null}
          {isSiCreateFlow && selectedSiResult && !selectedSiDetail ? (
            <p className="text-sm text-steel">
              Создание станет доступно после загрузки детальных данных по выбранной записи.
            </p>
          ) : null}
          <div className="flex justify-end">
            <button
              aria-label={
                activeModal?.kind === "equipment" && activeModal.mode === "edit"
                  ? "Сохранить прибор"
                  : "Создать прибор"
              }
              className="btn-primary disabled:opacity-60"
              disabled={
                createEquipmentMutation.isPending ||
                updateEquipmentMutation.isPending ||
                !selectedFolder ||
                (isSiCreateFlow && (!selectedSiResult || !selectedSiDetail))
              }
              type="submit"
            >
              {createEquipmentMutation.isPending || updateEquipmentMutation.isPending ? (
                "…"
              ) : activeModal?.kind === "equipment" && activeModal.mode === "edit" ? (
                <Icon className="h-4 w-4" name="check" />
              ) : (
                <Icon className="h-4 w-4" name="plus" />
              )}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        description={
          selectedEquipmentIds.length === 1
            ? "Будет создан один активный ремонт для выбранного прибора."
            : "Массовая отправка создаст активный ремонт для всех отмеченных приборов с общим маршрутом и стартовой датой."
        }
        open={activeModal?.kind === "repair-batch"}
        title={selectedEquipmentIds.length === 1 ? "Отправить в ремонт" : "Массовая отправка в ремонт"}
        onClose={closeRepairBatchModal}
      >
        <form className="space-y-4" onSubmit={(event) => void handleRepairBatchSubmit(event)}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm text-steel">
              Откуда
              <input
                className="form-input"
                type="text"
                value={repairBatchForm.routeCity}
                onChange={(event) =>
                  setRepairBatchForm((current) => ({ ...current, routeCity: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-steel">
              Куда
              <input
                className="form-input"
                type="text"
                value={repairBatchForm.routeDestination}
                onChange={(event) =>
                  setRepairBatchForm((current) => ({
                    ...current,
                    routeDestination: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label className="block text-sm text-steel">
            Дата отправки
            <DateInput
              className="form-input form-input--compact"
              value={repairBatchForm.sentToRepairAt}
              onChange={(value) =>
                setRepairBatchForm((current) => ({
                  ...current,
                  sentToRepairAt: value,
                }))
              }
            />
          </label>
          <label className="block text-sm text-steel">
            Первое сообщение
            <textarea
              className="form-input min-h-[92px] resize-none py-3"
              placeholder="Например: партия приборов упакована и отправлена в ремонт."
              value={repairBatchForm.initialMessageText}
              onChange={(event) =>
                setRepairBatchForm((current) => ({
                  ...current,
                  initialMessageText: event.target.value,
                }))
              }
            />
          </label>
          <div className="tone-parent rounded-2xl border border-line px-4 py-3 text-sm text-steel">
            {selectedEquipmentIds.length === 1
              ? "В ремонт сейчас уйдет 1 прибор."
              : `В ремонт сейчас уйдет ${selectedEquipmentIds.length} прибор(ов).`}
          </div>
          {createRepairBatchMutation.isError ? (
            <p className="text-sm text-[#b04c43]">
              {getMutationErrorMessage(
                createRepairBatchMutation.error,
                selectedEquipmentIds.length === 1
                  ? "Не удалось отправить прибор в ремонт."
                  : "Не удалось отправить отмеченные приборы в ремонт.",
              )}
            </p>
          ) : null}
          <div className="flex justify-end">
            <button
              aria-label={selectedEquipmentIds.length === 1 ? "Подтвердить отправку в ремонт" : "Подтвердить массовую отправку в ремонт"}
              className="btn-primary disabled:opacity-60"
              disabled={
                createRepairBatchMutation.isPending
                || selectedEquipmentIds.length === 0
                || !repairBatchForm.routeCity.trim()
                || !repairBatchForm.routeDestination.trim()
                || !repairBatchForm.sentToRepairAt
              }
              type="submit"
            >
              {createRepairBatchMutation.isPending ? (
                "…"
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        description={
          selectedEquipmentIds.length === 1
            ? "Будет создана одна активная поверка для выбранного СИ."
            : "Групповая поверка создаст отдельные активные записи для выбранных СИ и объединит их общим названием группы."
        }
        open={activeModal?.kind === "verification-batch"}
        title={selectedEquipmentIds.length === 1 ? "Отправить в поверку" : "Групповая поверка"}
        onClose={closeVerificationBatchModal}
      >
        <form className="space-y-4" onSubmit={(event) => void handleVerificationBatchSubmit(event)}>
          {selectedEquipmentIds.length > 1 ? (
            <label className="block text-sm text-steel">
              Название группы
              <input
                className="form-input"
                type="text"
                value={verificationBatchForm.batchName}
                onChange={(event) =>
                  setVerificationBatchForm((current) => ({ ...current, batchName: event.target.value }))
                }
              />
            </label>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block text-sm text-steel">
              Откуда
              <input
                className="form-input"
                type="text"
                value={verificationBatchForm.routeCity}
                onChange={(event) =>
                  setVerificationBatchForm((current) => ({ ...current, routeCity: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-steel">
              Куда
              <input
                className="form-input"
                type="text"
                value={verificationBatchForm.routeDestination}
                onChange={(event) =>
                  setVerificationBatchForm((current) => ({
                    ...current,
                    routeDestination: event.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-sm text-steel">
              Дата отправки
              <DateInput
                className="form-input form-input--compact"
                value={verificationBatchForm.sentToVerificationAt}
                onChange={(value) =>
                  setVerificationBatchForm((current) => ({
                    ...current,
                    sentToVerificationAt: value,
                  }))
                }
              />
            </label>
          </div>
          <label className="block text-sm text-steel">
            Первое сообщение
            <textarea
              className="form-input min-h-[88px] resize-none py-3"
              placeholder="Например: Ящик с приборами упакован и отправлен в поверку."
              value={verificationBatchForm.initialMessageText}
              onChange={(event) =>
                setVerificationBatchForm((current) => ({
                  ...current,
                  initialMessageText: event.target.value,
                }))
              }
            />
          </label>
          <div className="tone-parent rounded-2xl border border-line px-4 py-3 text-sm text-steel">
            {selectedEquipmentIds.length === 1
              ? "В поверку сейчас уйдет 1 прибор."
              : `В группу сейчас войдет ${selectedEquipmentIds.length} прибор(ов).`}
          </div>
          {createVerificationBatchMutation.isError ? (
            <p className="text-sm text-[#b04c43]">
              {getMutationErrorMessage(
                createVerificationBatchMutation.error,
                selectedEquipmentIds.length === 1
                  ? "Не удалось отправить прибор в поверку."
                  : "Не удалось создать групповую поверку.",
              )}
            </p>
          ) : null}
          <div className="flex justify-end">
            <button
              className="btn-primary px-4 py-2 text-sm disabled:opacity-60"
              disabled={
                createVerificationBatchMutation.isPending
                || selectedEquipmentIds.length === 0
                || (selectedEquipmentIds.length > 1 && !verificationBatchForm.batchName.trim())
                || !verificationBatchForm.routeCity.trim()
                || !verificationBatchForm.routeDestination.trim()
                || !verificationBatchForm.sentToVerificationAt
              }
              type="submit"
            >
              {createVerificationBatchMutation.isPending ? (
                "Создаем..."
              ) : selectedEquipmentIds.length === 1 ? (
                "Отправить в поверку"
              ) : (
                <>
                  <Icon className="h-4 w-4" name="plus" />
                  Создать группу поверки
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      <DeleteConfirmModal
        description={deleteTarget?.message}
        errorMessage={
          deleteFolderMutation.isError || deleteEquipmentMutation.isError || deleteEquipmentBatchMutation.isError
            ? getMutationErrorMessage(
                deleteFolderMutation.error ?? deleteEquipmentMutation.error ?? deleteEquipmentBatchMutation.error,
                "Не удалось выполнить удаление.",
              )
            : null
        }
        isOpen={deleteTarget !== null}
        isPending={
          deleteFolderMutation.isPending
          || deleteEquipmentMutation.isPending
          || deleteEquipmentBatchMutation.isPending
        }
        title={deleteTarget?.title ?? "Подтверждение удаления"}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleConfirmDelete()}
      />
    </section>
  );
}

function EquipmentRow({
  item,
  canManage,
  isSelected,
  onToggleSelected,
  rowIndex,
}: {
  item: EquipmentItem;
  canManage: boolean;
  isSelected: boolean;
  onToggleSelected: () => void;
  rowIndex: number;
}) {
  return (
    <tr className={`${rowIndex % 2 === 0 ? "tone-parent" : "tone-child"} text-sm text-ink`}>
      {canManage ? (
        <td className="px-3 py-3 align-top">
          <input
            checked={isSelected}
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
            onChange={onToggleSelected}
            type="checkbox"
          />
        </td>
      ) : null}
      <td className="px-3 py-3 align-top">
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
      <td className="px-3 py-3 align-top">{getEquipmentStatusLabel(item)}</td>
      <td className="px-3 py-3 align-top">{item.serialNumber || "—"}</td>
      <td className="px-3 py-3 align-top">{item.manufactureYear || "—"}</td>
      <td className="px-3 py-3 align-top">{item.objectName}</td>
      <td className="px-3 py-3 align-top">{item.currentLocationManual || "Не указано"}</td>
    </tr>
  );
}

function mapEquipmentFormToPayload(
  form: EquipmentFormState,
  folderId: number,
  selectedSiResult: ArshinSearchResult | null,
  selectedSiDetail: ArshinVriDetail | null,
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
    siVerification:
      form.equipmentType === "SI" && selectedSiResult
        ? buildSIVerificationPayloadFromArshin(selectedSiResult, selectedSiDetail)
        : null,
  };
}

function getMutationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getTodayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
