import {
  type ChangeEvent,
  Fragment,
  type FormEvent,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useSearchParams } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  closeRepairBatch,
  closeEquipmentRepair,
  createEquipmentRepairMessage,
  deleteRepairArchive,
  deleteEquipmentRepairMessage,
  downloadRepairArchiveZip,
  downloadRepairMessageAttachment,
  fetchEquipmentFolders,
  equipmentTypeLabels,
  exportRepairQueueXlsx,
  fetchEquipment,
  fetchEquipmentRepairMessages,
  fetchRepairQueue,
  fetchRepairQueuePage,
  getArshinDocumentLabel,
  getArshinDocumentShortLabel,
  supportsVerification,
  updateEquipmentRepairMilestones,
  updateEquipmentRepairMessage,
  updateRepairBatchItems,
  updateRepairBatchMilestones,
  type EquipmentItem,
  type ProcessCustomStage,
  type RepairMessage,
  type RepairMessageAttachment,
  type RepairQueueItem,
} from "@/api/equipment";
import { fetchMentionUsers } from "@/api/users";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { Select } from "@/components/ui/select";
import { AutocompleteTextarea } from "@/components/AutocompleteTextarea";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { EmojiPickerButton } from "@/components/EmojiPickerButton";
import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";
import { IconActionLink } from "@/components/IconActionLink";
import { AttachmentPreviewList } from "@/components/AttachmentPreviewList";
import { PaginationControls } from "@/components/PaginationControls";
import { MentionText } from "@/components/MentionText";
import { PendingAttachmentList } from "@/components/PendingAttachmentList";
import {
  ProcessStageActions,
  ProcessStageDateControl,
  ProcessStageDraftCard,
} from "@/components/ProcessStageInlineControls";
import { PrivateNoteBadge, PrivateNoteToggleButton } from "@/components/PrivateNoteControls";
import { ProcessBatchItemsModal } from "@/components/ProcessBatchItemsModal";
import {
  ProcessTimelineStrip,
  type ProcessTimelineStripItem,
  type ProcessTimelineStripMarker,
  type ProcessTimelineStripProgressMarker,
  type ProcessTimelineStripSegment,
} from "@/components/ProcessTimelineStrip";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  appendPendingFiles,
  formatAttachmentShortMeta,
  openFilePicker,
  removePendingFile,
} from "@/lib/attachments";
import { buildMentionSuggestionOptions, sortAutocompleteSuggestions } from "@/lib/autocomplete";
import { getDashboardFolderIds } from "@/lib/dashboard";
import { hasOperatorAccess } from "@/lib/roles";
import { validateMilestoneOrder } from "@/lib/milestoneValidation";
import { useQueuedAutoSave } from "@/lib/useQueuedAutoSave";
import { handleTextareaSubmitShortcut, insertEmojiAtCursor } from "@/lib/textarea";
import {
  PROCESS_STAGE_TONE_CLASS,
  applyStageDateChange,
  areProcessCustomStagesEqual,
  canMoveProcessCustomStage,
  getProcessStageTone,
  getStageRowsProgressLabel,
  insertProcessCustomStage,
  moveProcessCustomStage,
  normalizeProcessCustomStages,
  renumberProcessCustomStages,
} from "@/lib/processStages";
import { useAuthStore } from "@/store/auth";

type RepairTab = "active" | "archived";

type RepairMilestonesFormState = {
  sentToRepairAt: string;
  arrivedToDestinationAt: string;
  sentFromRepairAt: string;
  sentFromIrkutskAt: string;
  arrivedToLenskAt: string;
  actuallyReceivedAt: string;
  incomingControlAt: string;
  paidAt: string;
};

type RepairTimelineModel = {
  items: ProcessTimelineStripItem[];
  markers: ProcessTimelineStripMarker[];
  segments: ProcessTimelineStripSegment[];
  progress: number;
  progressMarker: ProcessTimelineStripProgressMarker | null;
  scaleDays: number;
};

type ProcessStageDraftState = {
  rowKey: string;
  anchorKey: string;
  insertSortOrder: number;
  label: string;
  date: string;
};

type RepairAutoSaveState = {
  milestones: RepairMilestonesFormState;
  customStages: ProcessCustomStage[];
};

type RepairStageRow = {
  key: string;
  anchorKey: string;
  customStageId: string | null;
  customSortOrder: number | null;
  label: string;
  note?: string;
  editable: boolean;
  formKey: keyof RepairMilestonesFormState | null;
  actualValue: string;
  deadline: string | null;
  overdueDays: number;
  statusLabel: string;
};

type RepairGroup = {
  key: string;
  title: string;
  items: RepairQueueItem[];
};

const tabButtonClass = "toolbar-tab";
const activeTabButtonClass = "toolbar-tab toolbar-tab--active";
const actionButtonClass = "btn-secondary";
const repairTimelineDefaultDays = 120;
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const repairQueuePageSize = 20;


