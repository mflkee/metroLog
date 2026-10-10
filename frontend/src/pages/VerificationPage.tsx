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
  closeEquipmentVerification,
  closeVerificationBatch,
  createEquipmentVerificationMessage,
  deleteVerificationArchive,
  deleteEquipmentVerificationMessage,
  downloadVerificationArchiveZip,
  downloadVerificationMessageAttachment,
  exportVerificationQueueXlsx,
  fetchEquipment,
  fetchEquipmentFolders,
  fetchEquipmentVerificationMessages,
  fetchVerificationQueue,
  fetchVerificationQueuePage,
  getArshinDocumentLabel,
  getArshinDocumentShortLabel,
  supportsVerification,
  updateEquipmentVerificationMilestones,
  updateEquipmentVerificationMessage,
  updateVerificationBatchItems,
  updateVerificationBatchMilestones,
  type EquipmentItem,
  type ProcessCustomStage,
  type VerificationMessage,
  type VerificationMessageAttachment,
  type VerificationQueueItem,
} from "@/api/equipment";
import { fetchMentionUsers } from "@/api/users";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { Select } from "@/components/ui/select";
import { AutocompleteTextarea } from "@/components/AutocompleteTextarea";
import { EmojiPickerButton } from "@/components/EmojiPickerButton";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
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
import { validateVerificationMilestoneOrder } from "@/lib/milestoneValidation";
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

type VerificationTab = "active" | "archived";

type VerificationMilestonesFormState = {
  receivedAtDestinationAt: string;
  handedToCsmAt: string;
  verificationCompletedAt: string;
  pickedUpFromCsmAt: string;
  shippedBackAt: string;
  returnedFromVerificationAt: string;
};

type VerificationGroup = {
  key: string;
  title: string;
  items: VerificationQueueItem[];
};

