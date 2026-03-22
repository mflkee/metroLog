import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
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
  deleteEquipmentVerificationMessage,
  downloadVerificationArchiveZip,
  downloadVerificationMessageAttachment,
  exportVerificationQueueXlsx,
  fetchEquipment,
  fetchEquipmentVerificationMessages,
  fetchVerificationQueue,
  getVerificationProgressLabel,
  updateEquipmentVerificationMilestones,
  updateVerificationBatchItems,
  updateVerificationBatchMilestones,
  type EquipmentItem,
  type VerificationMessage,
  type VerificationMessageAttachment,
  type VerificationQueueItem,
} from "@/api/equipment";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { AutocompleteTextarea } from "@/components/AutocompleteTextarea";
import { DateInput } from "@/components/DateInput";
import { EmojiPickerButton } from "@/components/EmojiPickerButton";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";
import { ProcessBatchItemsModal } from "@/components/ProcessBatchItemsModal";
import {
  ProcessTimelineStrip,
  type ProcessTimelineStripItem,
  type ProcessTimelineStripSegment,
} from "@/components/ProcessTimelineStrip";
import { PageHeader } from "@/components/layout/PageHeader";
import { sortAutocompleteSuggestions } from "@/lib/autocomplete";
import { validateVerificationMilestoneOrder } from "@/lib/milestoneValidation";
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
};

const tabButtonClass =
  "inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm text-steel transition hover:border-signal-info hover:text-ink";
const activeTabButtonClass =
  "inline-flex items-center gap-2 rounded-full border border-signal-info bg-[color:var(--accent-soft)] px-3 py-1.5 text-sm font-medium text-ink";
const actionButtonCompactClass = "btn-secondary btn-sm";
const actionButtonClass = "btn-secondary";
const actionAccentButtonClass = "btn-accent";

const verificationMilestoneDefinitions = [
  {
    key: "receivedAtDestinationAt",
    buildLabel: (routeDestination: string) => `Получение в ${routeDestination}`,
  },
  { key: "handedToCsmAt", buildLabel: () => "Передано в ЦСМ" },
  { key: "verificationCompletedAt", buildLabel: () => "Поверка выполнена" },
  { key: "pickedUpFromCsmAt", buildLabel: () => "Получено в ЦСМ" },
  { key: "shippedBackAt", buildLabel: () => "Упаковано и отправлено обратно" },
  { key: "returnedFromVerificationAt", buildLabel: () => "Получено обратно" },
] as const satisfies ReadonlyArray<{
  key: keyof VerificationMilestonesFormState;
  buildLabel: (routeDestination: string) => string;
}>;