export function RepairsPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const analysisFolderDefaultAppliedRef = useRef(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const previousDeferredSearchQueryRef = useRef(deferredSearchQuery);
  const tab: RepairTab = searchParams.get("tab") === "archived" ? "archived" : "active";
  const targetRepairId = Number(searchParams.get("repairId") ?? "");
  const targetEquipmentId = Number(searchParams.get("equipmentId") ?? "");
  const targetMessageId = Number(searchParams.get("messageId") ?? "");
  const targetBatchKey = searchParams.get("batchKey");
  const selectedFolderId = parseFolderSearchParam(searchParams.get("folderId"));
  const analysisFolderIds = useMemo(() => getDashboardFolderIds(user), [user]);
  const analysisDefaultFolderId =
    analysisFolderIds.length === 1 ? analysisFolderIds[0] : null;
  const currentPage = parsePageSearchParam(searchParams.get("page"));
  const repairQueueOffset = (currentPage - 1) * repairQueuePageSize;
  const hasTargetNavigation =
    Boolean(targetBatchKey)
    || isPositiveSearchParamId(targetRepairId)
    || isPositiveSearchParamId(targetEquipmentId);
  const canManage = hasOperatorAccess(user?.role);

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders", "repairs"],
    queryFn: () => fetchEquipmentFolders(token ?? ""),
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (
      analysisFolderDefaultAppliedRef.current
      || hasTargetNavigation
      || selectedFolderId !== null
      || analysisDefaultFolderId === null
      || !foldersQuery.isSuccess
    ) {
      return;
    }
    if (!foldersQuery.data?.some((folder) => folder.id === analysisDefaultFolderId)) {
      analysisFolderDefaultAppliedRef.current = true;
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("folderId", String(analysisDefaultFolderId));
    nextParams.set("page", "1");
    analysisFolderDefaultAppliedRef.current = true;
    setSearchParams(nextParams, { replace: true });
  }, [
    analysisDefaultFolderId,
    foldersQuery.data,
    foldersQuery.isSuccess,
    hasTargetNavigation,
    searchParams,
    selectedFolderId,
    setSearchParams,
  ]);

  const repairsPageQuery = useQuery({
    queryKey: [
      "repair-queue-page",
      tab,
      deferredSearchQuery,
      selectedFolderId ?? "all",
      currentPage,
      repairQueuePageSize,
    ],
    queryFn: () =>
      fetchRepairQueuePage(token ?? "", {
        lifecycleStatus: tab,
        query: deferredSearchQuery,
        folderId: selectedFolderId,
        limit: repairQueuePageSize,
        offset: repairQueueOffset,
      }),
    enabled: Boolean(token) && !hasTargetNavigation,
  });

  const targetRepairFilter = isPositiveSearchParamId(targetRepairId) ? targetRepairId : null;
  const targetEquipmentFilter = isPositiveSearchParamId(targetEquipmentId)
    ? targetEquipmentId
    : null;

  const repairsFullQuery = useQuery({
    queryKey: [
      "repair-queue",
      tab,
      deferredSearchQuery,
      selectedFolderId ?? "all",
      "target-mode",
      targetBatchKey ?? "",
      targetRepairFilter ?? "",
      targetEquipmentFilter ?? "",
    ],
    queryFn: () =>
      fetchRepairQueue(token ?? "", {
        lifecycleStatus: tab,
        query: deferredSearchQuery,
        folderId: selectedFolderId,
        processId: targetRepairFilter,
        batchKey: targetBatchKey,
        targetEquipmentId: targetEquipmentFilter,
      }),
    enabled: Boolean(token) && hasTargetNavigation,
  });

  const mentionUsersQuery = useQuery({
    queryKey: ["mention-users"],
    queryFn: () => fetchMentionUsers(token ?? ""),
    enabled: Boolean(token),
  });

  const mentionSuggestions = useMemo(
    () => buildMentionSuggestionOptions(mentionUsersQuery.data ?? []),
    [mentionUsersQuery.data],
  );

  const repairQueueItems = useMemo(
    () => (hasTargetNavigation ? repairsFullQuery.data ?? [] : repairsPageQuery.data?.items ?? []),
    [hasTargetNavigation, repairsFullQuery.data, repairsPageQuery.data?.items],
  );

  const groupedItems = useMemo<RepairGroup[]>(() => {
    const items = repairQueueItems;
    const groups = new Map<string, RepairGroup>();
    for (const item of items) {
      const key = item.batchKey ?? `single-${item.repairId}`;
      const title = item.batchName ?? item.equipmentName;
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(key, { key, title, items: [item] });
      }
    }
    return Array.from(groups.values());
  }, [repairQueueItems]);

  const totalGroupCount = useMemo(
    () => (hasTargetNavigation ? groupedItems.length : repairsPageQuery.data?.totalGroups ?? 0),
    [groupedItems.length, hasTargetNavigation, repairsPageQuery.data?.totalGroups],
  );

  const activeCount = useMemo(
    () =>
      tab === "active"
        ? hasTargetNavigation
          ? repairQueueItems.length
          : repairsPageQuery.data?.totalItems ?? 0
        : null,
    [hasTargetNavigation, repairQueueItems.length, repairsPageQuery.data?.totalItems, tab],
  );

  const searchSuggestions = useMemo(
    () => buildRepairTextSuggestions(repairQueueItems),
    [repairQueueItems],
  );

  const repairsError = hasTargetNavigation ? repairsFullQuery.error : repairsPageQuery.error;
  const isRepairsLoading = hasTargetNavigation ? repairsFullQuery.isLoading : repairsPageQuery.isLoading;

  const exportRepairMutation = useMutation({
    mutationFn: () =>
      exportRepairQueueXlsx(token ?? "", {
        lifecycleStatus: tab,
        query: deferredSearchQuery,
        folderId: selectedFolderId,
      }),
  });

  function handleTabChange(nextTab: RepairTab) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", nextTab);
    nextParams.set("page", "1");
    nextParams.delete("repairId");
    nextParams.delete("equipmentId");
    nextParams.delete("messageId");
    nextParams.delete("batchKey");
    setSearchParams(nextParams);
  }

  function handleFolderFilterChange(value: string) {
    const nextParams = new URLSearchParams(searchParams);
    if (value) {
      nextParams.set("folderId", value);
    } else {
      nextParams.delete("folderId");
    }
    nextParams.set("page", "1");
    nextParams.delete("repairId");
    nextParams.delete("equipmentId");
    nextParams.delete("messageId");
    nextParams.delete("batchKey");
    setSearchParams(nextParams);
  }

  function handlePageChange(page: number) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("page", String(page));
    setSearchParams(nextParams);
  }

  useEffect(() => {
    if (previousDeferredSearchQueryRef.current === deferredSearchQuery) {
      return;
    }

    previousDeferredSearchQueryRef.current = deferredSearchQuery;

    if (hasTargetNavigation || currentPage === 1) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("page", "1");
    setSearchParams(nextParams);
  }, [currentPage, deferredSearchQuery, hasTargetNavigation, searchParams, setSearchParams]);

  async function handleExportRepairs() {
    setExportError(null);
    try {
      const { blob, fileName } = await exportRepairMutation.mutateAsync();
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
        error instanceof Error ? error.message : "Не удалось выгрузить Excel-файл ремонтов.",
      );
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Ремонты"
        description="Активные и архивные ремонты с маршрутом, этапами, диалогом и контролем просрочек."
      />

      <div className="tone-parent toolbar-panel rounded-3xl border border-line shadow-panel">
        <div className="toolbar-panel__start">
          <button
            className={tab === "active" ? activeTabButtonClass : tabButtonClass}
            onClick={() => handleTabChange("active")}
            type="button"
          >
            <Icon className="h-4 w-4" name="repairs" />
            Активные
          </button>
          <button
            className={tab === "archived" ? activeTabButtonClass : tabButtonClass}
            onClick={() => handleTabChange("archived")}
            type="button"
          >
            <Icon className="h-4 w-4" name="repairs" />
            Архивные
          </button>
        </div>

        <div className="toolbar-panel__controls">
          <label className="sr-only" htmlFor="repairs-folder-filter">
            Фильтр по папке
          </label>
          <Select
            className="toolbar-select"
            disabled={foldersQuery.isLoading || foldersQuery.isError}
            id="repairs-folder-filter"
            onChange={(next) => handleFolderFilterChange(next)}
            options={[
              { value: "", label: "Все папки" },
              ...(foldersQuery.data ?? []).map((folder) => ({
                value: String(folder.id),
                label: folder.name,
              })),
            ]}
            value={selectedFolderId ? String(selectedFolderId) : ""}
          />
          <label className="toolbar-search">
            <span className="sr-only">Поиск по ремонтам</span>
            <svg className="toolbar-search__icon h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" />
            </svg>
            <AutocompleteInput
              className="toolbar-search__input"
              placeholder="Поиск по прибору, месту, Аршин-номеру, маршруту"
              suggestions={searchSuggestions}
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </label>
          <IconActionButton
            icon={
              exportRepairMutation.isPending ? (
                <span className="text-sm leading-none">…</span>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4m-5 7.5h18" />
                </svg>
              )
            }
            label="Экспортировать текущий список ремонтов в Excel"
            onClick={() => void handleExportRepairs()}
          />
        </div>
      </div>

      {exportError ? <p className="text-sm text-[#b04c43]">{exportError}</p> : null}

      {tab === "active" && activeCount !== null ? (
        <div className="flex justify-end">
          <div className="toolbar-badge">
            {activeCount} в работе
          </div>
        </div>
      ) : null}

      {!hasTargetNavigation && totalGroupCount > repairQueuePageSize ? (
        <div className="tone-parent rounded-2xl border border-line px-4 py-3 shadow-panel">
          <PaginationControls
            currentPage={currentPage}
            pageSize={repairQueuePageSize}
            totalItems={totalGroupCount}
            onPageChange={handlePageChange}
          />
        </div>
      ) : null}

      {isRepairsLoading ? <p className="text-sm text-steel">Загружаем список ремонтов...</p> : null}

      {repairsError ? (
        <p className="text-sm text-[#b04c43]">
          {repairsError instanceof Error
            ? repairsError.message
            : "Не удалось загрузить список ремонтов."}
        </p>
      ) : null}

      {!isRepairsLoading && !repairsError && repairQueueItems.length === 0 ? (
        <div className="tone-parent rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-steel">
          {tab === "active" ? "Активных ремонтов пока нет." : "Архивных ремонтов пока нет."}
        </div>
      ) : null}

      {!isRepairsLoading && !repairsError && repairQueueItems.length > 0 ? (
        <div className="space-y-3">
          {groupedItems.map((group) => (
            group.items.length > 1 ? (
              <RepairBatchCard
                batch={group}
                canManage={canManage}
                isTarget={Boolean(targetBatchKey) && group.key === targetBatchKey}
                key={`${tab}-${group.key}`}
                lifecycleStatus={tab}
                mentionSuggestions={mentionSuggestions}
                targetEquipmentId={Number.isInteger(targetEquipmentId) ? targetEquipmentId : null}
                targetMessageId={Number.isInteger(targetMessageId) ? targetMessageId : null}
                token={token ?? ""}
              />
            ) : (
              <RepairQueueRow
                canManage={canManage}
                isTarget={
                  !targetBatchKey
                  && (
                    (Number.isInteger(targetRepairId)
                      && group.items[0].repairId === targetRepairId)
                    || (
                      Number.isInteger(targetEquipmentId)
                      && group.items[0].equipmentId === targetEquipmentId
                    )
                  )
                }
                item={group.items[0]}
                key={`${tab}-${group.items[0].repairId}`}
                lifecycleStatus={tab}
                mentionSuggestions={mentionSuggestions}
                targetMessageId={Number.isInteger(targetMessageId) ? targetMessageId : null}
                token={token ?? ""}
              />
            )
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RepairQueueRow({
  item,
  token,
  canManage,
  lifecycleStatus,
  isTarget,
  targetMessageId,
  mentionSuggestions,
}: {
  item: RepairQueueItem;
  token: string;
  canManage: boolean;
  lifecycleStatus: RepairTab;
  isTarget: boolean;
  targetMessageId: number | null;
  mentionSuggestions: Array<{ value: string; label: string }>;
}) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [expanded, setExpanded] = useState(false);
  const [dialogExpanded, setDialogExpanded] = useState(false);
  const [form, setForm] = useState<RepairMilestonesFormState>(() => buildRepairFormState(item));
  const [customStages, setCustomStages] = useState<ProcessCustomStage[]>(() =>
    normalizeProcessCustomStages(item.customStages, item.stageTemplate),
  );
  const [stageDraft, setStageDraft] = useState<ProcessStageDraftState | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageDraftIsPrivate, setMessageDraftIsPrivate] = useState(false);
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [messageEditDraft, setMessageEditDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [archiveDeleteConfirmOpen, setArchiveDeleteConfirmOpen] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [flashingMessageId, setFlashingMessageId] = useState<number | null>(null);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<number | null>(null);
  const [downloadingArchive, setDownloadingArchive] = useState(false);
  const [messageToDeleteId, setMessageToDeleteId] = useState<number | null>(null);
  const isArchived = lifecycleStatus === "archived";
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const editMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const textSuggestions = useMemo(
    () => [...mentionSuggestions, ...buildRepairTextSuggestions([item])],
    [item, mentionSuggestions],
  );
  const baselineForm = useMemo(() => buildRepairFormState(item), [item]);
  const baselineCustomStages = useMemo(
    () => normalizeProcessCustomStages(item.customStages, item.stageTemplate),
    [item.customStages, item.stageTemplate],
  );
  const autoSaveValue = useMemo<RepairAutoSaveState>(
    () => ({
      milestones: form,
      customStages,
    }),
    [customStages, form],
  );
  const autoSaveBaseline = useMemo<RepairAutoSaveState>(
    () => ({
      milestones: baselineForm,
      customStages: baselineCustomStages,
    }),
    [baselineCustomStages, baselineForm],
  );

  useEffect(() => {
    setForm(baselineForm);
  }, [baselineForm]);

  useEffect(() => {
    setCustomStages(baselineCustomStages);
  }, [baselineCustomStages]);

  useEffect(() => {
    if (!messageInputRef.current) {
      return;
    }
    resizeTextarea(messageInputRef.current);
  }, [messageDraft]);

  useEffect(() => {
    if (!editMessageInputRef.current) {
      return;
    }
    resizeTextarea(editMessageInputRef.current);
  }, [editingMessageId, messageEditDraft]);

  useEffect(() => {
    if (!isTarget) {
      return;
    }
    setExpanded(true);
    if (targetMessageId) {
      setDialogExpanded(true);
    }
    setFlashActive(true);
    window.setTimeout(() => {
      articleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      articleRef.current?.focus({ preventScroll: true });
    }, 60);
    const timeoutId = window.setTimeout(() => setFlashActive(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [isTarget, targetMessageId]);

  const messagesQuery = useQuery({
    queryKey: ["repair-messages", item.equipmentId],
    queryFn: () => fetchEquipmentRepairMessages(token, item.equipmentId),
    enabled: Boolean(token) && expanded && dialogExpanded && !isArchived,
  });

  useEffect(() => {
    if (!isTarget || !targetMessageId || !messagesQuery.data?.some((message) => message.id === targetMessageId)) {
      return;
    }
    setDialogExpanded(true);
    setFlashingMessageId(targetMessageId);
    window.setTimeout(() => {
      document
        .getElementById(`repair-message-${item.equipmentId}-${targetMessageId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    const timeoutId = window.setTimeout(() => setFlashingMessageId(null), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [isTarget, item.equipmentId, messagesQuery.data, targetMessageId]);

  const updateMilestonesMutation = useMutation({
    mutationFn: (nextState: RepairAutoSaveState) =>
      updateEquipmentRepairMilestones(token, item.equipmentId, {
        sentToRepairAt: emptyToNull(nextState.milestones.sentToRepairAt),
        arrivedToDestinationAt: emptyToNull(nextState.milestones.arrivedToDestinationAt),
        sentFromRepairAt: emptyToNull(nextState.milestones.sentFromRepairAt),
        sentFromIrkutskAt: emptyToNull(nextState.milestones.sentFromIrkutskAt),
        arrivedToLenskAt: emptyToNull(nextState.milestones.arrivedToLenskAt),
        actuallyReceivedAt: emptyToNull(nextState.milestones.actuallyReceivedAt),
        incomingControlAt: emptyToNull(nextState.milestones.incomingControlAt),
        paidAt: emptyToNull(nextState.milestones.paidAt),
        customStages: nextState.customStages,
      }),
    onSuccess: async (updatedRepair) => {
      setForm(buildRepairFormState(updatedRepair));
      setCustomStages(
        normalizeProcessCustomStages(updatedRepair.customStages, updatedRepair.stageTemplate),
      );
      setStageDraft(null);
      setFormError(null);
      await invalidateRepairQueries(queryClient, item.equipmentId);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Не удалось сохранить этапы ремонта.");
    },
  });

  const { flush: flushMilestonesAutoSave } = useQueuedAutoSave({
    value: autoSaveValue,
    baseline: autoSaveBaseline,
    enabled: canManage && !isArchived,
    isEqual: areRepairAutoSaveStatesEqual,
    validate: (nextState) => getRepairMilestoneValidationError(item, nextState.milestones),
    onValidationError: (validationError) => {
      setFormError(validationError);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Не удалось сохранить этапы ремонта.");
    },
    save: async (nextState) => {
      await updateMilestonesMutation.mutateAsync(nextState);
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: () =>
      createEquipmentRepairMessage(token, item.equipmentId, {
        text: messageDraft,
        isPrivate: messageDraftIsPrivate,
        files: messageFiles,
      }),
    onSuccess: async () => {
      setActionError(null);
      setMessageDraft("");
      setMessageDraftIsPrivate(false);
      setMessageFiles([]);
      if (filesInputRef.current) {
        filesInputRef.current.value = "";
      }
      await queryClient.invalidateQueries({ queryKey: ["repair-messages", item.equipmentId] });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Не удалось отправить сообщение ремонта.");
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: number) => deleteEquipmentRepairMessage(token, item.equipmentId, messageId),
    onSuccess: async () => {
      setActionError(null);
      setMessageToDeleteId(null);
      await queryClient.invalidateQueries({ queryKey: ["repair-messages", item.equipmentId] });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Не удалось удалить сообщение ремонта.");
    },
  });

  const updateMessageMutation = useMutation({
    mutationFn: ({
      messageId,
      text,
    }: {
      messageId: number;
      text: string;
    }) => updateEquipmentRepairMessage(token, item.equipmentId, messageId, { text }),
    onSuccess: async () => {
      setActionError(null);
      setEditingMessageId(null);
      setMessageEditDraft("");
      await queryClient.invalidateQueries({ queryKey: ["repair-messages", item.equipmentId] });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Не удалось сохранить сообщение ремонта.");
    },
  });

  const closeRepairMutation = useMutation({
    mutationFn: () => closeEquipmentRepair(token, item.equipmentId),
    onSuccess: async () => {
      setActionError(null);
      await invalidateRepairQueries(queryClient, item.equipmentId);
    },
  });

  const deleteArchiveMutation = useMutation({
    mutationFn: () => deleteRepairArchive(token, item.repairId),
    onSuccess: async () => {
      setActionError(null);
      setArchiveDeleteConfirmOpen(false);
      await invalidateRepairQueries(queryClient, item.equipmentId);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Не удалось удалить архив ремонта.");
    },
  });

  async function handleCreateMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    await createMessageMutation.mutateAsync();
  }

  async function handleUpdateMessage(event: FormEvent<HTMLFormElement>, messageId: number) {
    event.preventDefault();
    setActionError(null);
    await updateMessageMutation.mutateAsync({
      messageId,
      text: messageEditDraft,
    });
  }

  async function handleArchiveDownload() {
    setActionError(null);
    setDownloadingArchive(true);
    try {
      const { blob, fileName } = await downloadRepairArchiveZip(token, item.repairId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось скачать архив ремонта.",
      );
    } finally {
      setDownloadingArchive(false);
    }
  }

  async function handleCloseRepair() {
    setActionError(null);
    try {
      const milestonesSaved = await flushMilestonesAutoSave();
      if (!milestonesSaved) {
        return;
      }
      await closeRepairMutation.mutateAsync();
      setCloseConfirmOpen(false);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось завершить ремонт.",
      );
    }
  }

  async function handleDeleteArchive() {
    setActionError(null);
    try {
      await deleteArchiveMutation.mutateAsync();
    } catch {
      return;
    }
  }

  function handleFilesPick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setMessageFiles((current) => appendPendingFiles(current, files));
    event.target.value = "";
  }

  function handleRemovePendingFile(file: File) {
    setMessageFiles((current) => removePendingFile(current, file));
  }

  async function handleAttachmentDownload(
    message: RepairMessage,
    attachment: RepairMessageAttachment,
  ) {
    setActionError(null);
    setDownloadingAttachmentId(attachment.id);
    try {
      const { blob, fileName } = await downloadRepairMessageAttachment(
        token,
        item.equipmentId,
        message.id,
        attachment.id,
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось скачать вложение ремонта.");
    } finally {
      setDownloadingAttachmentId(null);
    }
  }

  async function loadAttachmentPreview(
    messageId: number,
    attachment: RepairMessageAttachment,
  ) {
    const { blob } = await downloadRepairMessageAttachment(
      token,
      item.equipmentId,
      messageId,
      attachment.id,
    );
    return blob;
  }

  const stageRows = useMemo(
    () => buildRepairStageRows(item, form, customStages),
    [customStages, form, item],
  );
  const repairTimeline = useMemo(
    () => buildRepairTimeline(item, isArchived, stageRows),
    [isArchived, item, stageRows],
  );
  const repairProgressLabel = useMemo(
    () => getStageRowsProgressLabel(stageRows, item.closedAt, "Ремонт завершен"),
    [item.closedAt, stageRows],
  );

  function handleOpenStageDraft(row: RepairStageRow) {
    setStageDraft({
      rowKey: row.key,
      anchorKey: row.anchorKey,
      insertSortOrder: getInsertSortOrderForRepairRow(row, customStages),
      label: "",
      date: "",
    });
  }

  function handleCancelStageDraft() {
    setStageDraft(null);
  }

  function handleConfirmStageDraft() {
    if (!stageDraft) {
      return;
    }
    const nextLabel = stageDraft.label.trim();
    if (!nextLabel) {
      setFormError("Введите название дополнительного этапа.");
      return;
    }
    setFormError(null);
    setCustomStages((current) =>
      insertProcessCustomStage(current, {
        anchorKey: stageDraft.anchorKey,
        insertSortOrder: stageDraft.insertSortOrder,
        label: nextLabel,
        date: stageDraft.date.trim() || null,
      }),
    );
    setStageDraft(null);
  }

  function handleRemoveCustomStage(stageId: string) {
    setCustomStages((current) => removeProcessCustomStage(current, stageId));
  }

  function handleMoveCustomStage(stageId: string, direction: "up" | "down") {
    setCustomStages((current) => moveProcessCustomStage(current, stageId, direction));
  }

  return (
    <>
      <article
        className={[
          "tone-parent rounded-3xl border border-line shadow-panel",
          flashActive ? "process-target-flash" : "",
        ].join(" ")}
        ref={articleRef}
        tabIndex={-1}
      >
        <button
          aria-expanded={expanded}
          className="flex w-full flex-col gap-4 px-4 py-4 text-left md:px-5"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                className="text-base font-semibold text-ink transition hover:text-signal-info"
                onClick={(event) => event.stopPropagation()}
                to={`/equipment/${item.equipmentId}`}
              >
                {item.equipmentName}
              </Link>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
                {equipmentTypeLabels[item.equipmentType]}
              </span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
                {repairProgressLabel}
              </span>
              {isArchived ? (
                <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
                  Архив
                </span>
              ) : null}
              {item.hasActiveVerification ? (
                <span className="rounded-full border border-signal-info/40 bg-[color:var(--accent-soft)] px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-ink">
                  Также в поверке
                </span>
              ) : null}
            </div>
            <p className="text-sm text-steel">
              {item.objectName}
              {item.modification ? ` · ${item.modification}` : ""}
              {item.serialNumber ? ` · № ${item.serialNumber}` : ""}
              {` · ${getRepairRouteSummary(item)}`}
            </p>
            {!isArchived ? (
              <p className="text-xs text-steel">
                {getRepairStartDateLabel(item)}: {formatDate(item.sentToRepairAt)}
              </p>
            ) : (
              <p className="text-xs text-steel">
                {[
                  item.resultDocnum
                    ? `${getArshinDocumentShortLabel(item.equipmentType)} ${item.resultDocnum}`
                    : null,
                  item.closedAt ? `закрыт ${formatDate(item.closedAt)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>

          <div className="icon-action-row">
            {supportsVerification(item.equipmentType) && item.arshinUrl ? (
              <IconActionLink
                href={item.arshinUrl}
                icon={<Icon className="h-4 w-4" name="arshin" />}
                label="Аршин"
                onClick={(event) => event.stopPropagation()}
                rel="noreferrer"
                size="tiny"
                target="_blank"
                title="Открыть запись о поверке в Аршине"
              />
            ) : null}
            <IconActionLink
              icon={<Icon className="h-4 w-4" name="equipment" />}
              label="Открыть карточку"
              onClick={(event) => event.stopPropagation()}
              size="tiny"
              to={`/equipment/${item.equipmentId}`}
            />
            {isArchived ? (
              <>
                <IconActionButton
                  className="h-10 w-10 shrink-0"
                  disabled={downloadingArchive}
                  icon={
                    downloadingArchive ? (
                      <span className="text-sm leading-none">…</span>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4m-5 7.5h18" />
                      </svg>
                    )
                  }
                  label="Скачать архив ремонта"
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleArchiveDownload();
                  }}
                />
                {canManage ? (
                  <IconActionButton
                    className="h-10 w-10 shrink-0"
                    disabled={deleteArchiveMutation.isPending}
                    icon={
                      deleteArchiveMutation.isPending ? (
                        <span className="text-sm leading-none">…</span>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      )
                    }
                    label="Удалить архив ремонта"
                    onClick={(event) => {
                      event.stopPropagation();
                      setArchiveDeleteConfirmOpen(true);
                    }}
                  />
                ) : null}
              </>
            ) : null}
            <span className="mt-1 shrink-0 text-steel">
              <svg
                aria-hidden="true"
                className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 9 5.25 6 5.25-6" />
              </svg>
            </span>
          </div>
        </div>
        </button>
        <button
          aria-expanded={expanded}
          className="block w-full px-4 pb-4 text-left md:px-5"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
        <ProcessTimelineStrip
          items={repairTimeline.items}
          markers={repairTimeline.markers}
          segments={repairTimeline.segments}
          progress={repairTimeline.progress}
          progressMarker={repairTimeline.progressMarker}
          scaleLabel={`Масштаб: ${repairTimeline.scaleDays} дней`}
        />
        </button>

        {expanded ? (
          <div className="space-y-4 border-t border-line px-4 pb-4 pt-4 md:px-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.68fr)_minmax(0,1.32fr)]">
            <section className="tone-child rounded-2xl border border-line p-4 shadow-panel">
              <div>
                <h4 className="text-sm font-semibold text-ink">Прибор</h4>
                <p className="text-xs text-steel">Краткая информация о приборе.</p>
              </div>

              <dl className="mt-4 space-y-2 text-sm">
                <InfoRow label="Объект" value={item.objectName} />
                <InfoRow label="Тип" value={equipmentTypeLabels[item.equipmentType]} />
                <InfoRow label="Наименование" value={item.equipmentName} />
                <InfoRow label="Модификация" value={item.modification} />
                <InfoRow label="Заводской номер" value={item.serialNumber} />
                <InfoRow label="Год выпуска" value={item.manufactureYear ? String(item.manufactureYear) : null} />
                <InfoRow label={getArshinDocumentLabel(item.equipmentType)} value={item.resultDocnum} />
                <InfoRow label="Где сейчас" value={item.currentLocationManual} />
              </dl>
            </section>

            <section className="tone-child rounded-2xl border border-line p-4 shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-ink">Этапы ремонта</h4>
                  <p className="text-xs text-steel">Маршрут, контрольные даты и просрочки по ремонту.</p>
                </div>
                {!isArchived && canManage ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      className={actionButtonClass}
                      disabled={closeRepairMutation.isPending || !isProcessReadyToClose(stageRows)}
                      onClick={() => setCloseConfirmOpen(true)}
                      title={isProcessReadyToClose(stageRows) ? undefined : getProcessCloseBlockedMessage()}
                      type="button"
                    >
                      {closeRepairMutation.isPending ? "Завершаем..." : "Завершить ремонт"}
                    </button>
                    {updateMilestonesMutation.isPending ? (
                      <span className="text-xs text-steel">Сохраняем этапы...</span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {formError ? <p className="mt-3 text-sm text-[#b04c43]">{formError}</p> : null}
              {!isArchived && canManage && !isProcessReadyToClose(stageRows) ? (
                <p className="mt-3 text-sm text-steel">
                  {getProcessCloseBlockedMessage()}
                </p>
              ) : null}

              <div className="mt-4 space-y-3">
                {stageRows.map((row) => (
                  <Fragment key={row.key}>
                  <div className="tone-grandchild rounded-2xl border border-line px-3 py-3 shadow-panel">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,0.82fr)_minmax(190px,0.78fr)_minmax(122px,0.5fr)_minmax(132px,0.52fr)_minmax(150px,0.5fr)]">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{row.label}</p>
                        {row.note ? <p className="mt-1 text-xs text-steel">{row.note}</p> : null}
                      </div>

                      <div className="min-w-0">
                        {row.editable && !isArchived && canManage ? (
                          <ProcessStageDateControl
                            onChange={(value) => {
                              setFormError(null);
                              applyStageDateChange({
                                customStageId: row.customStageId,
                                formKey: row.formKey,
                                setCustomStages,
                                setForm,
                                value,
                              });
                            }}
                            onEnter={() => void flushMilestonesAutoSave()}
                            value={row.actualValue}
                          />
                        ) : (
                          <p className="text-sm text-ink">{formatDate(row.actualValue || null)}</p>
                        )}
                      </div>

                      {row.deadline ? (
                        <div className="min-w-0 space-y-1">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Дедлайн</p>
                          <p className="text-sm text-ink">{formatDate(row.deadline)}</p>
                        </div>
                      ) : (
                        <div aria-hidden="true" />
                      )}

                      <div className="min-w-0">
                        <p className={`text-sm ${PROCESS_STAGE_TONE_CLASS[getProcessStageTone(row)]}`}>
                          {row.statusLabel}
                        </p>
                        {row.overdueDays > 0 ? (
                          <p className="text-xs text-[color:var(--danger-text)]">{formatOverdueLabel(row.overdueDays)}</p>
                        ) : null}
                      </div>

                      <div className="min-w-0">
                        {canManage && !isArchived ? (
                          <ProcessStageActions
                            addLabel={`Добавить этап после «${row.label}»`}
                            canAdd
                            canMoveDown={
                              Boolean(row.customStageId)
                              && canMoveProcessCustomStage(customStages, row.customStageId, "down")
                            }
                            canMoveUp={
                              Boolean(row.customStageId)
                              && canMoveProcessCustomStage(customStages, row.customStageId, "up")
                            }
                            canRemove={Boolean(row.customStageId)}
                            moveDownLabel={`Переместить этап «${row.label}» ниже`}
                            moveUpLabel={`Переместить этап «${row.label}» выше`}
                            removeLabel={`Удалить этап «${row.label}»`}
                            onAdd={() => handleOpenStageDraft(row)}
                            onMoveDown={() => {
                              if (row.customStageId) {
                                handleMoveCustomStage(row.customStageId, "down");
                              }
                            }}
                            onMoveUp={() => {
                              if (row.customStageId) {
                                handleMoveCustomStage(row.customStageId, "up");
                              }
                            }}
                            onRemove={() => {
                              if (row.customStageId) {
                                handleRemoveCustomStage(row.customStageId);
                              }
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {stageDraft && stageDraft.rowKey === row.key && canManage && !isArchived ? (
                    <ProcessStageDraftCard
                      className="tone-child rounded-2xl border border-line px-3 py-3"
                      date={stageDraft.date}
                      gridClassName="md:grid-cols-[minmax(0,0.82fr)_minmax(190px,0.78fr)_minmax(132px,0.52fr)_minmax(150px,0.5fr)]"
                      label={stageDraft.label}
                      placeholder="Например: Передано в логистику"
                      onCancel={handleCancelStageDraft}
                      onConfirm={handleConfirmStageDraft}
                      onDateChange={(value) =>
                        setStageDraft((current) =>
                          current
                            ? {
                                ...current,
                                date: value,
                              }
                            : null,
                        )
                      }
                      onLabelChange={(value) =>
                        setStageDraft((current) =>
                          current
                            ? {
                                ...current,
                                label: value,
                              }
                            : null,
                        )
                      }
                    />
                  ) : null}
                  </Fragment>
                ))}
              </div>
            </section>
          </div>

          {!isArchived ? (
            <section className="tone-child overflow-hidden rounded-3xl border border-line">
              <div className="tone-grandchild border-b border-line px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <button
                    aria-expanded={dialogExpanded}
                    className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
                    onClick={() => setDialogExpanded((current) => !current)}
                    type="button"
                  >
                    <div>
                      <h4 className="text-sm font-semibold text-ink">Диалог ремонта</h4>
                      <p className="mt-1 text-xs text-steel">Сообщения, фото, документы и чеки по ремонту.</p>
                    </div>
                    <svg
                      className={["mt-0.5 h-4 w-4 shrink-0 text-steel transition-transform", dialogExpanded ? "rotate-180" : ""].join(" ")}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  <span className="tone-parent rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
                    {messagesQuery.data?.length ?? 0}
                  </span>
                </div>
              </div>

              {dialogExpanded ? (
                <div className="space-y-3 px-4 py-4">
                  {messagesQuery.isLoading ? (
                    <p className="text-sm text-steel">Загружаем диалог ремонта...</p>
                  ) : null}
                  {messagesQuery.isError ? (
                    <p className="text-sm text-[#b04c43]">
                      {messagesQuery.error instanceof Error
                        ? messagesQuery.error.message
                        : "Не удалось загрузить сообщения ремонта."}
                    </p>
                  ) : null}
                  {!messagesQuery.isLoading && !messagesQuery.data?.length ? (
                    <p className="text-sm text-steel">Диалог ремонта пока пуст.</p>
                  ) : null}
                  {actionError ? <p className="text-sm text-[#b04c43]">{actionError}</p> : null}

                  {messagesQuery.data?.map((message) => (
                    <article
                      className={[
                        "tone-grandchild rounded-2xl border border-line px-4 py-3",
                        flashingMessageId === message.id ? "process-target-flash" : "",
                      ].join(" ")}
                      id={`repair-message-${item.equipmentId}-${message.id}`}
                      key={message.id}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-xs text-steel">{formatRepairMessageMeta(message)}</div>
                          {message.isPrivate ? <PrivateNoteBadge /> : null}
                        </div>
                        {message.authorUserId === currentUserId ? (
                          <div className="flex shrink-0 gap-2">
                            <IconActionButton
                              icon={
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                </svg>
                              }
                              label="Редактировать сообщение ремонта"
                              onClick={() => {
                                setEditingMessageId(message.id);
                                setMessageEditDraft(message.text ?? "");
                              }}
                              size="tiny"
                            />
                            <IconActionButton
                              icon={
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h10.5" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.75h4.5l.75 1.5H18" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 7.5.75 11.25h6l.75-11.25" />
                                </svg>
                              }
                              label="Удалить сообщение ремонта"
                              onClick={() => {
                                setActionError(null);
                                setMessageToDeleteId(message.id);
                              }}
                              size="tiny"
                            />
                          </div>
                        ) : canManage ? (
                          <IconActionButton
                            icon={
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h10.5" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.75h4.5l.75 1.5H18" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 7.5.75 11.25h6l.75-11.25" />
                              </svg>
                            }
                            label="Удалить сообщение ремонта"
                            onClick={() => {
                              setActionError(null);
                              setMessageToDeleteId(message.id);
                            }}
                            size="tiny"
                          />
                        ) : null}
                      </div>

                      {editingMessageId === message.id ? (
                        <form className="mt-2 space-y-2" onSubmit={(event) => void handleUpdateMessage(event, message.id)}>
                          <AutocompleteTextarea
                            className="form-input min-h-[56px] resize-none overflow-hidden py-3"
                            maxLength={4000}
                            onChange={setMessageEditDraft}
                            onInput={(event) => resizeTextarea(event.currentTarget)}
                            onKeyDown={handleTextareaSubmitShortcut}
                            ref={editMessageInputRef}
                            rows={2}
                            suggestions={textSuggestions}
                            value={messageEditDraft}
                          />
                          <div className="flex justify-end gap-2">
                            <EmojiPickerButton
                              disabled={updateMessageMutation.isPending}
                              onPick={(emoji) =>
                                setMessageEditDraft((current) =>
                                  insertEmojiAtCursor(editMessageInputRef.current, current, emoji),
                                )
                              }
                            />
                            <IconActionButton
                              icon={
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                              }
                              label="Отменить редактирование сообщения ремонта"
                              onClick={() => {
                                setEditingMessageId(null);
                                setMessageEditDraft("");
                                setActionError(null);
                              }}
                              size="tiny"
                            />
                            <IconActionButton
                              disabled={
                                updateMessageMutation.isPending
                                || (!messageEditDraft.trim() && !message.attachments.length)
                              }
                              icon={
                                updateMessageMutation.isPending ? (
                                  <span className="text-sm leading-none">…</span>
                                ) : (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )
                              }
                              label="Сохранить сообщение ремонта"
                              size="tiny"
                              type="submit"
                            />
                          </div>
                        </form>
                      ) : message.text ? (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink"><MentionText text={message.text} /></p>
                      ) : null}

                      <AttachmentPreviewList
                        attachments={message.attachments}
                        className="mt-3"
                        downloadingId={downloadingAttachmentId}
                        getMeta={(attachment) =>
                          formatAttachmentShortMeta(attachment.fileSize, attachment.fileMimeType)
                        }
                        loadPreview={(attachment) => loadAttachmentPreview(message.id, attachment)}
                        onDownload={(attachment) =>
                          void handleAttachmentDownload(message, attachment)
                        }
                        previewVariant="compact"
                      />
                    </article>
                  ))}
                </div>
              ) : null}

              {canManage && dialogExpanded ? (
                <form className="border-t border-line px-4 py-4" onSubmit={(event) => void handleCreateMessage(event)}>
                  <AutocompleteTextarea
                    className="form-input min-h-[56px] resize-none overflow-hidden py-3"
                    maxLength={4000}
                    onChange={setMessageDraft}
                    onInput={(event) => resizeTextarea(event.currentTarget)}
                    onKeyDown={handleTextareaSubmitShortcut}
                    placeholder="Новое сообщение по ремонту"
                    ref={messageInputRef}
                    rows={2}
                    suggestions={textSuggestions}
                    value={messageDraft}
                  />
                  <input className="sr-only" multiple onChange={handleFilesPick} ref={filesInputRef} type="file" />
                  <PendingAttachmentList
                    className="mt-3"
                    files={messageFiles}
                    onRemove={handleRemovePendingFile}
                  />

                  <div className="mt-3 flex justify-end gap-2">
                    <PrivateNoteToggleButton
                      active={messageDraftIsPrivate}
                      disabled={createMessageMutation.isPending}
                      onClick={() => setMessageDraftIsPrivate((current) => !current)}
                    />
                    <EmojiPickerButton
                      disabled={createMessageMutation.isPending}
                      onPick={(emoji) =>
                        setMessageDraft((current) =>
                          insertEmojiAtCursor(messageInputRef.current, current, emoji),
                        )
                      }
                    />
                    <IconActionButton
                      className="h-10 w-10"
                      icon={
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.25 20.25a6 6 0 0 1-8.49-8.49l9.9-9.9a4.5 4.5 0 1 1 6.36 6.36l-9.2 9.19a3 3 0 0 1-4.24-4.24l8.49-8.49" />
                        </svg>
                      }
                      label="Прикрепить файлы к сообщению ремонта"
                      onClick={() => openFilePicker(filesInputRef.current)}
                    />
                    <IconActionButton
                      className="h-10 w-10"
                      disabled={createMessageMutation.isPending || (!messageDraft.trim() && !messageFiles.length)}
                      icon={
                        createMessageMutation.isPending ? (
                          <span className="text-sm leading-none">…</span>
                        ) : (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3 21l18-9L3 3l3 9Zm0 0h7.5" />
                          </svg>
                        )
                      }
                      label="Отправить сообщение ремонта"
                      type="submit"
                    />
                  </div>
                </form>
              ) : null}
            </section>
          ) : null}

            <DeleteConfirmModal
              confirmLabel="Завершить ремонт"
              description={`Завершить ремонт для прибора «${item.equipmentName}» и перенести его в архив?`}
              errorMessage={actionError}
              isOpen={closeConfirmOpen}
              isPending={closeRepairMutation.isPending}
              pendingLabel="Завершаем..."
              title="Подтверждение завершения"
              onClose={() => setCloseConfirmOpen(false)}
              onConfirm={() => void handleCloseRepair()}
            />
          </div>
        ) : null}
      </article>
      <DeleteConfirmModal
        confirmLabel="Удалить из архива"
        description={`Удалить архив ремонта для прибора «${item.equipmentName}»? Диалог и вложения этой архивной записи тоже будут удалены.`}
        errorMessage={actionError}
        isOpen={archiveDeleteConfirmOpen}
        isPending={deleteArchiveMutation.isPending}
        pendingLabel="Удаляем..."
        title="Удаление архива ремонта"
        onClose={() => setArchiveDeleteConfirmOpen(false)}
        onConfirm={() => void handleDeleteArchive()}
      />
      <DeleteConfirmModal
        confirmLabel="Удалить сообщение"
        description="Сообщение будет удалено вместе с вложениями."
        errorMessage={actionError}
        isOpen={messageToDeleteId !== null}
        isPending={deleteMessageMutation.isPending}
        pendingLabel="Удаляем..."
        title="Удалить сообщение ремонта?"
        onClose={() => setMessageToDeleteId(null)}
        onConfirm={() => {
          if (messageToDeleteId === null) {
            return;
          }
          void deleteMessageMutation.mutateAsync(messageToDeleteId);
        }}
      />
    </>
  );
}

function RepairBatchCard({
  batch,
  token,
  canManage,
  lifecycleStatus,
  isTarget,
  targetEquipmentId,
  targetMessageId,
  mentionSuggestions,
}: {
  batch: RepairGroup;
  token: string;
  canManage: boolean;
  lifecycleStatus: RepairTab;
  isTarget: boolean;
  targetEquipmentId: number | null;
  targetMessageId: number | null;
  mentionSuggestions: Array<{ value: string; label: string }>;
}) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const anchor = batch.items[0];
  const isArchived = lifecycleStatus === "archived";
  const [expanded, setExpanded] = useState(false);
  const [dialogExpanded, setDialogExpanded] = useState(false);
  const [form, setForm] = useState<RepairMilestonesFormState>(() => buildRepairFormState(anchor));
  const [customStages, setCustomStages] = useState<ProcessCustomStage[]>(() =>
    normalizeProcessCustomStages(anchor.customStages, anchor.stageTemplate),
  );
  const [stageDraft, setStageDraft] = useState<ProcessStageDraftState | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageDraftIsPrivate, setMessageDraftIsPrivate] = useState(false);
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [messageEditDraft, setMessageEditDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [archiveDeleteConfirmOpen, setArchiveDeleteConfirmOpen] = useState(false);
  const [flashActive, setFlashActive] = useState(false);
  const [flashingMessageId, setFlashingMessageId] = useState<number | null>(null);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<number | null>(null);
  const [downloadingArchive, setDownloadingArchive] = useState(false);
  const [messageToDeleteId, setMessageToDeleteId] = useState<number | null>(null);
  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const [itemsSearchQuery, setItemsSearchQuery] = useState("");
  const deferredItemsSearchQuery = useDeferredValue(itemsSearchQuery);
  const [pendingMembershipEquipmentId, setPendingMembershipEquipmentId] = useState<number | null>(
    null,
  );
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const editMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const textSuggestions = useMemo(
    () => [...mentionSuggestions, ...buildRepairTextSuggestions(batch.items)],
    [batch.items, mentionSuggestions],
  );
  const baselineForm = useMemo(() => buildRepairFormState(anchor), [anchor]);
  const baselineCustomStages = useMemo(
    () => normalizeProcessCustomStages(anchor.customStages, anchor.stageTemplate),
    [anchor.customStages, anchor.stageTemplate],
  );
  const autoSaveValue = useMemo<RepairAutoSaveState>(
    () => ({
      milestones: form,
      customStages,
    }),
    [customStages, form],
  );
  const autoSaveBaseline = useMemo<RepairAutoSaveState>(
    () => ({
      milestones: baselineForm,
      customStages: baselineCustomStages,
    }),
    [baselineCustomStages, baselineForm],
  );

  useEffect(() => {
    setForm(baselineForm);
  }, [baselineForm]);

  useEffect(() => {
    setCustomStages(baselineCustomStages);
  }, [baselineCustomStages]);

  useEffect(() => {
    if (!messageInputRef.current) {
      return;
    }
    resizeTextarea(messageInputRef.current);
  }, [messageDraft]);

  useEffect(() => {
    if (!editMessageInputRef.current) {
      return;
    }
    resizeTextarea(editMessageInputRef.current);
  }, [editingMessageId, messageEditDraft]);

  useEffect(() => {
    if (!isTarget) {
      return;
    }
    setExpanded(true);
    if (targetMessageId) {
      setDialogExpanded(true);
    }
    setFlashActive(true);
    window.setTimeout(() => {
      articleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      articleRef.current?.focus({ preventScroll: true });
    }, 60);
    const timeoutId = window.setTimeout(() => setFlashActive(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [isTarget, targetMessageId]);

  const messagesQuery = useQuery({
    queryKey: ["repair-batch-messages", anchor.batchKey, anchor.equipmentId],
    queryFn: () => fetchEquipmentRepairMessages(token, anchor.equipmentId),
    enabled: Boolean(token) && Boolean(anchor.batchKey) && expanded && dialogExpanded && !isArchived,
  });

  useEffect(() => {
    if (
      !isTarget
      || !targetMessageId
      || !messagesQuery.data?.some((message) => message.id === targetMessageId)
    ) {
      return;
    }
    setDialogExpanded(true);
    setFlashingMessageId(targetMessageId);
    window.setTimeout(() => {
      document
        .getElementById(`repair-batch-message-${anchor.batchKey}-${targetMessageId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    const timeoutId = window.setTimeout(() => setFlashingMessageId(null), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [anchor.batchKey, isTarget, messagesQuery.data, targetMessageId]);

  const candidateEquipmentQuery = useQuery({
    queryKey: ["repair-batch-candidates", anchor.batchKey, anchor.folderId, deferredItemsSearchQuery],
    queryFn: () =>
      fetchEquipment(token, {
        folderId: anchor.folderId,
        query: deferredItemsSearchQuery,
      }),
    enabled: Boolean(token) && Boolean(anchor.batchKey) && itemsModalOpen && !isArchived,
  });

  const candidateItems = useMemo(() => {
    const existingIds = new Set(batch.items.map((item) => item.equipmentId));
    return (candidateEquipmentQuery.data ?? [])
      .filter((item) => !existingIds.has(item.id))
      .filter((item) => item.activeRepair === null)
      .map((item) => ({
        id: item.id,
        title: item.name,
        subtitle: buildRepairCandidateSubtitle(item),
        meta: item.currentLocationManual ? `Местонахождение: ${item.currentLocationManual}` : null,
      }));
  }, [batch.items, candidateEquipmentQuery.data]);
  const candidateSearchSuggestions = useMemo(
    () =>
      sortAutocompleteSuggestions(
        (candidateEquipmentQuery.data ?? [])
          .filter((item) => !batch.items.some((batchItem) => batchItem.equipmentId === item.id))
          .filter((item) => item.activeRepair === null)
          .flatMap((item) => [
            item.name,
            item.objectName,
            item.modification,
            item.serialNumber,
            item.currentLocationManual,
          ]),
      ),
    [batch.items, candidateEquipmentQuery.data],
  );

  const updateMilestonesMutation = useMutation({
    mutationFn: (nextState: RepairAutoSaveState) =>
      updateRepairBatchMilestones(token, anchor.batchKey ?? "", {
        sentToRepairAt: emptyToNull(nextState.milestones.sentToRepairAt),
        arrivedToDestinationAt: emptyToNull(nextState.milestones.arrivedToDestinationAt),
        sentFromRepairAt: emptyToNull(nextState.milestones.sentFromRepairAt),
        sentFromIrkutskAt: emptyToNull(nextState.milestones.sentFromIrkutskAt),
        arrivedToLenskAt: emptyToNull(nextState.milestones.arrivedToLenskAt),
        actuallyReceivedAt: emptyToNull(nextState.milestones.actuallyReceivedAt),
        incomingControlAt: emptyToNull(nextState.milestones.incomingControlAt),
        paidAt: emptyToNull(nextState.milestones.paidAt),
        customStages: nextState.customStages,
      }),
    onSuccess: async (updatedBatch) => {
      const updatedRepair = updatedBatch[0];
      setForm({
        sentToRepairAt: updatedRepair.sentToRepairAt,
        arrivedToDestinationAt: updatedRepair.arrivedToDestinationAt ?? "",
        sentFromRepairAt: updatedRepair.sentFromRepairAt ?? "",
        sentFromIrkutskAt: updatedRepair.sentFromIrkutskAt ?? "",
        arrivedToLenskAt: updatedRepair.arrivedToLenskAt ?? "",
        actuallyReceivedAt: updatedRepair.actuallyReceivedAt ?? "",
        incomingControlAt: updatedRepair.incomingControlAt ?? "",
        paidAt: updatedRepair.paidAt ?? "",
      });
      setCustomStages(
        normalizeProcessCustomStages(updatedRepair.customStages, updatedRepair.stageTemplate),
      );
      setStageDraft(null);
      setFormError(null);
      setActionError(null);
      await invalidateRepairGroupQueries(queryClient, batch);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Не удалось сохранить этапы ремонта.");
    },
  });

  const { flush: flushMilestonesAutoSave } = useQueuedAutoSave({
    value: autoSaveValue,
    baseline: autoSaveBaseline,
    enabled: canManage && !isArchived,
    isEqual: areRepairAutoSaveStatesEqual,
    validate: (nextState) => getRepairMilestoneValidationError(anchor, nextState.milestones),
    onValidationError: (validationError) => {
      setFormError(validationError);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Не удалось сохранить этапы ремонта.");
    },
    save: async (nextState) => {
      await updateMilestonesMutation.mutateAsync(nextState);
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: () =>
      createEquipmentRepairMessage(token, anchor.equipmentId, {
        text: messageDraft,
        isPrivate: messageDraftIsPrivate,
        files: messageFiles,
      }),
    onSuccess: async () => {
      setActionError(null);
      setMessageDraft("");
      setMessageDraftIsPrivate(false);
      setMessageFiles([]);
      if (filesInputRef.current) {
        filesInputRef.current.value = "";
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["repair-batch-messages", anchor.batchKey, anchor.equipmentId],
        }),
        invalidateRepairGroupQueries(queryClient, batch),
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Не удалось отправить сообщение ремонта.");
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: number) => deleteEquipmentRepairMessage(token, anchor.equipmentId, messageId),
    onSuccess: async () => {
      setActionError(null);
      setMessageToDeleteId(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["repair-batch-messages", anchor.batchKey, anchor.equipmentId],
        }),
        invalidateRepairGroupQueries(queryClient, batch),
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Не удалось удалить сообщение ремонта.");
    },
  });

  const updateMessageMutation = useMutation({
    mutationFn: ({
      messageId,
      text,
    }: {
      messageId: number;
      text: string;
    }) => updateEquipmentRepairMessage(token, anchor.equipmentId, messageId, { text }),
    onSuccess: async () => {
      setActionError(null);
      setEditingMessageId(null);
      setMessageEditDraft("");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["repair-batch-messages", anchor.batchKey, anchor.equipmentId],
        }),
        invalidateRepairGroupQueries(queryClient, batch),
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Не удалось сохранить сообщение ремонта.");
    },
  });

  const closeBatchMutation = useMutation({
    mutationFn: () => closeRepairBatch(token, anchor.batchKey ?? ""),
    onSuccess: async () => {
      setActionError(null);
      await invalidateRepairGroupQueries(queryClient, batch);
    },
  });

  const deleteArchiveMutation = useMutation({
    mutationFn: () => deleteRepairArchive(token, anchor.repairId),
    onSuccess: async () => {
      setActionError(null);
      setArchiveDeleteConfirmOpen(false);
      await invalidateRepairGroupQueries(queryClient, batch);
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Не удалось удалить архив группы ремонта.",
      );
    },
  });

  const updateBatchItemsMutation = useMutation({
    mutationFn: (payload: { addEquipmentIds?: number[]; removeEquipmentIds?: number[] }) =>
      updateRepairBatchItems(token, anchor.batchKey ?? "", payload),
    onSuccess: async (updatedBatch) => {
      const updatedRepair = updatedBatch[0];
      if (updatedRepair) {
        setForm(buildRepairFormState(updatedRepair));
        setCustomStages(
          normalizeProcessCustomStages(updatedRepair.customStages, updatedRepair.stageTemplate),
        );
        setStageDraft(null);
      }
      setActionError(null);
      setFormError(null);
      setItemsModalOpen(false);
      setItemsSearchQuery("");
      await invalidateRepairGroupQueries(queryClient, batch);
    },
  });

  async function handleCreateMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    await createMessageMutation.mutateAsync();
  }

  async function handleUpdateMessage(event: FormEvent<HTMLFormElement>, messageId: number) {
    event.preventDefault();
    setActionError(null);
    await updateMessageMutation.mutateAsync({
      messageId,
      text: messageEditDraft,
    });
  }

  async function handleAttachmentDownload(
    message: RepairMessage,
    attachment: RepairMessageAttachment,
  ) {
    setActionError(null);
    setDownloadingAttachmentId(attachment.id);
    try {
      const { blob, fileName } = await downloadRepairMessageAttachment(
        token,
        anchor.equipmentId,
        message.id,
        attachment.id,
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось скачать вложение ремонта.");
    } finally {
      setDownloadingAttachmentId(null);
    }
  }

  async function loadAttachmentPreview(
    messageId: number,
    attachment: RepairMessageAttachment,
  ) {
    const { blob } = await downloadRepairMessageAttachment(
      token,
      anchor.equipmentId,
      messageId,
      attachment.id,
    );
    return blob;
  }

  async function handleArchiveDownload() {
    setActionError(null);
    setDownloadingArchive(true);
    try {
      const { blob, fileName } = await downloadRepairArchiveZip(token, anchor.repairId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось скачать архив ремонта.");
    } finally {
      setDownloadingArchive(false);
    }
  }

  async function handleCloseBatch() {
    setActionError(null);
    try {
      const milestonesSaved = await flushMilestonesAutoSave();
      if (!milestonesSaved) {
        return;
      }
      await closeBatchMutation.mutateAsync();
      setCloseConfirmOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось завершить групповой ремонт.");
    }
  }

  async function handleDeleteArchive() {
    setActionError(null);
    try {
      await deleteArchiveMutation.mutateAsync();
    } catch {
      return;
    }
  }

  async function handleAddEquipmentToBatch(equipmentId: number) {
    setActionError(null);
    setPendingMembershipEquipmentId(equipmentId);
    try {
      await updateBatchItemsMutation.mutateAsync({ addEquipmentIds: [equipmentId] });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось добавить прибор в группу ремонта.",
      );
    } finally {
      setPendingMembershipEquipmentId(null);
    }
  }

  async function handleRemoveEquipmentFromBatch(equipmentId: number) {
    setActionError(null);
    setPendingMembershipEquipmentId(equipmentId);
    try {
      await updateBatchItemsMutation.mutateAsync({ removeEquipmentIds: [equipmentId] });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось вывести прибор из группы ремонта.",
      );
    } finally {
      setPendingMembershipEquipmentId(null);
    }
  }

  function handleFilesPick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setMessageFiles((current) => appendPendingFiles(current, files));
    event.target.value = "";
  }

  function handleRemovePendingFile(file: File) {
    setMessageFiles((current) => removePendingFile(current, file));
  }

  const stageRows = useMemo(
    () => buildRepairStageRows(anchor, form, customStages),
    [anchor, customStages, form],
  );
  const repairTimeline = useMemo(
    () => buildRepairTimeline(anchor, isArchived, stageRows),
    [anchor, isArchived, stageRows],
  );
  const repairProgressLabel = useMemo(
    () => getStageRowsProgressLabel(stageRows, anchor.closedAt, "Ремонт завершен"),
    [anchor.closedAt, stageRows],
  );

  function handleOpenStageDraft(row: RepairStageRow) {
    setStageDraft({
      rowKey: row.key,
      anchorKey: row.anchorKey,
      insertSortOrder: getInsertSortOrderForRepairRow(row, customStages),
      label: "",
      date: "",
    });
  }

  function handleCancelStageDraft() {
    setStageDraft(null);
  }

  function handleConfirmStageDraft() {
    if (!stageDraft) {
      return;
    }
    const nextLabel = stageDraft.label.trim();
    if (!nextLabel) {
      setFormError("Введите название дополнительного этапа.");
      return;
    }
    setFormError(null);
    setCustomStages((current) =>
      insertProcessCustomStage(current, {
        anchorKey: stageDraft.anchorKey,
        insertSortOrder: stageDraft.insertSortOrder,
        label: nextLabel,
        date: stageDraft.date.trim() ? stageDraft.date : null,
      }),
    );
    setStageDraft(null);
  }

  function handleRemoveCustomStage(stageId: string) {
    setCustomStages((current) => removeProcessCustomStage(current, stageId));
  }

  function handleMoveCustomStage(stageId: string, direction: "up" | "down") {
    setCustomStages((current) => moveProcessCustomStage(current, stageId, direction));
  }

  if (isArchived) {
    return (
      <>
        <article
          className={[
            "tone-parent rounded-3xl border border-line shadow-panel",
            flashActive ? "process-target-flash" : "",
          ].join(" ")}
          ref={articleRef}
          tabIndex={-1}
        >
        <button
          aria-expanded={expanded}
          className="flex w-full flex-col gap-4 px-4 py-4 text-left md:px-5"
          onClick={() => setExpanded((current) => !current)}
          type="button"
          >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
          <div className="icon-action-row">
                <span className="text-base font-semibold text-ink">{batch.title}</span>
                <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
                  Архив
                </span>
                <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
                  {batch.items.length} приборов
                </span>
                {anchor.hasActiveVerification ? (
                  <span className="rounded-full border border-signal-info/40 bg-[color:var(--accent-soft)] px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-ink">
                    Также в поверке
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-steel">
                {getRepairRouteSummary(anchor)}
              </p>
              <p className="text-xs text-steel">
                {getRepairStartDateLabel(anchor)}: {formatDate(anchor.sentToRepairAt)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <IconActionButton
                className="h-10 w-10 shrink-0"
                disabled={downloadingArchive}
                icon={
                  downloadingArchive ? (
                    <span className="text-sm leading-none">…</span>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4m-5 7.5h18" />
                    </svg>
                  )
                }
                label="Скачать архив ремонта"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleArchiveDownload();
                }}
              />
              {canManage ? (
                <IconActionButton
                  className="h-10 w-10 shrink-0"
                  disabled={deleteArchiveMutation.isPending}
                  icon={
                    deleteArchiveMutation.isPending ? (
                      <span className="text-sm leading-none">…</span>
                    ) : (
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                      </svg>
                    )
                  }
                  label="Удалить архив группы ремонта"
                  onClick={(event) => {
                    event.stopPropagation();
                    setArchiveDeleteConfirmOpen(true);
                  }}
                />
              ) : null}
              <span className="mt-1 shrink-0 text-steel">
                <svg
                  aria-hidden="true"
                  className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 9 5.25 6 5.25-6" />
                </svg>
              </span>
            </div>
          </div>
          </button>
          <button
            aria-expanded={expanded}
            className="block w-full px-4 pb-4 text-left md:px-5"
            onClick={() => setExpanded((current) => !current)}
            type="button"
          >
          <ProcessTimelineStrip
            items={repairTimeline.items}
            markers={repairTimeline.markers}
            progress={repairTimeline.progress}
            segments={repairTimeline.segments}
            progressMarker={repairTimeline.progressMarker}
            scaleLabel={`Масштаб: ${repairTimeline.scaleDays} дней`}
          />
          </button>

          {expanded ? (
            <div className="space-y-4 border-t border-line px-4 pb-4 pt-4 md:px-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.68fr)_minmax(0,1.32fr)]">
              <section className="tone-child rounded-2xl border border-line p-4 shadow-panel">
                <div>
                  <h4 className="text-sm font-semibold text-ink">Состав группы</h4>
                  <p className="text-xs text-steel">Все приборы, которые входили в архивный групповой ремонт.</p>
                </div>
                <div className="mt-4 space-y-2">
                  {batch.items.map((groupItem) => (
                    <div
                      className={[
                        "tone-grandchild rounded-2xl border border-line px-3 py-3",
                        groupItem.equipmentId === targetEquipmentId ? "process-target-flash" : "",
                      ].join(" ")}
                      key={groupItem.repairId}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Link
                          className="text-sm font-medium text-ink transition hover:text-signal-info"
                          to={`/equipment/${groupItem.equipmentId}`}
                        >
                          {groupItem.equipmentName}
                        </Link>
                        <IconActionLink
                          icon={<Icon className="h-4 w-4" name="equipment" />}
                          label="Открыть карточку"
                          size="tiny"
                          to={`/equipment/${groupItem.equipmentId}`}
                        />
                      </div>
                      <p className="mt-1 text-xs text-steel">
                        {[
                          groupItem.objectName,
                          groupItem.modification,
                          groupItem.serialNumber ? `№ ${groupItem.serialNumber}` : null,
                          groupItem.resultDocnum
                            ? `${getArshinDocumentShortLabel(groupItem.equipmentType)} ${groupItem.resultDocnum}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="tone-child rounded-2xl border border-line p-4 shadow-panel">
                <h4 className="text-sm font-semibold text-ink">Этапы и даты</h4>
                <div className="mt-4 space-y-3">
                  {stageRows.map((row) => (
                    <ArchiveRepairStageRow
                      key={row.key}
                      deadline={row.deadline}
                      label={row.label}
                      note={row.note}
                      overdueDays={row.overdueDays}
                      statusLabel={row.statusLabel}
                      value={row.actualValue}
                    />
                  ))}
                </div>
              </section>
            </div>
          </div>
          ) : null}
          {actionError ? <p className="px-4 pb-4 text-sm text-[#b04c43] md:px-5">{actionError}</p> : null}
        </article>
        <DeleteConfirmModal
          confirmLabel="Удалить из архива"
          description={`Удалить архив группы ремонта «${batch.title}»? Все приборы группы, общий диалог и вложения будут удалены.`}
          errorMessage={actionError}
          isOpen={archiveDeleteConfirmOpen}
          isPending={deleteArchiveMutation.isPending}
          pendingLabel="Удаляем..."
          title="Удаление архива группы ремонта"
          onClose={() => setArchiveDeleteConfirmOpen(false)}
          onConfirm={() => void handleDeleteArchive()}
        />
      </>
    );
  }

  return (
    <article
      className={[
        "tone-parent rounded-3xl border border-line shadow-panel",
        flashActive ? "process-target-flash" : "",
      ].join(" ")}
      ref={articleRef}
      tabIndex={-1}
    >
      <button
        aria-expanded={expanded}
        className="flex w-full flex-col gap-4 px-4 py-4 text-left md:px-5"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-ink">{batch.title}</span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
                {repairProgressLabel}
              </span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
                {batch.items.length} приборов
              </span>
              {batch.items.some((groupItem) => groupItem.hasActiveVerification) ? (
                <span className="rounded-full border border-signal-info/40 bg-[color:var(--accent-soft)] px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-ink">
                  часть группы в поверке
                </span>
              ) : null}
            </div>
            <p className="text-sm text-steel">
              {getRepairRouteSummary(anchor)}
            </p>
            <p className="text-xs text-steel">
              {getRepairStartDateLabel(anchor)}: {formatDate(anchor.sentToRepairAt)}
            </p>
          </div>

          <span className="mt-1 shrink-0 text-steel">
            <svg
              aria-hidden="true"
              className={`h-5 w-5 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 9 5.25 6 5.25-6" />
            </svg>
          </span>
        </div>
      </button>
      <button
        aria-expanded={expanded}
        className="block w-full px-4 pb-4 text-left md:px-5"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <ProcessTimelineStrip
          items={repairTimeline.items}
          markers={repairTimeline.markers}
          progress={repairTimeline.progress}
          segments={repairTimeline.segments}
          progressMarker={repairTimeline.progressMarker}
          scaleLabel={`Масштаб: ${repairTimeline.scaleDays} дней`}
        />
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-line px-4 pb-4 pt-4 md:px-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.68fr)_minmax(0,1.32fr)]">
            <section className="tone-child rounded-2xl border border-line p-4 shadow-panel">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-ink">Состав группы</h4>
                  <p className="text-xs text-steel">Все приборы ниже используют общий диалог и общие этапы ремонта.</p>
                </div>
                {canManage ? (
                  <IconActionButton
                    className="h-10 w-10 shrink-0"
                    disabled={updateBatchItemsMutation.isPending}
                    icon={<Icon className="h-4 w-4" name="plus" />}
                    label="Добавить прибор в группу ремонта"
                    onClick={() => setItemsModalOpen(true)}
                  />
                ) : null}
              </div>

              <div className="mt-4 space-y-2">
                {batch.items.map((groupItem) => (
                  <div
                    className={[
                      "tone-grandchild rounded-2xl border border-line px-3 py-3",
                      groupItem.equipmentId === targetEquipmentId ? "process-target-flash" : "",
                    ].join(" ")}
                    key={groupItem.repairId}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        className="text-sm font-medium text-ink transition hover:text-signal-info"
                        to={`/equipment/${groupItem.equipmentId}`}
                      >
                        {groupItem.equipmentName}
                      </Link>
                      <div className="flex items-center gap-2">
                        <IconActionLink
                          icon={<Icon className="h-4 w-4" name="equipment" />}
                          label="Открыть карточку"
                          size="tiny"
                          to={`/equipment/${groupItem.equipmentId}`}
                        />
                        {canManage ? (
                          <IconActionButton
                            disabled={pendingMembershipEquipmentId === groupItem.equipmentId}
                            icon={
                              pendingMembershipEquipmentId === groupItem.equipmentId ? (
                                <span className="text-sm leading-none">…</span>
                              ) : (
                                <Icon className="h-4 w-4" name="delete" />
                              )
                            }
                            label={`Убрать прибор «${groupItem.equipmentName}» из группы ремонта`}
                            onClick={() => void handleRemoveEquipmentFromBatch(groupItem.equipmentId)}
                            size="tiny"
                          />
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-steel">
                      {[
                        groupItem.objectName,
                        equipmentTypeLabels[groupItem.equipmentType],
                        groupItem.modification,
                        groupItem.serialNumber ? `№ ${groupItem.serialNumber}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="tone-child rounded-2xl border border-line p-4 shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-ink">Этапы ремонта</h4>
                  <p className="text-xs text-steel">Даты применяются сразу ко всей группе.</p>
                </div>
                {canManage ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      className={actionButtonClass}
                      disabled={closeBatchMutation.isPending || !isProcessReadyToClose(stageRows)}
                      onClick={() => setCloseConfirmOpen(true)}
                      title={isProcessReadyToClose(stageRows) ? undefined : getProcessCloseBlockedMessage()}
                      type="button"
                    >
                      {closeBatchMutation.isPending ? "Завершаем..." : "Завершить ремонт"}
                    </button>
                    {updateMilestonesMutation.isPending ? (
                      <span className="text-xs text-steel">Сохраняем этапы...</span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {formError ? <p className="mt-3 text-sm text-[#b04c43]">{formError}</p> : null}
              {!isProcessReadyToClose(stageRows) && canManage ? (
                <p className="mt-3 text-sm text-steel">
                  {getProcessCloseBlockedMessage()}
                </p>
              ) : null}

              <div className="mt-4 space-y-3">
                {stageRows.map((row) => (
                  <Fragment key={row.key}>
                  <div className="tone-grandchild rounded-2xl border border-line px-3 py-3 shadow-panel">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,0.82fr)_minmax(190px,0.78fr)_minmax(122px,0.5fr)_minmax(132px,0.52fr)_minmax(150px,0.5fr)]">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{row.label}</p>
                        {row.note ? <p className="mt-1 text-xs text-steel">{row.note}</p> : null}
                      </div>

                      <div className="min-w-0">
                        {canManage ? (
                          <ProcessStageDateControl
                            onChange={(value) => {
                              setFormError(null);
                              applyStageDateChange({
                                customStageId: row.customStageId,
                                formKey: row.formKey,
                                setCustomStages,
                                setForm,
                                value,
                              });
                            }}
                            onEnter={() => void flushMilestonesAutoSave()}
                            value={row.actualValue}
                          />
                        ) : (
                          <p className="text-sm text-ink">{formatDate(row.actualValue || null)}</p>
                        )}
                      </div>

                      {row.deadline ? (
                        <div className="min-w-0 space-y-1">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Дедлайн</p>
                          <p className="text-sm text-ink">{formatDate(row.deadline)}</p>
                        </div>
                      ) : (
                        <div aria-hidden="true" />
                      )}

                      <div className="min-w-0">
                        <p className={`text-sm ${PROCESS_STAGE_TONE_CLASS[getProcessStageTone(row)]}`}>
                          {row.statusLabel}
                        </p>
                        {row.overdueDays > 0 ? (
                          <p className="text-xs text-[color:var(--danger-text)]">{formatOverdueLabel(row.overdueDays)}</p>
                        ) : null}
                      </div>

                      <div className="min-w-0">
                        {canManage ? (
                          <ProcessStageActions
                            addLabel={`Добавить этап после «${row.label}»`}
                            canAdd
                            canMoveDown={
                              Boolean(row.customStageId)
                              && canMoveProcessCustomStage(customStages, row.customStageId, "down")
                            }
                            canMoveUp={
                              Boolean(row.customStageId)
                              && canMoveProcessCustomStage(customStages, row.customStageId, "up")
                            }
                            canRemove={Boolean(row.customStageId)}
                            moveDownLabel={`Переместить этап «${row.label}» ниже`}
                            moveUpLabel={`Переместить этап «${row.label}» выше`}
                            removeLabel={`Удалить этап «${row.label}»`}
                            onAdd={() => handleOpenStageDraft(row)}
                            onMoveDown={() => {
                              if (row.customStageId) {
                                handleMoveCustomStage(row.customStageId, "down");
                              }
                            }}
                            onMoveUp={() => {
                              if (row.customStageId) {
                                handleMoveCustomStage(row.customStageId, "up");
                              }
                            }}
                            onRemove={() => {
                              if (row.customStageId) {
                                handleRemoveCustomStage(row.customStageId);
                              }
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {stageDraft && stageDraft.rowKey === row.key && canManage ? (
                    <ProcessStageDraftCard
                      className="tone-child rounded-2xl border border-line px-3 py-3"
                      date={stageDraft.date}
                      gridClassName="md:grid-cols-[minmax(0,0.82fr)_minmax(190px,0.78fr)_minmax(132px,0.52fr)_minmax(150px,0.5fr)]"
                      label={stageDraft.label}
                      placeholder="Например: Передано в логистику"
                      onCancel={handleCancelStageDraft}
                      onConfirm={handleConfirmStageDraft}
                      onDateChange={(value) =>
                        setStageDraft((current) =>
                          current
                            ? {
                                ...current,
                                date: value,
                              }
                            : null,
                        )
                      }
                      onLabelChange={(value) =>
                        setStageDraft((current) =>
                          current
                            ? {
                                ...current,
                                label: value,
                              }
                            : null,
                        )
                      }
                    />
                  ) : null}
                  </Fragment>
                ))}
              </div>
            </section>
          </div>

          <section className="tone-child overflow-hidden rounded-3xl border border-line">
            <div className="tone-grandchild border-b border-line px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  aria-expanded={dialogExpanded}
                  className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
                  onClick={() => setDialogExpanded((current) => !current)}
                  type="button"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-ink">Общий диалог группы</h4>
                    <p className="mt-1 text-xs text-steel">Сообщения, фото, документы и чеки едины для всех приборов этого ремонта.</p>
                  </div>
                  <svg
                    className={["mt-0.5 h-4 w-4 shrink-0 text-steel transition-transform", dialogExpanded ? "rotate-180" : ""].join(" ")}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                <span className="tone-parent rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
                  {messagesQuery.data?.length ?? 0}
                </span>
              </div>
            </div>

            {dialogExpanded ? (
              <div className="space-y-3 px-4 py-4">
                {messagesQuery.isLoading ? (
                  <p className="text-sm text-steel">Загружаем диалог ремонта...</p>
                ) : null}
                {messagesQuery.isError ? (
                  <p className="text-sm text-[#b04c43]">
                    {messagesQuery.error instanceof Error
                      ? messagesQuery.error.message
                      : "Не удалось загрузить сообщения ремонта."}
                  </p>
                ) : null}
                {!messagesQuery.isLoading && !messagesQuery.data?.length ? (
                  <p className="text-sm text-steel">Диалог ремонта пока пуст.</p>
                ) : null}
                {actionError ? <p className="text-sm text-[#b04c43]">{actionError}</p> : null}

                {messagesQuery.data?.map((message) => (
                  <article
                    className={[
                      "tone-grandchild rounded-2xl border border-line px-4 py-3",
                      flashingMessageId === message.id ? "process-target-flash" : "",
                    ].join(" ")}
                    id={`repair-batch-message-${anchor.batchKey}-${message.id}`}
                    key={message.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-xs text-steel">{formatRepairMessageMeta(message)}</div>
                        {message.isPrivate ? <PrivateNoteBadge /> : null}
                      </div>
                      {message.authorUserId === currentUserId ? (
                        <div className="flex shrink-0 gap-2">
                          <IconActionButton
                            icon={
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                              </svg>
                            }
                            label="Редактировать сообщение ремонта"
                            onClick={() => {
                              setEditingMessageId(message.id);
                              setMessageEditDraft(message.text ?? "");
                            }}
                            size="tiny"
                          />
                          <IconActionButton
                            icon={
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h10.5" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.75h4.5l.75 1.5H18" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 7.5.75 11.25h6l.75-11.25" />
                              </svg>
                            }
                            label="Удалить сообщение ремонта"
                            onClick={() => {
                              setActionError(null);
                              setMessageToDeleteId(message.id);
                            }}
                            size="tiny"
                          />
                        </div>
                      ) : canManage ? (
                        <IconActionButton
                          icon={
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h10.5" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.75h4.5l.75 1.5H18" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 7.5.75 11.25h6l.75-11.25" />
                            </svg>
                          }
                          label="Удалить сообщение ремонта"
                          onClick={() => {
                            setActionError(null);
                            setMessageToDeleteId(message.id);
                          }}
                          size="tiny"
                        />
                      ) : null}
                    </div>

                    {editingMessageId === message.id ? (
                      <form className="mt-2 space-y-2" onSubmit={(event) => void handleUpdateMessage(event, message.id)}>
                        <AutocompleteTextarea
                          className="form-input min-h-[56px] resize-none overflow-hidden py-3"
                          maxLength={4000}
                          onChange={setMessageEditDraft}
                          onInput={(event) => resizeTextarea(event.currentTarget)}
                          onKeyDown={handleTextareaSubmitShortcut}
                          ref={editMessageInputRef}
                          rows={2}
                          suggestions={textSuggestions}
                          value={messageEditDraft}
                        />
                        <div className="flex justify-end gap-2">
                          <EmojiPickerButton
                            disabled={updateMessageMutation.isPending}
                            onPick={(emoji) =>
                              setMessageEditDraft((current) =>
                                insertEmojiAtCursor(editMessageInputRef.current, current, emoji),
                              )
                            }
                          />
                          <IconActionButton
                            icon={
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                              </svg>
                            }
                            label="Отменить редактирование сообщения ремонта"
                            onClick={() => {
                              setEditingMessageId(null);
                              setMessageEditDraft("");
                              setActionError(null);
                            }}
                            size="tiny"
                          />
                          <IconActionButton
                            disabled={
                              updateMessageMutation.isPending
                              || (!messageEditDraft.trim() && !message.attachments.length)
                            }
                            icon={
                              updateMessageMutation.isPending ? (
                                <span className="text-sm leading-none">…</span>
                              ) : (
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )
                            }
                            label="Сохранить сообщение ремонта"
                            size="tiny"
                            type="submit"
                          />
                        </div>
                      </form>
                    ) : message.text ? (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink"><MentionText text={message.text} /></p>
                    ) : null}

                    <AttachmentPreviewList
                      attachments={message.attachments}
                      className="mt-3"
                      downloadingId={downloadingAttachmentId}
                      getMeta={(attachment) =>
                        formatAttachmentShortMeta(attachment.fileSize, attachment.fileMimeType)
                      }
                      loadPreview={(attachment) => loadAttachmentPreview(message.id, attachment)}
                      onDownload={(attachment) =>
                        void handleAttachmentDownload(message, attachment)
                      }
                      previewVariant="compact"
                    />
                  </article>
                ))}
              </div>
            ) : null}

            {canManage && dialogExpanded ? (
              <form className="border-t border-line px-4 py-4" onSubmit={(event) => void handleCreateMessage(event)}>
                <AutocompleteTextarea
                  className="form-input min-h-[56px] resize-none overflow-hidden py-3"
                  maxLength={4000}
                  onChange={setMessageDraft}
                  onInput={(event) => resizeTextarea(event.currentTarget)}
                  onKeyDown={handleTextareaSubmitShortcut}
                  placeholder="Новое сообщение по ремонту"
                  ref={messageInputRef}
                  rows={2}
                  suggestions={textSuggestions}
                  value={messageDraft}
                />
                <input className="sr-only" multiple onChange={handleFilesPick} ref={filesInputRef} type="file" />
                <PendingAttachmentList
                  className="mt-3"
                  files={messageFiles}
                  onRemove={handleRemovePendingFile}
                />

                <div className="mt-3 flex justify-end gap-2">
                  <PrivateNoteToggleButton
                    active={messageDraftIsPrivate}
                    disabled={createMessageMutation.isPending}
                    onClick={() => setMessageDraftIsPrivate((current) => !current)}
                  />
                  <EmojiPickerButton
                    disabled={createMessageMutation.isPending}
                    onPick={(emoji) =>
                      setMessageDraft((current) =>
                        insertEmojiAtCursor(messageInputRef.current, current, emoji),
                      )
                    }
                  />
                  <IconActionButton
                    className="h-10 w-10"
                    icon={
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.25 20.25a6 6 0 0 1-8.49-8.49l9.9-9.9a4.5 4.5 0 1 1 6.36 6.36l-9.2 9.19a3 3 0 0 1-4.24-4.24l8.49-8.49" />
                      </svg>
                    }
                    label="Прикрепить файлы к сообщению ремонта"
                    onClick={() => openFilePicker(filesInputRef.current)}
                  />
                  <IconActionButton
                    className="h-10 w-10"
                    disabled={createMessageMutation.isPending || (!messageDraft.trim() && !messageFiles.length)}
                    icon={
                      createMessageMutation.isPending ? (
                        <span className="text-sm leading-none">…</span>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3 21l18-9L3 3l3 9Zm0 0h7.5" />
                        </svg>
                      )
                    }
                    label="Отправить сообщение ремонта"
                    type="submit"
                  />
                </div>
              </form>
            ) : null}
          </section>

          <DeleteConfirmModal
            confirmLabel="Завершить ремонт"
            description={`Завершить групповой ремонт «${batch.title}» и перенести его в архив?`}
            errorMessage={actionError}
            isOpen={closeConfirmOpen}
            isPending={closeBatchMutation.isPending}
            pendingLabel="Завершаем..."
            title="Подтверждение завершения"
            onClose={() => setCloseConfirmOpen(false)}
            onConfirm={() => void handleCloseBatch()}
          />
          <ProcessBatchItemsModal
            description="Можно добавить только приборы без активного ремонта."
            emptyMessage="Подходящих приборов для добавления в группу не найдено."
            errorMessage={
              candidateEquipmentQuery.error instanceof Error
                ? candidateEquipmentQuery.error.message
                : null
            }
            isLoading={candidateEquipmentQuery.isLoading}
            items={candidateItems}
            onAdd={(equipmentId) => void handleAddEquipmentToBatch(equipmentId)}
            onClose={() => {
              if (updateBatchItemsMutation.isPending) {
                return;
              }
              setItemsModalOpen(false);
              setItemsSearchQuery("");
            }}
            onSearchChange={setItemsSearchQuery}
            open={itemsModalOpen}
            pendingEquipmentId={pendingMembershipEquipmentId}
            searchSuggestions={candidateSearchSuggestions}
            searchValue={itemsSearchQuery}
            title="Добавить прибор в группу ремонта"
          />
        </div>
      ) : null}
      <DeleteConfirmModal
        confirmLabel="Удалить сообщение"
        description="Сообщение будет удалено вместе с вложениями."
        errorMessage={actionError}
        isOpen={messageToDeleteId !== null}
        isPending={deleteMessageMutation.isPending}
        pendingLabel="Удаляем..."
        title="Удалить сообщение ремонта?"
        onClose={() => setMessageToDeleteId(null)}
        onConfirm={() => {
          if (messageToDeleteId === null) {
            return;
          }
          void deleteMessageMutation.mutateAsync(messageToDeleteId);
        }}
      />
    </article>
  );
}

function ArchiveRepairStageRow({
  label,
  value,
  deadline,
  overdueDays,
  statusLabel,
  note,
}: {
  label: string;
  value: string;
  deadline: string | null;
  overdueDays: number;
  statusLabel: string;
  note?: string;
}) {
  return (
    <div className="tone-grandchild rounded-2xl border border-line px-3 py-3 shadow-panel">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(180px,0.8fr)_minmax(140px,0.7fr)_minmax(150px,0.7fr)]">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{label}</p>
          {note ? <p className="mt-1 text-xs text-steel">{note}</p> : null}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Факт</p>
          <p className="text-sm text-ink">{formatDate(value || null)}</p>
        </div>
        {deadline ? (
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Дедлайн</p>
            <p className="text-sm text-ink">{formatDate(deadline)}</p>
          </div>
        ) : (
          <div aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Статус</p>
          <p
            className={`text-sm ${PROCESS_STAGE_TONE_CLASS[getProcessStageTone({ actualValue: value, overdueDays })]}`}
          >
            {statusLabel}
          </p>
          {overdueDays > 0 ? (
            <p className="text-xs text-[color:var(--danger-text)]">{formatOverdueLabel(overdueDays)}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function buildRepairTimeline(
  item: RepairQueueItem,
  isArchived: boolean,
  stageRows: ReadonlyArray<RepairStageRow>,
): RepairTimelineModel {
  const stages = stageRows.map((row) => ({
    key: row.key,
    label: row.label,
    actual: row.actualValue || null,
    deadline: row.deadline,
    deadlineLabel: row.formKey
      ? getRepairStageDeadlineLabel(row.formKey)
      : row.deadline
        ? "Дедлайн этапа"
        : null,
    overdueDays: row.overdueDays,
  }));

  const startDate = parseIsoDate(item.sentToRepairAt);
  if (!startDate) {
    return {
      items: [],
      markers: [],
      segments: [],
      progress: 0,
      progressMarker: null,
      scaleDays: repairTimelineDefaultDays,
    };
  }

  const actualDates = stages
    .map((stage) => parseIsoDate(stage.actual))
    .filter((date): date is Date => Boolean(date));

  const today = startOfToday();
  const progressDate = isArchived
    ? [parseIsoDate(item.closedAt), ...actualDates].filter((date): date is Date => Boolean(date)).reduce(
        (max, current) => (current.getTime() > max.getTime() ? current : max),
        startDate,
      )
    : today;
  const nextUpcomingDeadlineDate = stages
    .filter((stage) => !stage.actual)
    .map((stage) => parseIsoDate(stage.deadline))
    .filter((date): date is Date => Boolean(date))
    .filter((date) => date.getTime() > progressDate.getTime())
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
  const scaleReferenceDate = nextUpcomingDeadlineDate ?? progressDate;
  const scaleDays = calculateAdaptiveTimelineScaleDays(startDate, scaleReferenceDate);
  const plannedTimelineEnd = new Date(startDate.getTime() + scaleDays * millisecondsPerDay);
  const lastTimelineDate = [startDate, plannedTimelineEnd, ...actualDates]
    .filter((date): date is Date => Boolean(date))
    .reduce((max, current) => (current.getTime() > max.getTime() ? current : max), startDate);

  const items: ProcessTimelineStripItem[] = stages.map((stage) => {
    const actualDate = parseIsoDate(stage.actual);
    const deadlineDate = parseIsoDate(stage.deadline);

    if (actualDate) {
      return {
        key: stage.key,
        label: stage.label,
        value: formatDate(stage.actual),
        status: "done",
        position: calculateTimelineProgress(startDate, lastTimelineDate, actualDate),
      };
    }

    return {
      key: stage.key,
      label: stage.label,
      status: "pending",
      position: deadlineDate
        ? calculateTimelineProgress(startDate, lastTimelineDate, deadlineDate)
        : undefined,
    };
  });

  const markers: ProcessTimelineStripMarker[] = [];
  const segments: ProcessTimelineStripSegment[] = buildCompletedTimelineSegments({
    stages,
    startDate,
    lastTimelineDate,
  });
  const repairDeadlineDate = parseIsoDate(item.repairDeadlineAt);
  const repairDeadlinePosition = repairDeadlineDate
    ? calculateTimelineProgress(startDate, lastTimelineDate, repairDeadlineDate)
    : null;

  if (repairDeadlineDate && repairDeadlineDate.getTime() <= lastTimelineDate.getTime()) {
    markers.push({
      key: "repairDeadlineAt",
      position: repairDeadlinePosition ?? 0,
      label: "Дедлайн ремонта",
      value: buildDeadlineMarkerValue({
        deadline: item.repairDeadlineAt,
        actual: item.arrivedToLenskAt,
        overdueDays: item.repairOverdueDays,
      }),
      tone: getDeadlineMarkerTone({
        deadline: item.repairDeadlineAt,
        actual: item.arrivedToLenskAt,
        overdueDays: item.repairOverdueDays,
      }),
    });
  }

  const registrationDeadlineDate = parseIsoDate(item.registrationDeadlineAt);
  if (
    !item.isOnSite
    && registrationDeadlineDate
    && registrationDeadlineDate.getTime() <= lastTimelineDate.getTime()
  ) {
    markers.push({
      key: "registrationDeadlineAt",
      position: calculateTimelineProgress(
        startDate,
        lastTimelineDate,
        registrationDeadlineDate,
      ),
      label: "Дедлайн получения",
      value: buildDeadlineMarkerValue({
        deadline: item.registrationDeadlineAt,
        actual: item.actuallyReceivedAt,
        overdueDays: item.registrationOverdueDays,
      }),
      tone: getDeadlineMarkerTone({
        deadline: item.registrationDeadlineAt,
        actual: item.actuallyReceivedAt,
        overdueDays: item.registrationOverdueDays,
      }),
    });
  }

  const controlDeadlineDate = parseIsoDate(item.controlDeadlineAt);
  if (!item.isOnSite && controlDeadlineDate && controlDeadlineDate.getTime() <= lastTimelineDate.getTime()) {
    markers.push({
      key: "controlDeadlineAt",
      position: calculateTimelineProgress(
        startDate,
        lastTimelineDate,
        controlDeadlineDate,
      ),
      label: "Дедлайн входного контроля",
      value: buildDeadlineMarkerValue({
        deadline: item.controlDeadlineAt,
        actual: item.incomingControlAt,
        overdueDays: item.controlOverdueDays,
      }),
      tone: getDeadlineMarkerTone({
        deadline: item.controlDeadlineAt,
        actual: item.incomingControlAt,
        overdueDays: item.controlOverdueDays,
      }),
    });
  }

  const paymentDeadlineDate = parseIsoDate(item.paymentDeadlineAt);
  if (!item.isOnSite && paymentDeadlineDate && paymentDeadlineDate.getTime() <= lastTimelineDate.getTime()) {
    markers.push({
      key: "paymentDeadlineAt",
      position: calculateTimelineProgress(
        startDate,
        lastTimelineDate,
        paymentDeadlineDate,
      ),
      label: "Дедлайн оплаты",
      value: buildDeadlineMarkerValue({
        deadline: item.paymentDeadlineAt,
        actual: item.paidAt,
        overdueDays: item.paymentOverdueDays,
      }),
      tone: getDeadlineMarkerTone({
        deadline: item.paymentDeadlineAt,
        actual: item.paidAt,
        overdueDays: item.paymentOverdueDays,
      }),
    });
  }

  for (const stage of stages) {
    const deadlineDate = parseIsoDate(stage.deadline);
    if (!deadlineDate || stage.overdueDays <= 0 || !stage.deadlineLabel) {
      continue;
    }

    const actualDate = parseIsoDate(stage.actual);
    const overdueEndDate = actualDate && actualDate.getTime() > deadlineDate.getTime()
      ? actualDate
      : !actualDate
        ? progressDate
        : null;

    if (!overdueEndDate || overdueEndDate.getTime() <= deadlineDate.getTime()) {
      continue;
    }

    segments.push({
      key: `${stage.key}-overdue`,
      start: calculateTimelineProgress(startDate, lastTimelineDate, deadlineDate),
      end: calculateTimelineProgress(startDate, lastTimelineDate, overdueEndDate),
      tone: "danger",
      label: stage.deadlineLabel,
      value: `${formatOverdueLabel(stage.overdueDays)} · до ${formatDate(stage.deadline)}`,
    });
  }

  return {
    items,
    markers,
    segments,
    progress: calculateTimelineProgress(startDate, lastTimelineDate, progressDate),
    progressMarker: buildRepairTimelineProgressMarker({
      startDate,
      progressDate,
      nextUpcomingDeadlineDate,
      isArchived,
    }),
    scaleDays,
  };
}

function getRepairRouteSummary(
  item: Pick<RepairQueueItem, "isOnSite" | "routeCity" | "routeDestination">,
): string {
  if (item.isOnSite) {
    return "На месте";
  }
  return [item.routeCity, item.routeDestination].filter(Boolean).join(" → ");
}

function isProcessReadyToClose(stageRows: ReadonlyArray<Pick<RepairStageRow, "actualValue">>): boolean {
  const lastStage = stageRows[stageRows.length - 1];
  return Boolean(lastStage?.actualValue);
}

function getProcessCloseBlockedMessage(): string {
  return "Завершение доступно после даты последнего этапа.";
}

function getRepairStartDateLabel(item: Pick<RepairQueueItem, "stageTemplate">): string {
  return getRepairStartLabel(item);
}

function getRepairStartLabel(item: Pick<RepairQueueItem, "stageTemplate">): string {
  return item.stageTemplate[0]?.label ?? "Демонтаж";
}

function mapRepairStageKeyToTimelineKey(key: string): string {
  switch (key) {
    case "sent_to_repair_at":
      return "sentToRepairAt";
    case "arrived_to_destination_at":
      return "arrivedToDestinationAt";
    case "sent_from_repair_at":
      return "sentFromRepairAt";
    case "sent_from_irkutsk_at":
      return "sentFromIrkutskAt";
    case "arrived_to_lensk_at":
      return "arrivedToLenskAt";
    case "actually_received_at":
      return "actuallyReceivedAt";
    case "incoming_control_at":
      return "incomingControlAt";
    case "paid_at":
      return "paidAt";
    default:
      return key;
  }
}

function mapRepairStageKeyToFormKey(key: string): keyof RepairMilestonesFormState | null {
  switch (key) {
    case "sent_to_repair_at":
      return "sentToRepairAt";
    case "arrived_to_destination_at":
      return "arrivedToDestinationAt";
    case "sent_from_repair_at":
      return "sentFromRepairAt";
    case "sent_from_irkutsk_at":
      return "sentFromIrkutskAt";
    case "arrived_to_lensk_at":
      return "arrivedToLenskAt";
    case "actually_received_at":
      return "actuallyReceivedAt";
    case "incoming_control_at":
      return "incomingControlAt";
    case "paid_at":
      return "paidAt";
    default:
      return null;
  }
}

function getRepairStageFormValue(
  key: string,
  form: RepairMilestonesFormState,
): string | null {
  const formKey = mapRepairStageKeyToFormKey(key);
  return formKey ? form[formKey] : null;
}

function getRepairStageDeadline(
  item: Pick<
    RepairQueueItem,
    | "repairDeadlineAt"
    | "registrationDeadlineAt"
    | "controlDeadlineAt"
    | "paymentDeadlineAt"
  >,
  formKey: keyof RepairMilestonesFormState,
): string | null {
  switch (formKey) {
    case "arrivedToLenskAt":
      return item.repairDeadlineAt;
    case "actuallyReceivedAt":
      return item.registrationDeadlineAt;
    case "incomingControlAt":
      return item.controlDeadlineAt;
    case "paidAt":
      return item.paymentDeadlineAt;
    default:
      return null;
  }
}

function getRepairStageOverdueDays(
  item: Pick<
    RepairQueueItem,
    | "repairOverdueDays"
    | "registrationOverdueDays"
    | "controlOverdueDays"
    | "paymentOverdueDays"
  >,
  formKey: keyof RepairMilestonesFormState,
): number {
  switch (formKey) {
    case "arrivedToLenskAt":
      return item.repairOverdueDays;
    case "actuallyReceivedAt":
      return item.registrationOverdueDays;
    case "incomingControlAt":
      return item.controlOverdueDays;
    case "paidAt":
      return item.paymentOverdueDays;
    default:
      return 0;
  }
}

function getRepairStageDeadlineLabel(
  formKey: keyof RepairMilestonesFormState,
): string | null {
  switch (formKey) {
    case "arrivedToLenskAt":
      return "Просрочка ремонта";
    case "actuallyReceivedAt":
      return "Просрочка получения";
    case "incomingControlAt":
      return "Просрочка входного контроля";
    case "paidAt":
      return "Просрочка оплаты";
    default:
      return null;
  }
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-line pb-2 last:border-b-0 last:pb-0">
      <dt className="text-[11px] uppercase tracking-[0.14em] text-steel">{label}</dt>
      <dd className="text-ink">{value || "—"}</dd>
    </div>
  );
}

function buildRepairFormState(item: {
  sentToRepairAt: string;
  arrivedToDestinationAt: string | null;
  sentFromRepairAt: string | null;
  sentFromIrkutskAt: string | null;
  arrivedToLenskAt: string | null;
  actuallyReceivedAt: string | null;
  incomingControlAt: string | null;
  paidAt: string | null;
}): RepairMilestonesFormState {
  return {
    sentToRepairAt: item.sentToRepairAt,
    arrivedToDestinationAt: item.arrivedToDestinationAt ?? "",
    sentFromRepairAt: item.sentFromRepairAt ?? "",
    sentFromIrkutskAt: item.sentFromIrkutskAt ?? "",
    arrivedToLenskAt: item.arrivedToLenskAt ?? "",
    actuallyReceivedAt: item.actuallyReceivedAt ?? "",
    incomingControlAt: item.incomingControlAt ?? "",
    paidAt: item.paidAt ?? "",
  };
}

function areRepairMilestoneFormsEqual(
  left: RepairMilestonesFormState,
  right: RepairMilestonesFormState,
): boolean {
  return left.sentToRepairAt === right.sentToRepairAt
    && left.arrivedToDestinationAt === right.arrivedToDestinationAt
    && left.sentFromRepairAt === right.sentFromRepairAt
    && left.sentFromIrkutskAt === right.sentFromIrkutskAt
    && left.arrivedToLenskAt === right.arrivedToLenskAt
    && left.actuallyReceivedAt === right.actuallyReceivedAt
    && left.incomingControlAt === right.incomingControlAt
    && left.paidAt === right.paidAt;
}

function getRepairMilestoneValidationError(
  item: Pick<RepairQueueItem, "stageTemplate">,
  form: RepairMilestonesFormState,
): string | null {
  return validateMilestoneOrder(
    item.stageTemplate.map((stage) => ({
      label: stage.label,
      value: getRepairStageFormValue(stage.key, form),
    })),
  );
}

function buildRepairStageRows(
  item: RepairQueueItem,
  form: RepairMilestonesFormState,
  customStages: ProcessCustomStage[],
): RepairStageRow[] {
  const rows: RepairStageRow[] = [];
  const customByAnchor = new Map<string, ProcessCustomStage[]>();
  for (const customStage of renumberProcessCustomStages(customStages)) {
    if (!item.stageTemplate.some((stage) => stage.key === customStage.afterKey)) {
      continue;
    }
    const current = customByAnchor.get(customStage.afterKey);
    if (current) {
      current.push(customStage);
      continue;
    }
    customByAnchor.set(customStage.afterKey, [customStage]);
  }

  for (const [index, stage] of item.stageTemplate.entries()) {
    const formKey = mapRepairStageKeyToFormKey(stage.key);
    const actualValue = formKey ? form[formKey] : "";
    const overdueDays = formKey ? getRepairStageOverdueDays(item, formKey) : 0;
    const baseStatusLabel = actualValue
      ? overdueDays > 0
        ? "Выполнено с просрочкой"
        : "Выполнено"
      : overdueDays > 0
        ? "Просрочено"
        : "Ждет";
    rows.push({
      key: mapRepairStageKeyToTimelineKey(stage.key),
      anchorKey: stage.key,
      customStageId: null,
      customSortOrder: null,
      label: stage.label,
      note:
        index === 0
          ? item.isOnSite
            ? "Работа выполняется на объекте, без маршрута отправки."
            : `Маршрут: ${item.routeCity} → ${item.routeDestination}`
          : undefined,
      editable: true,
      formKey,
      actualValue,
      deadline: formKey ? getRepairStageDeadline(item, formKey) : null,
      overdueDays,
      statusLabel: baseStatusLabel,
    });

    const extras = customByAnchor.get(stage.key);
    if (!extras?.length) {
      continue;
    }
    for (const extra of extras) {
      rows.push({
        key: `repair-custom-${extra.id}`,
        anchorKey: extra.afterKey,
        customStageId: extra.id,
        customSortOrder: extra.sortOrder,
        label: extra.label,
        note: "Промежуточный этап",
        editable: true,
        formKey: null,
        actualValue: extra.date ?? "",
        deadline: getCustomStageDeadline(item.sentToRepairAt, extra.deadlineDays),
        overdueDays: 0,
        statusLabel: extra.date ? "Выполнено" : "Ждет",
      });
    }
  }
  return rows;
}




function areRepairAutoSaveStatesEqual(
  left: RepairAutoSaveState,
  right: RepairAutoSaveState,
): boolean {
  return areRepairMilestoneFormsEqual(left.milestones, right.milestones)
    && areProcessCustomStagesEqual(left.customStages, right.customStages);
}


function getInsertSortOrderForRepairRow(
  row: Pick<RepairStageRow, "anchorKey" | "customStageId" | "customSortOrder">,
  currentCustomStages: ProcessCustomStage[],
): number {
  if (row.customStageId && typeof row.customSortOrder === "number") {
    return row.customSortOrder + 1;
  }
  const sameAnchorCount = currentCustomStages.filter(
    (stage) => stage.afterKey === row.anchorKey,
  ).length;
  return sameAnchorCount > 0 ? sameAnchorCount : 0;
}


function removeProcessCustomStage(
  currentStages: ProcessCustomStage[],
  stageId: string,
): ProcessCustomStage[] {
  return renumberProcessCustomStages(
    currentStages.filter((stage) => stage.id !== stageId),
  );
}



async function invalidateRepairQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  equipmentId: number,
) {
  await queryClient.invalidateQueries({ queryKey: ["repair-queue"] });
  await queryClient.invalidateQueries({ queryKey: ["repair-queue-page"] });
  await queryClient.invalidateQueries({ queryKey: ["repair-messages", equipmentId] });
  await queryClient.invalidateQueries({ queryKey: ["equipment-repair-history", equipmentId] });
  await queryClient.invalidateQueries({ queryKey: ["equipment-item", equipmentId] });
  await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
}

async function invalidateRepairGroupQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  batch: RepairGroup,
) {
  const anchor = batch.items[0];
  await queryClient.invalidateQueries({ queryKey: ["repair-queue"] });
  await queryClient.invalidateQueries({ queryKey: ["repair-queue-page"] });
  await queryClient.invalidateQueries({
    queryKey: ["repair-batch-messages", anchor.batchKey, anchor.equipmentId],
  });
  await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
  await Promise.all(
    batch.items.flatMap((item) => [
      queryClient.invalidateQueries({ queryKey: ["equipment-item", item.equipmentId] }),
      queryClient.invalidateQueries({ queryKey: ["equipment-repair-history", item.equipmentId] }),
      queryClient.invalidateQueries({ queryKey: ["repair-messages", item.equipmentId] }),
    ]),
  );
}

function buildRepairCandidateSubtitle(item: EquipmentItem): string {
  return [
    item.objectName,
    equipmentTypeLabels[item.equipmentType],
    item.modification,
    item.serialNumber ? `№ ${item.serialNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }
  return `${day}.${month}.${year}`;
}

function formatTimelineDurationValue(start: string, end: string): string {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate || !endDate) {
    return `${formatDate(start)} — ${formatDate(end)}`;
  }
  const days = Math.max(
    0,
    Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)),
  );
  return `${days} дн. · ${formatDate(start)} — ${formatDate(end)}`;
}

function buildRepairTimelineProgressMarker({
  startDate,
  progressDate,
  nextUpcomingDeadlineDate,
  isArchived,
}: {
  startDate: Date;
  progressDate: Date;
  nextUpcomingDeadlineDate: Date | null;
  isArchived: boolean;
}): ProcessTimelineStripProgressMarker {
  const metaParts = [`От старта: ${formatTimelineDayCount(calculateWholeDaysBetween(startDate, progressDate))}`];

  if (!isArchived && nextUpcomingDeadlineDate) {
    metaParts.push(
      `До дедлайна: ${formatTimelineDayCount(calculateWholeDaysBetween(progressDate, nextUpcomingDeadlineDate))}`,
    );
  }

  return {
    label: isArchived ? "Линия завершения" : "Линия текущей даты",
    value: formatDateFromDate(progressDate),
    meta: metaParts.join(" · "),
  };
}

function getDeadlineMarkerTone({
  deadline,
  actual,
  overdueDays,
}: {
  deadline: string | null;
  actual: string | null;
  overdueDays: number;
}): ProcessTimelineStripMarker["tone"] {
  const deadlineDate = parseIsoDate(deadline);
  const actualDate = parseIsoDate(actual);

  if (deadlineDate && actualDate && actualDate.getTime() <= deadlineDate.getTime()) {
    return "success";
  }
  if (overdueDays > 0) {
    return "danger";
  }
  return "default";
}

function buildDeadlineMarkerValue({
  deadline,
  actual,
  overdueDays,
}: {
  deadline: string | null;
  actual: string | null;
  overdueDays: number;
}): string {
  const base = formatDate(deadline);
  const deadlineDate = parseIsoDate(deadline);
  const actualDate = parseIsoDate(actual);

  if (deadlineDate && actualDate && actualDate.getTime() <= deadlineDate.getTime()) {
    return `${base} · в срок`;
  }
  if (overdueDays > 0) {
    return `${base} · просрочка ${formatOverdueLabel(overdueDays)}`;
  }
  return base;
}

function buildCompletedTimelineSegments({
  stages,
  startDate,
  lastTimelineDate,
}: {
  stages: ReadonlyArray<{
    key: string;
    label: string;
    actual: string | null;
  }>;
  startDate: Date;
  lastTimelineDate: Date;
}): ProcessTimelineStripSegment[] {
  const segments: ProcessTimelineStripSegment[] = [];
  for (let index = 1; index < stages.length; index += 1) {
    const previous = stages[index - 1];
    const current = stages[index];
    if (!previous.actual || !current.actual) {
      continue;
    }

    const previousDate = parseIsoDate(previous.actual);
    const currentDate = parseIsoDate(current.actual);
    if (!previousDate || !currentDate || currentDate.getTime() < previousDate.getTime()) {
      continue;
    }

    segments.push({
      key: `${previous.key}-${current.key}`,
      start: calculateTimelineProgress(startDate, lastTimelineDate, previousDate),
      end: calculateTimelineProgress(startDate, lastTimelineDate, currentDate),
      tone: "success",
      label: `${previous.label} → ${current.label}`,
      value: formatTimelineDurationValue(previous.actual, current.actual),
    });
  }
  return segments;
}

function buildRepairTextSuggestions(items: RepairQueueItem[]): string[] {
  return sortAutocompleteSuggestions(
    items.flatMap((item) => [
      item.batchName,
      item.objectName,
      item.equipmentName,
      item.modification,
      item.serialNumber,
      item.currentLocationManual,
      item.routeCity,
      item.routeDestination,
      item.resultDocnum,
    ]),
  );
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function formatDateFromDate(value: Date): string {
  return new Intl.DateTimeFormat("ru-RU").format(value);
}

function getCustomStageDeadline(
  startDate: string,
  deadlineDays: number | null,
): string | null {
  if (deadlineDays === null) {
    return null;
  }
  const parsed = parseIsoDate(startDate);
  if (!parsed) {
    return null;
  }
  parsed.setDate(parsed.getDate() + deadlineDays);
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function calculateWholeDaysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / millisecondsPerDay));
}

function formatTimelineDayCount(days: number): string {
  return `${days} дн.`;
}

function calculateTimelineProgress(start: Date, end: Date, point: Date): number {
  const startTime = start.getTime();
  const endTime = end.getTime();
  const pointTime = point.getTime();

  if (endTime <= startTime) {
    return pointTime >= startTime ? 1 : 0;
  }

  const ratio = (pointTime - startTime) / (endTime - startTime);
  return Math.min(1, Math.max(0, ratio));
}

function calculateAdaptiveTimelineScaleDays(start: Date, reference: Date): number {
  const elapsedDays = Math.max(
    0,
    Math.floor((reference.getTime() - start.getTime()) / millisecondsPerDay),
  );
  if (elapsedDays <= 100) {
    return repairTimelineDefaultDays;
  }
  if (elapsedDays <= 150) {
    return 150;
  }
  if (elapsedDays <= 200) {
    return 200;
  }
  return Math.ceil(elapsedDays / 50) * 50;
}

function formatOverdueLabel(days: number): string {
  if (days <= 0) {
    return "Нет";
  }
  return `${days} дн.`;
}

function emptyToNull(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resizeTextarea(element: HTMLTextAreaElement) {
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}

function formatRepairMessageMeta(message: RepairMessage): string {
  return `${message.authorDisplayName} · ${new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(message.createdAt))}`;
}

function parseFolderSearchParam(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isPositiveSearchParamId(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function parsePageSearchParam(value: string | null): number {
  if (!value) {
    return 1;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}
