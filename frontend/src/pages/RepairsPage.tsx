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
  closeRepairBatch,
  closeEquipmentRepair,
  createEquipmentRepairMessage,
  deleteEquipmentRepairMessage,
  downloadRepairArchiveZip,
  downloadRepairMessageAttachment,
  equipmentTypeLabels,
  exportRepairQueueXlsx,
  fetchEquipment,
  fetchEquipmentRepairMessages,
  fetchRepairQueue,
  updateEquipmentRepairMilestones,
  updateRepairBatchItems,
  updateRepairBatchMilestones,
  type EquipmentItem,
  type RepairMessage,
  type RepairMessageAttachment,
  type RepairQueueItem,
} from "@/api/equipment";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { AutocompleteTextarea } from "@/components/AutocompleteTextarea";
import { DateInput } from "@/components/DateInput";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { EmojiPickerButton } from "@/components/EmojiPickerButton";
import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";
import { ProcessBatchItemsModal } from "@/components/ProcessBatchItemsModal";
import {
  ProcessTimelineStrip,
  type ProcessTimelineStripItem,
  type ProcessTimelineStripMarker,
  type ProcessTimelineStripSegment,
} from "@/components/ProcessTimelineStrip";
import { PageHeader } from "@/components/layout/PageHeader";
import { sortAutocompleteSuggestions } from "@/lib/autocomplete";
import { validateRepairMilestoneOrder } from "@/lib/milestoneValidation";
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
};

type RepairGroup = {
  key: string;
  title: string;
  items: RepairQueueItem[];
};

const tabButtonClass =
  "inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm text-steel transition hover:border-signal-info hover:text-ink";
const activeTabButtonClass =
  "inline-flex items-center gap-2 rounded-full border border-signal-info bg-[color:var(--accent-soft)] px-3 py-1.5 text-sm font-medium text-ink";
const actionButtonCompactClass = "btn-secondary btn-sm";
const actionButtonClass = "btn-secondary";
const actionAccentButtonClass = "btn-accent";