type VerificationTimelineModel = {
  items: ProcessTimelineStripItem[];
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

type VerificationAutoSaveState = {
  milestones: VerificationMilestonesFormState;
  customStages: ProcessCustomStage[];
};

type VerificationStageRow = {
  key: string;
  anchorKey: string;
  customStageId: string | null;
  customSortOrder: number | null;
  label: string;
  actualValue: string;
  editable: boolean;
  formKey: keyof VerificationMilestonesFormState | null;
  deadline: string | null;
  statusLabel: string;
};

const tabButtonClass = "toolbar-tab";
const activeTabButtonClass = "toolbar-tab toolbar-tab--active";
const actionButtonClass = "btn-secondary";
const timelineBaseDays = 50;
const timelineStepDays = 25;
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const verificationQueuePageSize = 20;


export function VerificationPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const analysisFolderDefaultAppliedRef = useRef(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const previousDeferredSearchQueryRef = useRef(deferredSearchQuery);
  const canManage = hasOperatorAccess(user?.role);
  const tab: VerificationTab = searchParams.get("tab") === "archived" ? "archived" : "active";
  const targetVerificationId = Number(searchParams.get("verificationId") ?? "");
  const targetEquipmentId = Number(searchParams.get("equipmentId") ?? "");
  const targetMessageId = Number(searchParams.get("messageId") ?? "");
  const targetBatchKey = searchParams.get("batchKey");
  const selectedFolderId = parseFolderSearchParam(searchParams.get("folderId"));
  const analysisFolderIds = useMemo(() => getDashboardFolderIds(user), [user]);
  const analysisDefaultFolderId =
    analysisFolderIds.length === 1 ? analysisFolderIds[0] : null;
  const currentPage = parsePageSearchParam(searchParams.get("page"));
  const verificationQueueOffset = (currentPage - 1) * verificationQueuePageSize;
  const hasTargetNavigation =
    Boolean(targetBatchKey)
    || isPositiveSearchParamId(targetVerificationId)
    || isPositiveSearchParamId(targetEquipmentId);

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders", "verification"],
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

  const verificationPageQuery = useQuery({
    queryKey: [
      "verification-queue-page",
      tab,
      deferredSearchQuery,
      selectedFolderId ?? "all",
      currentPage,
      verificationQueuePageSize,
    ],
    queryFn: () =>
      fetchVerificationQueuePage(token ?? "", {
        lifecycleStatus: tab,
        query: deferredSearchQuery,
        folderId: selectedFolderId,
        limit: verificationQueuePageSize,
        offset: verificationQueueOffset,
      }),
    enabled: Boolean(token) && !hasTargetNavigation,
  });

  const targetVerificationFilter = isPositiveSearchParamId(targetVerificationId)
    ? targetVerificationId
    : null;
  const targetEquipmentFilter = isPositiveSearchParamId(targetEquipmentId)
    ? targetEquipmentId
    : null;

  const verificationFullQuery = useQuery({
    queryKey: [
      "verification-queue",
      tab,
      deferredSearchQuery,
      selectedFolderId ?? "all",
      "target-mode",
      targetBatchKey ?? "",
      targetVerificationFilter ?? "",
      targetEquipmentFilter ?? "",
    ],
    queryFn: () =>
      fetchVerificationQueue(token ?? "", {
        lifecycleStatus: tab,
        query: deferredSearchQuery,
        folderId: selectedFolderId,
        processId: targetVerificationFilter,
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

  const verificationItems = useMemo(
    () =>
      hasTargetNavigation
        ? verificationFullQuery.data ?? []
        : verificationPageQuery.data?.items ?? [],
    [hasTargetNavigation, verificationFullQuery.data, verificationPageQuery.data?.items],
  );

  const groupedItems = useMemo<VerificationGroup[]>(() => {
    const items = verificationItems;
    const groups = new Map<string, VerificationGroup>();
    for (const item of items) {
      const key = item.batchKey ?? `single-${item.verificationId}`;
      const title = item.batchName ?? item.equipmentName;
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        groups.set(key, { key, title, items: [item] });
      }
    }
    return Array.from(groups.values());
  }, [verificationItems]);

  const totalGroupCount = useMemo(
    () => (hasTargetNavigation ? groupedItems.length : verificationPageQuery.data?.totalGroups ?? 0),
    [groupedItems.length, hasTargetNavigation, verificationPageQuery.data?.totalGroups],
  );

  const activeCount = useMemo(
    () =>
      tab === "active"
        ? hasTargetNavigation
          ? verificationItems.length
          : verificationPageQuery.data?.totalItems ?? 0
        : null,
    [hasTargetNavigation, tab, verificationItems.length, verificationPageQuery.data?.totalItems],
  );

  const searchSuggestions = useMemo(
    () => buildVerificationTextSuggestions(verificationItems),
    [verificationItems],
  );

  const verificationError = hasTargetNavigation
    ? verificationFullQuery.error
    : verificationPageQuery.error;
  const isVerificationLoading = hasTargetNavigation
    ? verificationFullQuery.isLoading
    : verificationPageQuery.isLoading;

  const exportVerificationMutation = useMutation({
    mutationFn: () =>
      exportVerificationQueueXlsx(token ?? "", {
        lifecycleStatus: tab,
        query: deferredSearchQuery,
        folderId: selectedFolderId,
      }),
  });

  function handleTabChange(nextTab: VerificationTab) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("tab", nextTab);
    nextParams.set("page", "1");
    nextParams.delete("verificationId");
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
    nextParams.delete("verificationId");
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

  async function invalidateVerificationQueries() {
    await queryClient.invalidateQueries({ queryKey: ["verification-queue"] });
    await queryClient.invalidateQueries({ queryKey: ["verification-queue-page"] });
    await queryClient.invalidateQueries({ queryKey: ["equipment-item"] });
    await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
  }

  async function handleExportVerification() {
    setExportError(null);
    try {
      const { blob, fileName } = await exportVerificationMutation.mutateAsync();
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
        error instanceof Error ? error.message : "Не удалось выгрузить Excel-файл поверок.",
      );
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Поверка СИ"
        description="Отдельный список активных и архивных поверок с быстрым переходом в карточку прибора."
      />

      <div className="tone-parent toolbar-panel rounded-3xl border border-line shadow-panel">
        <div className="toolbar-panel__start">
          <button
            className={tab === "active" ? activeTabButtonClass : tabButtonClass}
            onClick={() => handleTabChange("active")}
            type="button"
          >
            <Icon className="h-4 w-4" name="verification" />
            Активные
          </button>
          <button
            className={tab === "archived" ? activeTabButtonClass : tabButtonClass}
            onClick={() => handleTabChange("archived")}
            type="button"
          >
            <Icon className="h-4 w-4" name="verification" />
            Архивные
          </button>
        </div>
        <div className="toolbar-panel__controls">
          <label className="sr-only" htmlFor="verification-folder-filter">
            Фильтр по папке
          </label>
          <Select
            className="toolbar-select"
            disabled={foldersQuery.isLoading || foldersQuery.isError}
            id="verification-folder-filter"
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
            <span className="sr-only">Поиск по поверкам</span>
            <svg className="toolbar-search__icon h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" />
            </svg>
            <AutocompleteInput
              className="toolbar-search__input"
              placeholder="Поиск по прибору, Аршин-номеру, маршруту"
              suggestions={searchSuggestions}
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </label>
          <IconActionButton
            icon={
              exportVerificationMutation.isPending ? (
                <span className="text-sm leading-none">…</span>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4m-5 7.5h18" />
                </svg>
              )
            }
            label="Экспортировать текущий список поверок в Excel"
            onClick={() => void handleExportVerification()}
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

      {!hasTargetNavigation && totalGroupCount > verificationQueuePageSize ? (
        <div className="tone-parent rounded-2xl border border-line px-4 py-3 shadow-panel">
          <PaginationControls
            currentPage={currentPage}
            pageSize={verificationQueuePageSize}
            totalItems={totalGroupCount}
            onPageChange={handlePageChange}
          />
        </div>
      ) : null}

      {isVerificationLoading ? (
        <p className="text-sm text-steel">Загружаем список поверок...</p>
      ) : null}

      {verificationError ? (
        <p className="text-sm text-[#b04c43]">
          {verificationError instanceof Error
            ? verificationError.message
            : "Не удалось загрузить список поверок."}
        </p>
      ) : null}

      {!isVerificationLoading && !verificationError && verificationItems.length === 0 ? (
        <div className="tone-parent rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-steel">
          {tab === "active" ? "Активных поверок пока нет." : "Архивных поверок пока нет."}
        </div>
      ) : null}

      {!isVerificationLoading && !verificationError && verificationItems.length > 0 ? (
        <div className="space-y-3">
          {groupedItems.map((group) =>
            group.items.length > 1 ? (
              <VerificationBatchCard
                batch={group}
                canManage={canManage}
                isTarget={Boolean(targetBatchKey) && group.key === targetBatchKey}
                key={`${tab}-${group.key}`}
                lifecycleStatus={tab}
                mentionSuggestions={mentionSuggestions}
                onUpdated={invalidateVerificationQueries}
                targetEquipmentId={Number.isInteger(targetEquipmentId) ? targetEquipmentId : null}
                targetMessageId={Number.isInteger(targetMessageId) ? targetMessageId : null}
                token={token ?? ""}
              />
            ) : (
              <VerificationQueueRow
                canManage={canManage}
                isTarget={
                  !targetBatchKey
                  && (
                    (Number.isInteger(targetVerificationId)
                      && group.items[0].verificationId === targetVerificationId)
                    || (
                      Number.isInteger(targetEquipmentId)
                      && group.items[0].equipmentId === targetEquipmentId
                    )
                  )
                }
                item={group.items[0]}
                key={`${tab}-${group.items[0].verificationId}`}
                lifecycleStatus={tab}
                mentionSuggestions={mentionSuggestions}
                onUpdated={invalidateVerificationQueries}
                targetMessageId={Number.isInteger(targetMessageId) ? targetMessageId : null}
                token={token ?? ""}
              />
            ),
          )}
        </div>
      ) : null}
    </section>
  );
}

function VerificationBatchCard({
  batch,
  token,
  canManage,
  lifecycleStatus,
  onUpdated,
  isTarget,
  targetEquipmentId,
  targetMessageId,
  mentionSuggestions,
}: {
  batch: VerificationGroup;
  token: string;
  canManage: boolean;
  lifecycleStatus: VerificationTab;
  onUpdated: () => Promise<void>;
  isTarget: boolean;
  targetEquipmentId: number | null;
  targetMessageId: number | null;
  mentionSuggestions: Array<{ value: string; label: string }>;
}) {
  const anchor = batch.items[0];
  const isArchived = lifecycleStatus === "archived";
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<VerificationMilestonesFormState>(() =>
    buildMilestonesFormState(anchor),
  );
  const [customStages, setCustomStages] = useState<ProcessCustomStage[]>(() =>
    normalizeProcessCustomStages(anchor.customStages, anchor.stageTemplate),
  );
  const [stageDraft, setStageDraft] = useState<ProcessStageDraftState | null>(null);
  const [dialogExpanded, setDialogExpanded] = useState(false);
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
  const currentUserId = useAuthStore((state) => state.user?.id);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const editMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const textSuggestions = useMemo(
    () => [...mentionSuggestions, ...buildVerificationTextSuggestions(batch.items)],
    [batch.items, mentionSuggestions],
  );
  const baselineForm = useMemo(() => buildMilestonesFormState(anchor), [anchor]);
  const baselineCustomStages = useMemo(
    () => normalizeProcessCustomStages(anchor.customStages, anchor.stageTemplate),
    [anchor.customStages, anchor.stageTemplate],
  );
  const autoSaveValue = useMemo<VerificationAutoSaveState>(
    () => ({
      milestones: form,
      customStages,
    }),
    [customStages, form],
  );
  const autoSaveBaseline = useMemo<VerificationAutoSaveState>(
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
  });

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
    queryKey: ["verification-batch-messages", anchor.batchKey, anchor.equipmentId],
    queryFn: () => fetchEquipmentVerificationMessages(token, anchor.equipmentId),
    enabled: Boolean(anchor.batchKey) && expanded,
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
        .getElementById(`verification-batch-message-${anchor.batchKey}-${targetMessageId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    const timeoutId = window.setTimeout(() => setFlashingMessageId(null), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [anchor.batchKey, isTarget, messagesQuery.data, targetMessageId]);

  const candidateEquipmentQuery = useQuery({
    queryKey: [
      "verification-batch-candidates",
      anchor.batchKey,
      anchor.folderId,
      deferredItemsSearchQuery,
    ],
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
      .filter((item) => supportsVerification(item.equipmentType))
      .filter((item) => !existingIds.has(item.id))
      .filter((item) => item.activeVerification === null)
      .map((item) => ({
        id: item.id,
        title: item.name,
        subtitle: buildEquipmentCandidateSubtitle(item),
        meta: item.siVerification?.resultDocnum
          ? `${getArshinDocumentLabel(item.equipmentType)}: ${item.siVerification.resultDocnum}`
          : null,
      }));
  }, [batch.items, candidateEquipmentQuery.data]);
  const candidateSearchSuggestions = useMemo(
    () =>
      sortAutocompleteSuggestions(
        (candidateEquipmentQuery.data ?? [])
          .filter((item) => supportsVerification(item.equipmentType))
          .filter((item) => !batch.items.some((batchItem) => batchItem.equipmentId === item.id))
          .filter((item) => item.activeVerification === null)
          .flatMap((item) => [
            item.name,
            item.objectName,
            item.modification,
            item.serialNumber,
            item.currentLocationManual,
            item.siVerification?.resultDocnum,
          ]),
      ),
    [batch.items, candidateEquipmentQuery.data],
  );

  const updateMilestonesMutation = useMutation({
    mutationFn: (nextState: VerificationAutoSaveState) =>
      updateVerificationBatchMilestones(token, anchor.batchKey ?? "", {
        receivedAtDestinationAt: emptyToNull(nextState.milestones.receivedAtDestinationAt),
        handedToCsmAt: emptyToNull(nextState.milestones.handedToCsmAt),
        verificationCompletedAt: emptyToNull(nextState.milestones.verificationCompletedAt),
        pickedUpFromCsmAt: emptyToNull(nextState.milestones.pickedUpFromCsmAt),
        shippedBackAt: emptyToNull(nextState.milestones.shippedBackAt),
        returnedFromVerificationAt: emptyToNull(nextState.milestones.returnedFromVerificationAt),
        customStages: nextState.customStages,
      }),
    onSuccess: async (updatedBatch) => {
      setForm(buildMilestonesFormState(updatedBatch[0]));
      setCustomStages(
        normalizeProcessCustomStages(updatedBatch[0].customStages, updatedBatch[0].stageTemplate),
      );
      setStageDraft(null);
      setFormError(null);
      setActionError(null);
      await onUpdated();
    },
  });

  const { flush: flushMilestonesAutoSave } = useQueuedAutoSave({
    value: autoSaveValue,
    baseline: autoSaveBaseline,
    enabled: canManage && !isArchived,
    isEqual: areVerificationAutoSaveStatesEqual,
    validate: (nextState) => getVerificationMilestoneValidationError(anchor, nextState.milestones),
    onValidationError: (validationError) => {
      setFormError(validationError);
    },
    onError: (error) => {
      setFormError(
        error instanceof Error ? error.message : "Не удалось обновить этапы поверки.",
      );
    },
    save: async (nextState) => {
      await updateMilestonesMutation.mutateAsync(nextState);
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: () =>
      createEquipmentVerificationMessage(token, anchor.equipmentId, {
        text: messageDraft,
        isPrivate: messageDraftIsPrivate,
        files: messageFiles,
      }),
    onSuccess: async () => {
      setMessageDraft("");
      setMessageDraftIsPrivate(false);
      setMessageFiles([]);
      setActionError(null);
      if (filesInputRef.current) {
        filesInputRef.current.value = "";
      }
      await Promise.all([
        messagesQuery.refetch(),
        onUpdated(),
      ]);
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: number) =>
      deleteEquipmentVerificationMessage(token, anchor.equipmentId, messageId),
    onSuccess: async () => {
      setActionError(null);
      setMessageToDeleteId(null);
      await Promise.all([messagesQuery.refetch(), onUpdated()]);
    },
  });

  const updateMessageMutation = useMutation({
    mutationFn: ({
      messageId,
      text,
    }: {
      messageId: number;
      text: string;
    }) => updateEquipmentVerificationMessage(token, anchor.equipmentId, messageId, { text }),
    onSuccess: async () => {
      setActionError(null);
      setEditingMessageId(null);
      setMessageEditDraft("");
      await Promise.all([messagesQuery.refetch(), onUpdated()]);
    },
  });

  const closeBatchMutation = useMutation({
    mutationFn: () => closeVerificationBatch(token, anchor.batchKey ?? ""),
    onSuccess: async () => {
      setActionError(null);
      await onUpdated();
    },
  });

  const deleteArchiveMutation = useMutation({
    mutationFn: () => deleteVerificationArchive(token, anchor.verificationId),
    onSuccess: async () => {
      setActionError(null);
      setArchiveDeleteConfirmOpen(false);
      await onUpdated();
    },
    onError: (error) => {
      setActionError(
        error instanceof Error ? error.message : "Не удалось удалить архив группы поверки.",
      );
    },
  });

  const updateBatchItemsMutation = useMutation({
    mutationFn: (payload: { addEquipmentIds?: number[]; removeEquipmentIds?: number[] }) =>
      updateVerificationBatchItems(token, anchor.batchKey ?? "", payload),
    onSuccess: async (updatedBatch) => {
      if (updatedBatch[0]) {
        setForm(buildMilestonesFormState(updatedBatch[0]));
        setCustomStages(
          normalizeProcessCustomStages(updatedBatch[0].customStages, updatedBatch[0].stageTemplate),
        );
        setStageDraft(null);
      }
      setActionError(null);
      setFormError(null);
      setItemsModalOpen(false);
      setItemsSearchQuery("");
      await onUpdated();
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await flushMilestonesAutoSave();
  }

  async function handleCreateMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    try {
      await createMessageMutation.mutateAsync();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось отправить сообщение поверки.",
      );
    }
  }

  async function handleUpdateMessage(event: FormEvent<HTMLFormElement>, messageId: number) {
    event.preventDefault();
    setActionError(null);
    try {
      await updateMessageMutation.mutateAsync({
        messageId,
        text: messageEditDraft,
      });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось сохранить сообщение поверки.",
      );
    }
  }

  async function handleAttachmentDownload(
    message: VerificationMessage,
    attachment: VerificationMessageAttachment,
  ) {
    setDownloadingAttachmentId(attachment.id);
    try {
      const { blob, fileName } = await downloadVerificationMessageAttachment(
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
      setActionError(
        error instanceof Error ? error.message : "Не удалось скачать вложение поверки.",
      );
    } finally {
      setDownloadingAttachmentId(null);
    }
  }

  async function loadAttachmentPreview(
    messageId: number,
    attachment: VerificationMessageAttachment,
  ) {
    const { blob } = await downloadVerificationMessageAttachment(
      token,
      anchor.equipmentId,
      messageId,
      attachment.id,
    );
    return blob;
  }

  function handleFilesPick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setMessageFiles((current) => appendPendingFiles(current, files));
    event.target.value = "";
  }

  function handleRemovePendingFile(file: File) {
    setMessageFiles((current) => removePendingFile(current, file));
  }

  async function handleArchiveDownload() {
    setActionError(null);
    setDownloadingArchive(true);
    try {
      const { blob, fileName } = await downloadVerificationArchiveZip(token, anchor.verificationId);
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
        error instanceof Error ? error.message : "Не удалось скачать архив поверки.",
      );
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
      setActionError(
        error instanceof Error ? error.message : "Не удалось завершить групповую поверку.",
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

  async function handleAddEquipmentToBatch(equipmentId: number) {
    setActionError(null);
    setPendingMembershipEquipmentId(equipmentId);
    try {
      await updateBatchItemsMutation.mutateAsync({ addEquipmentIds: [equipmentId] });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось добавить прибор в группу поверки.",
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
        error instanceof Error ? error.message : "Не удалось вывести прибор из группы поверки.",
      );
    } finally {
      setPendingMembershipEquipmentId(null);
    }
  }

  const stageRows = useMemo(
    () => buildVerificationStageRows(anchor, form, customStages),
    [anchor, customStages, form],
  );
  const verificationTimeline = useMemo(
    () => buildVerificationTimeline(anchor, isArchived, stageRows),
    [anchor, isArchived, stageRows],
  );
  const verificationProgressLabel = useMemo(
    () => getStageRowsProgressLabel(stageRows, anchor.closedAt, "Поверка завершена"),
    [anchor.closedAt, stageRows],
  );

  function handleOpenStageDraft(row: VerificationStageRow) {
    setStageDraft({
      rowKey: row.key,
      anchorKey: row.anchorKey,
      insertSortOrder: getInsertSortOrderForVerificationRow(row, customStages),
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
            className="flex w-full flex-wrap items-start justify-between gap-3 px-4 py-4 text-left"
            onClick={() => setExpanded((current) => !current)}
            type="button"
          >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink">{batch.title}</span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
                Архив
              </span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
                {batch.items.length} приборов
              </span>
            </div>
            <p className="text-xs text-steel">
              {getVerificationRouteSummary(anchor)}
            </p>
            <p className="text-xs text-steel">
              {getVerificationStartLabel(anchor)}: {formatDateOnly(anchor.sentToVerificationAt)}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
              label="Скачать архив поверки"
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
                label="Удалить архив группы поверки"
                onClick={(event) => {
                  event.stopPropagation();
                  setArchiveDeleteConfirmOpen(true);
                }}
              />
            ) : null}
            <span className="mt-1 shrink-0 text-steel">
              <svg
                className={["h-5 w-5 transition-transform", expanded ? "rotate-180" : ""].join(" ")}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </div>
          </button>
        <button
          aria-expanded={expanded}
          className="block w-full px-4 pb-4 text-left"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <ProcessTimelineStrip
            items={verificationTimeline.items}
            progress={verificationTimeline.progress}
            segments={verificationTimeline.segments}
            progressMarker={verificationTimeline.progressMarker}
            scaleLabel={`Масштаб: ${verificationTimeline.scaleDays} дней`}
          />
        </button>
        {expanded ? (
          <div className="space-y-4 border-t border-line px-4 pb-4 pt-4">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
              <section className="space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-ink">Состав группы</h4>
                  <p className="mt-1 text-xs text-steel">
                    Все СИ, которые входили в архивную групповую поверку.
                  </p>
                </div>
                <div className="space-y-2">
                  {batch.items.map((groupItem) => (
                    <div
                      className={[
                        "tone-child rounded-2xl border border-line px-3 py-3",
                        groupItem.equipmentId === targetEquipmentId ? "process-target-flash" : "",
                      ].join(" ")}
                      key={groupItem.verificationId}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <Link
                          className="text-sm font-medium text-ink transition hover:text-signal-info"
                          to={`/equipment/${groupItem.equipmentId}`}
                        >
                          {groupItem.equipmentName}
                        </Link>
                        {groupItem.arshinUrl ? (
                          <IconActionLink
                            href={groupItem.arshinUrl}
                            icon={<Icon className="h-4 w-4" name="arshin" />}
                            label="Аршин"
                            rel="noreferrer"
                            size="tiny"
                            target="_blank"
                          />
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-steel">
                        {[
                          groupItem.objectName,
                          groupItem.modification,
                          groupItem.serialNumber ? `зав. № ${groupItem.serialNumber}` : null,
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
              <section className="space-y-2">
                <h4 className="text-sm font-semibold text-ink">Этапы и даты</h4>
                {anchor.stageTemplate.slice(1).map((stage) => (
                  <ArchiveMilestoneRow
                    key={stage.key}
                    label={stage.label}
                    value={getVerificationStageActualValue(anchor, stage.key)}
                  />
                ))}
              </section>
            </div>
          </div>
        ) : null}
          {actionError ? <p className="mt-3 text-sm text-[#b04c43]">{actionError}</p> : null}
        </article>
        <DeleteConfirmModal
          confirmLabel="Удалить из архива"
          description={`Удалить архив группы поверки «${batch.title}»? Все приборы группы, общий диалог и вложения будут удалены.`}
          errorMessage={actionError}
          isOpen={archiveDeleteConfirmOpen}
          isPending={deleteArchiveMutation.isPending}
          pendingLabel="Удаляем..."
          title="Удаление архива группы поверки"
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
        className="flex w-full flex-wrap items-start justify-between gap-3 px-4 py-4 text-left"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <div className="min-w-0 space-y-1">
          <div className="icon-action-row">
            <span className="text-sm font-semibold text-ink">{batch.title}</span>
            <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
              {verificationProgressLabel}
            </span>
            <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
              {batch.items.length} приборов
            </span>
            {batch.items.some((item) => item.hasActiveRepair) ? (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
                часть группы в ремонте
              </span>
            ) : null}
          </div>
          <p className="text-xs text-steel">
            {getVerificationRouteSummary(anchor)}
          </p>
          <p className="text-xs text-steel">
            {getVerificationStartLabel(anchor)}: {formatDateOnly(anchor.sentToVerificationAt)}
          </p>
        </div>
        <span className="mt-1 shrink-0 text-steel">
          <svg
            className={["h-5 w-5 transition-transform", expanded ? "rotate-180" : ""].join(" ")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      <button
        aria-expanded={expanded}
        className="block w-full px-4 pb-4 text-left"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <ProcessTimelineStrip
          items={verificationTimeline.items}
          progress={verificationTimeline.progress}
          segments={verificationTimeline.segments}
          progressMarker={verificationTimeline.progressMarker}
          scaleLabel={`Масштаб: ${verificationTimeline.scaleDays} дней`}
        />
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-line px-4 pb-4 pt-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <section className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-ink">Состав группы</h4>
                  <p className="mt-1 text-xs text-steel">
                    Все приборы ниже используют общий диалог и общие этапы движения.
                  </p>
                </div>
                {canManage ? (
                  <IconActionButton
                    className="h-10 w-10 shrink-0"
                    disabled={updateBatchItemsMutation.isPending}
                    icon={<Icon className="h-4 w-4" name="plus" />}
                    label="Добавить прибор в группу поверки"
                    onClick={() => setItemsModalOpen(true)}
                  />
                ) : null}
              </div>
              <div className="space-y-2">
                {batch.items.map((item) => (
                  <div
                    className={[
                      "tone-child rounded-2xl border border-line px-3 py-3",
                      item.equipmentId === targetEquipmentId ? "process-target-flash" : "",
                    ].join(" ")}
                    key={item.verificationId}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        className="text-sm font-medium text-ink transition hover:text-signal-info"
                        to={`/equipment/${item.equipmentId}`}
                      >
                        {item.equipmentName}
                      </Link>
                      <div className="flex items-center gap-2">
                        {item.arshinUrl ? (
                          <IconActionLink
                            href={item.arshinUrl}
                            icon={<Icon className="h-4 w-4" name="arshin" />}
                            label="Аршин"
                            rel="noreferrer"
                            size="tiny"
                            target="_blank"
                          />
                        ) : null}
                        {canManage ? (
                          <IconActionButton
                            disabled={pendingMembershipEquipmentId === item.equipmentId}
                            icon={
                              pendingMembershipEquipmentId === item.equipmentId ? (
                                <span className="text-sm leading-none">…</span>
                              ) : (
                                <Icon className="h-4 w-4" name="delete" />
                              )
                            }
                            label={`Убрать прибор «${item.equipmentName}» из группы поверки`}
                            onClick={() => void handleRemoveEquipmentFromBatch(item.equipmentId)}
                            size="tiny"
                          />
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-steel">
                      {[
                        item.objectName,
                        item.modification,
                        item.serialNumber ? `зав. № ${item.serialNumber}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {lifecycleStatus === "active" ? (
              <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
                <div>
                  <h4 className="text-sm font-semibold text-ink">Этапы поверки</h4>
                  <p className="mt-1 text-xs text-steel">
                    Даты заполняются для всей группы сразу.
                  </p>
                </div>
                {formError ? <p className="text-sm text-[#b04c43]">{formError}</p> : null}
                {stageRows.map((row) => (
                  <Fragment key={row.key}>
                  <div
                    className="tone-child grid items-start gap-3 rounded-2xl border border-line px-3 py-3 md:grid-cols-[minmax(0,0.8fr)_minmax(190px,0.78fr)_minmax(124px,0.5fr)_minmax(150px,0.52fr)]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{row.label}</p>
                    </div>
                    <div className="min-w-0">
                      <ProcessStageDateControl
                        disabled={!canManage || !row.editable}
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
                    </div>
                    <div className={`min-w-0 text-sm ${PROCESS_STAGE_TONE_CLASS[getProcessStageTone(row)]}`}>
                      <span>{row.statusLabel}</span>
                      {row.deadline ? (
                        <p className="mt-1 text-xs text-steel">до {formatDateOnly(row.deadline)}</p>
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
                  {stageDraft && stageDraft.rowKey === row.key && canManage ? (
                    <ProcessStageDraftCard
                      className="tone-grandchild rounded-2xl border border-line px-3 py-3"
                      date={stageDraft.date}
                      gridClassName="md:grid-cols-[minmax(0,0.8fr)_minmax(190px,0.78fr)_minmax(124px,0.5fr)_minmax(150px,0.52fr)]"
                      label={stageDraft.label}
                      placeholder="Например: Передано в архив"
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

                {canManage ? (
                  <div className="flex justify-end gap-2">
                    <button
                      className={actionButtonClass}
                      disabled={closeBatchMutation.isPending}
                      onClick={() => setCloseConfirmOpen(true)}
                      type="button"
                    >
                      {closeBatchMutation.isPending ? "Завершаем..." : "Завершить поверку"}
                    </button>
                    {updateMilestonesMutation.isPending ? (
                      <span className="text-xs text-steel">Сохраняем этапы...</span>
                    ) : null}
                  </div>
                ) : null}
              </form>
            ) : null}
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
                    <p className="mt-1 text-xs text-steel">Сообщения и вложения едины для всех приборов этой групповой поверки.</p>
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
                <p className="text-sm text-steel">Загружаем общий диалог поверки...</p>
              ) : null}
              {messagesQuery.isError ? (
                <p className="text-sm text-[#b04c43]">
                  {messagesQuery.error instanceof Error
                    ? messagesQuery.error.message
                    : "Не удалось загрузить сообщения поверки."}
                </p>
              ) : null}
              {!messagesQuery.isLoading && !messagesQuery.data?.length ? (
                <p className="text-sm text-steel">Диалог группы пока пуст.</p>
              ) : null}
              {actionError ? <p className="text-sm text-[#b04c43]">{actionError}</p> : null}

              {messagesQuery.data?.map((message) => (
                <article
                  className={[
                    "tone-grandchild rounded-2xl border border-line px-4 py-3",
                    flashingMessageId === message.id ? "process-target-flash" : "",
                  ].join(" ")}
                  id={`verification-batch-message-${anchor.batchKey}-${message.id}`}
                  key={message.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs text-steel">
                        {formatVerificationMessageMeta(message)}
                      </div>
                      {message.isPrivate ? <PrivateNoteBadge /> : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                    {message.authorUserId === currentUserId ? (
                      <IconActionButton
                        icon={
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                          </svg>
                        }
                        label="Редактировать сообщение поверки"
                        onClick={() => {
                          setEditingMessageId(message.id);
                          setMessageEditDraft(message.text ?? "");
                        }}
                        size="tiny"
                      />
                    ) : null}
                    {canManage || message.authorUserId === currentUserId ? (
                      <IconActionButton
                        icon={
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        }
                        label="Удалить сообщение поверки"
                        onClick={() => {
                          setActionError(null);
                          setMessageToDeleteId(message.id);
                        }}
                        size="tiny"
                      />
                    ) : null}
                    </div>
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
                          label="Отменить редактирование сообщения поверки"
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
                          label="Сохранить сообщение поверки"
                          size="tiny"
                          type="submit"
                        />
                      </div>
                    </form>
                  ) : null}
                  {editingMessageId !== message.id && message.text ? (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                      <MentionText text={message.text} />
                    </p>
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

            {canManage && lifecycleStatus === "active" && dialogExpanded ? (
              <form className="border-t border-line px-4 py-4" onSubmit={(event) => void handleCreateMessage(event)}>
                <AutocompleteTextarea
                  className="form-input min-h-[56px] resize-none overflow-hidden py-3"
                  maxLength={4000}
                  onChange={setMessageDraft}
                  onKeyDown={handleTextareaSubmitShortcut}
                  onInput={(event) => resizeTextarea(event.currentTarget)}
                  placeholder="Новое сообщение по групповой поверке"
                  ref={messageInputRef}
                  rows={2}
                  suggestions={textSuggestions}
                  value={messageDraft}
                />
                <input
                  className="sr-only"
                  multiple
                  onChange={handleFilesPick}
                  ref={filesInputRef}
                  type="file"
                />
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
                    label="Прикрепить файлы к сообщению поверки"
                    onClick={() => openFilePicker(filesInputRef.current)}
                  />
                  <IconActionButton
                    className="h-10 w-10"
                    disabled={
                      createMessageMutation.isPending
                      || (!messageDraft.trim() && !messageFiles.length)
                    }
                    icon={
                      createMessageMutation.isPending ? (
                        <span className="text-sm leading-none">…</span>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3 21l18-9L3 3l3 9Zm0 0h7.5" />
                        </svg>
                      )
                    }
                    label="Отправить сообщение поверки"
                    type="submit"
                  />
                </div>
              </form>
            ) : null}
          </section>
          <DeleteConfirmModal
            confirmLabel="Завершить поверку"
            description={`Завершить групповую поверку «${batch.title}» и перенести ее в архив?`}
            errorMessage={actionError}
            isOpen={closeConfirmOpen}
            isPending={closeBatchMutation.isPending}
            pendingLabel="Завершаем..."
            title="Подтверждение завершения"
            onClose={() => setCloseConfirmOpen(false)}
            onConfirm={() => void handleCloseBatch()}
          />
          <ProcessBatchItemsModal
            description="Можно добавить только свободные СИ без активной поверки."
            emptyMessage="Подходящих СИ для добавления в группу не найдено."
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
            title="Добавить СИ в группу поверки"
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
        title="Удалить сообщение поверки?"
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

function VerificationQueueRow({
  item,
  token,
  canManage,
  lifecycleStatus,
  onUpdated,
  isTarget,
  targetMessageId,
  mentionSuggestions,
}: {
  item: VerificationQueueItem;
  token: string;
  canManage: boolean;
  lifecycleStatus: VerificationTab;
  onUpdated: () => Promise<void>;
  isTarget: boolean;
  targetMessageId: number | null;
  mentionSuggestions: Array<{ value: string; label: string }>;
}) {
  const isArchived = lifecycleStatus === "archived";
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<VerificationMilestonesFormState>(() =>
    buildMilestonesFormState(item),
  );
  const [customStages, setCustomStages] = useState<ProcessCustomStage[]>(() =>
    normalizeProcessCustomStages(item.customStages, item.stageTemplate),
  );
  const [stageDraft, setStageDraft] = useState<ProcessStageDraftState | null>(null);
  const [dialogExpanded, setDialogExpanded] = useState(false);
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
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const editMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const textSuggestions = useMemo(
    () => [...mentionSuggestions, ...buildVerificationTextSuggestions([item])],
    [item, mentionSuggestions],
  );
  const baselineForm = useMemo(() => buildMilestonesFormState(item), [item]);
  const baselineCustomStages = useMemo(
    () => normalizeProcessCustomStages(item.customStages, item.stageTemplate),
    [item.customStages, item.stageTemplate],
  );
  const autoSaveValue = useMemo<VerificationAutoSaveState>(
    () => ({
      milestones: form,
      customStages,
    }),
    [customStages, form],
  );
  const autoSaveBaseline = useMemo<VerificationAutoSaveState>(
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
  });

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
    queryKey: ["verification-messages", item.equipmentId],
    queryFn: () => fetchEquipmentVerificationMessages(token, item.equipmentId),
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
        .getElementById(`verification-message-${item.equipmentId}-${targetMessageId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    const timeoutId = window.setTimeout(() => setFlashingMessageId(null), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [isTarget, item.equipmentId, messagesQuery.data, targetMessageId]);

  const updateMilestonesMutation = useMutation({
    mutationFn: (nextState: VerificationAutoSaveState) =>
      updateEquipmentVerificationMilestones(token, item.equipmentId, {
        receivedAtDestinationAt: emptyToNull(nextState.milestones.receivedAtDestinationAt),
        handedToCsmAt: emptyToNull(nextState.milestones.handedToCsmAt),
        verificationCompletedAt: emptyToNull(nextState.milestones.verificationCompletedAt),
        pickedUpFromCsmAt: emptyToNull(nextState.milestones.pickedUpFromCsmAt),
        shippedBackAt: emptyToNull(nextState.milestones.shippedBackAt),
        returnedFromVerificationAt: emptyToNull(nextState.milestones.returnedFromVerificationAt),
        customStages: nextState.customStages,
      }),
    onSuccess: async (updated) => {
      setForm(buildMilestonesFormState(updated));
      setCustomStages(
        normalizeProcessCustomStages(updated.customStages, updated.stageTemplate),
      );
      setStageDraft(null);
      setFormError(null);
      setActionError(null);
      await onUpdated();
    },
  });

  const { flush: flushMilestonesAutoSave } = useQueuedAutoSave({
    value: autoSaveValue,
    baseline: autoSaveBaseline,
    enabled: canManage && !isArchived,
    isEqual: areVerificationAutoSaveStatesEqual,
    validate: (nextState) => getVerificationMilestoneValidationError(item, nextState.milestones),
    onValidationError: (validationError) => {
      setFormError(validationError);
    },
    onError: (error) => {
      setFormError(
        error instanceof Error ? error.message : "Не удалось обновить этапы поверки.",
      );
    },
    save: async (nextState) => {
      await updateMilestonesMutation.mutateAsync(nextState);
    },
  });

  const closeVerificationMutation = useMutation({
    mutationFn: () => closeEquipmentVerification(token, item.equipmentId),
    onSuccess: async () => {
      setActionError(null);
      await onUpdated();
    },
  });

  const deleteArchiveMutation = useMutation({
    mutationFn: () => deleteVerificationArchive(token, item.verificationId),
    onSuccess: async () => {
      setActionError(null);
      setArchiveDeleteConfirmOpen(false);
      await onUpdated();
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Не удалось удалить архив поверки.");
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: () =>
      createEquipmentVerificationMessage(token, item.equipmentId, {
        text: messageDraft,
        isPrivate: messageDraftIsPrivate,
        files: messageFiles,
      }),
    onSuccess: async () => {
      setMessageDraft("");
      setMessageDraftIsPrivate(false);
      setMessageFiles([]);
      setActionError(null);
      if (filesInputRef.current) {
        filesInputRef.current.value = "";
      }
      await Promise.all([messagesQuery.refetch(), onUpdated()]);
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: number) =>
      deleteEquipmentVerificationMessage(token, item.equipmentId, messageId),
    onSuccess: async () => {
      setActionError(null);
      setMessageToDeleteId(null);
      await Promise.all([messagesQuery.refetch(), onUpdated()]);
    },
  });

  const updateMessageMutation = useMutation({
    mutationFn: ({
      messageId,
      text,
    }: {
      messageId: number;
      text: string;
    }) => updateEquipmentVerificationMessage(token, item.equipmentId, messageId, { text }),
    onSuccess: async () => {
      setActionError(null);
      setEditingMessageId(null);
      setMessageEditDraft("");
      await Promise.all([messagesQuery.refetch(), onUpdated()]);
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await flushMilestonesAutoSave();
  }

  async function handleArchiveDownload() {
    setActionError(null);
    setDownloadingArchive(true);
    try {
      const { blob, fileName } = await downloadVerificationArchiveZip(token, item.verificationId);
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
        error instanceof Error ? error.message : "Не удалось скачать архив поверки.",
      );
    } finally {
      setDownloadingArchive(false);
    }
  }

  async function handleCloseVerification() {
    setActionError(null);
    try {
      const milestonesSaved = await flushMilestonesAutoSave();
      if (!milestonesSaved) {
        return;
      }
      await closeVerificationMutation.mutateAsync();
      setCloseConfirmOpen(false);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось завершить поверку.",
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

  async function handleCreateMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    try {
      await createMessageMutation.mutateAsync();
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось отправить сообщение поверки.",
      );
    }
  }

  async function handleUpdateMessage(event: FormEvent<HTMLFormElement>, messageId: number) {
    event.preventDefault();
    setActionError(null);
    try {
      await updateMessageMutation.mutateAsync({
        messageId,
        text: messageEditDraft,
      });
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось сохранить сообщение поверки.",
      );
    }
  }

  async function handleAttachmentDownload(
    message: VerificationMessage,
    attachment: VerificationMessageAttachment,
  ) {
    setDownloadingAttachmentId(attachment.id);
    try {
      const { blob, fileName } = await downloadVerificationMessageAttachment(
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
      setActionError(
        error instanceof Error ? error.message : "Не удалось скачать вложение поверки.",
      );
    } finally {
      setDownloadingAttachmentId(null);
    }
  }

  async function loadAttachmentPreview(
    messageId: number,
    attachment: VerificationMessageAttachment,
  ) {
    const { blob } = await downloadVerificationMessageAttachment(
      token,
      item.equipmentId,
      messageId,
      attachment.id,
    );
    return blob;
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
    () => buildVerificationStageRows(item, form, customStages),
    [customStages, form, item],
  );
  const verificationTimeline = useMemo(
    () => buildVerificationTimeline(item, isArchived, stageRows),
    [isArchived, item, stageRows],
  );
  const verificationProgressLabel = useMemo(
    () => getStageRowsProgressLabel(stageRows, item.closedAt, "Поверка завершена"),
    [item.closedAt, stageRows],
  );

  function handleOpenStageDraft(row: VerificationStageRow) {
    setStageDraft({
      rowKey: row.key,
      anchorKey: row.anchorKey,
      insertSortOrder: getInsertSortOrderForVerificationRow(row, customStages),
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
            className="flex w-full flex-wrap items-start justify-between gap-3 px-4 py-4 text-left"
            onClick={() => setExpanded((current) => !current)}
            type="button"
          >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                className="text-sm font-semibold text-ink transition hover:text-signal-info"
                onClick={(event) => event.stopPropagation()}
                to={`/equipment/${item.equipmentId}`}
              >
                {item.equipmentName}
              </Link>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
                Архив
              </span>
            </div>
            <p className="text-xs text-steel">
              {getVerificationRouteSummary(item)}
            </p>
            <p className="text-xs text-steel">
              {getVerificationStartLabel(item)}: {formatDateOnly(item.sentToVerificationAt)}
            </p>
            <p className="text-xs text-steel">
              {[
                item.resultDocnum
                  ? `${getArshinDocumentShortLabel(item.equipmentType)} ${item.resultDocnum}`
                  : null,
                item.closedAt ? `закрыта ${formatDateOnly(item.closedAt)}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex items-center gap-2">
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
              label="Скачать архив поверки"
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
                label="Удалить архив поверки"
                onClick={(event) => {
                  event.stopPropagation();
                  setArchiveDeleteConfirmOpen(true);
                }}
              />
            ) : null}
            <span className="mt-1 shrink-0 text-steel">
              <svg
                className={["h-5 w-5 transition-transform", expanded ? "rotate-180" : ""].join(" ")}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
              </svg>
            </span>
          </div>
          </button>
      <button
        aria-expanded={expanded}
        className="block w-full px-4 pb-4 text-left"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <ProcessTimelineStrip
          items={verificationTimeline.items}
          progress={verificationTimeline.progress}
          segments={verificationTimeline.segments}
          progressMarker={verificationTimeline.progressMarker}
          scaleLabel={`Масштаб: ${verificationTimeline.scaleDays} дней`}
        />
      </button>
        {expanded ? (
          <div className="mt-4 space-y-2 border-t border-line pt-4">
            {item.stageTemplate.slice(1).map((stage) => (
              <ArchiveMilestoneRow
                key={stage.key}
                label={stage.label}
                value={getVerificationStageActualValue(item, stage.key)}
              />
            ))}
          </div>
        ) : null}
          {actionError ? <p className="mt-3 text-sm text-[#b04c43]">{actionError}</p> : null}
        </article>
        <DeleteConfirmModal
          confirmLabel="Удалить из архива"
          description={`Удалить архив поверки для прибора «${item.equipmentName}»? Диалог и вложения этой архивной записи тоже будут удалены.`}
          errorMessage={actionError}
          isOpen={archiveDeleteConfirmOpen}
          isPending={deleteArchiveMutation.isPending}
          pendingLabel="Удаляем..."
          title="Удаление архива поверки"
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
            className="flex w-full flex-wrap items-start justify-between gap-3 px-4 py-4 text-left"
            onClick={() => setExpanded((current) => !current)}
            type="button"
          >
        <div className="min-w-0 space-y-1">
          <div className="icon-action-row">
            <Link
              className="text-sm font-semibold text-ink transition hover:text-signal-info"
              to={`/equipment/${item.equipmentId}`}
            >
              {item.equipmentName}
            </Link>
            <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
              {verificationProgressLabel}
            </span>
            {item.hasActiveRepair ? (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
                также в ремонте
              </span>
            ) : null}
          </div>
          <p className="text-xs text-steel">
            {[
              item.objectName,
              item.modification,
              item.serialNumber ? `зав. № ${item.serialNumber}` : null,
              item.manufactureYear ? String(item.manufactureYear) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className="text-xs text-steel">
            {getVerificationStartLabel(item)}: {formatDateOnly(item.sentToVerificationAt)}
          </p>
        </div>
        <div className="icon-action-row">
          {item.arshinUrl ? (
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
          <span className="mt-1 shrink-0 text-steel">
            <svg
              className={["h-5 w-5 transition-transform", expanded ? "rotate-180" : ""].join(" ")}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </span>
        </div>
      </button>
      <button
        aria-expanded={expanded}
        className="block w-full px-4 pb-4 text-left"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <ProcessTimelineStrip
          items={verificationTimeline.items}
          progress={verificationTimeline.progress}
          segments={verificationTimeline.segments}
          progressMarker={verificationTimeline.progressMarker}
          scaleLabel={`Масштаб: ${verificationTimeline.scaleDays} дней`}
        />
      </button>

      {expanded && lifecycleStatus === "active" ? (
        <div className="space-y-4 border-t border-line px-4 pb-4 pt-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.68fr)_minmax(0,1.32fr)]">
            <section className="tone-child rounded-2xl border border-line p-4 shadow-panel">
              <div>
                <h4 className="text-sm font-semibold text-ink">Прибор</h4>
                <p className="text-xs text-steel">Краткая информация о приборе.</p>
              </div>

              <dl className="mt-4 space-y-2 text-sm">
                <VerificationInfoRow label="Объект" value={item.objectName} />
                <VerificationInfoRow label="Наименование" value={item.equipmentName} />
                <VerificationInfoRow label="Модификация" value={item.modification} />
                <VerificationInfoRow label="Заводской номер" value={item.serialNumber} />
                <VerificationInfoRow
                  label="Год выпуска"
                  value={item.manufactureYear ? String(item.manufactureYear) : null}
                />
                <VerificationInfoRow label={getArshinDocumentLabel(item.equipmentType)} value={item.resultDocnum} />
                <VerificationInfoRow
                  label="Действительно до"
                  value={item.validDate ? formatDateOnly(item.validDate) : null}
                />
                <VerificationInfoRow
                  label="Состояние"
                  value={verificationProgressLabel}
                />
              </dl>
            </section>

            <section className="tone-child rounded-2xl border border-line p-4 shadow-panel">
              <form className="space-y-3" onSubmit={(event) => void handleSubmit(event)}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-ink">Этапы поверки</h4>
                    <p className="text-xs text-steel">Даты движения и текущий статус поверки.</p>
                  </div>
                  {canManage ? (
                    <div className="flex justify-end gap-2">
                      <button
                        className={actionButtonClass}
                        disabled={closeVerificationMutation.isPending}
                        onClick={() => setCloseConfirmOpen(true)}
                        type="button"
                      >
                        {closeVerificationMutation.isPending ? "Завершаем..." : "Завершить поверку"}
                      </button>
                      {updateMilestonesMutation.isPending ? (
                        <span className="text-xs text-steel">Сохраняем этапы...</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {formError ? <p className="text-sm text-[#b04c43]">{formError}</p> : null}

                {stageRows.map((row) => (
                  <Fragment key={row.key}>
                  <div
                    className="tone-grandchild grid items-start gap-3 rounded-2xl border border-line px-3 py-3 md:grid-cols-[minmax(0,0.8fr)_minmax(190px,0.78fr)_minmax(124px,0.5fr)_minmax(150px,0.52fr)]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{row.label}</p>
                    </div>
                    <div className="min-w-0">
                      <ProcessStageDateControl
                        disabled={!canManage || !row.editable}
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
                    </div>
                    <div className={`min-w-0 text-sm ${PROCESS_STAGE_TONE_CLASS[getProcessStageTone(row)]}`}>
                      <span>{row.statusLabel}</span>
                      {row.deadline ? (
                        <p className="mt-1 text-xs text-steel">до {formatDateOnly(row.deadline)}</p>
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
                  {stageDraft && stageDraft.rowKey === row.key && canManage ? (
                    <ProcessStageDraftCard
                      className="tone-child rounded-2xl border border-line px-3 py-3"
                      date={stageDraft.date}
                      gridClassName="md:grid-cols-[minmax(0,0.8fr)_minmax(190px,0.78fr)_minmax(124px,0.5fr)_minmax(150px,0.52fr)]"
                      label={stageDraft.label}
                      placeholder="Например: Передано в архив"
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
              </form>
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
                    <h4 className="text-sm font-semibold text-ink">Диалог поверки</h4>
                    <p className="mt-1 text-xs text-steel">Сообщения, фото и документы по одиночной поверке.</p>
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
                  <p className="text-sm text-steel">Загружаем диалог поверки...</p>
                ) : null}
                {messagesQuery.isError ? (
                  <p className="text-sm text-[#b04c43]">
                    {messagesQuery.error instanceof Error
                      ? messagesQuery.error.message
                      : "Не удалось загрузить сообщения поверки."}
                  </p>
                ) : null}
                {!messagesQuery.isLoading && !messagesQuery.data?.length ? (
                  <p className="text-sm text-steel">Диалог поверки пока пуст.</p>
                ) : null}
                {actionError ? <p className="text-sm text-[#b04c43]">{actionError}</p> : null}

                {messagesQuery.data?.map((message) => (
                  <article
                    className={[
                      "tone-grandchild rounded-2xl border border-line px-4 py-3",
                      flashingMessageId === message.id ? "process-target-flash" : "",
                    ].join(" ")}
                    id={`verification-message-${item.equipmentId}-${message.id}`}
                    key={message.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-xs text-steel">{formatVerificationMessageMeta(message)}</div>
                        {message.isPrivate ? <PrivateNoteBadge /> : null}
                      </div>
                      <div className="flex shrink-0 gap-2">
                      {message.authorUserId === currentUserId ? (
                        <IconActionButton
                          icon={
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                            </svg>
                          }
                          label="Редактировать сообщение поверки"
                          onClick={() => {
                            setEditingMessageId(message.id);
                            setMessageEditDraft(message.text ?? "");
                          }}
                          size="tiny"
                        />
                      ) : null}
                      {canManage || message.authorUserId === currentUserId ? (
                        <IconActionButton
                          icon={
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          }
                          label="Удалить сообщение поверки"
                          onClick={() => {
                            setActionError(null);
                            setMessageToDeleteId(message.id);
                          }}
                          size="tiny"
                        />
                      ) : null}
                      </div>
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
                            label="Отменить редактирование сообщения поверки"
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
                            label="Сохранить сообщение поверки"
                            size="tiny"
                            type="submit"
                          />
                        </div>
                      </form>
                    ) : null}
                    {editingMessageId !== message.id && message.text ? (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                        <MentionText text={message.text} />
                      </p>
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
                  placeholder="Новое сообщение по поверке"
                  ref={messageInputRef}
                  rows={2}
                  suggestions={textSuggestions}
                  value={messageDraft}
                />
                <input
                  className="sr-only"
                  multiple
                  onChange={handleFilesPick}
                  ref={filesInputRef}
                  type="file"
                />
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
                    label="Прикрепить файлы к сообщению поверки"
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
                    label="Отправить сообщение поверки"
                    type="submit"
                  />
                </div>
              </form>
            ) : null}
          </section>
        </div>
      ) : null}
      <DeleteConfirmModal
        confirmLabel="Завершить поверку"
        description={`Завершить поверку прибора «${item.equipmentName}» и перенести ее в архив?`}
        errorMessage={actionError}
        isOpen={closeConfirmOpen}
        isPending={closeVerificationMutation.isPending}
        pendingLabel="Завершаем..."
        title="Подтверждение завершения"
        onClose={() => setCloseConfirmOpen(false)}
        onConfirm={() => void handleCloseVerification()}
      />
      <DeleteConfirmModal
        confirmLabel="Удалить сообщение"
        description="Сообщение будет удалено вместе с вложениями."
        errorMessage={actionError}
        isOpen={messageToDeleteId !== null}
        isPending={deleteMessageMutation.isPending}
        pendingLabel="Удаляем..."
        title="Удалить сообщение поверки?"
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

function VerificationInfoRow({
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

function buildVerificationTimeline(
  item: Pick<VerificationQueueItem, "closedAt">,
  isArchived: boolean,
  stageRows: ReadonlyArray<VerificationStageRow>,
): VerificationTimelineModel {
  return buildVerificationTimelineModel(
    stageRows.map((row) => ({
      key: row.key,
      label: row.label,
      actual: row.actualValue || null,
    })),
    item.closedAt,
    isArchived,
  );
}

function getVerificationRouteSummary(
  item: Pick<
    VerificationQueueItem,
    "isOnSite" | "flowMode" | "routeCity" | "routeDestination"
  >,
): string {
  if (item.isOnSite) {
    return item.flowMode === "ONSITE_WITHOUT_DEMOLITION"
      ? "На месте без демонтажа"
      : "На месте с демонтажом";
  }
  return [item.routeCity, item.routeDestination].filter(Boolean).join(" → ");
}

function getVerificationStartLabel(
  item: Pick<VerificationQueueItem, "stageTemplate">,
): string {
  return item.stageTemplate[0]?.label ?? "Демонтаж";
}

function mapVerificationStageKeyToTimelineKey(key: string): string {
  switch (key) {
    case "sent_to_verification_at":
      return "sentToVerificationAt";
    case "received_at_destination_at":
      return "receivedAtDestinationAt";
    case "handed_to_csm_at":
      return "handedToCsmAt";
    case "verification_completed_at":
      return "verificationCompletedAt";
    case "picked_up_from_csm_at":
      return "pickedUpFromCsmAt";
    case "shipped_back_at":
      return "shippedBackAt";
    case "returned_from_verification_at":
      return "returnedFromVerificationAt";
    default:
      return key;
  }
}

function mapVerificationStageKeyToFormKey(
  key: string,
): keyof VerificationMilestonesFormState | null {
  switch (key) {
    case "received_at_destination_at":
      return "receivedAtDestinationAt";
    case "handed_to_csm_at":
      return "handedToCsmAt";
    case "verification_completed_at":
      return "verificationCompletedAt";
    case "picked_up_from_csm_at":
      return "pickedUpFromCsmAt";
    case "shipped_back_at":
      return "shippedBackAt";
    case "returned_from_verification_at":
      return "returnedFromVerificationAt";
    default:
      return null;
  }
}

function getVerificationStageActualValue(
  item: Pick<
    VerificationQueueItem,
    | "sentToVerificationAt"
    | "receivedAtDestinationAt"
    | "handedToCsmAt"
    | "verificationCompletedAt"
    | "pickedUpFromCsmAt"
    | "shippedBackAt"
    | "returnedFromVerificationAt"
  >,
  key: string,
): string | null {
  switch (key) {
    case "sent_to_verification_at":
      return item.sentToVerificationAt;
    case "received_at_destination_at":
      return item.receivedAtDestinationAt;
    case "handed_to_csm_at":
      return item.handedToCsmAt;
    case "verification_completed_at":
      return item.verificationCompletedAt;
    case "picked_up_from_csm_at":
      return item.pickedUpFromCsmAt;
    case "shipped_back_at":
      return item.shippedBackAt;
    case "returned_from_verification_at":
      return item.returnedFromVerificationAt;
    default:
      return null;
  }
}

function getVerificationStageFormValue(
  key: string,
  sentToVerificationAt: string,
  form: VerificationMilestonesFormState,
): string | null {
  switch (key) {
    case "sent_to_verification_at":
      return sentToVerificationAt;
    case "received_at_destination_at":
      return form.receivedAtDestinationAt;
    case "handed_to_csm_at":
      return form.handedToCsmAt;
    case "verification_completed_at":
      return form.verificationCompletedAt;
    case "picked_up_from_csm_at":
      return form.pickedUpFromCsmAt;
    case "shipped_back_at":
      return form.shippedBackAt;
    case "returned_from_verification_at":
      return form.returnedFromVerificationAt;
    default:
      return null;
  }
}

function buildVerificationTimelineModel(
  milestones: ReadonlyArray<{
    key: string;
    label: string;
    actual: string | null;
  }>,
  closedAt: string | null,
  isArchived: boolean,
): VerificationTimelineModel {
  const startDate = parseIsoDate(milestones[0]?.actual);
  if (!startDate) {
    return {
      items: [],
      segments: [],
      progress: 0,
      progressMarker: null,
      scaleDays: timelineBaseDays,
    };
  }

  const actualDates = milestones
    .map((stage) => parseIsoDate(stage.actual))
    .filter((date): date is Date => Boolean(date));
  const today = startOfToday();
  const progressDate = isArchived
    ? [parseIsoDate(closedAt), ...actualDates].filter((date): date is Date => Boolean(date)).reduce(
        (max, current) => (current.getTime() > max.getTime() ? current : max),
        startDate,
      )
    : today;
  const scaleDays = calculateAdaptiveTimelineScaleDays(startDate, progressDate);
  const plannedTimelineEnd = new Date(startDate.getTime() + scaleDays * millisecondsPerDay);
  const lastTimelineDate = [startDate, plannedTimelineEnd, ...actualDates]
    .filter((date): date is Date => Boolean(date))
    .reduce((max, current) => (current.getTime() > max.getTime() ? current : max), startDate);

  const items = milestones.map((stage) => {
    const actualDate = parseIsoDate(stage.actual);

    if (actualDate) {
      return {
        key: stage.key,
        label: stage.label,
        value: formatDateOnly(stage.actual ?? ""),
        status: "done" as const,
        position: calculateTimelineProgress(startDate, lastTimelineDate, actualDate),
      };
    }

    return {
      key: stage.key,
      label: stage.label,
      status: "pending" as const,
    };
  });

  return {
    items,
    segments: buildCompletedVerificationTimelineSegments({
      milestones,
      startDate,
      lastTimelineDate,
    }),
    progress: calculateTimelineProgress(startDate, lastTimelineDate, progressDate),
    progressMarker: buildVerificationTimelineProgressMarker({
      startDate,
      progressDate,
      isArchived,
    }),
    scaleDays,
  };
}

function buildEquipmentCandidateSubtitle(item: EquipmentItem): string {
  return [
    item.objectName,
    item.modification,
    item.serialNumber ? `зав. № ${item.serialNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function buildVerificationTimelineProgressMarker({
  startDate,
  progressDate,
  isArchived,
}: {
  startDate: Date;
  progressDate: Date;
  isArchived: boolean;
}): ProcessTimelineStripProgressMarker {
  return {
    label: isArchived ? "Линия завершения" : "Линия текущей даты",
    value: formatDateFromDate(progressDate),
    meta: `От отправки: ${formatTimelineDayCount(calculateWholeDaysBetween(startDate, progressDate))}`,
  };
}

function buildCompletedVerificationTimelineSegments(
  {
    milestones,
    startDate,
    lastTimelineDate,
  }: {
    milestones: ReadonlyArray<{
      key: string;
      label: string;
      actual: string | null;
    }>;
    startDate: Date;
    lastTimelineDate: Date;
  },
): ProcessTimelineStripSegment[] {
  const segments: ProcessTimelineStripSegment[] = [];
  for (let index = 1; index < milestones.length; index += 1) {
    const previous = milestones[index - 1];
    const current = milestones[index];
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

function ArchiveMilestoneRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="tone-child grid items-center gap-2 rounded-2xl border border-line px-3 py-3 md:grid-cols-[minmax(0,1fr)_180px_96px]">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
      </div>
      <div className="text-sm text-ink">{value ? formatDateOnly(value) : "Не указано"}</div>
      <div className="text-xs text-steel">{value ? "Выполнено" : "Нет даты"}</div>
    </div>
  );
}

function buildMilestonesFormState(
  item: Pick<
    VerificationQueueItem,
    | "receivedAtDestinationAt"
    | "handedToCsmAt"
    | "verificationCompletedAt"
    | "pickedUpFromCsmAt"
    | "shippedBackAt"
    | "returnedFromVerificationAt"
  >,
): VerificationMilestonesFormState {
  return {
    receivedAtDestinationAt: item.receivedAtDestinationAt ?? "",
    handedToCsmAt: item.handedToCsmAt ?? "",
    verificationCompletedAt: item.verificationCompletedAt ?? "",
    pickedUpFromCsmAt: item.pickedUpFromCsmAt ?? "",
    shippedBackAt: item.shippedBackAt ?? "",
    returnedFromVerificationAt: item.returnedFromVerificationAt ?? "",
  };
}

function areVerificationMilestoneFormsEqual(
  left: VerificationMilestonesFormState,
  right: VerificationMilestonesFormState,
): boolean {
  return left.receivedAtDestinationAt === right.receivedAtDestinationAt
    && left.handedToCsmAt === right.handedToCsmAt
    && left.verificationCompletedAt === right.verificationCompletedAt
    && left.pickedUpFromCsmAt === right.pickedUpFromCsmAt
    && left.shippedBackAt === right.shippedBackAt
    && left.returnedFromVerificationAt === right.returnedFromVerificationAt;
}

function getVerificationMilestoneValidationError(
  item: Pick<VerificationQueueItem, "stageTemplate" | "sentToVerificationAt">,
  form: VerificationMilestonesFormState,
): string | null {
  return validateVerificationMilestoneOrder(
    item.stageTemplate.map((stage) => ({
      label: stage.label,
      value: getVerificationStageFormValue(stage.key, item.sentToVerificationAt, form),
    })),
  );
}

function buildVerificationStageRows(
  item: Pick<
    VerificationQueueItem,
    | "stageTemplate"
    | "sentToVerificationAt"
    | "receivedAtDestinationAt"
    | "handedToCsmAt"
    | "verificationCompletedAt"
    | "pickedUpFromCsmAt"
    | "shippedBackAt"
    | "returnedFromVerificationAt"
  >,
  form: VerificationMilestonesFormState,
  customStages: ProcessCustomStage[],
): VerificationStageRow[] {
  const rows: VerificationStageRow[] = [];
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

  for (const stage of item.stageTemplate) {
    const formKey = mapVerificationStageKeyToFormKey(stage.key);
    const actualValue = getVerificationStageFormValue(stage.key, item.sentToVerificationAt, form) ?? "";
    rows.push({
      key: mapVerificationStageKeyToTimelineKey(stage.key),
      anchorKey: stage.key,
      customStageId: null,
      customSortOrder: null,
      label: stage.label,
      actualValue,
      editable: Boolean(formKey),
      formKey,
      deadline: null,
      statusLabel: actualValue ? "Выполнено" : "Ожидает",
    });

    const extras = customByAnchor.get(stage.key);
    if (!extras?.length) {
      continue;
    }
    for (const extra of extras) {
      rows.push({
        key: `verification-custom-${extra.id}`,
        anchorKey: extra.afterKey,
        customStageId: extra.id,
        customSortOrder: extra.sortOrder,
        label: extra.label,
        actualValue: extra.date ?? "",
        editable: true,
        formKey: null,
        deadline: getCustomStageDeadline(item.sentToVerificationAt, extra.deadlineDays),
        statusLabel: extra.date ? "Выполнено" : "Ожидает",
      });
    }
  }
  return rows;
}




function areVerificationAutoSaveStatesEqual(
  left: VerificationAutoSaveState,
  right: VerificationAutoSaveState,
): boolean {
  return areVerificationMilestoneFormsEqual(left.milestones, right.milestones)
    && areProcessCustomStagesEqual(left.customStages, right.customStages);
}


function getInsertSortOrderForVerificationRow(
  row: Pick<VerificationStageRow, "anchorKey" | "customStageId" | "customSortOrder">,
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



function buildVerificationTextSuggestions(items: VerificationQueueItem[]): string[] {
  return sortAutocompleteSuggestions(
    items.flatMap((item) => [
      item.batchName,
      item.objectName,
      item.equipmentName,
      item.modification,
      item.serialNumber,
      item.routeCity,
      item.routeDestination,
      item.resultDocnum,
    ]),
  );
}

function formatDateOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ru-RU").format(date);
}

function formatTimelineDurationValue(start: string, end: string): string {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate || !endDate) {
    return `${formatDateOnly(start)} — ${formatDateOnly(end)}`;
  }
  const days = Math.max(
    0,
    Math.round((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)),
  );
  return `${days} дн. · ${formatDateOnly(start)} — ${formatDateOnly(end)}`;
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
  return timelineBaseDays + Math.floor(elapsedDays / timelineStepDays) * timelineStepDays;
}

function emptyToNull(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function resizeTextarea(element: HTMLTextAreaElement) {
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}

function formatVerificationMessageMeta(message: VerificationMessage): string {
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
