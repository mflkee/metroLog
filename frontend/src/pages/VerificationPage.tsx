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
  fetchEquipmentVerificationMessages,
  fetchVerificationQueue,
  getVerificationProgressLabel,
  updateEquipmentVerificationMilestones,
  updateVerificationBatchMilestones,
  type VerificationMessage,
  type VerificationMessageAttachment,
  type VerificationQueueItem,
} from "@/api/equipment";
import { EmojiPickerButton } from "@/components/EmojiPickerButton";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";
import { PageHeader } from "@/components/layout/PageHeader";
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

const tabButtonClass =
  "inline-flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-sm text-steel transition hover:border-signal-info hover:text-ink";
const activeTabButtonClass =
  "inline-flex items-center gap-2 rounded-full border border-signal-info bg-[color:var(--accent-soft)] px-3 py-1.5 text-sm font-medium text-ink";

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
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const canManage = user?.role === "ADMINISTRATOR" || user?.role === "MKAIR";
  const tab: VerificationTab = searchParams.get("tab") === "archived" ? "archived" : "active";

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

  async function invalidateVerificationQueries() {
    await queryClient.invalidateQueries({ queryKey: ["verification-queue"] });
    await queryClient.invalidateQueries({ queryKey: ["equipment-item"] });
    await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
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
        <div className="flex min-w-[240px] flex-1 justify-end">
          <label className="tone-child flex w-full max-w-sm items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-steel shadow-panel">
            <span className="sr-only">Поиск по поверкам</span>
            <svg className="h-4 w-4 text-steel" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z" />
            </svg>
            <input
              className="w-full bg-transparent text-ink outline-none placeholder:text-steel"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Поиск по прибору, свидетельству, маршруту"
              type="search"
              value={searchQuery}
            />
          </label>
        </div>
      </div>

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
                key={`${tab}-${group.key}`}
                lifecycleStatus={tab}
                onUpdated={invalidateVerificationQueries}
                token={token ?? ""}
              />
            ) : (
              <VerificationQueueRow
                canManage={canManage}
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
}: {
  batch: VerificationGroup;
  token: string;
  canManage: boolean;
  lifecycleStatus: VerificationTab;
  onUpdated: () => Promise<void>;
}) {
  const anchor = batch.items[0];
  const isArchived = lifecycleStatus === "archived";
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<VerificationMilestonesFormState>(() =>
    buildMilestonesFormState(anchor),
  );
  const [dialogExpanded, setDialogExpanded] = useState(true);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<number | null>(null);
  const [downloadingArchive, setDownloadingArchive] = useState(false);
  const currentUserId = useAuthStore((state) => state.user?.id);
  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const filesInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setForm(buildMilestonesFormState(anchor));
  }, [anchor]);

  useEffect(() => {
    if (!messageInputRef.current) {
      return;
    }
    resizeTextarea(messageInputRef.current);
  }, [messageDraft]);

  const messagesQuery = useQuery({
    queryKey: ["verification-batch-messages", anchor.batchKey, anchor.equipmentId],
    queryFn: () => fetchEquipmentVerificationMessages(token, anchor.equipmentId),
    enabled: Boolean(anchor.batchKey) && expanded,
  });

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    try {
      await updateMilestonesMutation.mutateAsync();
    } catch (error) {
      setActionError(
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

  if (isArchived) {
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
                архив
              </span>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel">
                {batch.items.length} приборов
              </span>
            </div>
            <p className="text-xs text-steel">
              {[anchor.routeCity, anchor.routeDestination].filter(Boolean).join(" → ")}
            </p>
            <p className="text-xs text-steel">
              {[
                anchor.closedAt ? `закрыта ${formatDateOnly(anchor.closedAt)}` : null,
                `${batch.items.length} СИ в группе`,
              ].join(" · ")}
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
        <div className="mt-3 grid gap-2 text-sm text-ink md:grid-cols-2 xl:grid-cols-4">
          <QueueField label="Маршрут" value={`${anchor.routeCity} → ${anchor.routeDestination}`} />
          <QueueField label="Отправлено" value={formatDateOnly(anchor.sentToVerificationAt)} />
          <QueueField label="Закрыто" value={anchor.closedAt ? formatDateOnly(anchor.closedAt) : "Не указано"} />
          <QueueField label="Количество" value={`${batch.items.length} СИ`} />
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
                            className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel transition hover:border-signal-info hover:text-ink"
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
          <p className="line-clamp-2 text-xs text-steel">
            {batch.items
              .map((item) => item.equipmentName)
              .filter(Boolean)
              .join(" · ")}
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

      <div className="mt-3 grid gap-2 text-sm text-ink md:grid-cols-2 xl:grid-cols-4">
        <QueueField label="Маршрут" value={`${anchor.routeCity} → ${anchor.routeDestination}`} />
        <QueueField label="Отправлено в поверку" value={formatDateOnly(anchor.sentToVerificationAt)} />
        <QueueField
          label="Состояние"
          value={getVerificationProgressLabel(anchor)}
        />
        <QueueField
          label="Количество"
          value={`${batch.items.length} приборов`}
        />
      </div>

      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-line pt-4">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
            <section className="space-y-3">
              <div>
                <h4 className="text-sm font-semibold text-ink">Состав группы</h4>
                <p className="mt-1 text-xs text-steel">
                  Все приборы ниже используют общий диалог и общие этапы движения.
                </p>
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
                      {item.arshinUrl ? (
                        <a
                          className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel transition hover:border-signal-info hover:text-ink"
                          href={item.arshinUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Arshin
                        </a>
                      ) : null}
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
                {verificationMilestoneDefinitions.map((milestone) => (
                  <div
                    className="tone-child grid items-center gap-2 rounded-2xl border border-line px-3 py-3 md:grid-cols-[minmax(0,1fr)_180px_96px]"
                    key={milestone.key}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">
                        {milestone.buildLabel(anchor.routeDestination)}
                      </p>
                    </div>
                    <input
                      className="form-input py-2"
                      disabled={!canManage}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          [milestone.key]: event.target.value,
                        }))
                      }
                      type="date"
                      value={form[milestone.key]}
                    />
                    <div className="text-xs text-steel">
                      {form[milestone.key] ? "Ок" : "Ждет"}
                    </div>
                  </div>
                ))}

                {canManage ? (
                  <div className="flex justify-end gap-2">
                    <button
                      className="rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-signal-info disabled:cursor-not-allowed disabled:opacity-60"
                      disabled={closeBatchMutation.isPending}
                      onClick={() => setCloseConfirmOpen(true)}
                      type="button"
                    >
                      {closeBatchMutation.isPending ? "Завершаем..." : "Завершить поверку"}
                    </button>
                    <button
                      className="rounded-full border border-signal-info bg-[color:var(--accent-soft)] px-4 py-2 text-sm text-ink transition hover:border-signal-info disabled:cursor-not-allowed disabled:opacity-60"
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
                <textarea
                  className="form-input min-h-[56px] resize-none overflow-hidden py-3"
                  maxLength={4000}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  onKeyDown={handleTextareaSubmitShortcut}
                  onInput={(event) => resizeTextarea(event.currentTarget)}
                  placeholder="Новое сообщение по групповой поверке"
                  ref={messageInputRef}
                  rows={2}
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
}: {
  item: VerificationQueueItem;
  token: string;
  canManage: boolean;
  lifecycleStatus: VerificationTab;
  onUpdated: () => Promise<void>;
}) {
  const isArchived = lifecycleStatus === "archived";
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<VerificationMilestonesFormState>(() =>
    buildMilestonesFormState(item),
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [downloadingArchive, setDownloadingArchive] = useState(false);

  useEffect(() => {
    setForm(buildMilestonesFormState(item));
  }, [item]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    try {
      await updateMilestonesMutation.mutateAsync();
    } catch (error) {
      setActionError(
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

  if (isArchived) {
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
                onClick={(event) => event.stopPropagation()}
                to={`/equipment/${item.equipmentId}`}
              >
                {item.equipmentName}
              </Link>
              <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-steel">
                архив
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
        <div className="mt-3 grid gap-2 text-sm text-ink md:grid-cols-2 xl:grid-cols-4">
          <QueueField label="Маршрут" value={`${item.routeCity} → ${item.routeDestination}`} />
          <QueueField label="Отправлено" value={formatDateOnly(item.sentToVerificationAt)} />
          <QueueField label="Свидетельство" value={item.resultDocnum || "Не указано"} />
          <QueueField label="Закрыто" value={item.closedAt ? formatDateOnly(item.closedAt) : "Не указано"} />
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
              className="rounded-full border border-line px-3 py-1 text-xs text-steel transition hover:border-signal-info hover:text-ink"
              href={item.arshinUrl}
              rel="noreferrer"
              target="_blank"
            >
              Arshin
            </a>
          ) : null}
          <Link
            className="rounded-full border border-line px-3 py-1 text-xs text-steel transition hover:border-signal-info hover:text-ink"
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

      <div className="mt-3 grid gap-2 text-sm text-ink md:grid-cols-2 xl:grid-cols-4">
        <QueueField label="Маршрут" value={`${item.routeCity} → ${item.routeDestination}`} />
        <QueueField label="Отправлен в поверку" value={formatDateOnly(item.sentToVerificationAt)} />
        <QueueField label="Свидетельство" value={item.resultDocnum || "Не указано"} />
        <QueueField
          label="Действительно до"
          value={item.validDate ? formatDateOnly(item.validDate) : "Не указано"}
        />
      </div>

      {expanded && lifecycleStatus === "active" ? (
        <form className="mt-4 space-y-3 border-t border-line pt-4" onSubmit={(event) => void handleSubmit(event)}>
          {verificationMilestoneDefinitions.map((milestone) => (
            <div
              className="tone-child grid items-center gap-2 rounded-2xl border border-line px-3 py-3 md:grid-cols-[minmax(0,1fr)_180px_120px]"
              key={milestone.key}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {milestone.buildLabel(item.routeDestination)}
                </p>
              </div>
              <input
                className="form-input py-2"
                disabled={!canManage}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [milestone.key]: event.target.value,
                  }))
                }
                type="date"
                value={form[milestone.key]}
              />
              <div className="text-xs text-steel">
                {form[milestone.key] ? "Выполнено" : "Ожидает"}
              </div>
            </div>
          ))}

          {actionError ? <p className="text-sm text-[#b04c43]">{actionError}</p> : null}

          {canManage ? (
            <div className="flex justify-end gap-2">
              <button
                className="rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-signal-info disabled:cursor-not-allowed disabled:opacity-60"
                disabled={closeVerificationMutation.isPending}
                onClick={() => setCloseConfirmOpen(true)}
                type="button"
              >
                {closeVerificationMutation.isPending ? "Завершаем..." : "Завершить поверку"}
              </button>
              <button
                className="rounded-full border border-signal-info bg-[color:var(--accent-soft)] px-4 py-2 text-sm text-ink transition hover:border-signal-info disabled:cursor-not-allowed disabled:opacity-60"
                disabled={updateMilestonesMutation.isPending}
                type="submit"
              >
                {updateMilestonesMutation.isPending ? "Сохраняем..." : "Сохранить этапы"}
              </button>
            </div>
          ) : null}
        </form>
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

function QueueField({ label, value }: { label: string; value: string }) {
  return (
    <div className="tone-child rounded-2xl border border-line px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.08em] text-steel">{label}</p>
      <p className="mt-1 text-sm text-ink">{value}</p>
    </div>
  );
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

function formatDateOnly(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ru-RU").format(date);
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
