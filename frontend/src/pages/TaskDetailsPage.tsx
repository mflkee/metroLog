import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  addChecklistItem,
  createTaskMessage,
  deleteChecklistItem,
  deleteTask,
  deleteTaskAttachment,
  deleteTaskMessage,
  fetchTask,
  fetchTaskAttachmentBlob,
  fetchTaskAttachments,
  fetchTaskMessageAttachmentBlob,
  fetchTaskMessages,
  fetchTaskSubscription,
  setTaskSubscription,
  updateChecklistItem,
  updateTask,
  uploadTaskAttachments,
  type TaskAttachment,
  type TaskChecklistItem,
  type TaskMessageAttachment,
  type TaskPriority,
  type TaskStatus,
} from "@/api/tasks";
import { fetchMentionUsers } from "@/api/users";
import { AutocompleteTextarea } from "@/components/AutocompleteTextarea";
import { Select } from "@/components/ui/select";
import { AttachmentPreviewList } from "@/components/AttachmentPreviewList";
import { DateInput } from "@/components/DateInput";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { EmojiPickerButton } from "@/components/EmojiPickerButton";
import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";
import { PendingAttachmentList } from "@/components/PendingAttachmentList";
import { PrivateNoteBadge, PrivateNoteToggleButton } from "@/components/PrivateNoteControls";
import { EquipmentPickerModal } from "@/components/EquipmentPickerModal";
import { TaskParticipantsModal } from "@/components/TaskParticipantsModal";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { buildMentionSuggestionOptions } from "@/lib/autocomplete";
import {
  appendPendingFiles,
  downloadBlob,
  openFilePicker,
  removePendingFile,
} from "@/lib/attachments";
import {
  handleTextareaSubmitShortcut,
  insertEmojiAtCursor,
  resizeTextareaToContent,
} from "@/lib/textarea";
import { hasOperatorAccess } from "@/lib/roles";
import { TASK_STATUS_TONES } from "@/lib/taskStatusTone";
import { useAuthStore } from "@/store/auth";

const paperclipIcon = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21.44 11.05 12.25 20.25a6 6 0 0 1-8.49-8.49l9.9-9.9a4.5 4.5 0 1 1 6.36 6.36l-9.2 9.19a3 3 0 0 1-4.24-4.24l8.49-8.49"
    />
  </svg>
);

const sendIcon = (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3 21l18-9L3 3l3 9Zm0 0h7.5" />
  </svg>
);

function formatDateTime(value: string): string {
  return value.slice(0, 16).replace("T", " ");
}