export function VerificationPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const canManage = user?.role === "ADMINISTRATOR" || user?.role === "MKAIR";
  const tab: VerificationTab = searchParams.get("tab") === "archived" ? "archived" : "active";
  const targetVerificationId = Number(searchParams.get("verificationId") ?? "");
  const targetEquipmentId = Number(searchParams.get("equipmentId") ?? "");
  const targetBatchKey = searchParams.get("batchKey");

  const verificationQuery = useQuery({
    queryKey: ["verification-queue", tab, deferredSearchQuery],
    queryFn: () =>
      fetchVerificationQueue(token ?? "", {
        lifecycleStatus: tab,
        query: deferredSearchQuery,
      }),
    enabled: Boolean(token),
  });

  const activeCount = useMemo(
    () => (tab === "active" ? verificationQuery.data?.length ?? 0 : null),
    [tab, verificationQuery.data],
  );

  const groupedItems = useMemo<VerificationGroup[]>(() => {
    const items = verificationQuery.data ?? [];
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
  }, [verificationQuery.data]);

  const searchSuggestions = useMemo(
    () => buildVerificationTextSuggestions(verificationQuery.data ?? []),
    [verificationQuery.data],
  );

  const exportVerificationMutation = useMutation({
    mutationFn: () =>
      exportVerificationQueueXlsx(token ?? "", {
        lifecycleStatus: tab,
        query: deferredSearchQuery,
      }),
  });

  async function invalidateVerificationQueries() {
    await queryClient.invalidateQueries({ queryKey: ["verification-queue"] });
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

      <div className="tone-parent flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line p-4 shadow-panel">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={tab === "active" ? activeTabButtonClass : tabButtonClass}
            onClick={() => setSearchParams({ tab: "active" })}
            type="button"
          >
            <Icon className="h-4 w-4" name="verification" />
            Активные
          </button>
          <button
            className={tab === "archived" ? activeTabButtonClass : tabButtonClass}
            onClick={() => setSearchParams({ tab: "archived" })}
            type="button"
          >
            <Icon className="h-4 w-4" name="verification" />
            Архивные
          </button>
        </div>
        <div className="flex min-w-[240px] flex-1 justify-end gap-2">
          <label className="tone-child flex w-full max-w-sm items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-steel shadow-panel">
            <span className="sr-only">Поиск по поверкам</span>
            <svg className="h-4 w-4 text-steel" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" />
            </svg>
            <AutocompleteInput
              className="w-full bg-transparent text-ink outline-none placeholder:text-steel"
              placeholder="Поиск по прибору, свидетельству, маршруту"
              suggestions={searchSuggestions}
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </label>
          <IconActionButton
            className="h-10 w-10 shrink-0"
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
          <div className="rounded-full border border-line px-3 py-1 text-xs text-steel">
            {activeCount} в работе
          </div>
        </div>
      ) : null}

      {verificationQuery.isLoading ? (
        <p className="text-sm text-steel">Загружаем список поверок...</p>
      ) : null}

      {verificationQuery.isError ? (
        <p className="text-sm text-[#b04c43]">
          {verificationQuery.error instanceof Error
            ? verificationQuery.error.message
            : "Не удалось загрузить список поверок."}
        </p>
      ) : null}

      {!verificationQuery.isLoading && !verificationQuery.isError && !verificationQuery.data?.length ? (
        <div className="tone-parent rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-steel">
          {tab === "active" ? "Активных поверок пока нет." : "Архивных поверок пока нет."}
        </div>
      ) : null}

      {!verificationQuery.isLoading && !verificationQuery.isError && verificationQuery.data?.length ? (
        <div className="space-y-3">
          {groupedItems.map((group) =>
            group.items.length > 1 ? (
              <VerificationBatchCard
                batch={group}
                canManage={canManage}
                isTarget={Boolean(targetBatchKey) && group.key === targetBatchKey}
                key={`${tab}-${group.key}`}
                lifecycleStatus={tab}
                onUpdated={invalidateVerificationQueries}
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
                onUpdated={invalidateVerificationQueries}
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
}: {
  batch: VerificationGroup;
  token: string;
  canManage: boolean;
  lifecycleStatus: VerificationTab;
  onUpdated: () => Promise<void>;
  isTarget: boolean;
}) {
  const anchor = batch.items[0];
  const isArchived = lifecycleStatus === "archived";
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<VerificationMilestonesFormState>(() =>
    buildMilestonesFormState(anchor),
  );
  const [dialogExpanded, setDialogExpanded] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<number | null>(null);
  const [downloadingArchive, setDownloadingArchive] = useState(false);
  const [itemsModalOpen, setItemsModalOpen] = useState(false);
  const [itemsSearchQuery, setItemsSearchQuery] = useState("");
  const deferredItemsSearchQuery = useDeferredValue(itemsSearchQuery);
  const [pendingMembershipEquipmentId, setPendingMembershipEquipmentId] = useState<number | null>(
    null,
  );
  const currentUserId = useAuthStore((state) => state.user?.id);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const textSuggestions = useMemo(
    () => buildVerificationTextSuggestions(batch.items),
    [batch.items],
  );

  useEffect(() => {
    setForm(buildMilestonesFormState(anchor));
  }, [anchor]);

  useEffect(() => {
    if (!messageInputRef.current) {
      return;
    }
    resizeTextarea(messageInputRef.current);
  }, [messageDraft]);

  useEffect(() => {
    if (!isTarget) {
      return;
    }
    setExpanded(true);
    window.setTimeout(() => {
      articleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      articleRef.current?.focus({ preventScroll: true });
    }, 60);
  }, [isTarget]);

  const messagesQuery = useQuery({
    queryKey: ["verification-batch-messages", anchor.batchKey, anchor.equipmentId],
    queryFn: () => fetchEquipmentVerificationMessages(token, anchor.equipmentId),
    enabled: Boolean(anchor.batchKey) && expanded,
  });

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
        equipmentType: "SI",
        query: deferredItemsSearchQuery,
      }),
    enabled: Boolean(token) && Boolean(anchor.batchKey) && itemsModalOpen && !isArchived,
  });

  const candidateItems = useMemo(() => {
    const existingIds = new Set(batch.items.map((item) => item.equipmentId));
    return (candidateEquipmentQuery.data ?? [])
      .filter((item) => !existingIds.has(item.id))
      .filter((item) => item.activeVerification === null)
      .map((item) => ({
        id: item.id,
        title: item.name,
        subtitle: buildEquipmentCandidateSubtitle(item),
        meta: item.siVerification?.resultDocnum
          ? `Свидетельство: ${item.siVerification.resultDocnum}`
          : null,
      }));
  }, [batch.items, candidateEquipmentQuery.data]);
  const candidateSearchSuggestions = useMemo(
    () =>
      sortAutocompleteSuggestions(
        candidateItems.flatMap((item) => [item.title, item.subtitle, item.meta]),
      ),
    [candidateItems],
  );

  const updateMilestonesMutation = useMutation({
    mutationFn: () =>
      updateVerificationBatchMilestones(token, anchor.batchKey ?? "", {
        receivedAtDestinationAt: emptyToNull(form.receivedAtDestinationAt),
        handedToCsmAt: emptyToNull(form.handedToCsmAt),
        verificationCompletedAt: emptyToNull(form.verificationCompletedAt),
        pickedUpFromCsmAt: emptyToNull(form.pickedUpFromCsmAt),
        shippedBackAt: emptyToNull(form.shippedBackAt),
        returnedFromVerificationAt: emptyToNull(form.returnedFromVerificationAt),
      }),
    onSuccess: async (updatedBatch) => {
      setForm(buildMilestonesFormState(updatedBatch[0]));
      setFormError(null);
      setActionError(null);
      await onUpdated();
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: () =>
      createEquipmentVerificationMessage(token, anchor.equipmentId, {
        text: messageDraft,
        files: messageFiles,
      }),
    onSuccess: async () => {
      setMessageDraft("");
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

  const updateBatchItemsMutation = useMutation({
    mutationFn: (payload: { addEquipmentIds?: number[]; removeEquipmentIds?: number[] }) =>
      updateVerificationBatchItems(token, anchor.batchKey ?? "", payload),
    onSuccess: async (updatedBatch) => {
      if (updatedBatch[0]) {
        setForm(buildMilestonesFormState(updatedBatch[0]));
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
    await handleSaveMilestones();
  }

  async function handleSaveMilestones() {
    setFormError(null);
    setActionError(null);

    const validationError = validateVerificationMilestoneOrder({
      routeDestination: anchor.routeDestination,
      sentToVerificationAt: anchor.sentToVerificationAt,
      receivedAtDestinationAt: form.receivedAtDestinationAt,
      handedToCsmAt: form.handedToCsmAt,
      verificationCompletedAt: form.verificationCompletedAt,
      pickedUpFromCsmAt: form.pickedUpFromCsmAt,
      shippedBackAt: form.shippedBackAt,
      returnedFromVerificationAt: form.returnedFromVerificationAt,
    });

    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      await updateMilestonesMutation.mutateAsync();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Не удалось обновить этапы поверки.",
      );
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

  function handleFilesPick(event: ChangeEvent<HTMLInputElement>) {
    setMessageFiles(Array.from(event.target.files ?? []));
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
      await closeBatchMutation.mutateAsync();
      setCloseConfirmOpen(false);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось завершить групповую поверку.",
      );
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

  if (isArchived) {
    return (
      <article
        className="tone-parent rounded-2xl border border-line px-4 py-3 shadow-panel"
        ref={articleRef}
        tabIndex={-1}
      >
        <button
          aria-expanded={expanded}
          className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink">{batch.title}</span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel">
                Архив
              </span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel">
                {batch.items.length} приборов
              </span>
            </div>
            <p className="text-xs text-steel">
              {[anchor.routeCity, anchor.routeDestination].filter(Boolean).join(" → ")}
            </p>
            <p className="text-xs text-steel">
              Дата отправки: {formatDateOnly(anchor.sentToVerificationAt)}
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
        <div className="mt-3">
          <ProcessTimelineStrip
            items={buildVerificationBatchTimeline(batch).items}
            segments={buildVerificationBatchTimeline(batch).segments}
          />
        </div>
        {expanded ? (
          <div className="mt-4 space-y-4 border-t border-line pt-4">
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
                    <div className="tone-child rounded-2xl border border-line px-3 py-3" key={groupItem.verificationId}>
                      <div className="flex items-center justify-between gap-3">
                        <Link
                          className="text-sm font-medium text-ink transition hover:text-signal-info"
                          to={`/equipment/${groupItem.equipmentId}`}
                        >
                          {groupItem.equipmentName}
                        </Link>
                        {groupItem.arshinUrl ? (
                          <a
                            className={actionButtonCompactClass}
                            href={groupItem.arshinUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Arshin
                          </a>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-steel">
                        {[
                          groupItem.objectName,
                          groupItem.modification,
                          groupItem.serialNumber ? `зав. № ${groupItem.serialNumber}` : null,
                          groupItem.resultDocnum ? `свид. ${groupItem.resultDocnum}` : null,
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
                <ArchiveMilestoneRow label={`Получение в ${anchor.routeDestination}`} value={anchor.receivedAtDestinationAt} />
                <ArchiveMilestoneRow label="Передано в ЦСМ" value={anchor.handedToCsmAt} />
                <ArchiveMilestoneRow label="Поверка выполнена" value={anchor.verificationCompletedAt} />
                <ArchiveMilestoneRow label="Получено в ЦСМ" value={anchor.pickedUpFromCsmAt} />
                <ArchiveMilestoneRow label="Упаковано и отправлено обратно" value={anchor.shippedBackAt} />
                <ArchiveMilestoneRow label="Получено обратно" value={anchor.returnedFromVerificationAt} />
              </section>
            </div>
          </div>
        ) : null}
        {actionError ? <p className="mt-3 text-sm text-[#b04c43]">{actionError}</p> : null}
      </article>
    );
  }

  return (
    <article className="tone-parent rounded-2xl border border-line px-4 py-3 shadow-panel">
      <button
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">{batch.title}</span>
            <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel">
              {getVerificationProgressLabel(anchor)}
            </span>
            <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel">
              {batch.items.length} приборов
            </span>
            {batch.items.some((item) => item.hasActiveRepair) ? (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel">
                часть группы в ремонте
              </span>
            ) : null}
          </div>
          <p className="text-xs text-steel">
            {[anchor.routeCity, anchor.routeDestination].filter(Boolean).join(" → ")}
          </p>
          <p className="text-xs text-steel">
            Дата отправки: {formatDateOnly(anchor.sentToVerificationAt)}
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

      <div className="mt-3">
        <ProcessTimelineStrip
          items={buildVerificationBatchTimeline(batch).items}
          segments={buildVerificationBatchTimeline(batch).segments}
        />
      </div>

      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
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
                    className="tone-child rounded-2xl border border-line px-3 py-3"
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
                          <a
                            className={actionButtonCompactClass}
                            href={item.arshinUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Arshin
                          </a>
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
                {verificationMilestoneDefinitions.map((milestone) => (
                  <div
                    className="tone-child grid items-center gap-3 rounded-2xl border border-line px-3 py-3 md:grid-cols-[minmax(0,0.82fr)_minmax(248px,1.04fr)_84px]"
                    key={milestone.key}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {milestone.buildLabel(anchor.routeDestination)}
                      </p>
                    </div>
                    <DateInput
                      className="form-input form-input--compact"
                      disabled={!canManage}
                      onChange={(value) => {
                        setFormError(null);
                        setForm((current) => ({
                          ...current,
                          [milestone.key]: value,
                        }));
                      }}
                      onEnter={() => void handleSaveMilestones()}
                      value={form[milestone.key]}
                    />
                    <div className="text-xs text-steel md:text-right">
                      {form[milestone.key] ? "Ок" : "Ждет"}
                    </div>
                  </div>
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
                    <button
                      className={actionAccentButtonClass}
                      disabled={updateMilestonesMutation.isPending}
                      type="submit"
                    >
                      {updateMilestonesMutation.isPending ? "Сохраняем..." : "Сохранить этапы группы"}
                    </button>
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
                  className="tone-grandchild rounded-2xl border border-line px-4 py-3"
                  key={message.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-steel">
                      {formatVerificationMessageMeta(message)}
                    </div>
                    {canManage || message.authorUserId === currentUserId ? (
                      <IconActionButton
                        icon={
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        }
                        label="Удалить сообщение поверки"
                        onClick={() => void deleteMessageMutation.mutateAsync(message.id)}
                        size="tiny"
                      />
                    ) : null}
                  </div>
                  {message.text ? (
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                      {message.text}
                    </p>
                  ) : null}
                  {message.attachments.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.attachments.map((attachment) => (
                        <button
                          className="tone-child inline-flex max-w-full items-center gap-2 rounded-full border border-line px-3 py-2 text-xs text-ink transition hover:border-signal-info"
                          key={attachment.id}
                          onClick={() => void handleAttachmentDownload(message, attachment)}
                          type="button"
                        >
                          {downloadingAttachmentId === attachment.id ? (
                            <span className="text-sm leading-none">…</span>
                          ) : (
                            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4m-5 7.5h18" />
                            </svg>
                          )}
                          <span className="truncate">{attachment.fileName}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
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
                {messageFiles.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {messageFiles.map((file) => (
                      <span
                        className="tone-child rounded-full border border-line px-3 py-2 text-xs text-ink"
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                      >
                        {file.name}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex justify-end gap-2">
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
                    onClick={() => filesInputRef.current?.click()}
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
}: {
  item: VerificationQueueItem;
  token: string;
  canManage: boolean;
  lifecycleStatus: VerificationTab;
  onUpdated: () => Promise<void>;
  isTarget: boolean;
}) {
  const isArchived = lifecycleStatus === "archived";
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<VerificationMilestonesFormState>(() =>
    buildMilestonesFormState(item),
  );
  const [dialogExpanded, setDialogExpanded] = useState(false);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<number | null>(null);
  const [downloadingArchive, setDownloadingArchive] = useState(false);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const textSuggestions = useMemo(() => buildVerificationTextSuggestions([item]), [item]);

  useEffect(() => {
    setForm(buildMilestonesFormState(item));
  }, [item]);

  useEffect(() => {
    if (!messageInputRef.current) {
      return;
    }
    resizeTextarea(messageInputRef.current);
  }, [messageDraft]);

  useEffect(() => {
    if (!isTarget) {
      return;
    }
    setExpanded(true);
    window.setTimeout(() => {
      articleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      articleRef.current?.focus({ preventScroll: true });
    }, 60);
  }, [isTarget]);

  const messagesQuery = useQuery({
    queryKey: ["verification-messages", item.equipmentId],
    queryFn: () => fetchEquipmentVerificationMessages(token, item.equipmentId),
    enabled: Boolean(token) && expanded && dialogExpanded && !isArchived,
  });

  const updateMilestonesMutation = useMutation({
    mutationFn: () =>
      updateEquipmentVerificationMilestones(token, item.equipmentId, {
        receivedAtDestinationAt: emptyToNull(form.receivedAtDestinationAt),
        handedToCsmAt: emptyToNull(form.handedToCsmAt),
        verificationCompletedAt: emptyToNull(form.verificationCompletedAt),
        pickedUpFromCsmAt: emptyToNull(form.pickedUpFromCsmAt),
        shippedBackAt: emptyToNull(form.shippedBackAt),
        returnedFromVerificationAt: emptyToNull(form.returnedFromVerificationAt),
      }),
    onSuccess: async (updated) => {
      setForm(buildMilestonesFormState(updated));
      setFormError(null);
      setActionError(null);
      await onUpdated();
    },
  });

  const closeVerificationMutation = useMutation({
    mutationFn: () => closeEquipmentVerification(token, item.equipmentId),
    onSuccess: async () => {
      setActionError(null);
      await onUpdated();
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: () =>
      createEquipmentVerificationMessage(token, item.equipmentId, {
        text: messageDraft,
        files: messageFiles,
      }),
    onSuccess: async () => {
      setMessageDraft("");
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
      await Promise.all([messagesQuery.refetch(), onUpdated()]);
    },
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await handleSaveMilestones();
  }

  async function handleSaveMilestones() {
    setFormError(null);
    setActionError(null);

    const validationError = validateVerificationMilestoneOrder({
      routeDestination: item.routeDestination,
      sentToVerificationAt: item.sentToVerificationAt,
      receivedAtDestinationAt: form.receivedAtDestinationAt,
      handedToCsmAt: form.handedToCsmAt,
      verificationCompletedAt: form.verificationCompletedAt,
      pickedUpFromCsmAt: form.pickedUpFromCsmAt,
      shippedBackAt: form.shippedBackAt,
      returnedFromVerificationAt: form.returnedFromVerificationAt,
    });

    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      await updateMilestonesMutation.mutateAsync();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Не удалось обновить этапы поверки.",
      );
    }
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
      await closeVerificationMutation.mutateAsync();
      setCloseConfirmOpen(false);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось завершить поверку.",
      );
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

  function handleFilesPick(event: ChangeEvent<HTMLInputElement>) {
    setMessageFiles(Array.from(event.target.files ?? []));
  }

  if (isArchived) {
    return (
      <article
        className="tone-parent rounded-2xl border border-line px-4 py-3 shadow-panel"
        ref={articleRef}
        tabIndex={-1}
      >
        <button
          aria-expanded={expanded}
          className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
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
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel">
                Архив
              </span>
            </div>
            <p className="text-xs text-steel">
              {[item.routeCity, item.routeDestination].filter(Boolean).join(" → ")}
            </p>
            <p className="text-xs text-steel">
              {[
                item.resultDocnum ? `свид. ${item.resultDocnum}` : null,
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
      <div className="mt-3">
        <ProcessTimelineStrip
          items={buildVerificationTimeline(item).items}
          segments={buildVerificationTimeline(item).segments}
        />
      </div>
        {expanded ? (
          <div className="mt-4 space-y-2 border-t border-line pt-4">
            <ArchiveMilestoneRow label={`Получение в ${item.routeDestination}`} value={item.receivedAtDestinationAt} />
            <ArchiveMilestoneRow label="Передано в ЦСМ" value={item.handedToCsmAt} />
            <ArchiveMilestoneRow label="Поверка выполнена" value={item.verificationCompletedAt} />
            <ArchiveMilestoneRow label="Получено в ЦСМ" value={item.pickedUpFromCsmAt} />
            <ArchiveMilestoneRow label="Упаковано и отправлено обратно" value={item.shippedBackAt} />
            <ArchiveMilestoneRow label="Получено обратно" value={item.returnedFromVerificationAt} />
          </div>
        ) : null}
        {actionError ? <p className="mt-3 text-sm text-[#b04c43]">{actionError}</p> : null}
      </article>
    );
  }

  return (
    <article className="tone-parent rounded-2xl border border-line px-4 py-3 shadow-panel">
      <button
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="text-sm font-semibold text-ink transition hover:text-signal-info"
              to={`/equipment/${item.equipmentId}`}
            >
              {item.equipmentName}
            </Link>
            <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel">
              {getVerificationProgressLabel(item)}
            </span>
            {item.hasActiveRepair ? (
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel">
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
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {item.arshinUrl ? (
            <a
              className={actionButtonCompactClass}
              href={item.arshinUrl}
              rel="noreferrer"
              target="_blank"
            >
              Arshin
            </a>
          ) : null}
          <Link
            className={actionButtonCompactClass}
            onClick={(event) => event.stopPropagation()}
            to={`/equipment/${item.equipmentId}`}
          >
            Карточка
          </Link>
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

      <div className="mt-3">
        <ProcessTimelineStrip
          items={buildVerificationTimeline(item).items}
          segments={buildVerificationTimeline(item).segments}
        />
      </div>

      {expanded && lifecycleStatus === "active" ? (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
            <section className="tone-child rounded-2xl border border-line p-4 shadow-panel">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-ink">Прибор</h4>
                  <p className="text-xs text-steel">Краткая информация и быстрый переход в карточку.</p>
                </div>
                <div className="flex items-center gap-2">
                  {item.arshinUrl ? (
                    <a
                      className={actionButtonCompactClass}
                      href={item.arshinUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Arshin
                    </a>
                  ) : null}
                  <Link
                    className={actionButtonCompactClass}
                    to={`/equipment/${item.equipmentId}`}
                  >
                    Открыть карточку
                  </Link>
                </div>
              </div>

              <dl className="mt-4 space-y-2 text-sm">
                <VerificationInfoRow label="Объект" value={item.objectName} />
                <VerificationInfoRow label="Наименование" value={item.equipmentName} />
                <VerificationInfoRow label="Модификация" value={item.modification} />
                <VerificationInfoRow label="Серийный номер" value={item.serialNumber} />
                <VerificationInfoRow
                  label="Год выпуска"
                  value={item.manufactureYear ? String(item.manufactureYear) : null}
                />
                <VerificationInfoRow label="Свидетельство" value={item.resultDocnum} />
                <VerificationInfoRow
                  label="Действительно до"
                  value={item.validDate ? formatDateOnly(item.validDate) : null}
                />
                <VerificationInfoRow
                  label="Состояние"
                  value={getVerificationProgressLabel(item)}
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
                      <button
                        className={actionAccentButtonClass}
                        disabled={updateMilestonesMutation.isPending}
                        type="submit"
                      >
                        {updateMilestonesMutation.isPending ? "Сохраняем..." : "Сохранить этапы"}
                      </button>
                    </div>
                  ) : null}
                </div>
                {formError ? <p className="text-sm text-[#b04c43]">{formError}</p> : null}

                {verificationMilestoneDefinitions.map((milestone) => (
                  <div
                    className="tone-grandchild grid items-center gap-3 rounded-2xl border border-line px-3 py-3 md:grid-cols-[minmax(0,0.88fr)_minmax(196px,0.92fr)_104px]"
                    key={milestone.key}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {milestone.buildLabel(item.routeDestination)}
                      </p>
                    </div>
                    <DateInput
                      className="form-input form-input--compact"
                      disabled={!canManage}
                      onChange={(value) => {
                        setFormError(null);
                        setForm((current) => ({
                          ...current,
                          [milestone.key]: value,
                        }));
                      }}
                      onEnter={() => void handleSaveMilestones()}
                      value={form[milestone.key]}
                    />
                    <div className="text-xs text-steel md:text-right">
                      {form[milestone.key] ? "Выполнено" : "Ожидает"}
                    </div>
                  </div>
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
                  <article className="tone-grandchild rounded-2xl border border-line px-4 py-3" key={message.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-xs text-steel">{formatVerificationMessageMeta(message)}</div>
                      {canManage || message.authorUserId === currentUserId ? (
                        <IconActionButton
                          icon={
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                          }
                          label="Удалить сообщение поверки"
                          onClick={() => void deleteMessageMutation.mutateAsync(message.id)}
                          size="tiny"
                        />
                      ) : null}
                    </div>
                    {message.text ? (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                        {message.text}
                      </p>
                    ) : null}
                    {message.attachments.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {message.attachments.map((attachment) => (
                          <button
                            className="tone-child inline-flex max-w-full items-center gap-2 rounded-full border border-line px-3 py-2 text-xs text-ink transition hover:border-signal-info"
                            key={attachment.id}
                            onClick={() => void handleAttachmentDownload(message, attachment)}
                            type="button"
                          >
                            {downloadingAttachmentId === attachment.id ? (
                              <span className="text-sm leading-none">…</span>
                            ) : (
                              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4m-5 7.5h18" />
                              </svg>
                            )}
                            <span className="truncate">{attachment.fileName}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
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
                {messageFiles.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {messageFiles.map((file) => (
                      <span
                        className="tone-child rounded-full border border-line px-3 py-2 text-xs text-ink"
                        key={`${file.name}-${file.size}-${file.lastModified}`}
                      >
                        {file.name}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 flex justify-end gap-2">
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
                    onClick={() => filesInputRef.current?.click()}
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

function buildVerificationTimeline(item: VerificationQueueItem): VerificationTimelineModel {
  const milestones = [
    {
      key: "sentToVerificationAt",
      label: `Отправлено в ${item.routeDestination}`,
      value: item.sentToVerificationAt,
    },
    {
      key: "receivedAtDestinationAt",
      label: `Получение в ${item.routeDestination}`,
      value: item.receivedAtDestinationAt,
    },
    {
      key: "handedToCsmAt",
      label: "Передано в ЦСМ",
      value: item.handedToCsmAt,
    },
    {
      key: "verificationCompletedAt",
      label: "Поверка выполнена",
      value: item.verificationCompletedAt,
    },
    {
      key: "pickedUpFromCsmAt",
      label: "Получено в ЦСМ",
      value: item.pickedUpFromCsmAt,
    },
    {
      key: "shippedBackAt",
      label: "Упаковано и отправлено обратно",
      value: item.shippedBackAt,
    },
    {
      key: "returnedFromVerificationAt",
      label: "Получено обратно",
      value: item.returnedFromVerificationAt,
    },
  ];

  const items = milestones.map((stage) => {
    const position = milestones.length > 1 ? milestones.findIndex((item) => item.key === stage.key) / (milestones.length - 1) : 0;

    if (stage.value) {
      return {
        key: stage.key,
        label: stage.label,
        value: formatDateOnly(stage.value),
        status: "done" as const,
        position,
      };
    }

    return {
      key: stage.key,
      label: stage.label,
      status: "pending" as const,
      position,
    };
  });

  return {
    items,
    segments: buildVerificationTimelineSegments(milestones),
  };
}

function buildVerificationBatchTimeline(batch: VerificationGroup): VerificationTimelineModel {
  const anchor = batch.items[0];
  const milestones = [
    {
      key: "sentToVerificationAt",
      label: `Отправлено в ${anchor.routeDestination}`,
      value: anchor.sentToVerificationAt,
    },
    {
      key: "receivedAtDestinationAt",
      label: `Получение в ${anchor.routeDestination}`,
      value: anchor.receivedAtDestinationAt,
    },
    {
      key: "handedToCsmAt",
      label: "Передано в ЦСМ",
      value: anchor.handedToCsmAt,
    },
    {
      key: "verificationCompletedAt",
      label: "Поверка выполнена",
      value: anchor.verificationCompletedAt,
    },
    {
      key: "pickedUpFromCsmAt",
      label: "Получено в ЦСМ",
      value: anchor.pickedUpFromCsmAt,
    },
    {
      key: "shippedBackAt",
      label: "Упаковано и отправлено обратно",
      value: anchor.shippedBackAt,
    },
    {
      key: "returnedFromVerificationAt",
      label: "Получено обратно",
      value: anchor.returnedFromVerificationAt,
    },
  ];

  const items = milestones.map((stage) => {
    const position = milestones.length > 1 ? milestones.findIndex((item) => item.key === stage.key) / (milestones.length - 1) : 0;

    if (stage.value) {
      return {
        key: stage.key,
        label: stage.label,
        value: formatDateOnly(stage.value),
        status: "done" as const,
        position,
      };
    }

    return {
      key: stage.key,
      label: stage.label,
      status: "pending" as const,
      position,
    };
  });

  return {
    items,
    segments: buildVerificationTimelineSegments(milestones),
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

function buildVerificationTimelineSegments(
  milestones: ReadonlyArray<{
    key: string;
    label: string;
    value: string | null;
  }>,
): ProcessTimelineStripSegment[] {
  const segments: ProcessTimelineStripSegment[] = [];
  for (let index = 1; index < milestones.length; index += 1) {
    const previous = milestones[index - 1];
    const current = milestones[index];
    if (!previous.value || !current.value) {
      continue;
    }

    segments.push({
      key: `${previous.key}-${current.key}`,
      start: milestones.length > 1 ? (index - 1) / (milestones.length - 1) : 0,
      end: milestones.length > 1 ? index / (milestones.length - 1) : 1,
      tone: "success",
      label: `${previous.label} → ${current.label}`,
      value: formatTimelineDurationValue(previous.value, current.value),
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
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return `${formatDateOnly(start)} — ${formatDateOnly(end)}`;
  }
  const normalizedStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const normalizedEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  const days = Math.max(
    0,
    Math.round((normalizedEnd.getTime() - normalizedStart.getTime()) / (24 * 60 * 60 * 1000)),
  );
  return `${days} дн. · ${formatDateOnly(start)} — ${formatDateOnly(end)}`;
}

function emptyToNull(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function handleTextareaSubmitShortcut(event: KeyboardEvent<HTMLTextAreaElement>): void {
  if (event.key !== "Enter" || event.shiftKey) {
    return;
  }

  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
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

function insertEmojiAtCursor(
  input: HTMLTextAreaElement | null,
  currentValue: string,
  emoji: string,
): string {
  if (!input) {
    return `${currentValue}${emoji}`;
  }
  const start = input.selectionStart ?? currentValue.length;
  const end = input.selectionEnd ?? currentValue.length;
  const nextValue = `${currentValue.slice(0, start)}${emoji}${currentValue.slice(end)}`;
  queueMicrotask(() => {
    const caret = start + emoji.length;
    input.focus();
    input.setSelectionRange(caret, caret);
  });
  return nextValue;
}