export function RepairsPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const tab: RepairTab = searchParams.get("tab") === "archived" ? "archived" : "active";
  const targetRepairId = Number(searchParams.get("repairId") ?? "");
  const targetEquipmentId = Number(searchParams.get("equipmentId") ?? "");
  const targetBatchKey = searchParams.get("batchKey");
  const canManage = user?.role === "ADMINISTRATOR" || user?.role === "MKAIR";

  const repairsQuery = useQuery({
    queryKey: ["repair-queue", tab, deferredSearchQuery],
    queryFn: () =>
      fetchRepairQueue(token ?? "", {
        lifecycleStatus: tab,
        query: deferredSearchQuery,
      }),
    enabled: Boolean(token),
  });

  const summary = useMemo(() => {
    const items = repairsQuery.data ?? [];
    return {
      total: items.length,
      repair: items.filter((item) => item.repairOverdueDays > 0).length,
      registration: items.filter((item) => item.registrationOverdueDays > 0).length,
      control: items.filter((item) => item.controlOverdueDays > 0).length,
      payment: items.filter((item) => item.paymentOverdueDays > 0).length,
      any: items.filter((item) => item.maxOverdueDays > 0).length,
    };
  }, [repairsQuery.data]);

  const groupedItems = useMemo<RepairGroup[]>(() => {
    const items = repairsQuery.data ?? [];
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
  }, [repairsQuery.data]);

  const searchSuggestions = useMemo(
    () => buildRepairTextSuggestions(repairsQuery.data ?? []),
    [repairsQuery.data],
  );

  const exportRepairMutation = useMutation({
    mutationFn: () =>
      exportRepairQueueXlsx(token ?? "", {
        lifecycleStatus: tab,
        query: deferredSearchQuery,
      }),
  });

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

      <div className="tone-parent flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-line p-4 shadow-panel">
        <div className="flex flex-wrap items-center gap-2">
          <button
            className={tab === "active" ? activeTabButtonClass : tabButtonClass}
            onClick={() => setSearchParams({ tab: "active" })}
            type="button"
          >
            <Icon className="h-4 w-4" name="repairs" />
            Активные
          </button>
          <button
            className={tab === "archived" ? activeTabButtonClass : tabButtonClass}
            onClick={() => setSearchParams({ tab: "archived" })}
            type="button"
          >
            <Icon className="h-4 w-4" name="repairs" />
            Архивные
          </button>
        </div>

        <div className="flex min-w-[240px] flex-1 justify-end gap-2">
          <label className="tone-child flex w-full max-w-sm items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-steel shadow-panel">
            <span className="sr-only">Поиск по ремонтам</span>
            <svg className="h-4 w-4 text-steel" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" />
            </svg>
            <AutocompleteInput
              className="w-full bg-transparent text-ink outline-none placeholder:text-steel"
              placeholder="Поиск по прибору, месту, свидетельству, маршруту"
              suggestions={searchSuggestions}
              value={searchQuery}
              onChange={setSearchQuery}
            />
          </label>
          <IconActionButton
            className="h-10 w-10 shrink-0"
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

      {tab === "active" ? (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
          <SummaryChip label="Всего" value={String(summary.total)} />
          <SummaryChip danger={summary.repair > 0} label="Просрочен ремонт" value={String(summary.repair)} />
          <SummaryChip danger={summary.registration > 0} label="Просрочено получение" value={String(summary.registration)} />
          <SummaryChip danger={summary.control > 0} label="Просрочен входной" value={String(summary.control)} />
          <SummaryChip danger={summary.payment > 0} label="Просрочена оплата" value={String(summary.payment)} />
          <SummaryChip danger={summary.any > 0} label="Любая просрочка" value={String(summary.any)} />
        </div>
      ) : null}

      {repairsQuery.isLoading ? <p className="text-sm text-steel">Загружаем список ремонтов...</p> : null}

      {repairsQuery.isError ? (
        <p className="text-sm text-[#b04c43]">
          {repairsQuery.error instanceof Error
            ? repairsQuery.error.message
            : "Не удалось загрузить список ремонтов."}
        </p>
      ) : null}

      {!repairsQuery.isLoading && !repairsQuery.isError && !repairsQuery.data?.length ? (
        <div className="tone-parent rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-steel">
          {tab === "active" ? "Активных ремонтов пока нет." : "Архивных ремонтов пока нет."}
        </div>
      ) : null}

      {!repairsQuery.isLoading && !repairsQuery.isError && repairsQuery.data?.length ? (
        <div className="space-y-3">
          {groupedItems.map((group) => (
            group.items.length > 1 ? (
              <RepairBatchCard
                batch={group}
                canManage={canManage}
                isTarget={Boolean(targetBatchKey) && group.key === targetBatchKey}
                key={`${tab}-${group.key}`}
                lifecycleStatus={tab}
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
}: {
  item: RepairQueueItem;
  token: string;
  canManage: boolean;
  lifecycleStatus: RepairTab;
  isTarget: boolean;
}) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [expanded, setExpanded] = useState(false);
  const [dialogExpanded, setDialogExpanded] = useState(false);
  const [form, setForm] = useState<RepairMilestonesFormState>(() => buildRepairFormState(item));
  const [messageDraft, setMessageDraft] = useState("");
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<number | null>(null);
  const [downloadingArchive, setDownloadingArchive] = useState(false);
  const isArchived = lifecycleStatus === "archived";
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const repairTimeline = buildRepairTimeline(item, isArchived);
  const textSuggestions = useMemo(() => buildRepairTextSuggestions([item]), [item]);

  useEffect(() => {
    setForm(buildRepairFormState(item));
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
    queryKey: ["repair-messages", item.equipmentId],
    queryFn: () => fetchEquipmentRepairMessages(token, item.equipmentId),
    enabled: Boolean(token) && expanded && dialogExpanded && !isArchived,
  });

  const updateMilestonesMutation = useMutation({
    mutationFn: () =>
      updateEquipmentRepairMilestones(token, item.equipmentId, {
        sentToRepairAt: emptyToNull(form.sentToRepairAt),
        arrivedToDestinationAt: emptyToNull(form.arrivedToDestinationAt),
        sentFromRepairAt: emptyToNull(form.sentFromRepairAt),
        sentFromIrkutskAt: emptyToNull(form.sentFromIrkutskAt),
        arrivedToLenskAt: emptyToNull(form.arrivedToLenskAt),
        actuallyReceivedAt: emptyToNull(form.actuallyReceivedAt),
        incomingControlAt: emptyToNull(form.incomingControlAt),
        paidAt: emptyToNull(form.paidAt),
      }),
    onSuccess: async () => {
      setFormError(null);
      await invalidateRepairQueries(queryClient, item.equipmentId);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Не удалось сохранить этапы ремонта.");
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: () =>
      createEquipmentRepairMessage(token, item.equipmentId, {
        text: messageDraft,
        files: messageFiles,
      }),
    onSuccess: async () => {
      setActionError(null);
      setMessageDraft("");
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
      await queryClient.invalidateQueries({ queryKey: ["repair-messages", item.equipmentId] });
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Не удалось удалить сообщение ремонта.");
    },
  });

  const closeRepairMutation = useMutation({
    mutationFn: () => closeEquipmentRepair(token, item.equipmentId),
    onSuccess: async () => {
      setActionError(null);
      await invalidateRepairQueries(queryClient, item.equipmentId);
    },
  });

  async function handleSaveMilestones() {
    setFormError(null);

    const validationError = validateRepairMilestoneOrder({
      routeCity: item.routeCity,
      routeDestination: item.routeDestination,
      sentToRepairAt: form.sentToRepairAt,
      arrivedToDestinationAt: form.arrivedToDestinationAt,
      sentFromRepairAt: form.sentFromRepairAt,
      sentFromIrkutskAt: form.sentFromIrkutskAt,
      arrivedToLenskAt: form.arrivedToLenskAt,
      actuallyReceivedAt: form.actuallyReceivedAt,
      incomingControlAt: form.incomingControlAt,
      paidAt: form.paidAt,
    });

    if (validationError) {
      setFormError(validationError);
      return;
    }

    await updateMilestonesMutation.mutateAsync();
  }

  async function handleCreateMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    await createMessageMutation.mutateAsync();
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
      await closeRepairMutation.mutateAsync();
      setCloseConfirmOpen(false);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось завершить ремонт.",
      );
    }
  }

  function handleFilesPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files ? Array.from(event.target.files) : [];
    setMessageFiles(picked);
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

  const stageRows = buildRepairStageRows(item, form);

  return (
    <article
      className="tone-parent rounded-3xl border border-line shadow-panel"
      ref={articleRef}
      tabIndex={-1}
    >
      <button
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
              {isArchived ? (
                <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel">
                  Архив
                </span>
              ) : null}
              {item.hasActiveVerification ? (
                <span className="rounded-full border border-signal-info/40 bg-[color:var(--accent-soft)] px-2 py-0.5 text-[11px] text-ink">
                  Также в поверке
                </span>
              ) : null}
            </div>
            <p className="text-sm text-steel">
              {item.objectName}
              {item.modification ? ` · ${item.modification}` : ""}
              {item.serialNumber ? ` · № ${item.serialNumber}` : ""}
              {item.routeCity || item.routeDestination ? ` · ${item.routeCity} → ${item.routeDestination}` : ""}
            </p>
            {!isArchived ? (
              <p className="text-xs text-steel">
                Дата отправки: {formatDate(item.sentToRepairAt)}
              </p>
            ) : (
              <p className="text-xs text-steel">
                {[
                  item.resultDocnum ? `свид. ${item.resultDocnum}` : null,
                  item.closedAt ? `закрыт ${formatDate(item.closedAt)}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              className={actionButtonClass}
              onClick={(event) => event.stopPropagation()}
              to={`/equipment/${item.equipmentId}`}
            >
              Открыть карточку
            </Link>
            {isArchived ? (
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

        <ProcessTimelineStrip
          items={repairTimeline.items}
          markers={repairTimeline.markers}
          segments={repairTimeline.segments}
          progress={repairTimeline.progress}
        />
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-line px-4 pb-4 pt-4 md:px-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
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
                <InfoRow label="Серийный номер" value={item.serialNumber} />
                <InfoRow label="Год выпуска" value={item.manufactureYear ? String(item.manufactureYear) : null} />
                <InfoRow label="Свидетельство" value={item.resultDocnum} />
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
                      disabled={closeRepairMutation.isPending || !form.paidAt}
                      onClick={() => setCloseConfirmOpen(true)}
                      title={form.paidAt ? undefined : "Завершение ремонта доступно после даты оплаты."}
                      type="button"
                    >
                      {closeRepairMutation.isPending ? "Завершаем..." : "Завершить ремонт"}
                    </button>
                    <button
                      className={actionAccentButtonClass}
                      disabled={updateMilestonesMutation.isPending}
                      onClick={() => void handleSaveMilestones()}
                      type="button"
                    >
                      {updateMilestonesMutation.isPending ? "Сохраняем..." : "Сохранить этапы"}
                    </button>
                  </div>
                ) : null}
              </div>

              {formError ? <p className="mt-3 text-sm text-[#b04c43]">{formError}</p> : null}
              {!isArchived && canManage && !form.paidAt ? (
                <p className="mt-3 text-sm text-steel">
                  Завершение ремонта станет доступно после заполнения даты оплаты.
                </p>
              ) : null}

              <div className="mt-4 space-y-3">
                {stageRows.map((row) => (
                  <div className="tone-grandchild rounded-2xl border border-line px-3 py-3 shadow-panel" key={row.key}>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(248px,1.05fr)_minmax(0,0.82fr)_minmax(0,0.68fr)]">
                      <div>
                        <p className="text-sm font-medium text-ink">{row.label}</p>
                        {row.note ? <p className="mt-1 text-xs text-steel">{row.note}</p> : null}
                      </div>

                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Факт</p>
                        {row.editable && !isArchived && canManage ? (
                          <DateInput
                            className="form-input form-input--compact"
                            onChange={(event) => {
                              setFormError(null);
                              setForm((current) => ({ ...current, [row.formKey]: event }));
                            }}
                            onEnter={() => void handleSaveMilestones()}
                            value={row.actualValue}
                          />
                        ) : (
                          <p className="text-sm text-ink">{formatDate(row.actualValue || null)}</p>
                        )}
                      </div>

                      {row.deadline ? (
                        <div className="space-y-1">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Дедлайн</p>
                          <p className="text-sm text-ink">{formatDate(row.deadline)}</p>
                        </div>
                      ) : (
                        <div aria-hidden="true" />
                      )}

                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Статус</p>
                        <p className={`text-sm ${row.accent === "danger" ? "text-[#b04c43]" : "text-ink"}`}>
                          {row.statusLabel}
                        </p>
                        {row.overdueDays > 0 ? (
                          <p className="text-xs text-[#b04c43]">{formatOverdueLabel(row.overdueDays)}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
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
                    <article className="tone-grandchild rounded-2xl border border-line px-4 py-3" key={message.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-xs text-steel">{formatRepairMessageMeta(message)}</div>
                        {canManage || message.authorUserId === currentUserId ? (
                          <IconActionButton
                            icon={
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h10.5" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.75h4.5l.75 1.5H18" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 7.5.75 11.25h6l.75-11.25" />
                              </svg>
                            }
                            label="Удалить сообщение ремонта"
                            onClick={() => void deleteMessageMutation.mutateAsync(message.id)}
                            size="tiny"
                          />
                        ) : null}
                      </div>

                      {message.text ? (
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">{message.text}</p>
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
                    placeholder="Новое сообщение по ремонту"
                    ref={messageInputRef}
                    rows={2}
                    suggestions={textSuggestions}
                    value={messageDraft}
                  />
                  <input className="sr-only" multiple onChange={handleFilesPick} ref={filesInputRef} type="file" />
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
                      label="Прикрепить файлы к сообщению ремонта"
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
  );
}

function RepairBatchCard({
  batch,
  token,
  canManage,
  lifecycleStatus,
  isTarget,
}: {
  batch: RepairGroup;
  token: string;
  canManage: boolean;
  lifecycleStatus: RepairTab;
  isTarget: boolean;
}) {
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const anchor = batch.items[0];
  const isArchived = lifecycleStatus === "archived";
  const [expanded, setExpanded] = useState(false);
  const [dialogExpanded, setDialogExpanded] = useState(false);
  const [form, setForm] = useState<RepairMilestonesFormState>(() => buildRepairFormState(anchor));
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
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);
  const articleRef = useRef<HTMLElement | null>(null);
  const repairTimeline = buildRepairTimeline(anchor, isArchived);
  const textSuggestions = useMemo(() => buildRepairTextSuggestions(batch.items), [batch.items]);

  useEffect(() => {
    setForm(buildRepairFormState(anchor));
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
    queryKey: ["repair-batch-messages", anchor.batchKey, anchor.equipmentId],
    queryFn: () => fetchEquipmentRepairMessages(token, anchor.equipmentId),
    enabled: Boolean(token) && Boolean(anchor.batchKey) && expanded && dialogExpanded && !isArchived,
  });

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
        candidateItems.flatMap((item) => [item.title, item.subtitle, item.meta]),
      ),
    [candidateItems],
  );

  const updateMilestonesMutation = useMutation({
    mutationFn: () =>
      updateRepairBatchMilestones(token, anchor.batchKey ?? "", {
        sentToRepairAt: emptyToNull(form.sentToRepairAt),
        arrivedToDestinationAt: emptyToNull(form.arrivedToDestinationAt),
        sentFromRepairAt: emptyToNull(form.sentFromRepairAt),
        sentFromIrkutskAt: emptyToNull(form.sentFromIrkutskAt),
        arrivedToLenskAt: emptyToNull(form.arrivedToLenskAt),
        actuallyReceivedAt: emptyToNull(form.actuallyReceivedAt),
        incomingControlAt: emptyToNull(form.incomingControlAt),
        paidAt: emptyToNull(form.paidAt),
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
      setFormError(null);
      setActionError(null);
      await invalidateRepairGroupQueries(queryClient, batch);
    },
    onError: (error) => {
      setFormError(error instanceof Error ? error.message : "Не удалось сохранить этапы ремонта.");
    },
  });

  const createMessageMutation = useMutation({
    mutationFn: () =>
      createEquipmentRepairMessage(token, anchor.equipmentId, {
        text: messageDraft,
        files: messageFiles,
      }),
    onSuccess: async () => {
      setActionError(null);
      setMessageDraft("");
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

  const closeBatchMutation = useMutation({
    mutationFn: () => closeRepairBatch(token, anchor.batchKey ?? ""),
    onSuccess: async () => {
      setActionError(null);
      await invalidateRepairGroupQueries(queryClient, batch);
    },
  });

  const updateBatchItemsMutation = useMutation({
    mutationFn: (payload: { addEquipmentIds?: number[]; removeEquipmentIds?: number[] }) =>
      updateRepairBatchItems(token, anchor.batchKey ?? "", payload),
    onSuccess: async (updatedBatch) => {
      const updatedRepair = updatedBatch[0];
      if (updatedRepair) {
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
      }
      setActionError(null);
      setFormError(null);
      setItemsModalOpen(false);
      setItemsSearchQuery("");
      await invalidateRepairGroupQueries(queryClient, batch);
    },
  });

  async function handleSaveMilestones() {
    setFormError(null);
    setActionError(null);

    const validationError = validateRepairMilestoneOrder({
      routeCity: anchor.routeCity,
      routeDestination: anchor.routeDestination,
      sentToRepairAt: form.sentToRepairAt,
      arrivedToDestinationAt: form.arrivedToDestinationAt,
      sentFromRepairAt: form.sentFromRepairAt,
      sentFromIrkutskAt: form.sentFromIrkutskAt,
      arrivedToLenskAt: form.arrivedToLenskAt,
      actuallyReceivedAt: form.actuallyReceivedAt,
      incomingControlAt: form.incomingControlAt,
      paidAt: form.paidAt,
    });

    if (validationError) {
      setFormError(validationError);
      return;
    }

    try {
      await updateMilestonesMutation.mutateAsync();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Не удалось сохранить этапы ремонта.");
    }
  }

  async function handleCreateMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    await createMessageMutation.mutateAsync();
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
      await closeBatchMutation.mutateAsync();
      setCloseConfirmOpen(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось завершить групповой ремонт.");
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
    const picked = event.target.files ? Array.from(event.target.files) : [];
    setMessageFiles(picked);
  }

  const stageRows = buildRepairStageRows(anchor, form);

  if (isArchived) {
    return (
      <article
        className="tone-parent rounded-3xl border border-line shadow-panel"
        ref={articleRef}
        tabIndex={-1}
      >
        <button
          className="flex w-full flex-col gap-4 px-4 py-4 text-left md:px-5"
          onClick={() => setExpanded((current) => !current)}
          type="button"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-ink">{batch.title}</span>
                <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel">
                  Архив
                </span>
                <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel">
                  {batch.items.length} приборов
                </span>
                {anchor.hasActiveVerification ? (
                  <span className="rounded-full border border-signal-info/40 bg-[color:var(--accent-soft)] px-2 py-0.5 text-[11px] text-ink">
                    Также в поверке
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-steel">
                {[anchor.routeCity, anchor.routeDestination].filter(Boolean).join(" → ")}
              </p>
              <p className="text-xs text-steel">
                Дата отправки: {formatDate(anchor.sentToRepairAt)}
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

          <ProcessTimelineStrip
            items={repairTimeline.items}
            markers={repairTimeline.markers}
            progress={repairTimeline.progress}
            segments={repairTimeline.segments}
          />
        </button>

        {expanded ? (
          <div className="space-y-4 border-t border-line px-4 pb-4 pt-4 md:px-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
              <section className="tone-child rounded-2xl border border-line p-4 shadow-panel">
                <div>
                  <h4 className="text-sm font-semibold text-ink">Состав группы</h4>
                  <p className="text-xs text-steel">Все приборы, которые входили в архивный групповой ремонт.</p>
                </div>
                <div className="mt-4 space-y-2">
                  {batch.items.map((groupItem) => (
                    <div className="tone-grandchild rounded-2xl border border-line px-3 py-3" key={groupItem.repairId}>
                      <div className="flex items-center justify-between gap-3">
                        <Link
                          className="text-sm font-medium text-ink transition hover:text-signal-info"
                          to={`/equipment/${groupItem.equipmentId}`}
                        >
                          {groupItem.equipmentName}
                        </Link>
                        <Link className={actionButtonCompactClass} to={`/equipment/${groupItem.equipmentId}`}>
                          Карточка
                        </Link>
                      </div>
                      <p className="mt-1 text-xs text-steel">
                        {[
                          groupItem.objectName,
                          groupItem.modification,
                          groupItem.serialNumber ? `№ ${groupItem.serialNumber}` : null,
                          groupItem.resultDocnum ? `свид. ${groupItem.resultDocnum}` : null,
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
    );
  }

  return (
    <article className="tone-parent rounded-3xl border border-line shadow-panel">
      <button
        className="flex w-full flex-col gap-4 px-4 py-4 text-left md:px-5"
        onClick={() => setExpanded((current) => !current)}
        type="button"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base font-semibold text-ink">{batch.title}</span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] uppercase tracking-[0.14em] text-steel">
                {anchor.currentStageLabel}
              </span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel">
                {batch.items.length} приборов
              </span>
              {batch.items.some((groupItem) => groupItem.hasActiveVerification) ? (
                <span className="rounded-full border border-signal-info/40 bg-[color:var(--accent-soft)] px-2 py-0.5 text-[11px] text-ink">
                  часть группы в поверке
                </span>
              ) : null}
            </div>
            <p className="text-sm text-steel">
              {[anchor.routeCity, anchor.routeDestination].filter(Boolean).join(" → ")}
            </p>
            <p className="text-xs text-steel">
              Дата отправки: {formatDate(anchor.sentToRepairAt)}
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

        <ProcessTimelineStrip
          items={repairTimeline.items}
          markers={repairTimeline.markers}
          progress={repairTimeline.progress}
          segments={repairTimeline.segments}
        />
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-line px-4 pb-4 pt-4 md:px-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)]">
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
                  <div className="tone-grandchild rounded-2xl border border-line px-3 py-3" key={groupItem.repairId}>
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        className="text-sm font-medium text-ink transition hover:text-signal-info"
                        to={`/equipment/${groupItem.equipmentId}`}
                      >
                        {groupItem.equipmentName}
                      </Link>
                      <div className="flex items-center gap-2">
                        <Link className={actionButtonCompactClass} to={`/equipment/${groupItem.equipmentId}`}>
                          Карточка
                        </Link>
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
                      disabled={closeBatchMutation.isPending || !form.paidAt}
                      onClick={() => setCloseConfirmOpen(true)}
                      title={form.paidAt ? undefined : "Завершение ремонта доступно после даты оплаты."}
                      type="button"
                    >
                      {closeBatchMutation.isPending ? "Завершаем..." : "Завершить ремонт"}
                    </button>
                    <button
                      className={actionAccentButtonClass}
                      disabled={updateMilestonesMutation.isPending}
                      onClick={() => void handleSaveMilestones()}
                      type="button"
                    >
                      {updateMilestonesMutation.isPending ? "Сохраняем..." : "Сохранить этапы"}
                    </button>
                  </div>
                ) : null}
              </div>

              {formError ? <p className="mt-3 text-sm text-[#b04c43]">{formError}</p> : null}
              {!form.paidAt && canManage ? (
                <p className="mt-3 text-sm text-steel">
                  Завершение ремонта станет доступно после заполнения даты оплаты.
                </p>
              ) : null}

              <div className="mt-4 space-y-3">
                {stageRows.map((row) => (
                  <div className="tone-grandchild rounded-2xl border border-line px-3 py-3 shadow-panel" key={row.key}>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(248px,1.05fr)_minmax(0,0.82fr)_minmax(0,0.68fr)]">
                      <div>
                        <p className="text-sm font-medium text-ink">{row.label}</p>
                        {row.note ? <p className="mt-1 text-xs text-steel">{row.note}</p> : null}
                      </div>

                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Факт</p>
                        {canManage ? (
                          <DateInput
                            className="form-input form-input--compact"
                            onChange={(value) => {
                              setFormError(null);
                              setForm((current) => ({ ...current, [row.formKey]: value }));
                            }}
                            onEnter={() => void handleSaveMilestones()}
                            value={row.actualValue}
                          />
                        ) : (
                          <p className="text-sm text-ink">{formatDate(row.actualValue || null)}</p>
                        )}
                      </div>

                      {row.deadline ? (
                        <div className="space-y-1">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Дедлайн</p>
                          <p className="text-sm text-ink">{formatDate(row.deadline)}</p>
                        </div>
                      ) : (
                        <div aria-hidden="true" />
                      )}

                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Статус</p>
                        <p className={`text-sm ${row.accent === "danger" ? "text-[#b04c43]" : "text-ink"}`}>
                          {row.statusLabel}
                        </p>
                        {row.overdueDays > 0 ? (
                          <p className="text-xs text-[#b04c43]">{formatOverdueLabel(row.overdueDays)}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
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
                  <article className="tone-grandchild rounded-2xl border border-line px-4 py-3" key={message.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="text-xs text-steel">{formatRepairMessageMeta(message)}</div>
                      {canManage || message.authorUserId === currentUserId ? (
                        <IconActionButton
                          icon={
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h10.5" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.75h4.5l.75 1.5H18" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 7.5.75 11.25h6l.75-11.25" />
                            </svg>
                          }
                          label="Удалить сообщение ремонта"
                          onClick={() => void deleteMessageMutation.mutateAsync(message.id)}
                          size="tiny"
                        />
                      ) : null}
                    </div>

                    {message.text ? (
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">{message.text}</p>
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
                  placeholder="Новое сообщение по ремонту"
                  ref={messageInputRef}
                  rows={2}
                  suggestions={textSuggestions}
                  value={messageDraft}
                />
                <input className="sr-only" multiple onChange={handleFilesPick} ref={filesInputRef} type="file" />
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
                    label="Прикрепить файлы к сообщению ремонта"
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
      <div className="grid gap-2 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.7fr)]">
        <div>
          <p className="text-sm font-medium text-ink">{label}</p>
          {note ? <p className="mt-1 text-xs text-steel">{note}</p> : null}
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Факт</p>
          <p className="text-sm text-ink">{formatDate(value || null)}</p>
        </div>
        {deadline ? (
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Дедлайн</p>
            <p className="text-sm text-ink">{formatDate(deadline)}</p>
          </div>
        ) : (
          <div aria-hidden="true" />
        )}
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-steel">Статус</p>
          <p className={`text-sm ${overdueDays > 0 ? "text-[#b04c43]" : "text-ink"}`}>{statusLabel}</p>
          {overdueDays > 0 ? (
            <p className="text-xs text-[#b04c43]">{formatOverdueLabel(overdueDays)}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SummaryChip({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string;
  danger?: boolean;
}) {
  return (
    <div className="tone-child rounded-2xl border border-line px-3 py-3 shadow-panel">
      <p className="text-[11px] uppercase tracking-[0.14em] text-steel">{label}</p>
      <p className={`mt-1 text-base font-semibold ${danger ? "text-[#b04c43]" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function buildRepairTimeline(item: RepairQueueItem, isArchived: boolean): RepairTimelineModel {
  const routeDestination = item.routeDestination || "пункт назначения";
  const routeCity = item.routeCity || "пункт отправления";
  const stages = [
    {
      key: "sentToRepairAt",
      label: `Отправлено в ${routeDestination}`,
      actual: item.sentToRepairAt,
      deadline: null,
      deadlineLabel: null,
      overdueDays: 0,
    },
    {
      key: "arrivedToDestinationAt",
      label: `Прибыло в ${routeDestination}`,
      actual: item.arrivedToDestinationAt,
      deadline: null,
      deadlineLabel: null,
      overdueDays: 0,
    },
    {
      key: "sentFromRepairAt",
      label: "Ремонт произведен",
      actual: item.sentFromRepairAt,
      deadline: null,
      deadlineLabel: null,
      overdueDays: 0,
    },
    {
      key: "sentFromIrkutskAt",
      label: `Отправлено в ${routeCity}`,
      actual: item.sentFromIrkutskAt,
      deadline: null,
      deadlineLabel: null,
      overdueDays: 0,
    },
    {
      key: "arrivedToLenskAt",
      label: `Прибыло в ${routeCity}`,
      actual: item.arrivedToLenskAt,
      deadline: item.repairDeadlineAt,
      deadlineLabel: "Просрочка ремонта",
      overdueDays: item.repairOverdueDays,
    },
    {
      key: "actuallyReceivedAt",
      label: `Получено в ${routeCity}`,
      actual: item.actuallyReceivedAt,
      deadline: item.registrationDeadlineAt,
      deadlineLabel: "Просрочка получения",
      overdueDays: item.registrationOverdueDays,
    },
    {
      key: "incomingControlAt",
      label: "Входной контроль",
      actual: item.incomingControlAt,
      deadline: item.controlDeadlineAt,
      deadlineLabel: "Просрочка входного контроля",
      overdueDays: item.controlOverdueDays,
    },
    {
      key: "paidAt",
      label: "Оплата",
      actual: item.paidAt,
      deadline: item.paymentDeadlineAt,
      deadlineLabel: "Просрочка оплаты",
      overdueDays: item.paymentOverdueDays,
    },
  ] as const;

  const startDate = parseIsoDate(item.sentToRepairAt);
  if (!startDate) {
    return { items: [], markers: [], segments: [], progress: 0 };
  }
  const plannedTimelineEnd = new Date(startDate.getTime() + 250 * 24 * 60 * 60 * 1000);

  const actualDates = stages
    .map((stage) => parseIsoDate(stage.actual))
    .filter((date): date is Date => Boolean(date));
  const deadlineDates = [
    parseIsoDate(item.repairDeadlineAt),
    parseIsoDate(item.registrationDeadlineAt),
    parseIsoDate(item.controlDeadlineAt),
    parseIsoDate(item.paymentDeadlineAt),
  ].filter((date): date is Date => Boolean(date));

  const today = startOfToday();
  const lastTimelineDate = [startDate, plannedTimelineEnd, ...actualDates, ...deadlineDates, !isArchived ? today : null]
    .filter((date): date is Date => Boolean(date))
    .reduce((max, current) => (current.getTime() > max.getTime() ? current : max), startDate);
  const progressDate = isArchived
    ? [parseIsoDate(item.closedAt), ...actualDates].filter((date): date is Date => Boolean(date)).reduce(
        (max, current) => (current.getTime() > max.getTime() ? current : max),
        startDate,
      )
    : today;

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

  if (item.repairDeadlineAt) {
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

  if (item.registrationDeadlineAt) {
    markers.push({
      key: "registrationDeadlineAt",
      position: calculateTimelineProgress(
        startDate,
        lastTimelineDate,
        parseIsoDate(item.registrationDeadlineAt) ?? startDate,
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

  if (item.controlDeadlineAt) {
    markers.push({
      key: "controlDeadlineAt",
      position: calculateTimelineProgress(
        startDate,
        lastTimelineDate,
        parseIsoDate(item.controlDeadlineAt) ?? startDate,
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

  if (item.paymentDeadlineAt) {
    markers.push({
      key: "paymentDeadlineAt",
      position: calculateTimelineProgress(
        startDate,
        lastTimelineDate,
        parseIsoDate(item.paymentDeadlineAt) ?? startDate,
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
  };
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

function buildRepairFormState(item: RepairQueueItem): RepairMilestonesFormState {
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

function buildRepairStageRows(
  item: RepairQueueItem,
  form: RepairMilestonesFormState,
): Array<{
  key: string;
  label: string;
  note?: string;
  editable: boolean;
  formKey: keyof RepairMilestonesFormState;
  actualValue: string;
  deadline: string | null;
  overdueDays: number;
  statusLabel: string;
  accent: "danger" | "normal";
}> {
  return [
    buildRepairReadonlyStage({
      key: "sentToRepairAt",
      label: `Отправлено в ${item.routeDestination}`,
      actualValue: form.sentToRepairAt,
      note: `Маршрут: ${item.routeCity} → ${item.routeDestination}`,
      deadline: null,
      overdueDays: 0,
      formKey: "sentToRepairAt",
    }),
    buildRepairEditableStage({
      key: "arrivedToDestinationAt",
      label: `Прибыло в ${item.routeDestination}`,
      actualValue: form.arrivedToDestinationAt,
      deadline: null,
      overdueDays: 0,
      formKey: "arrivedToDestinationAt",
    }),
    buildRepairEditableStage({
      key: "sentFromRepairAt",
      label: "Ремонт произведен",
      actualValue: form.sentFromRepairAt,
      deadline: null,
      overdueDays: 0,
      formKey: "sentFromRepairAt",
    }),
    buildRepairEditableStage({
      key: "sentFromIrkutskAt",
      label: `Отправлено в ${item.routeCity}`,
      actualValue: form.sentFromIrkutskAt,
      deadline: null,
      overdueDays: 0,
      formKey: "sentFromIrkutskAt",
    }),
    buildRepairEditableStage({
      key: "arrivedToLenskAt",
      label: `Прибыло в ${item.routeCity}`,
      actualValue: form.arrivedToLenskAt,
      deadline: item.repairDeadlineAt,
      overdueDays: item.repairOverdueDays,
      formKey: "arrivedToLenskAt",
    }),
    buildRepairEditableStage({
      key: "actuallyReceivedAt",
      label: `Получено в ${item.routeCity}`,
      actualValue: form.actuallyReceivedAt,
      deadline: item.registrationDeadlineAt,
      overdueDays: item.registrationOverdueDays,
      formKey: "actuallyReceivedAt",
    }),
    buildRepairEditableStage({
      key: "incomingControlAt",
      label: "Дата входного контроля",
      actualValue: form.incomingControlAt,
      deadline: item.controlDeadlineAt,
      overdueDays: item.controlOverdueDays,
      formKey: "incomingControlAt",
    }),
    buildRepairEditableStage({
      key: "paidAt",
      label: "Дата оплаты",
      actualValue: form.paidAt,
      deadline: item.paymentDeadlineAt,
      overdueDays: item.paymentOverdueDays,
      formKey: "paidAt",
    }),
  ];
}

function buildRepairReadonlyStage({
  key,
  label,
  actualValue,
  note,
  deadline,
  overdueDays,
  formKey,
}: {
  key: string;
  label: string;
  actualValue: string;
  note?: string;
  deadline: string | null;
  overdueDays: number;
  formKey: keyof RepairMilestonesFormState;
}) {
  const hasValue = Boolean(actualValue);
  const statusLabel = hasValue
    ? overdueDays > 0
      ? "Выполнено с просрочкой"
      : "Выполнено"
    : overdueDays > 0
      ? "Просрочено"
      : "Ждет";

  return {
    key,
    label,
    note,
    editable: true,
    formKey,
    actualValue,
    deadline,
    overdueDays,
    statusLabel,
    accent: overdueDays > 0 ? ("danger" as const) : ("normal" as const),
  };
}

function buildRepairEditableStage({
  key,
  label,
  actualValue,
  deadline,
  overdueDays,
  formKey,
}: {
  key: string;
  label: string;
  actualValue: string;
  deadline: string | null;
  overdueDays: number;
  formKey: keyof RepairMilestonesFormState;
}) {
  const hasValue = Boolean(actualValue);
  const statusLabel = hasValue
    ? overdueDays > 0
      ? "Выполнено с просрочкой"
      : "Выполнено"
    : overdueDays > 0
      ? "Просрочено"
      : "Ждет";

  return {
    key,
    label,
    editable: true,
    formKey,
    actualValue,
    deadline,
    overdueDays,
    statusLabel,
    accent: overdueDays > 0 ? ("danger" as const) : ("normal" as const),
  };
}

async function invalidateRepairQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  equipmentId: number,
) {
  await queryClient.invalidateQueries({ queryKey: ["repair-queue"] });
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

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
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

function formatRepairMessageMeta(message: RepairMessage): string {
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
