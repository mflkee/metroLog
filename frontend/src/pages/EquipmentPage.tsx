import { ActiveModal, DeleteTarget, ESIInternalModuleFormState, EquipmentFormState, EquipmentSortState, FolderFormState, RepairBatchFormState, SIImportFormState, SISearchFormState, VerificationBatchFormState, complianceIntervalOptions, defaultEquipmentForm, defaultFolderForm, defaultRepairBatchForm, defaultSIImportForm, defaultSISearchForm, defaultVerificationBatchForm, equipmentPageSize, equipmentStatusOptions, equipmentTypeOptions, extractArshinResultCertificateNumber, formatRefreshWindow, getArshinSearchResultManufactureYear, getFolderRefreshRowStatusLabel, getFolderRefreshRowTargetLabel, getFolderRefreshStatusBadgeClass, getFolderRefreshTaskStatusLabel, getInitialSortDirection, getMutationErrorMessage, getOnSiteProcessRouteValue, getPreferredDeadlinePresetId, getVerificationStartDateLabel, isVerificationFlowOnSite, mapEquipmentFormToPayload, subtleButtonClass, subtleButtonWithIconClass } from "@/lib/equipmentRegistry";
import { EquipmentRow, SortableTableHeader } from "@/components/equipment-registry/EquipmentTable";
import { type ChangeEvent, type FormEvent, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchArshinEsiDetail,
  fetchArshinVriDetail,
  getArshinErrorMessage,
  searchArshin,
  type ArshinSearchResult,
  type ArshinVriDetail,
} from "@/api/arshin";
import {
  applyFolderRefreshRows,
  canChangeEquipmentTypeAfterCreation,
  fetchDeadlinePresets,
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
  equipmentTypeSelectionLabels,
  fetchFolderRefreshTaskDetails,
  fetchFolderProcessSubscriptions,
  fetchEquipment,
  fetchEquipmentPage,
  fetchEquipmentFolderSuggestions,
  getEditableEquipmentTypeOptions,
  getEquipmentComplianceDateLabel,
  getEquipmentCompliancePeriodLabel,
  isArshinEquipmentType,
  fetchEquipmentFolders,
  importSIEquipmentExcel,
  startFolderRefreshTask,
  supportsVerification,
  updateEquipment,
  updateEquipmentArshinRefreshExclusion,
  updateEquipmentFolder,
  updateFolderProcessSubscriptions,
  type EquipmentFolder,
  type EquipmentFolderRefreshApplyResult,
  type EquipmentFolderRefreshRowStatus,
  type EquipmentPageResult,
  type EquipmentSIBulkImportResult,
  type EquipmentSortKey,
  type EquipmentStatus,
  type EquipmentType,
} from "@/api/equipment";
import { fetchMentionUsers } from "@/api/users";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { AutocompleteTextarea } from "@/components/AutocompleteTextarea";
import { DateInput } from "@/components/DateInput";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { EmojiPickerButton } from "@/components/EmojiPickerButton";
import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";
import { Modal } from "@/components/Modal";
import { PendingAttachmentList } from "@/components/PendingAttachmentList";
import { PaginationControls } from "@/components/PaginationControls";
import { ProcessVariantSelector } from "@/components/ProcessVariantSelector";
import { PrivateNoteToggleButton } from "@/components/PrivateNoteControls";
import { PageHeader } from "@/components/layout/PageHeader";
import { appendPendingFiles, openFilePicker, removePendingFile } from "@/lib/attachments";
import { buildMentionSuggestionOptions, sortAutocompleteSuggestions } from "@/lib/autocomplete";
import { extractEsiInternalModuleCandidates } from "@/lib/esiModules";
import {
  getProcessFormatButtonClass,
  getProcessVariantById,
  getRepairPresetVariants,
  getVerificationFlowModeForVariant,
  getVerificationPresetVariants,
} from "@/lib/processVariants";
import { hasOperatorAccess, roleLabels } from "@/lib/roles";
import { buildUserExtraInfo, matchesUserSearch, userSearchPlaceholder } from "@/lib/userSearch";
import { insertEmojiAtCursor } from "@/lib/textarea";
import { useAuthStore } from "@/store/auth";