export function TaskDetailsPage() {
  const { taskId: taskIdParam } = useParams();
  const taskId = Number(taskIdParam);
  const token = useAuthStore((state) => state.token) ?? "";
  const currentUser = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isOperator = hasOperatorAccess(currentUser?.role);
  const canUsePrivateNotes = isOperator;
  const currentUserId = currentUser?.id ?? null;
  const [actionError, setActionError] = useState<string | null>(null);

  const [checklistLabel, setChecklistLabel] = useState("");
  const [messageText, setMessageText] = useState("");
  const [messagePrivate, setMessagePrivate] = useState(false);
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const messageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const messageFilesInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentFilesInputRef = useRef<HTMLInputElement | null>(null);

  const taskQuery = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => fetchTask(token, taskId),
    enabled: Boolean(token) && Number.isFinite(taskId),
  });
  const messagesQuery = useQuery({
    queryKey: ["task-messages", taskId],
    queryFn: () => fetchTaskMessages(token, taskId),
    enabled: Boolean(token) && Number.isFinite(taskId),
  });
  const attachmentsQuery = useQuery({
    queryKey: ["task-attachments", taskId],
    queryFn: () => fetchTaskAttachments(token, taskId),
    enabled: Boolean(token) && Number.isFinite(taskId),
  });
  const subscriptionQuery = useQuery({
    queryKey: ["task-subscription", taskId],
    queryFn: () => fetchTaskSubscription(token, taskId),
    enabled: Boolean(token) && Number.isFinite(taskId),
  });
  const usersQuery = useQuery({
    queryKey: ["mention-users"],
    queryFn: () => fetchMentionUsers(token),
    enabled: Boolean(token),
  });

  const mentionSuggestions = useMemo(
    () => buildMentionSuggestionOptions(usersQuery.data ?? []),
    [usersQuery.data],
  );

  function reportError(fallback: string, error: unknown) {
    setActionError(error instanceof Error && error.message ? error.message : fallback);
  }

  const refreshTask = () => {
    setActionError(null);
    queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: TaskStatus) => updateTask(token, taskId, { status }),
    onError: (error) => reportError("Не удалось изменить статус.", error),
    onSuccess: refreshTask,
  });
  const priorityMutation = useMutation({
    mutationFn: (priority: TaskPriority) => updateTask(token, taskId, { priority }),
    onError: (error) => reportError("Не удалось изменить приоритет.", error),
    onSuccess: refreshTask,
  });
  const equipmentMutation = useMutation({
    mutationFn: (equipmentIds: number[]) => updateTask(token, taskId, { equipmentIds }),
    onError: (error) => reportError("Не удалось сохранить приборы.", error),
    onSuccess: refreshTask,
  });
  const dueDateMutation = useMutation({
    // DateInput reports an empty string for a cleared field; the API wants null there.
    mutationFn: (dueDate: string | null) => updateTask(token, taskId, { dueDate }),
    onError: (error) => reportError("Не удалось изменить срок.", error),
    onSuccess: refreshTask,
  });
  const checklistAdd = useMutation({
    mutationFn: () => addChecklistItem(token, taskId, checklistLabel.trim()),
    onError: (error) => reportError("Не удалось добавить пункт чек-листа.", error),
    onSuccess: () => {
      setChecklistLabel("");
      refreshTask();
    },
  });
  const checklistToggle = useMutation({
    mutationFn: ({ itemId, isDone }: { itemId: number; isDone: boolean }) =>
      updateChecklistItem(token, taskId, itemId, { isDone }),
    onError: (error) => reportError("Не удалось отметить пункт чек-листа.", error),
    onSuccess: refreshTask,
  });
  const checklistDelete = useMutation({
    mutationFn: (itemId: number) => deleteChecklistItem(token, taskId, itemId),
    onError: (error) => reportError("Не удалось удалить пункт чек-листа.", error),
    onSuccess: refreshTask,
  });
  // The checklist reflects a tick immediately; the override is dropped once the server agrees.
  const [checklistOverride, setChecklistOverride] = useState<Record<number, boolean>>({});
  const checklistItems = useMemo(
    () => taskQuery.data?.checklist ?? [],
    [taskQuery.data?.checklist],
  );

  useEffect(() => {
    setChecklistOverride((current) => {
      const next: Record<number, boolean> = {};
      let changed = false;
      for (const [id, value] of Object.entries(current)) {
        const item = checklistItems.find((entry) => entry.id === Number(id));
        if (item && item.isDone !== value) {
          next[Number(id)] = value;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [checklistItems]);

  const messageCreate = useMutation({
    mutationFn: () =>
      createTaskMessage(token, taskId, { text: messageText, isPrivate: messagePrivate }, messageFiles),
    onSuccess: () => {
      setMessageText("");
      setMessagePrivate(false);
      setMessageFiles([]);
      queryClient.invalidateQueries({ queryKey: ["task-messages", taskId] });
    },
  });
  const messageDelete = useMutation({
    mutationFn: (messageId: number) => deleteTaskMessage(token, taskId, messageId),
    onError: (error) => reportError("Не удалось удалить сообщение.", error),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task-messages", taskId] }),
  });
  const attachmentUpload = useMutation({
    mutationFn: () => uploadTaskAttachments(token, taskId, attachmentFiles),
    onSuccess: () => {
      setAttachmentFiles([]);
      queryClient.invalidateQueries({ queryKey: ["task-attachments", taskId] });
    },
  });
  const attachmentDelete = useMutation({
    mutationFn: (attachmentId: number) => deleteTaskAttachment(token, taskId, attachmentId),
    onError: (error) => reportError("Не удалось удалить вложение.", error),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task-attachments", taskId] }),
  });
  const subscriptionMutation = useMutation({
    mutationFn: (subscribed: boolean) => setTaskSubscription(token, taskId, subscribed),
    onError: (error) => reportError("Не удалось изменить подписку.", error),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task-subscription", taskId] }),
  });
  /*
   * The failure belongs to the confirmation dialog, which stays open above the page: reporting it
   * on the page's own error line would put it behind the dialog the user is looking at.
   */
  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(token, taskId),
    onSuccess: () => navigate("/tasks"),
  });

  async function downloadTaskAttachment(attachment: TaskAttachment) {
    const blob = await fetchTaskAttachmentBlob(token, taskId, attachment.id);
    downloadBlob(blob, attachment.fileName);
  }

  async function downloadTaskMessageAttachment(
    messageId: number,
    attachment: TaskMessageAttachment,
  ) {
    const blob = await fetchTaskMessageAttachmentBlob(token, taskId, messageId, attachment.id);
    downloadBlob(blob, attachment.fileName);
  }

  function pickMessageFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setMessageFiles((current) => appendPendingFiles(current, files));
    event.target.value = "";
  }

  function pickAttachmentFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setAttachmentFiles((current) => appendPendingFiles(current, files));
    event.target.value = "";
  }

  if (taskQuery.isLoading) {
    return <p className="text-sm text-steel">Загрузка задачи…</p>;
  }
  if (taskQuery.isError || !taskQuery.data) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[color:var(--danger)]">Задача не найдена.</p>
        <Link className="text-sm text-steel underline" to="/tasks">
          ← К списку задач
        </Link>
      </div>
    );
  }

  const task = taskQuery.data;
  /*
   * Same rule the API enforces (`_assert_can_mutate`): operators (MKAIR and above), the author and
   * the RESPONSIBLE/ASSIGNEE participants may change a task, observers only read it. The screens
   * have to agree with that, otherwise a click fails with 403 behind an apparently active control.
   */
  // The API already decided this (`_can_mutate`), so the screen never guesses at the rule.
  const canMutate = task.canMutate;
  const canDeleteAttachment = (attachment: TaskAttachment): boolean =>
    isOperator
    || (attachment.uploadedByUserId !== null && attachment.uploadedByUserId === currentUserId);

  function checklistItemDone(item: TaskChecklistItem): boolean {
    const override = checklistOverride[item.id];
    return override !== undefined && override !== item.isDone ? override : item.isDone;
  }

  const checklistDoneCount = task.checklist.filter((item) => checklistItemDone(item)).length;
  const responsible = task.participants.filter((participant) => participant.role === "RESPONSIBLE");
  const assignees = task.participants.filter((participant) => participant.role === "ASSIGNEE");
  const observers = task.participants.filter((participant) => participant.role === "OBSERVER");
  const messages = messagesQuery.data ?? [];
  const attachments = attachmentsQuery.data ?? [];
  const canSubmitMessage = messageText.trim().length > 0 || messageFiles.length > 0;

  return (
    <section className="space-y-4">
      <Link className="text-sm text-steel underline" to="/tasks">
        ← К списку задач
      </Link>
      <PageHeader
        title={task.title}
        description={`${task.folderName ?? "Без папки"} · приоритет ${TASK_PRIORITY_LABELS[task.priority].toLowerCase()} · автор ${task.createdByDisplayName}`}
        actions={
          <div className="flex items-center gap-2">
            <button
              className="btn-secondary btn-sm"
              onClick={() => subscriptionMutation.mutate(!(subscriptionQuery.data?.isSubscribed ?? false))}
              type="button"
            >
              {subscriptionQuery.data?.isSubscribed ? "Отписаться" : "Подписаться"}
            </button>
            {canMutate ? (
              <button
                className="btn-danger btn-sm"
                onClick={() => setDeleteConfirmOpen(true)}
                type="button"
              >
                Удалить
              </button>
            ) : null}
          </div>
        }
      />

      {actionError ? (
        <p className="text-sm text-[color:var(--danger)]">{actionError}</p>
      ) : null}
      {canMutate ? null : (
        <p className="text-sm text-steel">
          Только просмотр: менять задачу могут автор, ответственный, исполнители и операторы.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <article className="tone-parent space-y-3 rounded-3xl border border-line p-4 shadow-panel">
            <div className="flex flex-wrap items-center gap-3">
              <Select<TaskStatus>
                compact
                disabled={!canMutate}
                onChange={(next) => statusMutation.mutate(next)}
                options={TASK_STATUSES.map((status) => ({
                  value: status,
                  label: TASK_STATUS_LABELS[status],
                }))}
                value={task.status}
              />
              <StatusBadge tone={TASK_STATUS_TONES[task.status]}>
                {TASK_STATUS_LABELS[task.status]}
              </StatusBadge>
              <Select<TaskPriority>
                ariaLabel="Приоритет"
                compact
                disabled={!canMutate}
                onChange={(next) => priorityMutation.mutate(next)}
                options={Object.entries(TASK_PRIORITY_LABELS).map(([value, label]) => ({
                  value: value as TaskPriority,
                  label,
                }))}
                value={task.priority}
              />
              <label className="flex items-center gap-2 text-sm text-steel">
                Срок
                <DateInput
                  aria-label="Срок"
                  className="form-input form-input--compact"
                  disabled={!canMutate}
                  value={task.dueDate}
                  onChange={(value) => dueDateMutation.mutate(value || null)}
                />
              </label>
              {canMutate && task.dueDate ? (
                <button
                  className="text-xs text-steel underline"
                  onClick={() => dueDateMutation.mutate(null)}
                  type="button"
                >
                  сбросить срок
                </button>
              ) : null}
              {task.isOverdue ? (
                <span className="text-xs font-semibold text-[color:var(--danger)]">просрочено</span>
              ) : null}
              {task.tags.length > 0 ? (
                <span className="text-xs text-steel">Теги: {task.tags.join(", ")}</span>
              ) : null}
            </div>
            {task.description ? (
              <p className="whitespace-pre-wrap text-sm text-ink">{task.description}</p>
            ) : (
              <p className="text-sm text-steel">Описание не задано.</p>
            )}
          </article>

          <article className="tone-parent space-y-3 rounded-3xl border border-line p-4 shadow-panel">
            <h3 className="text-sm font-semibold text-ink">
              Чек-лист {task.checklistTotal > 0 ? `(${checklistDoneCount}/${task.checklistTotal})` : ""}
            </h3>
            <ul className="space-y-1.5">
              {task.checklist.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={checklistItemDone(item)}
                    disabled={!canMutate}
                    id={`checklist-item-${item.id}`}
                    onCheckedChange={(checked) => {
                      setChecklistOverride((current) => ({ ...current, [item.id]: checked }));
                      checklistToggle.mutate({ itemId: item.id, isDone: checked });
                    }}
                  />
                  <label
                    className={checklistItemDone(item) ? "text-steel line-through" : "text-ink"}
                    htmlFor={`checklist-item-${item.id}`}
                  >
                    {item.label}
                  </label>
                  {canMutate ? (
                    <IconActionButton
                      className="icon-action-button--danger ml-auto shrink-0"
                      icon={<Icon className="h-4 w-4" name="delete" />}
                      label="Удалить пункт чек-листа"
                      size="tiny"
                      onClick={() => checklistDelete.mutate(item.id)}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
            {canMutate ? (
              <form
                className="flex gap-2"
                onSubmit={(event: FormEvent) => {
                  event.preventDefault();
                  if (checklistLabel.trim()) {
                    checklistAdd.mutate();
                  }
                }}
              >
                <input
                  className="form-input form-input--compact"
                  placeholder="Новый пункт"
                  value={checklistLabel}
                  onChange={(event) => setChecklistLabel(event.target.value)}
                />
                <button className="btn-secondary btn-sm" type="submit">
                  Добавить
                </button>
              </form>
            ) : null}
          </article>

          <article className="tone-parent space-y-3 rounded-3xl border border-line p-4 shadow-panel">
            <h3 className="text-lg font-semibold text-ink">Обсуждение</h3>

            <div className="space-y-3">
              {messages.map((message) => (
                <article key={message.id} className="tone-child rounded-2xl border border-line px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-steel">
                        {message.authorDisplayName} · {formatDateTime(message.createdAt)}
                      </span>
                      {message.isPrivate ? <PrivateNoteBadge /> : null}
                    </div>
                    {isOperator || message.authorUserId === currentUserId ? (
                      <IconActionButton
                        className="icon-action-button--danger"
                        icon={<Icon className="h-4 w-4" name="delete" />}
                        label="Удалить сообщение"
                        size="tiny"
                        onClick={() => messageDelete.mutate(message.id)}
                      />
                    ) : null}
                  </div>
                  {message.text ? (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                      {message.text}
                    </p>
                  ) : null}
                  <AttachmentPreviewList
                    attachments={message.attachments}
                    className="mt-3"
                    loadPreview={(attachment) =>
                      fetchTaskMessageAttachmentBlob(token, taskId, message.id, attachment.id)
                    }
                    onDownload={(attachment) => void downloadTaskMessageAttachment(message.id, attachment)}
                    previewVariant="compact"
                  />
                </article>
              ))}
              {!messages.length ? (
                <p className="text-sm text-steel">Сообщений пока нет — начни обсуждение.</p>
              ) : null}
            </div>

            <form
              className="space-y-2 border-t border-line pt-4"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                if (canSubmitMessage) {
                  messageCreate.mutate();
                }
              }}
            >
              <AutocompleteTextarea
                ref={messageInputRef}
                className="form-input min-h-[56px] overflow-hidden py-3 resize-none"
                maxLength={4000}
                placeholder="Сообщение, @упоминание…"
                rows={2}
                suggestions={mentionSuggestions}
                value={messageText}
                onChange={setMessageText}
                onKeyDown={handleTextareaSubmitShortcut}
                onInput={(event) => resizeTextareaToContent(event.currentTarget)}
              />
              <input
                ref={messageFilesInputRef}
                className="sr-only"
                multiple
                type="file"
                onChange={pickMessageFiles}
              />
              <PendingAttachmentList
                disableRemove={messageCreate.isPending}
                files={messageFiles}
                onRemove={(file) => setMessageFiles((current) => removePendingFile(current, file))}
              />
              {messageCreate.isError ? (
                <p className="text-sm text-[color:var(--danger)]">
                  {messageCreate.error instanceof Error
                    ? messageCreate.error.message
                    : "Не удалось отправить сообщение."}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                {canUsePrivateNotes ? (
                  <PrivateNoteToggleButton
                    active={messagePrivate}
                    disabled={messageCreate.isPending}
                    onClick={() => setMessagePrivate((current) => !current)}
                  />
                ) : null}
                <EmojiPickerButton
                  disabled={messageCreate.isPending}
                  onPick={(emoji) =>
                    setMessageText((current) => insertEmojiAtCursor(messageInputRef.current, current, emoji))
                  }
                />
                <IconActionButton
                  className="icon-action-button--info h-10 w-10"
                  disabled={messageCreate.isPending}
                  icon={paperclipIcon}
                  label="Прикрепить файлы к сообщению"
                  onClick={() => openFilePicker(messageFilesInputRef.current)}
                />
                <IconActionButton
                  className="icon-action-button--accent h-10 w-10"
                  disabled={messageCreate.isPending || !canSubmitMessage}
                  icon={messageCreate.isPending ? <span className="text-sm leading-none">…</span> : sendIcon}
                  label="Отправить сообщение"
                  type="submit"
                />
              </div>
            </form>
          </article>
        </div>

        <aside className="space-y-4">
          <article className="tone-parent space-y-2 rounded-3xl border border-line p-4 text-sm shadow-panel">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Участники</h3>
              {canMutate ? (
                <button
                  className="text-xs text-steel underline"
                  onClick={() => setParticipantsOpen(true)}
                  type="button"
                >
                  изменить
                </button>
              ) : null}
            </div>
            <p className="text-steel">
              Ответственный: <span className="text-ink">{responsible[0]?.displayName ?? "—"}</span>
            </p>
            <p className="text-steel">
              Исполнители:{" "}
              <span className="text-ink">
                {assignees.map((participant) => participant.displayName).join(", ") || "—"}
              </span>
            </p>
            <p className="text-steel">
              Наблюдатели:{" "}
              <span className="text-ink">
                {observers.map((participant) => participant.displayName).join(", ") || "—"}
              </span>
            </p>
          </article>

          <article className="tone-parent space-y-2 rounded-3xl border border-line p-4 text-sm shadow-panel">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Оборудование</h3>
              {canMutate ? (
                <button
                  className="text-xs text-steel underline"
                  onClick={() => setEquipmentOpen(true)}
                  type="button"
                >
                  изменить
                </button>
              ) : null}
            </div>
            {task.equipment.length === 0 ? (
              <p className="text-steel">Приборы не привязаны.</p>
            ) : (
              <ul className="space-y-1">
                {task.equipment.map((link) => (
                  <li key={link.equipmentId}>
                    <Link className="text-ink hover:underline" to={`/equipment/${link.equipmentId}`}>
                      {link.name ?? `Прибор #${link.equipmentId}`}
                      {link.serialNumber ? ` · зав. № ${link.serialNumber}` : ""}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="tone-parent space-y-3 rounded-3xl border border-line p-4 shadow-panel">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-ink">Вложения</h3>
              <IconActionButton
                className="icon-action-button--accent shrink-0"
                icon={<Icon className="h-5 w-5" name="plus" />}
                label="Добавить вложение"
                onClick={() => openFilePicker(attachmentFilesInputRef.current)}
              />
            </div>
            <input
              ref={attachmentFilesInputRef}
              className="sr-only"
              multiple
              type="file"
              onChange={pickAttachmentFiles}
            />
            <div className="space-y-2">
              <PendingAttachmentList
                disableRemove={attachmentUpload.isPending}
                files={attachmentFiles}
                onRemove={(file) => setAttachmentFiles((current) => removePendingFile(current, file))}
              />
              {attachmentFiles.length > 0 ? (
                <button
                  className="btn-primary btn-sm w-full justify-center"
                  disabled={attachmentUpload.isPending}
                  onClick={() => attachmentUpload.mutate()}
                  type="button"
                >
                  {attachmentUpload.isPending
                    ? "Загружаем…"
                    : `Загрузить (${attachmentFiles.length})`}
                </button>
              ) : null}
              {attachmentUpload.isError ? (
                <p className="text-sm text-[color:var(--danger)]">
                  {attachmentUpload.error instanceof Error
                    ? attachmentUpload.error.message
                    : "Не удалось загрузить вложения."}
                </p>
              ) : null}
              {!attachments.length && !attachmentFiles.length ? (
                <p className="text-sm text-steel">Пока пусто.</p>
              ) : null}
              <AttachmentPreviewList
                attachments={attachments}
                canDelete={canDeleteAttachment}
                className="mt-2"
                columns="single"
                deletingId={attachmentDelete.isPending ? attachmentDelete.variables ?? null : null}
                loadPreview={(attachment) => fetchTaskAttachmentBlob(token, taskId, attachment.id)}
                onDelete={(attachment) => attachmentDelete.mutate(attachment.id)}
                onDownload={(attachment) => void downloadTaskAttachment(attachment)}
                previewVariant="a4"
              />
            </div>
          </article>
        </aside>
      </div>

      {participantsOpen ? (
        <TaskParticipantsModal
          open={participantsOpen}
          token={token}
          task={task}
          onClose={() => setParticipantsOpen(false)}
          onSaved={() => {
            setParticipantsOpen(false);
            refreshTask();
          }}
        />
      ) : null}
      {equipmentOpen ? (
        <EquipmentPickerModal
          defaultFolderId={task.folderId}
          initialSelection={task.equipment.map((link) => ({
            id: link.equipmentId,
            label: `${link.name ?? `Прибор #${link.equipmentId}`}${
              link.modification ? ` · ${link.modification}` : ""
            }`,
            hint: link.serialNumber ? `зав. № ${link.serialNumber}` : undefined,
          }))}
          open={equipmentOpen}
          token={token}
          onClose={() => setEquipmentOpen(false)}
          onConfirm={(items) => {
            setEquipmentOpen(false);
            equipmentMutation.mutate(items.map((item) => item.id));
          }}
        />
      ) : null}
      <DeleteConfirmModal
        confirmLabel="Удалить задачу"
        description="Задача, её пункты чек-листа, сообщения и вложения будут удалены безвозвратно."
        errorMessage={
          deleteMutation.isError
            ? deleteMutation.error instanceof Error
              ? deleteMutation.error.message
              : "Не удалось удалить задачу."
            : null
        }
        isOpen={deleteConfirmOpen}
        isPending={deleteMutation.isPending}
        title="Удалить задачу?"
        onClose={() => {
          if (deleteMutation.isPending) {
            return;
          }
          setDeleteConfirmOpen(false);
        }}
        onConfirm={() => void deleteMutation.mutateAsync()}
      />
    </section>
  );
}