export function EquipmentPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const dashboardObjectNameFilter = useMemo(() => {
    const value = searchParams.get("objectName")?.trim();
    return value ? value : null;
  }, [searchParams]);
  const dashboardCurrentLocationFilter = useMemo(() => {
    const value = searchParams.get("currentLocation")?.trim();
    return value ? value : null;
  }, [searchParams]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(() => {
    const folderIdFromUrl = searchParams.get("folderId");
    return folderIdFromUrl ? Number(folderIdFromUrl) : null;
  });
  const [folderSearchQuery, setFolderSearchQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState(() => {
    const urlQuery = searchParams.get("query")?.trim();
    if (urlQuery) {
      return urlQuery;
    }
    return searchParams.get("currentLocation")?.trim() ?? "";
  });
  const [statusFilter, setStatusFilter] = useState<EquipmentStatus | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<EquipmentType | "ALL">("ALL");
  const [folderForm, setFolderForm] = useState<FolderFormState>(defaultFolderForm);
  const [equipmentForm, setEquipmentForm] = useState<EquipmentFormState>(defaultEquipmentForm);
  const [siSearchForm, setSiSearchForm] = useState<SISearchFormState>(defaultSISearchForm);
  const [siSearchResults, setSiSearchResults] = useState<ArshinSearchResult[]>([]);
  const [selectedSiResult, setSelectedSiResult] = useState<ArshinSearchResult | null>(null);
  const [selectedSiDetail, setSelectedSiDetail] = useState<ArshinVriDetail | null>(null);
  const [esiInternalModules, setEsiInternalModules] = useState<ESIInternalModuleFormState[]>([]);
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
  const [folderSubscriptionModalOpen, setFolderSubscriptionModalOpen] = useState(false);
  const [folderRefreshModalOpen, setFolderRefreshModalOpen] = useState(false);
  const [folderRefreshTaskId, setFolderRefreshTaskId] = useState<number | null>(null);
  const [folderRefreshMinimized, setFolderRefreshMinimized] = useState(false);
  const [folderRefreshScopeEquipmentIds, setFolderRefreshScopeEquipmentIds] = useState<number[]>([]);
  const [selectedFolderRefreshRowIds, setSelectedFolderRefreshRowIds] = useState<number[]>([]);
  const [folderRefreshApplyResult, setFolderRefreshApplyResult] = useState<EquipmentFolderRefreshApplyResult | null>(null);
  const [folderRefreshActionMessage, setFolderRefreshActionMessage] = useState<string | null>(null);
  const [folderRefreshStatusFilter, setFolderRefreshStatusFilter] = useState<"ALL" | EquipmentFolderRefreshRowStatus>("ALL");
  const [folderRefreshSearchQuery, setFolderRefreshSearchQuery] = useState("");
  const [selectedFolderSubscriptionUserIds, setSelectedFolderSubscriptionUserIds] = useState<number[]>([]);
  const [folderSubscriptionUserSearchQuery, setFolderSubscriptionUserSearchQuery] = useState("");
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<number[]>([]);
  const [equipmentPage, setEquipmentPage] = useState(1);
  const [sortState, setSortState] = useState<EquipmentSortState | null>(null);
  const folderRefreshTableScrollRef = useRef<HTMLDivElement | null>(null);
  const folderRefreshBottomScrollbarRef = useRef<HTMLDivElement | null>(null);
  const folderRefreshBottomScrollbarInnerRef = useRef<HTMLDivElement | null>(null);
  const repairInitialMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const verificationInitialMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const repairInitialFilesInputRef = useRef<HTMLInputElement | null>(null);
  const verificationInitialFilesInputRef = useRef<HTMLInputElement | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const canManage = hasOperatorAccess(user?.role);

  useEffect(() => {
    if (
      (equipmentForm.equipmentType !== "IO" && equipmentForm.equipmentType !== "VO")
      || equipmentForm.complianceIntervalMonths
    ) {
      return;
    }

    setEquipmentForm((current) => {
      if (
        (current.equipmentType !== "IO" && current.equipmentType !== "VO")
        || current.complianceIntervalMonths
      ) {
        return current;
      }

      return {
        ...current,
        complianceIntervalMonths: "12",
      };
    });
  }, [equipmentForm.complianceIntervalMonths, equipmentForm.equipmentType]);

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
      deferredSearchQuery,
      dashboardObjectNameFilter,
      dashboardCurrentLocationFilter,
      statusFilter,
      typeFilter,
      sortState?.key ?? "default-order",
      sortState?.direction ?? "default-direction",
      equipmentPage,
      equipmentPageSize,
    ],
    queryFn: () =>
      fetchEquipmentPage(token ?? "", {
        folderId: selectedFolderId,
        groupId: null,
        query: deferredSearchQuery,
        objectName: dashboardObjectNameFilter,
        currentLocationManual: dashboardCurrentLocationFilter,
        status: statusFilter === "ALL" ? null : statusFilter,
        equipmentType: typeFilter === "ALL" ? null : typeFilter,
        sortKey: sortState?.key ?? null,
        sortDirection: sortState?.direction ?? null,
        limit: equipmentPageSize,
        offset: (equipmentPage - 1) * equipmentPageSize,
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

  async function invalidateEquipmentRegistryQueries() {
    await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
    await queryClient.invalidateQueries({ queryKey: ["equipment-items-page"] });
    await queryClient.invalidateQueries({ queryKey: ["equipment-selected-items"] });
  }

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

  const folderRefreshTaskQuery = useQuery({
    queryKey: [
      "equipment-folder-refresh-task",
      selectedFolderId ?? "none",
      folderRefreshTaskId ?? "none",
    ],
    queryFn: () => fetchFolderRefreshTaskDetails(token ?? "", selectedFolderId ?? 0, folderRefreshTaskId ?? 0),
    enabled:
      Boolean(token)
      && canManage
      && selectedFolderId !== null
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

  useEffect(() => {
    if (activeModal?.kind !== "folder" || folderForm.deadlinePresetId !== null) {
      return;
    }
    const preferredPresetId = getPreferredDeadlinePresetId(deadlinePresetsQuery.data ?? []);
    if (preferredPresetId === null) {
      return;
    }
    setFolderForm((current) => ({
      ...current,
      deadlinePresetId: preferredPresetId,
      initialDeadlinePresetId: current.initialDeadlinePresetId ?? preferredPresetId,
    }));
  }, [
    activeModal,
    deadlinePresetsQuery.data,
    folderForm.deadlinePresetId,
  ]);

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
      if (selectedFolderId === folderId) {
        setFolderSelection(null);
      }
      setDeleteTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["equipment-folders"] });
      await invalidateEquipmentRegistryQueries();
    },
  });

  const updateFolderProcessSubscriptionsMutation = useMutation({
    mutationFn: (userIds: number[]) =>
      updateFolderProcessSubscriptions(token ?? "", selectedFolderId ?? 0, userIds),
    onSuccess: (result) => {
      setSelectedFolderSubscriptionUserIds(
        result.users.filter((userItem) => userItem.enabled).map((userItem) => userItem.userId),
      );
      queryClient.setQueryData(["folder-process-subscriptions", selectedFolderId ?? "none"], result);
      setFolderSubscriptionModalOpen(false);
    },
  });

  const startFolderRefreshMutation = useMutation({
    mutationFn: (equipmentIds: number[]) =>
      startFolderRefreshTask(token ?? "", selectedFolderId ?? 0, equipmentIds),
    onSuccess: (task) => {
      setFolderRefreshTaskId(task.id);
      setSelectedFolderRefreshRowIds([]);
      setFolderRefreshApplyResult(null);
    },
  });

  const applyFolderRefreshMutation = useMutation({
    mutationFn: (rowIds: number[]) =>
      applyFolderRefreshRows(token ?? "", selectedFolderId ?? 0, folderRefreshTaskId ?? 0, rowIds),
    onSuccess: async (result) => {
      setFolderRefreshApplyResult(result);
      setSelectedFolderRefreshRowIds([]);
      setFolderRefreshActionMessage(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            "equipment-folder-refresh-task",
            selectedFolderId ?? "none",
            folderRefreshTaskId ?? "none",
          ],
        }),
        invalidateEquipmentRegistryQueries(),
        queryClient.invalidateQueries({ queryKey: ["equipment-item"] }),
        queryClient.invalidateQueries({ queryKey: ["equipment-esi-monitoring", selectedFolderId ?? "none"] }),
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
        invalidateEquipmentRegistryQueries(),
        queryClient.invalidateQueries({ queryKey: ["dashboard-equipment"] }),
        queryClient.invalidateQueries({ queryKey: ["equipment-details"] }),
      ]);
    },
  });
  const folderRefreshTask = folderRefreshTaskQuery.data?.task ?? startFolderRefreshMutation.data ?? null;

  const siSearchMutation = useMutation({
    mutationFn: ({ documentNumber, equipmentType }: { documentNumber: string; equipmentType: EquipmentType }) =>
      searchArshin(token ?? "", {
        registryKind: equipmentType === "ESI" ? "ESI" : "SI",
        ...(equipmentType === "ESI"
          ? { certificateNumber: documentNumber }
          : { resultDocnum: documentNumber }),
      }),
    onSuccess: (results) => {
      setSiSearchResults(results);
      setSelectedSiResult(null);
      setSelectedSiDetail(null);
      setEsiInternalModules([]);
      if (results.length === 1) {
        handleSelectSiResult(results[0]);
      }
    },
  });

  const siDetailMutation = useMutation({
    mutationFn: ({
      equipmentType,
      result,
    }: {
      equipmentType: EquipmentType;
      result: ArshinSearchResult;
    }) =>
      equipmentType === "ESI"
        ? fetchArshinEsiDetail(token ?? "", result)
        : fetchArshinVriDetail(token ?? "", result.vriId),
    onSuccess: (detail) => {
      setSelectedSiDetail(detail);
      setEsiInternalModules(
        equipmentForm.equipmentType === "ESI"
          ? extractEsiInternalModuleCandidates(detail).map((item) => ({
              ...item,
              measurementLimit: "",
            }))
          : [],
      );
      setEquipmentForm((current) => ({
        ...current,
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
          esiInternalModules,
        ),
      ),
    onSuccess: async (equipmentItem) => {
      closeEquipmentModal();
      await invalidateEquipmentRegistryQueries();
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
        mapEquipmentFormToPayload(equipmentForm, selectedFolderId, null, null, []),
      );
    },
    onSuccess: async (equipmentItem) => {
      closeEquipmentModal();
      await invalidateEquipmentRegistryQueries();
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", equipmentItem.id] });
    },
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: (equipmentId: number) => deleteEquipment(token ?? "", equipmentId),
    onSuccess: (_, equipmentId) => {
      setDeleteTarget(null);
      void Promise.all([
        invalidateEquipmentRegistryQueries(),
        queryClient.invalidateQueries({ queryKey: ["equipment-item", equipmentId] }),
      ]);
    },
  });

  const deleteEquipmentBatchMutation = useMutation({
    mutationFn: (equipmentIds: number[]) => deleteEquipmentBatch(token ?? "", equipmentIds),
    onSuccess: async () => {
      setDeleteTarget(null);
      setSelectedEquipmentIds([]);
      await invalidateEquipmentRegistryQueries();
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
      await invalidateEquipmentRegistryQueries();
    },
  });

  const exportEquipmentMutation = useMutation({
    mutationFn: () =>
      exportEquipmentRegistryXlsx(
        token ?? "",
        selectedEquipmentIds.length > 0
          ? {
              folderId: selectedFolderId,
              equipmentIds: selectedEquipmentIds,
            }
          : {
              folderId: selectedFolderId,
              query: deferredSearchQuery,
              status: statusFilter === "ALL" ? null : statusFilter,
              equipmentType: typeFilter === "ALL" ? null : typeFilter,
            },
      ),
  });

  const createVerificationBatchMutation = useMutation<unknown, Error, void>({
    mutationFn: () => {
      const selectedVariant = getProcessVariantById(
        verificationPresetVariants,
        verificationBatchForm.stageTemplateVariantId,
      );
      const flowMode = getVerificationFlowModeForVariant(selectedVariant)
        ?? verificationBatchForm.flowMode;
      if (selectedEquipmentIds.length === 1) {
        return createEquipmentVerification(token ?? "", selectedEquipmentIds[0], {
          flowMode,
          stageTemplateVariantId: selectedVariant?.id ?? null,
          routeCity: isVerificationFlowOnSite(flowMode)
            ? getOnSiteProcessRouteValue()
            : verificationBatchForm.routeCity,
          routeDestination: isVerificationFlowOnSite(flowMode)
            ? getOnSiteProcessRouteValue()
            : verificationBatchForm.routeDestination,
          sentToVerificationAt: verificationBatchForm.sentToVerificationAt,
          initialMessageText: verificationBatchForm.initialMessageText,
          initialMessageIsPrivate: verificationBatchForm.initialMessageIsPrivate,
          files: verificationBatchForm.files,
        });
      }

      return createVerificationBatch(token ?? "", {
        equipmentIds: selectedEquipmentIds,
        batchName: verificationBatchForm.batchName,
        flowMode,
        stageTemplateVariantId: selectedVariant?.id ?? null,
        routeCity: isVerificationFlowOnSite(flowMode)
          ? getOnSiteProcessRouteValue()
          : verificationBatchForm.routeCity,
        routeDestination: isVerificationFlowOnSite(flowMode)
          ? getOnSiteProcessRouteValue()
          : verificationBatchForm.routeDestination,
        sentToVerificationAt: verificationBatchForm.sentToVerificationAt,
        initialMessageText: verificationBatchForm.initialMessageText,
        initialMessageIsPrivate: verificationBatchForm.initialMessageIsPrivate,
        files: verificationBatchForm.files,
      });
    },
    onSuccess: async () => {
      setSelectedEquipmentIds([]);
      setVerificationBatchForm(defaultVerificationBatchForm);
      if (verificationInitialFilesInputRef.current) {
        verificationInitialFilesInputRef.current.value = "";
      }
      setActiveModal(null);
      await invalidateEquipmentRegistryQueries();
      await queryClient.invalidateQueries({ queryKey: ["verification-queue"] });
      await queryClient.invalidateQueries({ queryKey: ["verification-queue-page"] });
    },
  });

  const createRepairBatchMutation = useMutation<unknown, Error, void>({
    mutationFn: () => {
      const selectedVariant = getProcessVariantById(
        repairPresetVariants,
        repairBatchForm.stageTemplateVariantId,
      );
      const isOnSite = selectedVariant
        ? selectedVariant.routeKind === "on_site"
        : repairBatchForm.isOnSite;
      if (selectedEquipmentIds.length === 1) {
        return createEquipmentRepair(token ?? "", selectedEquipmentIds[0], {
          isOnSite,
          stageTemplateVariantId: selectedVariant?.id ?? null,
          routeCity: isOnSite
            ? getOnSiteProcessRouteValue()
            : repairBatchForm.routeCity,
          routeDestination: isOnSite
            ? getOnSiteProcessRouteValue()
            : repairBatchForm.routeDestination,
          sentToRepairAt: repairBatchForm.sentToRepairAt,
          initialMessageText: repairBatchForm.initialMessageText,
          initialMessageIsPrivate: repairBatchForm.initialMessageIsPrivate,
          files: repairBatchForm.files,
        });
      }

      return createRepairBatch(token ?? "", {
        equipmentIds: selectedEquipmentIds,
        batchName: repairBatchForm.batchName,
        isOnSite,
        stageTemplateVariantId: selectedVariant?.id ?? null,
        routeCity: isOnSite
          ? getOnSiteProcessRouteValue()
          : repairBatchForm.routeCity,
        routeDestination: isOnSite
          ? getOnSiteProcessRouteValue()
          : repairBatchForm.routeDestination,
        sentToRepairAt: repairBatchForm.sentToRepairAt,
        initialMessageText: repairBatchForm.initialMessageText,
        initialMessageIsPrivate: repairBatchForm.initialMessageIsPrivate,
        files: repairBatchForm.files,
      });
    },
    onSuccess: async () => {
      setSelectedEquipmentIds([]);
      setRepairBatchForm(defaultRepairBatchForm);
      if (repairInitialFilesInputRef.current) {
        repairInitialFilesInputRef.current.value = "";
      }
      setActiveModal(null);
      await invalidateEquipmentRegistryQueries();
      await queryClient.invalidateQueries({ queryKey: ["repair-queue"] });
      await queryClient.invalidateQueries({ queryKey: ["repair-queue-page"] });
    },
  });

  const allFolders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const hiddenEquipmentFolderIds = useMemo(
    () => new Set(user?.hiddenEquipmentFolderIds ?? []),
    [user?.hiddenEquipmentFolderIds],
  );
  const folders = useMemo(
    () => allFolders.filter((folder) => !hiddenEquipmentFolderIds.has(folder.id)),
    [allFolders, hiddenEquipmentFolderIds],
  );
  const paginatedEquipmentPage = useMemo<EquipmentPageResult | null>(
    () => equipmentPageQuery.data ?? null,
    [equipmentPageQuery.data],
  );
  const equipmentItems = useMemo(() => paginatedEquipmentPage?.items ?? [], [paginatedEquipmentPage?.items]);
  const equipmentTotalCount = useMemo(() => paginatedEquipmentPage?.total ?? 0, [paginatedEquipmentPage?.total]);
  const equipmentTotalPages = useMemo(
    () => Math.max(1, Math.ceil(equipmentTotalCount / equipmentPageSize)),
    [equipmentTotalCount],
  );
  const pagedEquipmentItems = useMemo(() => equipmentItems, [equipmentItems]);
  const selectedEquipmentItems = useMemo(
    () => selectedEquipmentQuery.data ?? [],
    [selectedEquipmentQuery.data],
  );
  const visibleSelectedEquipmentIds = useMemo(
    () =>
      pagedEquipmentItems
        .filter((item) => selectedEquipmentIds.includes(item.id))
        .map((item) => item.id),
    [pagedEquipmentItems, selectedEquipmentIds],
  );
  const areAllVisibleEquipmentSelected =
    pagedEquipmentItems.length > 0
    && visibleSelectedEquipmentIds.length === pagedEquipmentItems.length;
  const areAllSelectedItemsSi =
    selectedEquipmentItems.length > 0
    && selectedEquipmentItems.every((item) => supportsVerification(item.equipmentType));
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

  const existingRouteCities = useMemo(
    () => Array.from(new Set(folderSuggestionsQuery.data?.repairRouteCities ?? [])).sort(),
    [folderSuggestionsQuery.data?.repairRouteCities],
  );

  const existingRouteDestinations = useMemo(
    () => Array.from(new Set(folderSuggestionsQuery.data?.repairRouteDestinations ?? [])).sort(),
    [folderSuggestionsQuery.data?.repairRouteDestinations],
  );

  const existingMeasurementUnits = useMemo(
    () => sortAutocompleteSuggestions(folderSuggestionsQuery.data?.measurementUnits ?? []),
    [folderSuggestionsQuery.data?.measurementUnits],
  );

  const existingProcessBatchNames = useMemo(
    () => sortAutocompleteSuggestions(folderSuggestionsQuery.data?.processBatchNames ?? []),
    [folderSuggestionsQuery.data?.processBatchNames],
  );
  const mentionSuggestions = useMemo(
    () => buildMentionSuggestionOptions(mentionUsersQuery.data ?? []),
    [mentionUsersQuery.data],
  );

  const folderSearchSuggestions = useMemo(
    () =>
      sortAutocompleteSuggestions(
        folders.flatMap((folder) => [folder.name, folder.description]),
      ),
    [folders],
  );

  const processTextSuggestions = useMemo(
    () => [
      ...mentionSuggestions,
      ...sortAutocompleteSuggestions([
        folders.find((folder) => folder.id === selectedFolderId)?.name,
        ...selectedEquipmentItems.flatMap((item) => [
          item.objectName,
          item.name,
          item.modification,
          item.serialNumber,
          item.currentLocationManual,
          item.siVerification?.resultDocnum ?? null,
          item.siVerification?.mitNumber ?? null,
          item.siVerification?.miNumber ?? null,
        ]),
        ...existingObjectNames,
        ...existingLocations,
        ...existingRouteCities,
        ...existingRouteDestinations,
      ]),
    ],
    [
      existingLocations,
      existingObjectNames,
      existingRouteCities,
      existingRouteDestinations,
      folders,
      mentionSuggestions,
      selectedFolderId,
      selectedEquipmentItems,
    ],
  );

  const equipmentSearchSuggestions = useMemo(
    () =>
      sortAutocompleteSuggestions([
        ...equipmentItems.flatMap((item) => [
          item.objectName,
          item.name,
          item.modification,
          item.serialNumber,
          item.currentLocationManual,
          item.siVerification?.resultDocnum ?? null,
          item.siVerification?.mitNumber ?? null,
          item.siVerification?.miNumber ?? null,
        ]),
        ...existingObjectNames,
        ...existingLocations,
        ...existingRouteCities,
        ...existingRouteDestinations,
      ]),
    [
      equipmentItems,
      existingLocations,
      existingObjectNames,
      existingRouteCities,
      existingRouteDestinations,
    ],
  );

  useEffect(() => {
    if (selectedFolderId === null || !foldersQuery.isSuccess) {
      return;
    }

    if (!allFolders.some((folder) => folder.id === selectedFolderId)) {
      setSelectedFolderId(null);
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete("folderId");
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [allFolders, foldersQuery.isSuccess, searchParams, selectedFolderId, setSearchParams]);

  useEffect(() => {
    const normalizedQuery = searchQuery.trim();
    if ((searchParams.get("query") ?? "") === normalizedQuery) {
      return;
    }
    const nextSearchParams = new URLSearchParams(searchParams);
    if (normalizedQuery) {
      nextSearchParams.set("query", normalizedQuery);
    } else {
      nextSearchParams.delete("query");
    }
    setSearchParams(nextSearchParams, { replace: true });
  }, [searchParams, searchQuery, setSearchParams]);

  useEffect(() => {
    setEquipmentPage(1);
  }, [
    selectedFolderId,
    deferredSearchQuery,
    dashboardObjectNameFilter,
    dashboardCurrentLocationFilter,
    statusFilter,
    typeFilter,
    sortState,
  ]);

  useEffect(() => {
    if (equipmentPage > equipmentTotalPages) {
      setEquipmentPage(equipmentTotalPages);
    }
  }, [equipmentPage, equipmentTotalPages]);

  const selectedFolder = useMemo(
    () => allFolders.find((folder) => folder.id === selectedFolderId) ?? null,
    [allFolders, selectedFolderId],
  );
  const selectedFolderCurrentDeadlinePreset = useMemo(
    () =>
      (deadlinePresetsQuery.data ?? []).find(
        (preset) => preset.id === selectedFolder?.deadlinePresetId,
      ) ?? null,
    [deadlinePresetsQuery.data, selectedFolder?.deadlinePresetId],
  );
  const repairPresetVariants = useMemo(
    () =>
      selectedFolderCurrentDeadlinePreset?.repairStageTemplates?.variants
      ?? getRepairPresetVariants(selectedFolder),
    [selectedFolder, selectedFolderCurrentDeadlinePreset],
  );
  const verificationPresetVariants = useMemo(
    () =>
      selectedFolderCurrentDeadlinePreset?.verificationStageTemplates?.variants
      ?? getVerificationPresetVariants(selectedFolder),
    [selectedFolder, selectedFolderCurrentDeadlinePreset],
  );
  const hasRepairPresetVariantConfig = Boolean(
    selectedFolderCurrentDeadlinePreset?.repairStageTemplates
    ?? selectedFolder?.deadlinePresetSnapshot?.repairStageTemplates,
  );
  const hasVerificationPresetVariantConfig = Boolean(
    selectedFolderCurrentDeadlinePreset?.verificationStageTemplates
    ?? selectedFolder?.deadlinePresetSnapshot?.verificationStageTemplates,
  );
  const selectedRepairPresetVariant = getProcessVariantById(
    repairPresetVariants,
    repairBatchForm.stageTemplateVariantId,
  );
  const selectedVerificationPresetVariant = getProcessVariantById(
    verificationPresetVariants,
    verificationBatchForm.stageTemplateVariantId,
  );
  const effectiveRepairIsOnSite = selectedRepairPresetVariant
    ? selectedRepairPresetVariant.routeKind === "on_site"
    : repairBatchForm.isOnSite;
  const effectiveVerificationFlowMode =
    getVerificationFlowModeForVariant(selectedVerificationPresetVariant)
    ?? verificationBatchForm.flowMode;
  const folderRefreshRows = useMemo(
    () => folderRefreshTaskQuery.data?.rows ?? [],
    [folderRefreshTaskQuery.data?.rows],
  );
  const folderRefreshRowIds = useMemo(
    () => folderRefreshRows.map((row) => row.id),
    [folderRefreshRows],
  );
  const applicableFolderRefreshRowIds = useMemo(
    () =>
      folderRefreshRows
        .filter((row) => row.status === "UPDATED" || row.status === "UPDATED_UNCERTAIN")
        .map((row) => row.id),
    [folderRefreshRows],
  );
  const filteredFolderRefreshRows = useMemo(() => {
    const normalizedQuery = folderRefreshSearchQuery.trim().toLowerCase();
    return folderRefreshRows.filter((row) => {
      if (folderRefreshStatusFilter !== "ALL" && row.status !== folderRefreshStatusFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return [
        row.equipmentName,
        getFolderRefreshRowTargetLabel(row),
        row.currentCertificateNumber ?? "",
        row.matchedCertificateNumber ?? "",
        row.targetRegistryNumber ?? "",
        row.matchedRegistryNumber ?? "",
        row.notes ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [folderRefreshRows, folderRefreshSearchQuery, folderRefreshStatusFilter]);
  const filteredFolderRefreshRowIds = useMemo(
    () => filteredFolderRefreshRows.map((row) => row.id),
    [filteredFolderRefreshRows],
  );
  const applicableSelectedFolderRefreshRowIds = useMemo(
    () => selectedFolderRefreshRowIds.filter((rowId) => applicableFolderRefreshRowIds.includes(rowId)),
    [applicableFolderRefreshRowIds, selectedFolderRefreshRowIds],
  );
  const selectedFilteredFolderRefreshRowIds = useMemo(
    () => selectedFolderRefreshRowIds.filter((rowId) => filteredFolderRefreshRowIds.includes(rowId)),
    [filteredFolderRefreshRowIds, selectedFolderRefreshRowIds],
  );
  const selectedFolderRefreshEquipmentIds = useMemo(
    () =>
      Array.from(
        new Set(
          folderRefreshRows
            .filter((row) => selectedFolderRefreshRowIds.includes(row.id))
            .map((row) => row.equipmentId),
        ),
      ),
    [folderRefreshRows, selectedFolderRefreshRowIds],
  );
  const isScopedFolderRefresh = folderRefreshScopeEquipmentIds.length > 0;
  const folderRefreshScopeLabel = isScopedFolderRefresh
    ? `по ${folderRefreshScopeEquipmentIds.length} отмеченным приборам`
    : "по всей папке";
  const folderRefreshScopeDescriptionLabel = isScopedFolderRefresh
    ? `${folderRefreshScopeEquipmentIds.length} отмеченных приборов`
    : "всех приборов папки";
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
    isArshinEquipmentType(equipmentForm.equipmentType);
  const isManualArshinCreateFlow = isSiCreateFlow && equipmentForm.createdManually;
  const isAutomaticArshinCreateFlow = isSiCreateFlow && !equipmentForm.createdManually;
  const isEsiCreateFlow = isAutomaticArshinCreateFlow && equipmentForm.equipmentType === "ESI";
  const isEquipmentEditFlow = activeModal?.kind === "equipment" && activeModal.mode === "edit";
  const equipmentEditBaseType = useMemo<EquipmentType>(
    () =>
      isEquipmentEditFlow && activeModal?.kind === "equipment" && activeModal.equipmentId
        ? (
            pagedEquipmentItems.find((item) => item.id === activeModal.equipmentId)?.equipmentType
            ?? equipmentForm.equipmentType
          )
        : equipmentForm.equipmentType,
    [activeModal, equipmentForm.equipmentType, isEquipmentEditFlow, pagedEquipmentItems],
  );
  const editableEquipmentTypeOptions = isEquipmentEditFlow
    ? getEditableEquipmentTypeOptions(equipmentEditBaseType)
    : equipmentTypeOptions;
  const canEditEquipmentTypeInModal = !isEquipmentEditFlow
    || canChangeEquipmentTypeAfterCreation(equipmentEditBaseType);
  const isEquipmentLoading = equipmentPageQuery.isLoading;
  const equipmentError = equipmentPageQuery.error;
  const isFolderRefreshProcessing =
    folderRefreshTask?.status === "PENDING"
    || folderRefreshTask?.status === "PROCESSING";
  const shouldShowMinimizedFolderRefresh =
    folderRefreshMinimized
    && !folderRefreshModalOpen
    && folderRefreshTaskId !== null
    && folderRefreshTask !== null;
  const filteredFolderSubscriptionUsers = useMemo(
    () =>
      (folderProcessSubscriptionsQuery.data?.users ?? []).filter((userItem) =>
        matchesUserSearch(userItem, folderSubscriptionUserSearchQuery),
      ),
    [folderProcessSubscriptionsQuery.data?.users, folderSubscriptionUserSearchQuery],
  );
  const esiInternalModulesReady =
    !isEsiCreateFlow
    || (
      Boolean(selectedSiDetail)
      && esiInternalModules.length > 0
      && esiInternalModules.every((item) => item.measurementLimit.trim().length > 0)
    );

  useEffect(() => {
    if (!folderSubscriptionModalOpen || !folderProcessSubscriptionsQuery.data) {
      return;
    }
    setSelectedFolderSubscriptionUserIds(
      folderProcessSubscriptionsQuery.data.users
        .filter((userItem) => userItem.enabled)
        .map((userItem) => userItem.userId),
    );
  }, [folderProcessSubscriptionsQuery.data, folderSubscriptionModalOpen]);

  useEffect(() => {
    setSelectedFolderRefreshRowIds((current) =>
      current.filter((rowId) => folderRefreshRowIds.includes(rowId)),
    );
  }, [folderRefreshRowIds]);

  useEffect(() => {
    const tableScroller = folderRefreshTableScrollRef.current;
    const bottomScroller = folderRefreshBottomScrollbarRef.current;
    const bottomInner = folderRefreshBottomScrollbarInnerRef.current;

    if (
      !folderRefreshModalOpen
      || !folderRefreshRows.length
      || !tableScroller
      || !bottomScroller
      || !bottomInner
    ) {
      return;
    }

    let syncingFromTable = false;
    let syncingFromBottom = false;

    const syncDimensions = () => {
      bottomInner.style.width = `${tableScroller.scrollWidth}px`;
      bottomScroller.scrollLeft = tableScroller.scrollLeft;
    };

    const handleTableScroll = () => {
      if (syncingFromBottom) {
        syncingFromBottom = false;
        return;
      }
      syncingFromTable = true;
      bottomScroller.scrollLeft = tableScroller.scrollLeft;
    };

    const handleBottomScroll = () => {
      if (syncingFromTable) {
        syncingFromTable = false;
        return;
      }
      syncingFromBottom = true;
      tableScroller.scrollLeft = bottomScroller.scrollLeft;
    };

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            syncDimensions();
          })
        : null;

    resizeObserver?.observe(tableScroller);
    if (tableScroller.firstElementChild instanceof HTMLElement) {
      resizeObserver?.observe(tableScroller.firstElementChild);
    }

    window.addEventListener("resize", syncDimensions);
    tableScroller.addEventListener("scroll", handleTableScroll);
    bottomScroller.addEventListener("scroll", handleBottomScroll);

    syncDimensions();
    const timeoutId = window.setTimeout(syncDimensions, 0);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", syncDimensions);
      tableScroller.removeEventListener("scroll", handleTableScroll);
      bottomScroller.removeEventListener("scroll", handleBottomScroll);
      resizeObserver?.disconnect();
    };
  }, [folderRefreshModalOpen, folderRefreshRows]);

  const folderDeadlinePresetOptions = useMemo(
    () =>
      (deadlinePresetsQuery.data ?? []).filter(
        (preset) => preset.isActive || preset.id === folderForm.deadlinePresetId,
      ),
    [deadlinePresetsQuery.data, folderForm.deadlinePresetId],
  );

  if (!token) {
    return null;
  }

  function resetFolderRefreshState() {
    setFolderRefreshModalOpen(false);
    setFolderRefreshMinimized(false);
    setFolderRefreshTaskId(null);
    setFolderRefreshScopeEquipmentIds([]);
    setSelectedFolderRefreshRowIds([]);
    setFolderRefreshApplyResult(null);
    setFolderRefreshActionMessage(null);
    setFolderRefreshStatusFilter("ALL");
    setFolderRefreshSearchQuery("");
    startFolderRefreshMutation.reset();
    applyFolderRefreshMutation.reset();
    excludeFolderRefreshSelectionMutation.reset();
  }

  function closeFolderModal() {
    setFolderForm(defaultFolderForm);
    setActiveModal(null);
  }

  function closeFolderSubscriptionModal() {
    setFolderSubscriptionModalOpen(false);
    setSelectedFolderSubscriptionUserIds([]);
    setFolderSubscriptionUserSearchQuery("");
    updateFolderProcessSubscriptionsMutation.reset();
  }

  function closeFolderRefreshModal() {
    if (folderRefreshTaskId !== null && isFolderRefreshProcessing) {
      setFolderRefreshModalOpen(false);
      setFolderRefreshMinimized(true);
      return;
    }
    resetFolderRefreshState();
  }

  function minimizeFolderRefreshModal() {
    if (folderRefreshTaskId === null || folderRefreshTask === null) {
      setFolderRefreshModalOpen(false);
      return;
    }
    setFolderRefreshModalOpen(false);
    setFolderRefreshMinimized(true);
  }

  function resetSiSearchState() {
    setSiSearchForm(defaultSISearchForm);
    setSiSearchResults([]);
    setSelectedSiResult(null);
    setSelectedSiDetail(null);
    setEsiInternalModules([]);
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
    if (verificationInitialFilesInputRef.current) {
      verificationInitialFilesInputRef.current.value = "";
    }
    createVerificationBatchMutation.reset();
    setActiveModal(null);
  }

  function closeRepairBatchModal() {
    setRepairBatchForm(defaultRepairBatchForm);
    if (repairInitialFilesInputRef.current) {
      repairInitialFilesInputRef.current.value = "";
    }
    createRepairBatchMutation.reset();
    setActiveModal(null);
  }

  function setFolderSelection(nextFolderId: number | null) {
    setSelectedFolderId(nextFolderId);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("objectName");
    nextSearchParams.delete("currentLocation");
    if (nextFolderId === null) {
      nextSearchParams.delete("folderId");
    } else {
      nextSearchParams.set("folderId", String(nextFolderId));
    }
    setSearchParams(nextSearchParams, { replace: true });
  }

  function clearDashboardScopeFilters() {
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete("objectName");
    nextSearchParams.delete("currentLocation");
    setSearchParams(nextSearchParams, { replace: true });
  }

  function leaveFolderWorkspace() {
    closeFolderSubscriptionModal();
    resetFolderRefreshState();
    setFolderSelection(null);
    setSelectedEquipmentIds([]);
    setEquipmentPage(1);
    setSearchQuery("");
    setStatusFilter("ALL");
    setTypeFilter("ALL");
    setExportError(null);
  }

  function openCreateFolderModal() {
    const preferredPresetId = getPreferredDeadlinePresetId(deadlinePresetsQuery.data ?? []);
    setFolderForm({
      ...defaultFolderForm,
      deadlinePresetId: preferredPresetId,
      initialDeadlinePresetId: preferredPresetId,
    });
    setActiveModal({ kind: "folder", mode: "create" });
  }

  function openEditFolderModal(folder: EquipmentFolder) {
    setFolderForm({
      name: folder.name,
      description: folder.description ?? "",
      sortOrder: folder.sortOrder,
      deadlinePresetId: folder.deadlinePresetId,
      initialDeadlinePresetId: folder.deadlinePresetId,
    });
    setActiveModal({ kind: "folder", mode: "edit", folderId: folder.id });
  }

  function openFolderSubscriptionModal() {
    if (!selectedFolderId || !canManage) {
      return;
    }
    setFolderSubscriptionModalOpen(true);
  }

  function openFolderRefreshModal() {
    if (!selectedFolderId || !canManage) {
      return;
    }
    if (folderRefreshTaskId !== null) {
      setFolderRefreshModalOpen(true);
      setFolderRefreshMinimized(false);
      return;
    }
    const nextScopeEquipmentIds = Array.from(new Set(selectedEquipmentIds));
    setFolderRefreshModalOpen(true);
    setFolderRefreshMinimized(false);
    setFolderRefreshScopeEquipmentIds(nextScopeEquipmentIds);
    setSelectedFolderRefreshRowIds([]);
    setFolderRefreshApplyResult(null);
    setFolderRefreshActionMessage(null);
    setFolderRefreshStatusFilter("ALL");
    setFolderRefreshSearchQuery("");
    startFolderRefreshMutation.reset();
    applyFolderRefreshMutation.reset();
    excludeFolderRefreshSelectionMutation.reset();
    void startFolderRefreshMutation.mutateAsync(nextScopeEquipmentIds);
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
    if (
      selectedEquipmentIds.length === 0
      || !areAllSelectedItemsSi
      || hasSelectedItemsWithActiveVerification
    ) {
      return;
    }
    const firstVariant = verificationPresetVariants[0] ?? null;
    setVerificationBatchForm({
      ...defaultVerificationBatchForm,
      batchName: "Групповая поверка",
      flowMode: getVerificationFlowModeForVariant(firstVariant) ?? "OFFSITE_WITH_DEMOLITION",
      stageTemplateVariantId: firstVariant?.id ?? "",
    });
    createVerificationBatchMutation.reset();
    setActiveModal({ kind: "verification-batch" });
  }

  function openRepairBatchModal() {
    if (selectedEquipmentIds.length === 0 || hasSelectedItemsWithActiveRepair) {
      return;
    }
    const firstVariant = repairPresetVariants[0] ?? null;
    setRepairBatchForm({
      ...defaultRepairBatchForm,
      batchName: "Групповой ремонт",
      isOnSite: firstVariant ? firstVariant.routeKind === "on_site" : false,
      stageTemplateVariantId: firstVariant?.id ?? "",
    });
    createRepairBatchMutation.reset();
    setActiveModal({ kind: "repair-batch" });
  }

  function handleEquipmentTypeChange(nextType: EquipmentType) {
    const currentType = equipmentForm.equipmentType;
    setEquipmentForm((current) => ({
      ...current,
      equipmentType: nextType,
      createdManually: isArshinEquipmentType(nextType) ? current.createdManually : false,
      excludeFromArshinRefresh: isArshinEquipmentType(nextType) ? current.excludeFromArshinRefresh : false,
      complianceDate:
        nextType === "IO" || nextType === "VO" ? current.complianceDate : "",
      complianceIntervalMonths:
        nextType === "IO" || nextType === "VO"
          ? current.complianceIntervalMonths || "12"
          : "",
      measurementRangeStart: isArshinEquipmentType(nextType) ? current.measurementRangeStart : "",
      measurementRangeEnd: isArshinEquipmentType(nextType) ? current.measurementRangeEnd : "",
      measurementUnit: isArshinEquipmentType(nextType) ? current.measurementUnit : "",
      manualCertificateNumber: isArshinEquipmentType(nextType) ? current.manualCertificateNumber : "",
      manualRegistryNumber: nextType === "ESI" ? current.manualRegistryNumber : "",
      manualVerificationDate: isArshinEquipmentType(nextType) ? current.manualVerificationDate : "",
      manualValidDate: isArshinEquipmentType(nextType) ? current.manualValidDate : "",
      manualVerificationIntervalMonths:
        nextType === "SI" ? current.manualVerificationIntervalMonths : "",
    }));
    if (nextType !== "ESI") {
      setEsiInternalModules([]);
    }

    if (
      !isArshinEquipmentType(nextType)
      || !isArshinEquipmentType(currentType)
      || currentType !== nextType
    ) {
      resetSiSearchState();
    }
  }

  function handleSelectSiResult(result: ArshinSearchResult) {
    const nextType = equipmentForm.equipmentType;
    setSelectedSiResult(result);
    setSelectedSiDetail(null);
    setEsiInternalModules([]);
    setEquipmentForm((current) => ({
      ...current,
      equipmentType: nextType,
      name: result.mitTitle ?? current.name,
      modification: result.miModification ?? "",
      serialNumber: result.miNumber ?? "",
      manufactureYear: getArshinSearchResultManufactureYear(result) ?? current.manufactureYear,
    }));
    void siDetailMutation.mutateAsync({ equipmentType: nextType, result });
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

  async function handleFolderProcessSubscriptionsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFolderId) {
      return;
    }
    await updateFolderProcessSubscriptionsMutation.mutateAsync(selectedFolderSubscriptionUserIds);
  }

  async function handleFolderRefreshApplySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFolderId || !folderRefreshTaskId || applicableSelectedFolderRefreshRowIds.length === 0) {
      return;
    }
    await applyFolderRefreshMutation.mutateAsync(applicableSelectedFolderRefreshRowIds);
  }

async function handleEquipmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFolderId || activeModal?.kind !== "equipment") {
      return;
    }
    if (
      isAutomaticArshinCreateFlow
      && (!selectedSiResult || !selectedSiDetail)
    ) {
      return;
    }
    if (isManualArshinCreateFlow && !equipmentForm.manualCertificateNumber.trim()) {
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
    if (!isArshinEquipmentType(equipmentForm.equipmentType)) {
      return;
    }

    void siSearchMutation.mutateAsync({
      documentNumber: siSearchForm.certificateNumber,
      equipmentType: equipmentForm.equipmentType,
    });
  }

  function handleInsertRepairInitialEmoji(emoji: string) {
    setRepairBatchForm((current) => ({
      ...current,
      initialMessageText: insertEmojiAtCursor(
        repairInitialMessageInputRef.current,
        current.initialMessageText,
        emoji,
      ),
    }));
  }

  function handleInsertVerificationInitialEmoji(emoji: string) {
    setVerificationBatchForm((current) => ({
      ...current,
      initialMessageText: insertEmojiAtCursor(
        verificationInitialMessageInputRef.current,
        current.initialMessageText,
        emoji,
      ),
    }));
  }

  function handleRepairInitialFilesPick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setRepairBatchForm((current) => ({
      ...current,
      files: appendPendingFiles(current.files, files),
    }));
    event.target.value = "";
  }

  function handleVerificationInitialFilesPick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setVerificationBatchForm((current) => ({
      ...current,
      files: appendPendingFiles(current.files, files),
    }));
    event.target.value = "";
  }

  function handleRemoveRepairInitialFile(file: File) {
    setRepairBatchForm((current) => ({
      ...current,
      files: removePendingFile(current.files, file),
    }));
  }

  function handleRemoveVerificationInitialFile(file: File) {
    setVerificationBatchForm((current) => ({
      ...current,
      files: removePendingFile(current.files, file),
    }));
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

  function toggleFolderRefreshRowSelection(rowId: number) {
    setSelectedFolderRefreshRowIds((current) =>
      current.includes(rowId)
        ? current.filter((value) => value !== rowId)
        : [...current, rowId],
    );
  }

  function toggleSelectAllFolderRefreshRows() {
    const filteredRowIdSet = new Set(filteredFolderRefreshRowIds);
    setSelectedFolderRefreshRowIds((current) => {
      const allFilteredSelected =
        filteredFolderRefreshRowIds.length > 0
        && filteredFolderRefreshRowIds.every((rowId) => current.includes(rowId));
      if (allFilteredSelected) {
        return current.filter((rowId) => !filteredRowIdSet.has(rowId));
      }
      return Array.from(new Set([...current, ...filteredFolderRefreshRowIds]));
    });
  }

  async function handleExcludeSelectedFolderRefreshEquipment() {
    if (!selectedFolderRefreshEquipmentIds.length) {
      return;
    }
    setFolderRefreshApplyResult(null);
    await excludeFolderRefreshSelectionMutation.mutateAsync(selectedFolderRefreshEquipmentIds);
  }

  function toggleSelectAllEquipment() {
    setSelectedEquipmentIds((current) =>
      areAllVisibleEquipmentSelected
        ? current.filter((id) => !pagedEquipmentItems.some((item) => item.id === id))
        : Array.from(new Set([...current, ...pagedEquipmentItems.map((item) => item.id)])),
    );
  }

  function handleSortColumn(key: EquipmentSortKey) {
    setSortState((current) => {
      if (!current || current.key !== key) {
        return {
          key,
          direction: getInitialSortDirection(key),
        };
      }

      return {
        key,
        direction: current.direction === "asc" ? "desc" : "asc",
      };
    });
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
                <AutocompleteInput
                  className="form-input"
                  placeholder="Название или описание папки"
                  suggestions={folderSearchSuggestions}
                  value={folderSearchQuery}
                  onChange={setFolderSearchQuery}
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
              <p className="text-base font-semibold text-ink">
                {allFolders.length > 0 ? "Все папки скрыты." : "Папок пока нет."}
              </p>
              <p className="mt-2 text-sm text-steel">
                {allFolders.length > 0
                  ? "Открой настройки и снимай скрытие у нужных папок, чтобы вернуть их в список оборудования."
                  : "Создай первую папку, чтобы собрать внутри общий список приборов."}
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
                  onClick={() => setFolderSelection(folder.id)}
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
          <div
            className={[
              "border-b border-line pb-5",
              canManage ? "folder-toolbar-grid" : "flex flex-wrap items-center gap-3",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className={canManage ? "folder-toolbar-grid__left" : "flex flex-wrap items-center gap-3"}>
              <button className={subtleButtonWithIconClass} type="button" onClick={leaveFolderWorkspace}>
                <Icon className="h-4 w-4" name="folders" />
                Все папки
              </button>
              <Link
                className={subtleButtonWithIconClass}
                title="Открыть мониторинг эталонов в выбранной папке"
                to={`/equipment/esi-monitoring?folderId=${selectedFolder.id}`}
              >
                <Icon className="h-4 w-4" name="equipment" />
                Эталоны
              </Link>
            </div>

            {canManage ? (
              <div className="folder-toolbar-grid__center">
                <button
                  className="toolbar-pill-button toolbar-pill-button--success"
                  disabled={
                    selectedEquipmentIds.length === 0
                    || !areAllSelectedItemsSi
                    || hasSelectedItemsWithActiveVerification
                  }
                  title="Отправить отмеченные приборы в поверку"
                  type="button"
                  onClick={openVerificationBatchModal}
                >
                  <Icon className="h-4 w-4" name="verification" />
                  <span>В поверку</span>
                </button>
                <button
                  className="toolbar-pill-button toolbar-pill-button--warning"
                  disabled={selectedEquipmentIds.length === 0 || hasSelectedItemsWithActiveRepair}
                  title="Отправить отмеченные приборы в ремонт"
                  type="button"
                  onClick={openRepairBatchModal}
                >
                  <Icon className="h-4 w-4" name="repairs" />
                  <span>В ремонт</span>
                </button>
                <button
                  aria-label={
                    selectedEquipmentIds.length > 0
                      ? `Проверить отмеченные приборы (${selectedEquipmentIds.length}) на обновления в Аршине`
                      : "Проверить СИ и ЭСИ выбранной папки на обновления в Аршине"
                  }
                  className="toolbar-pill-button toolbar-pill-button--accent"
                  disabled={startFolderRefreshMutation.isPending}
                  title={
                    selectedEquipmentIds.length > 0
                      ? `Проверить только отмеченные приборы (${selectedEquipmentIds.length})`
                      : "Проверить СИ и ЭСИ выбранной папки на обновления в Аршине"
                  }
                  type="button"
                  onClick={openFolderRefreshModal}
                >
                  <Icon
                    className={startFolderRefreshMutation.isPending ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                    name="refresh"
                  />
                  <span>{selectedEquipmentIds.length > 0 ? `Обновить СИ (${selectedEquipmentIds.length})` : "Обновить СИ"}</span>
                </button>
              </div>
            ) : null}

            {canManage ? (
              <div className="folder-toolbar-grid__right">
                <div className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-3.5 text-sm text-steel">
                  <span>Выбрано:</span>
                  <span className="font-semibold text-ink">{selectedEquipmentIds.length}</span>
                </div>
                <IconActionButton
                  className="icon-action-button--info h-10 w-10"
                  icon={<Icon className="h-4 w-4" name="message" />}
                  label="Настроить сообщения по папке"
                  onClick={openFolderSubscriptionModal}
                />
                <IconActionButton
                  className="icon-action-button--accent h-10 w-10 disabled:opacity-60"
                  disabled={exportEquipmentMutation.isPending}
                  icon={
                    exportEquipmentMutation.isPending ? (
                      <span className="text-sm leading-none">…</span>
                    ) : (
                      <Icon className="h-4 w-4" name="download" />
                    )
                  }
                  label={
                    selectedEquipmentIds.length > 0
                      ? "Экспортировать отмеченные приборы в Excel"
                      : "Экспортировать текущий список в Excel"
                  }
                  onClick={() => void handleExportEquipment()}
                />
                <IconActionButton
                  className="icon-action-button--accent h-10 w-10"
                  icon={<Icon className="h-4 w-4" name="upload" />}
                  label="Импорт СИ из Excel"
                  onClick={openSIImportModal}
                />
                <IconActionButton
                  className="icon-action-button--success h-10 w-10"
                  icon={<Icon className="h-4 w-4" name="plus" />}
                  label="Добавить прибор"
                  onClick={openCreateEquipmentModal}
                />
                <IconActionButton
                  className="icon-action-button--danger h-10 w-10 disabled:opacity-60"
                  disabled={selectedEquipmentIds.length === 0}
                  icon={<Icon className="h-4 w-4" name="delete" />}
                  label="Удалить отмеченные приборы"
                  onClick={() =>
                    setDeleteTarget({
                      kind: "equipment-batch",
                      ids: selectedEquipmentIds,
                      title: "Удалить отмеченные приборы",
                      message: `Удалить отмеченные приборы (${selectedEquipmentIds.length})?`,
                    })
                  }
                />
              </div>
            ) : null}
          </div>

          <section className="space-y-4">
            {dashboardObjectNameFilter || dashboardCurrentLocationFilter ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-line bg-[var(--accent-soft)]/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-ink">
                  <span className="font-medium">Открыто из панели:</span>{" "}
                  {[
                    dashboardObjectNameFilter ? `объект ${dashboardObjectNameFilter}` : null,
                    dashboardCurrentLocationFilter
                      ? `местонахождение ${dashboardCurrentLocationFilter}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
                <button className={subtleButtonClass} type="button" onClick={clearDashboardScopeFilters}>
                  Снять ограничение
                </button>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-3">
                <label className="block text-sm text-steel">
                  Поиск
                  <AutocompleteInput
                    className="form-input"
                    placeholder="Наименование, объект, серийный номер, местонахождение"
                    suggestions={equipmentSearchSuggestions}
                    value={searchQuery}
                    onChange={setSearchQuery}
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
                        {equipmentTypeSelectionLabels[type]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

            {isEquipmentLoading ? <p className="text-sm text-steel">Загружаем оборудование...</p> : null}
            {equipmentError ? (
              <p className="text-sm text-[#b04c43]">
                {equipmentError instanceof Error
                  ? equipmentError.message
                  : "Не удалось загрузить оборудование."}
              </p>
            ) : null}
            {exportError ? (
              <p className="text-sm text-[#b04c43]">{exportError}</p>
            ) : null}

            {!isEquipmentLoading && !equipmentTotalCount ? (
              <div className="tone-parent rounded-3xl border border-dashed border-line px-5 py-10 text-center">
                <p className="text-base font-semibold text-ink">Под текущие фильтры приборы не найдены.</p>
                <p className="mt-2 text-sm text-steel">
                  Измени фильтры или добавь первый прибор в выбранную папку.
                </p>
              </div>
            ) : null}

            {equipmentTotalCount ? (
              <div className="tone-parent overflow-hidden rounded-3xl border border-line shadow-panel">
                {equipmentTotalCount > equipmentPageSize ? (
                  <div className="border-b border-line px-4 py-3">
                    <PaginationControls
                      currentPage={equipmentPage}
                      pageSize={equipmentPageSize}
                      totalItems={equipmentTotalCount}
                      onPageChange={setEquipmentPage}
                    />
                  </div>
                ) : null}
                <div className="overflow-x-auto">
                <table className="min-w-[1480px] w-full table-auto">
                  <thead>
                    <tr className="tone-child text-left text-xs uppercase tracking-[0.16em] text-steel">
                      {canManage ? (
                        <th className="w-10 px-3 py-2">
                          <input
                            checked={areAllVisibleEquipmentSelected}
                            className="h-4 w-4 accent-[var(--accent)]"
                            onChange={toggleSelectAllEquipment}
                            type="checkbox"
                          />
                        </th>
                      ) : null}
                      <SortableTableHeader
                        activeSort={sortState}
                        label="Прибор"
                        sortKey="name"
                        onSort={handleSortColumn}
                        className="w-[320px]"
                      />
                      <SortableTableHeader
                        activeSort={sortState}
                        label="Категория"
                        sortKey="equipmentType"
                        onSort={handleSortColumn}
                        className="w-[120px]"
                      />
                      <SortableTableHeader
                        activeSort={sortState}
                        label="Статус"
                        sortKey="status"
                        onSort={handleSortColumn}
                        className="w-[160px]"
                      />
                      <SortableTableHeader
                        activeSort={sortState}
                        label="Серийный"
                        sortKey="serialNumber"
                        onSort={handleSortColumn}
                        className="w-[150px]"
                      />
                      <SortableTableHeader
                        activeSort={sortState}
                        label="Год выпуска"
                        sortKey="manufactureYear"
                        onSort={handleSortColumn}
                        className="w-[128px]"
                      />
                      <SortableTableHeader
                        activeSort={sortState}
                        label="Объект"
                        sortKey="objectName"
                        onSort={handleSortColumn}
                        className="w-[180px]"
                      />
                      <SortableTableHeader
                        activeSort={sortState}
                        label="Местонахождение"
                        sortKey="currentLocationManual"
                        onSort={handleSortColumn}
                        className="w-[190px]"
                      />
                      <SortableTableHeader
                        activeSort={sortState}
                        label="Действителен с"
                        sortKey="validFrom"
                        onSort={handleSortColumn}
                        className="w-[142px]"
                      />
                      <SortableTableHeader
                        activeSort={sortState}
                        label="Действителен по"
                        sortKey="validTo"
                        onSort={handleSortColumn}
                        className="w-[142px]"
                      />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedEquipmentItems.map((item, index) => (
                      <EquipmentRow
                        key={item.id}
                        item={item}
                        canManage={canManage}
                        isSelected={selectedEquipmentIds.includes(item.id)}
                        onToggleSelected={() => toggleEquipmentSelection(item.id)}
                        rowIndex={(equipmentPage - 1) * equipmentPageSize + index}
                      />
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            ) : null}
          </section>
        </section>
      ) : null}

      <Modal
        description={
          activeModal?.kind === "folder" && activeModal.mode === "edit"
            ? "Измени название, описание и пресет дедлайнов папки."
            : "Например лаборатория, участок или другая логическая область учета с выбранным пресетом дедлайнов."
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
            Пресет дедлайнов
            <select
              className="form-input"
              value={folderForm.deadlinePresetId ?? ""}
              onChange={(event) =>
                setFolderForm((current) => ({
                  ...current,
                  deadlinePresetId: event.target.value ? Number(event.target.value) : null,
                }))
              }
            >
              {!folderDeadlinePresetOptions.length ? (
                <option value="">
                  {deadlinePresetsQuery.isLoading
                    ? "Загружаем пресеты..."
                    : "Нет доступных пресетов"}
                </option>
              ) : null}
              {folderDeadlinePresetOptions.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                  {preset.isActive ? "" : " (неактивен)"}
                </option>
              ))}
            </select>
          </label>
          {deadlinePresetsQuery.isError ? (
            <p className="text-sm text-[#b04c43]">
              {deadlinePresetsQuery.error instanceof Error
                ? deadlinePresetsQuery.error.message
                : "Не удалось загрузить пресеты дедлайнов."}
            </p>
          ) : null}
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
              disabled={
                createFolderMutation.isPending
                || updateFolderMutation.isPending
                || deadlinePresetsQuery.isLoading
                || folderForm.deadlinePresetId === null
              }
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

      {shouldShowMinimizedFolderRefresh ? (
        <aside className="tone-parent fixed bottom-4 right-4 z-40 w-[min(26rem,calc(100vw-2rem))] rounded-[24px] border border-line p-4 shadow-panel">
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">Обновление СИ</p>
                <p className="mt-1 text-xs text-steel">
                  {selectedFolder ? `Папка: ${selectedFolder.name} • ${folderRefreshScopeLabel}` : "Выбранная папка"}
                </p>
              </div>
              <button
                className={`${subtleButtonClass} btn-sm shrink-0`}
                type="button"
                onClick={openFolderRefreshModal}
              >
                Открыть
              </button>
            </div>

            <div className="tone-child rounded-2xl border border-line px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-ink">
                    Статус: {getFolderRefreshTaskStatusLabel(folderRefreshTask.status)}
                  </div>
                  <div className="mt-1 text-xs text-steel">
                    {folderRefreshTask.totalRows > 0
                      ? `Обработано ${folderRefreshTask.processedRows} из ${folderRefreshTask.totalRows}.`
                      : "Подготавливаем список приборов для проверки."}
                  </div>
                </div>
                <div className="text-sm font-semibold text-ink">{folderRefreshTask.progress}%</div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--accent-soft)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all"
                  style={{ width: `${folderRefreshTask.progress}%` }}
                />
              </div>
            </div>

            {folderRefreshTask.summary ? (
              <div className="flex flex-wrap gap-2">
                {[
                  ["Обновить", folderRefreshTask.summary.updated ?? 0],
                  ["Обновить?", folderRefreshTask.summary.updatedUncertain ?? 0],
                  ["Без изменений", folderRefreshTask.summary.unchanged ?? 0],
                  ["Не найдено", folderRefreshTask.summary.notFound ?? 0],
                  ["Ошибки", folderRefreshTask.summary.error ?? 0],
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

            {folderRefreshTask.errorMessage ? (
              <p className="text-sm text-[#b04c43]">{folderRefreshTask.errorMessage}</p>
            ) : null}

            {!isFolderRefreshProcessing ? (
              <div className="flex justify-end">
                <button className={`${subtleButtonClass} btn-sm`} type="button" onClick={resetFolderRefreshState}>
                  Убрать
                </button>
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}

      <Modal
        description={
          selectedFolder
            ? `Отметь сотрудников, которые будут получать письма по изменениям внутри папки «${selectedFolder.name}».`
            : "Выбери папку."
        }
        footer={
          <div className="flex items-center justify-end gap-3">
            <button className={subtleButtonClass} type="button" onClick={closeFolderSubscriptionModal}>
              Закрыть
            </button>
            <button
              className="btn-primary disabled:opacity-60"
              disabled={updateFolderProcessSubscriptionsMutation.isPending || !selectedFolderId}
              form="folder-process-subscriptions-form"
              type="submit"
            >
              {updateFolderProcessSubscriptionsMutation.isPending ? "…" : "Сохранить"}
            </button>
          </div>
        }
        open={folderSubscriptionModalOpen}
        size="sm"
        title="Рассылка по папке"
        onClose={closeFolderSubscriptionModal}
      >
        <form
          id="folder-process-subscriptions-form"
          className="space-y-4"
          onSubmit={(event) => void handleFolderProcessSubscriptionsSubmit(event)}
        >
          {folderProcessSubscriptionsQuery.isLoading ? (
            <p className="text-sm text-steel">Загружаю список сотрудников…</p>
          ) : folderProcessSubscriptionsQuery.isError ? (
            <p className="text-sm text-[#b04c43]">
              {getMutationErrorMessage(
                folderProcessSubscriptionsQuery.error,
                "Не удалось загрузить настройки рассылки.",
              )}
            </p>
          ) : folderProcessSubscriptionsQuery.data?.users.length ? (
            <div className="space-y-3">
              <label className="block text-sm text-steel">
                Поиск сотрудника
                <input
                  className="form-input"
                  type="text"
                  placeholder={userSearchPlaceholder}
                  value={folderSubscriptionUserSearchQuery}
                  onChange={(event) => setFolderSubscriptionUserSearchQuery(event.target.value)}
                />
              </label>
              {!filteredFolderSubscriptionUsers.length ? (
                <p className="text-sm text-steel">По этому запросу сотрудники не найдены.</p>
              ) : null}
              {filteredFolderSubscriptionUsers.map((userItem) => {
                const checked = selectedFolderSubscriptionUserIds.includes(userItem.userId);
                const extraInfo = buildUserExtraInfo(userItem);
                return (
                  <label
                    key={userItem.userId}
                    className="tone-child flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm"
                  >
                    <input
                      checked={checked}
                      className="mt-1 h-4 w-4 accent-[var(--accent)]"
                      type="checkbox"
                      onChange={(event) =>
                        setSelectedFolderSubscriptionUserIds((current) =>
                          event.target.checked
                            ? [...current, userItem.userId].filter((value, index, source) => source.indexOf(value) === index)
                            : current.filter((value) => value !== userItem.userId),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{userItem.displayName}</span>
                      <span className="mt-1 block text-xs text-steel">
                        {roleLabels[userItem.role]} · {userItem.email}
                      </span>
                      {extraInfo ? (
                        <span className="mt-1 block text-xs text-steel">{extraInfo}</span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-steel">Для этой папки пока нет доступных сотрудников.</p>
          )}
          {updateFolderProcessSubscriptionsMutation.isError ? (
            <p className="text-sm text-[#b04c43]">
              {getMutationErrorMessage(
                updateFolderProcessSubscriptionsMutation.error,
                "Не удалось сохранить настройки рассылки.",
              )}
            </p>
          ) : null}
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
            <AutocompleteInput
              className="form-input"
              suggestions={existingObjectNames}
              value={siImportForm.objectName}
              onChange={(value) => setSiImportForm((current) => ({ ...current, objectName: value }))}
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
              <AutocompleteInput
                className="form-input"
                suggestions={existingLocations}
                value={siImportForm.currentLocationManual}
                onChange={(value) =>
                  setSiImportForm((current) => ({
                    ...current,
                    currentLocationManual: value,
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
                  file: Array.from(event.target.files ?? [])[0] ?? null,
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
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    {equipmentForm.createdManually
                      ? (
                          equipmentForm.equipmentType === "ESI"
                            ? "Ручное создание ЭСИ"
                            : "Ручное создание СИ"
                        )
                      : (
                          equipmentForm.equipmentType === "ESI"
                            ? "Поиск ЭСИ в Аршине"
                            : "Поиск СИ в Аршине"
                        )}
                  </h3>
                  <p className="mt-1 text-xs text-steel">
                    {equipmentForm.createdManually
                      ? "Используй этот режим, если Аршин временно недоступен. После будущего обновления по папке система сможет сопоставить запись с Аршином и снять пометку ручного добавления."
                      : (
                          equipmentForm.equipmentType === "ESI"
                            ? "Для `ЭСИ` создание идет через номер свидетельства. После выбора записи система подтянет детальную эталонную карточку."
                            : "Для `SI` создание идет через номер свидетельства. После выбора записи система подтянет детальные сведения по `vri_id`."
                        )}
                  </p>
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink">
                  <input
                    checked={equipmentForm.createdManually}
                    className="h-4 w-4 accent-[var(--accent)]"
                    type="checkbox"
                    onChange={(event) => {
                      const nextValue = event.target.checked;
                      setEquipmentForm((current) => ({
                        ...current,
                        createdManually: nextValue,
                        excludeFromArshinRefresh: nextValue ? current.excludeFromArshinRefresh : false,
                      }));
                      resetSiSearchState();
                    }}
                  />
                  <span>Вручную</span>
                </label>
              </div>

              {!equipmentForm.createdManually ? (
                <>
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                    <label className="block text-sm text-steel">
                      Номер свидетельства
                      <input
                        className="form-input"
                        placeholder={
                          equipmentForm.equipmentType === "ESI"
                            ? "Например С-ВЯ/05-02-2026/503716225"
                            : "Например С-АСГ/07-03-2026/509468383"
                        }
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
                        aria-label={
                          equipmentForm.equipmentType === "ESI" ? "Найти ЭСИ в Аршине" : "Найти СИ в Аршине"
                        }
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
                      {getArshinErrorMessage(
                        siSearchMutation.error,
                        "Не удалось выполнить поиск по Аршину.",
                      )}
                    </p>
                  ) : null}

                  {siSearchMutation.isSuccess && siSearchResults.length === 0 ? (
                    <p className="text-sm text-steel">
                      {equipmentForm.equipmentType === "ESI"
                        ? "По этому свидетельству ЭСИ не найдены."
                        : "По этому свидетельству записи не найдены."}
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
                                  {result.mitTitle
                                    ?? (equipmentForm.equipmentType === "ESI"
                                      ? "ЭСИ без наименования"
                                      : "СИ без наименования")}
                                </div>
                                <div className="mt-1 text-xs text-steel">
                                  {[
                                    result.mitNotation || "без обозначения",
                                    result.miModification || "без модификации",
                                    result.miNumber || "без заводского номера",
                                    equipmentForm.equipmentType === "ESI"
                                      ? (extractArshinResultCertificateNumber(result) || "без свидетельства")
                                      : (
                                          result.resultDocnum
                                          || "без свидетельства"
                                        ),
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

                  {selectedSiResult && siDetailMutation.isPending ? (
                    <p className="text-sm text-steel">
                      {equipmentForm.equipmentType === "ESI"
                        ? "Загружаем детальные сведения ЭСИ..."
                        : "Загружаем детальные сведения по `vri_id`..."}
                    </p>
                  ) : null}
                  {selectedSiResult && siDetailMutation.isError ? (
                    <p className="text-sm text-[#b04c43]">
                      {getArshinErrorMessage(
                        siDetailMutation.error,
                        equipmentForm.equipmentType === "ESI"
                          ? "Не удалось загрузить детальные сведения ЭСИ."
                          : "Не удалось загрузить детальные сведения СИ.",
                      )}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <div className="rounded-2xl border border-dashed border-line px-4 py-3 text-sm text-steel">
                    Запись будет создана как ручная. Когда Аршин снова станет доступен, папочное обновление или ручное обновление карточки сможет привязать её к записи Аршина.
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {equipmentForm.equipmentType === "ESI" ? (
                      <label className="block text-sm text-steel">
                        Номер в перечне
                        <input
                          className="form-input"
                          type="text"
                          value={equipmentForm.manualRegistryNumber}
                          onChange={(event) =>
                            setEquipmentForm((current) => ({
                              ...current,
                              manualRegistryNumber: event.target.value,
                            }))
                          }
                        />
                      </label>
                    ) : null}
                    <label className="block text-sm text-steel">
                      Номер свидетельства
                      <input
                        className="form-input"
                        required
                        type="text"
                        value={equipmentForm.manualCertificateNumber}
                        onChange={(event) =>
                          setEquipmentForm((current) => ({
                            ...current,
                            manualCertificateNumber: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="block text-sm text-steel">
                      Дата поверки
                      <DateInput
                        className="form-input form-input--compact"
                        value={equipmentForm.manualVerificationDate}
                        onChange={(value) =>
                          setEquipmentForm((current) => ({
                            ...current,
                            manualVerificationDate: value,
                          }))
                        }
                      />
                    </label>
                    {equipmentForm.equipmentType === "SI" ? (
                      <label className="flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink md:col-span-2">
                        <input
                          checked={Boolean(equipmentForm.manualVerificationIntervalMonths)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                          type="checkbox"
                          onChange={(event) =>
                            setEquipmentForm((current) => ({
                              ...current,
                              manualVerificationIntervalMonths: event.target.checked
                                ? (current.manualVerificationIntervalMonths || "12")
                                : "",
                            }))
                          }
                        />
                        <span>
                          <span className="block font-medium">Межповерочный интервал вручную</span>
                          <span className="mt-1 block text-xs text-steel">
                            Следующая поверка будет считаться от даты поверки как период минус 1 день.
                          </span>
                        </span>
                      </label>
                    ) : null}
                    {equipmentForm.equipmentType === "SI" && equipmentForm.manualVerificationIntervalMonths ? (
                      <label className="block text-sm text-steel md:col-span-2">
                        Межповерочный интервал
                        <select
                          className="form-input"
                          value={equipmentForm.manualVerificationIntervalMonths}
                          onChange={(event) =>
                            setEquipmentForm((current) => ({
                              ...current,
                              manualVerificationIntervalMonths: event.target.value,
                            }))
                          }
                        >
                          {complianceIntervalOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="block text-sm text-steel">
                        Действительно до
                        <DateInput
                          className="form-input form-input--compact"
                          value={equipmentForm.manualValidDate}
                          onChange={(value) =>
                            setEquipmentForm((current) => ({
                              ...current,
                              manualValidDate: value,
                            }))
                          }
                        />
                      </label>
                    )}
                  </div>
                  <label className="flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink">
                    <input
                      checked={equipmentForm.excludeFromArshinRefresh}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                      type="checkbox"
                      onChange={(event) =>
                        setEquipmentForm((current) => ({
                          ...current,
                          excludeFromArshinRefresh: event.target.checked,
                        }))
                      }
                    />
                    <span>
                      <span className="block font-medium">Исключить из проверки свидетельств в Аршине</span>
                      <span className="mt-1 block text-xs text-steel">
                        Используй это для ручных записей, которые заведомо не найдутся в Аршине и не должны засорять отчёт обновления по папке.
                      </span>
                    </span>
                  </label>
                </>
              )}
            </section>
          ) : null}
          {equipmentForm.equipmentType === "SI" && !equipmentForm.createdManually ? (
            <section className="space-y-3 rounded-3xl border border-line bg-[var(--surface)] p-4">
              <label className="flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink">
                <input
                  checked={Boolean(equipmentForm.manualVerificationIntervalMonths)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                  type="checkbox"
                  onChange={(event) =>
                    setEquipmentForm((current) => ({
                      ...current,
                      manualVerificationIntervalMonths: event.target.checked
                        ? (current.manualVerificationIntervalMonths || "12")
                        : "",
                    }))
                  }
                />
                <span>
                  <span className="block font-medium">Межповерочный интервал вручную</span>
                  <span className="mt-1 block text-xs text-steel">
                    Следующая поверка будет считаться от даты поверки как период минус 1 день.
                  </span>
                </span>
              </label>
              {equipmentForm.manualVerificationIntervalMonths ? (
                <label className="block text-sm text-steel">
                  Межповерочный интервал
                  <select
                    className="form-input"
                    value={equipmentForm.manualVerificationIntervalMonths}
                    onChange={(event) =>
                      setEquipmentForm((current) => ({
                        ...current,
                        manualVerificationIntervalMonths: event.target.value,
                      }))
                    }
                  >
                    {complianceIntervalOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </section>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm text-steel">
              Категория
              <select
                className="form-input"
                disabled={!canEditEquipmentTypeInModal}
                value={equipmentForm.equipmentType}
                onChange={(event) => handleEquipmentTypeChange(event.target.value as EquipmentType)}
                >
                  {editableEquipmentTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {equipmentTypeSelectionLabels[type]}
                    </option>
                  ))}
                </select>
            </label>
            {isEquipmentEditFlow ? (
              <p className="text-xs text-steel md:col-span-2">
                {canEditEquipmentTypeInModal
                  ? "Для импортированных приборов можно менять категорию только из Др. в СИ, ИО или ВО."
                  : "Категорию этого прибора после создания менять нельзя."}
              </p>
            ) : null}
            <label className="block text-sm text-steel">
              Объект
              <AutocompleteInput
                className="form-input"
                suggestions={existingObjectNames}
                value={equipmentForm.objectName}
                onChange={(value) =>
                  setEquipmentForm((current) => ({ ...current, objectName: value }))
                }
              />
            </label>
            <label className="block text-sm text-steel">
              Наименование
              <input
                className="form-input"
                type="text"
                value={equipmentForm.name}
                readOnly={isAutomaticArshinCreateFlow}
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
                readOnly={isAutomaticArshinCreateFlow}
                onChange={(event) =>
                  setEquipmentForm((current) => ({ ...current, modification: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-steel">
              Заводской номер
              <input
                className="form-input"
                type="text"
                value={equipmentForm.serialNumber}
                readOnly={isAutomaticArshinCreateFlow}
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
          {equipmentForm.equipmentType === "SI" ? (
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(180px,0.8fr)]">
              <label className="block text-sm text-steel">
                Диапазон измерения от
                <input
                  className="form-input"
                  type="text"
                  value={equipmentForm.measurementRangeStart}
                  onChange={(event) =>
                    setEquipmentForm((current) => ({
                      ...current,
                      measurementRangeStart: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-sm text-steel">
                Диапазон измерения до
                <input
                  className="form-input"
                  type="text"
                  value={equipmentForm.measurementRangeEnd}
                  onChange={(event) =>
                    setEquipmentForm((current) => ({
                      ...current,
                      measurementRangeEnd: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-sm text-steel">
                Единица измерения
                <AutocompleteInput
                  className="form-input"
                  suggestions={existingMeasurementUnits}
                  value={equipmentForm.measurementUnit}
                  onChange={(value) =>
                    setEquipmentForm((current) => ({
                      ...current,
                      measurementUnit: value,
                    }))
                  }
                />
              </label>
            </div>
          ) : null}
          {isEsiCreateFlow && selectedSiDetail ? (
            <section className="tone-parent space-y-3 rounded-3xl border border-line p-4">
              <div>
                <h3 className="text-sm font-semibold text-ink">Внутренние модули ЭСИ</h3>
                <p className="mt-1 text-xs text-steel">
                  Для каждого найденного внутреннего модуля укажи предел измерения одной строкой.
                </p>
              </div>
              {esiInternalModules.length ? (
                <div className="space-y-3">
                  {esiInternalModules.map((module, index) => (
                    <article
                      key={`${module.registryNumber}-${index}`}
                      className="rounded-2xl border border-line px-4 py-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-ink">
                            {module.title ?? "Модуль ЭСИ"}
                            {module.selected ? " · основной" : ""}
                          </div>
                          <div className="mt-1 text-xs text-steel">
                            {[
                              module.registryNumber,
                              module.rank,
                              module.modification,
                              module.serialNumber,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                          <div className="mt-1 text-xs text-steel">
                            {[module.verificationDate, module.validUntil, module.certificateNumber]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                        <label className="block min-w-[280px] text-sm text-steel">
                          Предел измерения
                          <input
                            className="form-input"
                            type="text"
                            value={module.measurementLimit}
                            onChange={(event) =>
                              setEsiInternalModules((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? { ...item, measurementLimit: event.target.value }
                                    : item,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-steel">
                  В детальной карточке Аршина пока не нашлись внутренние модули.
                </p>
              )}
            </section>
          ) : null}
          {(equipmentForm.equipmentType === "IO" || equipmentForm.equipmentType === "VO") ? (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm text-steel">
                {getEquipmentComplianceDateLabel(equipmentForm.equipmentType)}
                <DateInput
                  className="form-input form-input--compact"
                  value={equipmentForm.complianceDate || null}
                  onChange={(value) =>
                    setEquipmentForm((current) => ({
                      ...current,
                      complianceDate: value,
                    }))
                  }
                />
              </label>
              <label className="block text-sm text-steel">
                {getEquipmentCompliancePeriodLabel(equipmentForm.equipmentType)}
                <select
                  className="form-input"
                  value={equipmentForm.complianceIntervalMonths}
                  onChange={(event) =>
                    setEquipmentForm((current) => ({
                      ...current,
                      complianceIntervalMonths: event.target.value,
                    }))
                  }
                >
                  {complianceIntervalOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
          <label className="block text-sm text-steel">
            Текущее местоположение
            <AutocompleteInput
              className="form-input"
              suggestions={existingLocations}
              value={equipmentForm.currentLocationManual}
              onChange={(value) =>
                setEquipmentForm((current) => ({
                  ...current,
                  currentLocationManual: value,
                }))
              }
            />
          </label>
          {(createEquipmentMutation.isError || updateEquipmentMutation.isError) ? (
            <p className="text-sm text-[#b04c43]">
              {getMutationErrorMessage(createEquipmentMutation.error ?? updateEquipmentMutation.error, "Не удалось сохранить прибор.")}
            </p>
          ) : null}
          {isAutomaticArshinCreateFlow && !selectedSiResult ? (
            <p className="text-sm text-steel">
              Для создания `{equipmentForm.equipmentType}` сначала выбери запись из поиска Аршина.
            </p>
          ) : null}
          {isAutomaticArshinCreateFlow && equipmentForm.equipmentType === "SI" && selectedSiResult && !selectedSiDetail ? (
            <p className="text-sm text-steel">
              Создание станет доступно после загрузки детальных данных по выбранной записи.
            </p>
          ) : null}
          {isAutomaticArshinCreateFlow && equipmentForm.equipmentType === "ESI" && selectedSiResult && !selectedSiDetail ? (
            <p className="text-sm text-steel">
              Создание станет доступно после загрузки детальной карточки ЭСИ.
            </p>
          ) : null}
          {isManualArshinCreateFlow && !equipmentForm.manualCertificateNumber.trim() ? (
            <p className="text-sm text-steel">
              Для ручного создания укажи номер свидетельства.
            </p>
          ) : null}
          {isEsiCreateFlow && selectedSiDetail && !esiInternalModulesReady ? (
            <p className="text-sm text-steel">
              Для создания ЭСИ заполни предел измерения у каждого внутреннего модуля.
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
                (
                  isAutomaticArshinCreateFlow
                  && (
                    !selectedSiResult
                    || !selectedSiDetail
                  )
                )
                || (isManualArshinCreateFlow && !equipmentForm.manualCertificateNumber.trim())
                || (isEsiCreateFlow && !esiInternalModulesReady)
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
          {selectedEquipmentIds.length > 1 ? (
            <label className="block text-sm text-steel">
              Название группы
              <AutocompleteInput
                className="form-input"
                suggestions={existingProcessBatchNames}
                value={repairBatchForm.batchName}
                onChange={(value) =>
                  setRepairBatchForm((current) => ({
                    ...current,
                    batchName: value,
                  }))
                }
              />
            </label>
          ) : null}
          {repairPresetVariants.length ? (
            <ProcessVariantSelector
              selectedVariantId={repairBatchForm.stageTemplateVariantId}
              variants={repairPresetVariants}
              onSelect={(variant) =>
                setRepairBatchForm((current) => ({
                  ...current,
                  stageTemplateVariantId: variant.id,
                  isOnSite: variant.routeKind === "on_site",
                }))
              }
            />
          ) : hasRepairPresetVariantConfig ? (
            <ProcessVariantSelector
              emptyMessage="В выбранном пресете пока нет вариантов ремонта. Добавь вариант в настройках, чтобы выбирать готовый сценарий здесь."
              selectedVariantId=""
              variants={[]}
              onSelect={() => undefined}
            />
          ) : (
            <div className="space-y-2">
              <span className="block text-sm text-steel">Формат</span>
              <div className="inline-flex rounded-2xl border border-line p-1">
                <button
                  className={getProcessFormatButtonClass(!repairBatchForm.isOnSite)}
                  onClick={() =>
                    setRepairBatchForm((current) => ({
                      ...current,
                      isOnSite: false,
                    }))
                  }
                  type="button"
                >
                  Отправка
                </button>
                <button
                  className={getProcessFormatButtonClass(repairBatchForm.isOnSite)}
                  onClick={() =>
                    setRepairBatchForm((current) => ({
                      ...current,
                      isOnSite: true,
                    }))
                  }
                  type="button"
                >
                  На месте
                </button>
              </div>
            </div>
          )}
          {effectiveRepairIsOnSite ? (
            <div className="tone-parent rounded-2xl border border-line px-4 py-3 text-sm text-steel">
              Ремонт будет оформлен как работа на объекте, без маршрута отправки.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm text-steel">
                Откуда
                <AutocompleteInput
                  className="form-input"
                  suggestions={existingRouteCities}
                  value={repairBatchForm.routeCity}
                  onChange={(value) =>
                    setRepairBatchForm((current) => ({ ...current, routeCity: value }))
                  }
                />
              </label>
              <label className="block text-sm text-steel">
                Куда
                <AutocompleteInput
                  className="form-input"
                  suggestions={existingRouteDestinations}
                  value={repairBatchForm.routeDestination}
                  onChange={(value) =>
                    setRepairBatchForm((current) => ({
                      ...current,
                      routeDestination: value,
                    }))
                  }
                />
              </label>
            </div>
          )}
          <label className="block text-sm text-steel">
            {selectedRepairPresetVariant?.stages[0]?.label || "Демонтаж / подготовка к ремонту"}
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
            <AutocompleteTextarea
              ref={repairInitialMessageInputRef}
              className="form-input min-h-[92px] resize-none py-3"
              suggestions={processTextSuggestions}
              placeholder="Например: партия приборов упакована и отправлена в ремонт."
              value={repairBatchForm.initialMessageText}
              onChange={(value) =>
                setRepairBatchForm((current) => ({
                  ...current,
                  initialMessageText: value,
                }))
              }
            />
          </label>
          <input
            ref={repairInitialFilesInputRef}
            className="sr-only"
            multiple
            type="file"
            onChange={handleRepairInitialFilesPick}
          />
          <PendingAttachmentList
            files={repairBatchForm.files}
            onRemove={handleRemoveRepairInitialFile}
          />
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
          <div className="flex justify-end gap-2">
            <PrivateNoteToggleButton
              active={repairBatchForm.initialMessageIsPrivate}
              disabled={createRepairBatchMutation.isPending}
              onClick={() =>
                setRepairBatchForm((current) => ({
                  ...current,
                  initialMessageIsPrivate: !current.initialMessageIsPrivate,
                }))
              }
            />
            <EmojiPickerButton
              disabled={createRepairBatchMutation.isPending}
              onPick={handleInsertRepairInitialEmoji}
            />
            <IconActionButton
              className="h-10 w-10"
              disabled={createRepairBatchMutation.isPending}
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.25 20.25a6 6 0 0 1-8.49-8.49l9.9-9.9a4.5 4.5 0 1 1 6.36 6.36l-9.2 9.19a3 3 0 0 1-4.24-4.24l8.49-8.49" />
                </svg>
              }
              label="Прикрепить файлы к первому сообщению ремонта"
              onClick={() => openFilePicker(repairInitialFilesInputRef.current)}
            />
            <button
              aria-label={selectedEquipmentIds.length === 1 ? "Подтвердить отправку в ремонт" : "Подтвердить массовую отправку в ремонт"}
              className="btn-primary disabled:opacity-60"
              disabled={
                createRepairBatchMutation.isPending
                || selectedEquipmentIds.length === 0
                || (selectedEquipmentIds.length > 1 && !repairBatchForm.batchName.trim())
                || (hasRepairPresetVariantConfig && !repairPresetVariants.length)
                || (!effectiveRepairIsOnSite && !repairBatchForm.routeCity.trim())
                || (!effectiveRepairIsOnSite && !repairBatchForm.routeDestination.trim())
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
            ? "Будет создана одна активная поверка для выбранного СИ или ЭСИ."
            : "Групповая поверка создаст отдельные активные записи для выбранных СИ и ЭСИ и объединит их общим названием группы."
        }
        open={activeModal?.kind === "verification-batch"}
        title={selectedEquipmentIds.length === 1 ? "Отправить в поверку" : "Групповая поверка"}
        onClose={closeVerificationBatchModal}
      >
        <form className="space-y-4" onSubmit={(event) => void handleVerificationBatchSubmit(event)}>
          {selectedEquipmentIds.length > 1 ? (
            <label className="block text-sm text-steel">
              Название группы
              <AutocompleteInput
                className="form-input"
                suggestions={existingProcessBatchNames}
                value={verificationBatchForm.batchName}
                onChange={(value) =>
                  setVerificationBatchForm((current) => ({ ...current, batchName: value }))
                }
              />
            </label>
          ) : null}
          {verificationPresetVariants.length ? (
            <ProcessVariantSelector
              selectedVariantId={verificationBatchForm.stageTemplateVariantId}
              variants={verificationPresetVariants}
              onSelect={(variant) =>
                setVerificationBatchForm((current) => ({
                  ...current,
                  stageTemplateVariantId: variant.id,
                  flowMode: getVerificationFlowModeForVariant(variant) ?? current.flowMode,
                }))
              }
            />
          ) : hasVerificationPresetVariantConfig ? (
            <ProcessVariantSelector
              emptyMessage="В выбранном пресете пока нет вариантов поверки. Добавь вариант в настройках, чтобы выбирать готовый сценарий здесь."
              selectedVariantId=""
              variants={[]}
              onSelect={() => undefined}
            />
          ) : (
            <div className="space-y-2">
              <span className="block text-sm text-steel">Формат</span>
              <div className="inline-flex rounded-2xl border border-line p-1">
                <button
                  className={getProcessFormatButtonClass(
                    verificationBatchForm.flowMode === "OFFSITE_WITH_DEMOLITION",
                  )}
                  onClick={() =>
                    setVerificationBatchForm((current) => ({
                      ...current,
                      flowMode: "OFFSITE_WITH_DEMOLITION",
                    }))
                  }
                  type="button"
                >
                  С отправкой
                </button>
                <button
                  className={getProcessFormatButtonClass(
                    verificationBatchForm.flowMode === "ONSITE_WITH_DEMOLITION",
                  )}
                  onClick={() =>
                    setVerificationBatchForm((current) => ({
                      ...current,
                      flowMode: "ONSITE_WITH_DEMOLITION",
                    }))
                  }
                  type="button"
                >
                  На месте + демонтаж
                </button>
                <button
                  className={getProcessFormatButtonClass(
                    verificationBatchForm.flowMode === "ONSITE_WITHOUT_DEMOLITION",
                  )}
                  onClick={() =>
                    setVerificationBatchForm((current) => ({
                      ...current,
                      flowMode: "ONSITE_WITHOUT_DEMOLITION",
                    }))
                  }
                  type="button"
                >
                  На месте без демонтажа
                </button>
              </div>
            </div>
          )}
          {isVerificationFlowOnSite(effectiveVerificationFlowMode) ? (
            <div className="tone-parent rounded-2xl border border-line px-4 py-3 text-sm text-steel">
              {effectiveVerificationFlowMode === "ONSITE_WITHOUT_DEMOLITION"
                ? "Поверка будет оформлена как работа на объекте без демонтажа и без маршрута отправки."
                : "Поверка будет оформлена как работа на объекте, без маршрута отправки."}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm text-steel">
                Откуда
                <AutocompleteInput
                  className="form-input"
                  suggestions={existingRouteCities}
                  value={verificationBatchForm.routeCity}
                  onChange={(value) =>
                    setVerificationBatchForm((current) => ({ ...current, routeCity: value }))
                  }
                />
              </label>
              <label className="block text-sm text-steel">
                Куда
                <AutocompleteInput
                  className="form-input"
                  suggestions={existingRouteDestinations}
                  value={verificationBatchForm.routeDestination}
                  onChange={(value) =>
                    setVerificationBatchForm((current) => ({
                      ...current,
                      routeDestination: value,
                    }))
                  }
                />
              </label>
            </div>
          )}
          <label className="block text-sm text-steel">
            {selectedVerificationPresetVariant?.stages[0]?.label
              || getVerificationStartDateLabel(effectiveVerificationFlowMode)}
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
          <label className="block text-sm text-steel">
            Первое сообщение
            <AutocompleteTextarea
              ref={verificationInitialMessageInputRef}
              className="form-input min-h-[88px] resize-none py-3"
              suggestions={processTextSuggestions}
              placeholder="Например: Ящик с приборами упакован и отправлен в поверку."
              value={verificationBatchForm.initialMessageText}
              onChange={(value) =>
                setVerificationBatchForm((current) => ({
                  ...current,
                  initialMessageText: value,
                }))
              }
            />
          </label>
          <input
            ref={verificationInitialFilesInputRef}
            className="sr-only"
            multiple
            type="file"
            onChange={handleVerificationInitialFilesPick}
          />
          <PendingAttachmentList
            files={verificationBatchForm.files}
            onRemove={handleRemoveVerificationInitialFile}
          />
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
          <div className="flex justify-end gap-2">
            <PrivateNoteToggleButton
              active={verificationBatchForm.initialMessageIsPrivate}
              disabled={createVerificationBatchMutation.isPending}
              onClick={() =>
                setVerificationBatchForm((current) => ({
                  ...current,
                  initialMessageIsPrivate: !current.initialMessageIsPrivate,
                }))
              }
            />
            <EmojiPickerButton
              disabled={createVerificationBatchMutation.isPending}
              onPick={handleInsertVerificationInitialEmoji}
            />
            <IconActionButton
              className="h-10 w-10"
              disabled={createVerificationBatchMutation.isPending}
              icon={
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.25 20.25a6 6 0 0 1-8.49-8.49l9.9-9.9a4.5 4.5 0 1 1 6.36 6.36l-9.2 9.19a3 3 0 0 1-4.24-4.24l8.49-8.49" />
                </svg>
              }
              label="Прикрепить файлы к первому сообщению поверки"
              onClick={() => openFilePicker(verificationInitialFilesInputRef.current)}
            />
            <button
              aria-label={
                selectedEquipmentIds.length === 1
                  ? "Подтвердить отправку в поверку"
                  : "Подтвердить массовую отправку в поверку"
              }
              className="btn-primary disabled:opacity-60"
              disabled={
                createVerificationBatchMutation.isPending
                || selectedEquipmentIds.length === 0
                || (selectedEquipmentIds.length > 1 && !verificationBatchForm.batchName.trim())
                || (hasVerificationPresetVariantConfig && !verificationPresetVariants.length)
                || (!isVerificationFlowOnSite(effectiveVerificationFlowMode)
                  && !verificationBatchForm.routeCity.trim())
                || (!isVerificationFlowOnSite(effectiveVerificationFlowMode)
                  && !verificationBatchForm.routeDestination.trim())
                || !verificationBatchForm.sentToVerificationAt
              }
              type="submit"
            >
              {createVerificationBatchMutation.isPending ? (
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
          selectedFolder
            ? `Поиск возможных обновлений для ${folderRefreshScopeDescriptionLabel} «${selectedFolder.name}». Обновления применяются только вручную по отмеченным строкам.`
            : "Сначала выбери папку."
        }
        footer={
          <div className="flex flex-wrap items-center justify-end gap-3">
            <button
              className={subtleButtonClass}
              disabled={excludeFolderRefreshSelectionMutation.isPending || selectedFolderRefreshEquipmentIds.length === 0}
              type="button"
              onClick={() => void handleExcludeSelectedFolderRefreshEquipment()}
            >
              {excludeFolderRefreshSelectionMutation.isPending
                ? "Исключаем..."
                : `Не проверять в следующий раз (${selectedFolderRefreshEquipmentIds.length})`}
            </button>
            <button className={subtleButtonClass} type="button" onClick={minimizeFolderRefreshModal}>
              Свернуть
            </button>
            <button
              className="btn-primary disabled:opacity-60"
              disabled={
                applyFolderRefreshMutation.isPending
                || isFolderRefreshProcessing
                || applicableSelectedFolderRefreshRowIds.length === 0
              }
              form="folder-refresh-form"
              type="submit"
            >
              {applyFolderRefreshMutation.isPending
                ? "Применяем..."
                : `Применить (${applicableSelectedFolderRefreshRowIds.length})`}
            </button>
          </div>
        }
        headerActions={
          <IconActionButton
            icon={<span className="text-base leading-none">−</span>}
            label="Свернуть"
            onClick={minimizeFolderRefreshModal}
          />
        }
        open={folderRefreshModalOpen}
        size="xl"
        title="Обновление записей Аршина"
        onClose={closeFolderRefreshModal}
      >
        <form
          id="folder-refresh-form"
          className="space-y-4"
          onSubmit={(event) => void handleFolderRefreshApplySubmit(event)}
        >
          {startFolderRefreshMutation.isPending && !folderRefreshTaskId ? (
            <p className="text-sm text-steel">Запускаем поиск обновлений...</p>
          ) : null}

          {startFolderRefreshMutation.isError ? (
            <p className="text-sm text-[#b04c43]">
              {getMutationErrorMessage(
                startFolderRefreshMutation.error,
                "Не удалось запустить поиск обновлений.",
              )}
            </p>
          ) : null}

          {folderRefreshTask ? (
            <section className="tone-parent space-y-3 rounded-3xl border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-ink">
                    Статус: {getFolderRefreshTaskStatusLabel(folderRefreshTask.status)}
                  </div>
                  <div className="mt-1 text-xs text-steel">
                    Обработано {folderRefreshTask.processedRows} из {folderRefreshTask.totalRows}.
                  </div>
                </div>
                <div className="text-sm font-semibold text-ink">{folderRefreshTask.progress}%</div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--accent-soft)]">
                <div
                  className="h-full rounded-full bg-[var(--accent)] transition-all"
                  style={{ width: `${folderRefreshTask.progress}%` }}
                />
              </div>
              {folderRefreshTask.summary ? (
                <div className="flex flex-wrap gap-2">
                  {[
                    ["Обновить", folderRefreshTask.summary.updated ?? 0],
                    ["Обновить?", folderRefreshTask.summary.updatedUncertain ?? 0],
                    ["Без изменений", folderRefreshTask.summary.unchanged ?? 0],
                    ["Не найдено", folderRefreshTask.summary.notFound ?? 0],
                    ["Ошибки", folderRefreshTask.summary.error ?? 0],
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
              {folderRefreshTask.errorMessage ? (
                <p className="text-sm text-[#b04c43]">{folderRefreshTask.errorMessage}</p>
              ) : null}
            </section>
          ) : null}

          {applyFolderRefreshMutation.isError ? (
            <p className="text-sm text-[#b04c43]">
              {getMutationErrorMessage(
                applyFolderRefreshMutation.error,
                "Не удалось применить выбранные обновления.",
              )}
            </p>
          ) : null}

          {folderRefreshApplyResult ? (
            <div className="tone-child rounded-2xl border border-line px-4 py-3 text-sm text-ink">
              Применено: {folderRefreshApplyResult.appliedCount}. Ошибок: {folderRefreshApplyResult.failedCount}.
            </div>
          ) : null}

          {folderRefreshTaskQuery.isLoading && folderRefreshTaskId ? (
            <p className="text-sm text-steel">Загружаем результаты поиска...</p>
          ) : null}

          {folderRefreshTaskQuery.isError ? (
            <p className="text-sm text-[#b04c43]">
              {getMutationErrorMessage(
                folderRefreshTaskQuery.error,
                "Не удалось загрузить результаты поиска обновлений.",
              )}
            </p>
          ) : null}

          {excludeFolderRefreshSelectionMutation.isError ? (
            <p className="text-sm text-[#b04c43]">
              {getMutationErrorMessage(
                excludeFolderRefreshSelectionMutation.error,
                "Не удалось исключить выбранные приборы из следующих проверок.",
              )}
            </p>
          ) : null}

          {folderRefreshActionMessage ? (
            <div className="tone-child rounded-2xl border border-line px-4 py-3 text-sm text-ink">
              {folderRefreshActionMessage}
            </div>
          ) : null}

          {folderRefreshRows.length ? (
            <div className="space-y-3">
              <section className="tone-parent space-y-3 rounded-2xl border border-line p-4">
                <div className="flex flex-wrap gap-2">
                  {[
                    ["ALL", "Все", folderRefreshRows.length],
                    ["UPDATED", "Обновить", folderRefreshTask?.summary?.updated ?? 0],
                    ["UPDATED_UNCERTAIN", "Обновить?", folderRefreshTask?.summary?.updatedUncertain ?? 0],
                    ["UNCHANGED", "Без изменений", folderRefreshTask?.summary?.unchanged ?? 0],
                    ["NOT_FOUND", "Не найдено", folderRefreshTask?.summary?.notFound ?? 0],
                    ["ERROR", "Ошибки", folderRefreshTask?.summary?.error ?? 0],
                  ].map(([value, label, count]) => {
                    const active = folderRefreshStatusFilter === value;
                    return (
                      <button
                        key={value}
                        className={[
                          "rounded-full border px-3 py-1 text-xs transition",
                          active
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-ink"
                            : "border-line text-steel hover:border-signal-info hover:text-ink",
                        ].join(" ")}
                        type="button"
                        onClick={() =>
                          setFolderRefreshStatusFilter(value as "ALL" | EquipmentFolderRefreshRowStatus)
                        }
                      >
                        {label}: {count}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <label className="block min-w-[280px] flex-1 text-sm text-steel">
                    Фильтр
                    <input
                      className="form-input mt-1"
                      placeholder="Прибор, документ, реестр, примечание"
                      type="text"
                      value={folderRefreshSearchQuery}
                      onChange={(event) => setFolderRefreshSearchQuery(event.target.value)}
                    />
                  </label>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      className={subtleButtonClass}
                      disabled={filteredFolderRefreshRowIds.length === 0}
                      type="button"
                      onClick={toggleSelectAllFolderRefreshRows}
                    >
                      {filteredFolderRefreshRowIds.length > 0
                        && selectedFilteredFolderRefreshRowIds.length === filteredFolderRefreshRowIds.length
                        ? "Снять выделение с отфильтрованных"
                        : "Выделить отфильтрованные"}
                    </button>
                    <button
                      className={subtleButtonClass}
                      disabled={selectedFolderRefreshRowIds.length === 0}
                      type="button"
                      onClick={() => setSelectedFolderRefreshRowIds([])}
                    >
                      Очистить выделение
                    </button>
                  </div>
                </div>

                <div className="text-xs text-steel">
                  Показано: {filteredFolderRefreshRows.length} из {folderRefreshRows.length}. Выбрано строк: {selectedFolderRefreshRowIds.length}. К обновлению: {applicableSelectedFolderRefreshRowIds.length}. К исключению: {selectedFolderRefreshEquipmentIds.length}.
                </div>
              </section>

              <div
                ref={folderRefreshTableScrollRef}
                className="max-h-[calc(100dvh-24rem)] overflow-auto rounded-2xl border border-line bg-white"
              >
                <table className="min-w-[1160px] w-full table-fixed border-collapse text-left text-sm">
                <colgroup>
                  <col className="w-12" />
                  <col className="w-[18rem]" />
                  <col className="w-[13rem]" />
                  <col className="w-[13rem]" />
                  <col className="w-[16rem]" />
                  <col className="w-[8rem]" />
                  <col className="w-auto" />
                </colgroup>
                <thead className="tone-child text-[11px] uppercase tracking-[0.12em] text-steel">
                  <tr>
                    <th className="border-b border-line px-3 py-2 font-semibold">
                      <input
                        checked={
                          filteredFolderRefreshRowIds.length > 0
                          && selectedFilteredFolderRefreshRowIds.length === filteredFolderRefreshRowIds.length
                        }
                        className="h-4 w-4 accent-[var(--accent)]"
                        disabled={filteredFolderRefreshRowIds.length === 0}
                        type="checkbox"
                        onChange={toggleSelectAllFolderRefreshRows}
                      />
                    </th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Прибор / цель</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Текущий документ</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Найдено в Аршине</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Поверка</th>
                    <th className="border-b border-line px-3 py-2 font-semibold whitespace-nowrap">Статус</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Примечание</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredFolderRefreshRows.map((row) => {
                    const currentWindow = formatRefreshWindow(
                      row.currentVerificationDate,
                      row.currentValidDate,
                    );
                    const matchedWindow = formatRefreshWindow(
                      row.matchedVerificationDate,
                      row.matchedValidDate,
                    );
                    const hasVerificationChange = currentWindow !== matchedWindow;
                    const hasCurrentSecondaryLine = Boolean(
                      row.targetRegistryNumber
                      && row.targetRegistryNumber !== row.currentCertificateNumber,
                    );
                    const hasMatchedSecondaryLine = Boolean(
                      row.matchedRegistryNumber
                      && row.matchedRegistryNumber !== row.matchedCertificateNumber,
                    );
                    return (
                      <tr key={row.id} className="tone-parent align-top text-ink">
                        <td className="border-b border-line px-3 py-2.5">
                          <input
                            checked={selectedFolderRefreshRowIds.includes(row.id)}
                            className="h-4 w-4 accent-[var(--accent)]"
                            type="checkbox"
                            onChange={() => toggleFolderRefreshRowSelection(row.id)}
                          />
                        </td>
                        <td className="border-b border-line px-3 py-2.5">
                          <div className="font-semibold text-ink">{row.equipmentName}</div>
                          <div className="mt-1 text-xs leading-4 text-steel">
                            {getFolderRefreshRowTargetLabel(row)}
                          </div>
                        </td>
                        <td className="border-b border-line px-3 py-2.5 text-xs leading-5">
                          <div className="break-all font-mono text-ink">
                            {row.currentCertificateNumber ?? "—"}
                          </div>
                          {hasCurrentSecondaryLine ? (
                            <div className="mt-1 break-all font-mono text-steel">{row.targetRegistryNumber}</div>
                          ) : null}
                        </td>
                        <td className="border-b border-line px-3 py-2.5 text-xs leading-5">
                          <div className="break-all font-mono text-ink">
                            {row.matchedCertificateNumber ?? "—"}
                          </div>
                          {hasMatchedSecondaryLine ? (
                            <div className="mt-1 break-all font-mono text-steel">{row.matchedRegistryNumber}</div>
                          ) : null}
                        </td>
                        <td className="border-b border-line px-3 py-2.5 text-xs text-ink">
                          <div className="whitespace-nowrap">{currentWindow}</div>
                          {hasVerificationChange ? (
                            <div className="mt-1 whitespace-nowrap text-steel">
                              → {matchedWindow}
                            </div>
                          ) : null}
                        </td>
                        <td className="border-b border-line px-3 py-2.5 text-xs whitespace-nowrap">
                          <span className={getFolderRefreshStatusBadgeClass(row.status)}>
                            {getFolderRefreshRowStatusLabel(row.status)}
                          </span>
                        </td>
                        <td className="border-b border-line px-3 py-2.5 text-xs leading-5 text-steel">
                          {row.notes ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
              <div className="sticky bottom-0 z-10 rounded-full border border-line bg-white/95 px-3 py-2 shadow-panel backdrop-blur">
                <div
                  ref={folderRefreshBottomScrollbarRef}
                  className="overflow-x-auto overflow-y-hidden"
                >
                  <div
                    ref={folderRefreshBottomScrollbarInnerRef}
                    className="h-1 min-w-full"
                  />
                </div>
              </div>
            </div>
          ) : null}
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

