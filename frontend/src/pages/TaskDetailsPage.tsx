import { type ChangeEvent, type FormEvent, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";

import { apiBaseUrl } from "@/api/client";
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
  fetchTaskAttachments,
  fetchTaskMessages,
  fetchTaskSubscription,
  setTaskSubscription,
  updateChecklistItem,
  updateTask,
  uploadTaskAttachments,
  type TaskAttachment,
  type TaskStatus,
} from "@/api/tasks";
import { fetchMentionUsers } from "@/api/users";
import { Modal } from "@/components/Modal";
import { MentionTextarea } from "@/components/MentionTextarea";
import { TaskEquipmentModal } from "@/components/TaskEquipmentModal";
import { TaskParticipantsModal } from "@/components/TaskParticipantsModal";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/store/auth";

function formatDateTime(value: string): string {
  return value.slice(0, 16).replace("T", " ");
}

async function downloadAttachment(token: string, taskId: number, attachment: TaskAttachment) {
  const response = await fetch(`${apiBaseUrl}/tasks/${taskId}/attachments/${attachment.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function downloadMessageAttachment(
  token: string,
  taskId: number,
  messageId: number,
  attachmentId: number,
  fileName: string,
) {
  const response = await fetch(
    `${apiBaseUrl}/tasks/${taskId}/messages/${messageId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function TaskDetailsPage() {
  const { taskId: taskIdParam } = useParams();
  const taskId = Number(taskIdParam);
  const token = useAuthStore((state) => state.token) ?? "";
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [checklistLabel, setChecklistLabel] = useState("");
  const [messageText, setMessageText] = useState("");
  const [messagePrivate, setMessagePrivate] = useState(false);
  const [messageFiles, setMessageFiles] = useState<File[]>([]);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string; mime: string | null } | null>(
    null,
  );

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

  const refreshTask = () => {
    queryClient.invalidateQueries({ queryKey: ["task", taskId] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: TaskStatus) => updateTask(token, taskId, { status }),
    onSuccess: refreshTask,
  });
  const checklistAdd = useMutation({
    mutationFn: () => addChecklistItem(token, taskId, checklistLabel.trim()),
    onSuccess: () => {
      setChecklistLabel("");
      refreshTask();
    },
  });
  const checklistToggle = useMutation({
    mutationFn: ({ itemId, isDone }: { itemId: number; isDone: boolean }) =>
      updateChecklistItem(token, taskId, itemId, { isDone }),
    onSuccess: refreshTask,
  });
  const checklistDelete = useMutation({
    mutationFn: (itemId: number) => deleteChecklistItem(token, taskId, itemId),
    onSuccess: refreshTask,
  });
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task-attachments", taskId] }),
  });
  const subscriptionMutation = useMutation({
    mutationFn: (subscribed: boolean) => setTaskSubscription(token, taskId, subscribed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["task-subscription", taskId] }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteTask(token, taskId),
    onSuccess: () => navigate("/tasks"),
  });

  async function openPreview(attachment: TaskAttachment) {
    const response = await fetch(`${apiBaseUrl}/tasks/${taskId}/attachments/${attachment.id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      return;
    }
    const blob = await response.blob();
    setPreview({
      url: URL.createObjectURL(blob),
      name: attachment.fileName,
      mime: attachment.fileMimeType,
    });
  }

  function closePreview() {
    setPreview((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
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
  const responsible = task.participants.filter((participant) => participant.role === "RESPONSIBLE");
  const assignees = task.participants.filter((participant) => participant.role === "ASSIGNEE");
  const observers = task.participants.filter((participant) => participant.role === "OBSERVER");

  return (
    <section className="space-y-4">
      <Link className="text-sm text-steel underline" to="/tasks">
        ← К списку задач
      </Link>
      <PageHeader
        title={task.title}
        description={`${task.folderName ?? "Без папки"} · приоритет ${TASK_PRIORITY_LABELS[task.priority].toLowerCase()} · автор ${task.createdByDisplayName}`}
        action={
          <div className="flex items-center gap-2">
            <button
              className="rounded-xl border border-line px-3 py-2 text-sm text-steel"
              onClick={() => subscriptionMutation.mutate(!(subscriptionQuery.data?.isSubscribed ?? false))}
              type="button"
            >
              {subscriptionQuery.data?.isSubscribed ? "Отписаться" : "Подписаться"}
            </button>
            <button
              className="rounded-xl border border-[color:var(--danger)] px-3 py-2 text-sm text-[color:var(--danger)]"
              onClick={() => {
                if (window.confirm("Удалить задачу?")) {
                  deleteMutation.mutate();
                }
              }}
              type="button"
            >
              Удалить
            </button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <article className="space-y-3 rounded-2xl border border-line p-4">
            <div className="flex flex-wrap items-center gap-3">
              <select
                className="form-input form-input--compact"
                value={task.status}
                onChange={(event) => statusMutation.mutate(event.target.value as TaskStatus)}
              >
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {TASK_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
              <span className={task.isOverdue ? "text-sm text-[color:var(--danger)]" : "text-sm text-steel"}>
                Срок: {task.dueDate ?? "не задан"}
              </span>
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

          <article className="space-y-3 rounded-2xl border border-line p-4">
            <h3 className="text-sm font-semibold text-ink">
              Чек-лист {task.checklistTotal > 0 ? `(${task.checklistDone}/${task.checklistTotal})` : ""}
            </h3>
            <ul className="space-y-1.5">
              {task.checklist.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-sm">
                  <input
                    checked={item.isDone}
                    onChange={(event) =>
                      checklistToggle.mutate({ itemId: item.id, isDone: event.target.checked })
                    }
                    type="checkbox"
                  />
                  <span className={item.isDone ? "text-steel line-through" : "text-ink"}>{item.label}</span>
                  <button
                    className="ml-auto text-xs text-[color:var(--danger)]"
                    onClick={() => checklistDelete.mutate(item.id)}
                    type="button"
                  >
                    удалить
                  </button>
                </li>
              ))}
            </ul>
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
              <button className="rounded-xl border border-line px-3 py-1 text-sm text-steel" type="submit">
                Добавить
              </button>
            </form>
          </article>

          <article className="space-y-3 rounded-2xl border border-line p-4">
            <h3 className="text-sm font-semibold text-ink">Обсуждение</h3>
            <ul className="space-y-3">
              {(messagesQuery.data ?? []).map((message) => (
                <li key={message.id} className="rounded-xl border border-line p-3 text-sm">
                  <div className="flex items-center justify-between gap-2 text-xs text-steel">
                    <span>
                      {message.authorDisplayName}
                      {message.isPrivate ? " · приватно" : ""} · {formatDateTime(message.createdAt)}
                    </span>
                    <button
                      className="text-[color:var(--danger)]"
                      onClick={() => messageDelete.mutate(message.id)}
                      type="button"
                    >
                      удалить
                    </button>
                  </div>
                  {message.text ? <p className="mt-1 whitespace-pre-wrap text-ink">{message.text}</p> : null}
                  {message.attachments.length > 0 ? (
                    <ul className="mt-1 space-y-1 text-xs">
                      {message.attachments.map((attachment) => (
                        <li key={attachment.id}>
                          <button
                            className="text-left text-steel underline"
                            onClick={() =>
                              void downloadMessageAttachment(
                                token,
                                taskId,
                                message.id,
                                attachment.id,
                                attachment.fileName,
                              )
                            }
                            type="button"
                          >
                            {attachment.fileName}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
            <form
              className="space-y-2"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                if (messageText.trim() || messageFiles.length > 0) {
                  messageCreate.mutate();
                }
              }}
            >
              <MentionTextarea
                users={usersQuery.data ?? []}
                placeholder="Сообщение, @упоминание…"
                rows={2}
                value={messageText}
                onChange={setMessageText}
              />
              <div className="flex flex-wrap items-center gap-3 text-xs text-steel">
                <label className="flex items-center gap-1">
                  <input
                    checked={messagePrivate}
                    onChange={(event) => setMessagePrivate(event.target.checked)}
                    type="checkbox"
                  />
                  Приватно
                </label>
                <input
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setMessageFiles(Array.from(event.target.files ?? []))
                  }
                  type="file"
                  multiple
                />
                <button className="ml-auto rounded-xl border border-line px-3 py-1 text-ink" type="submit">
                  Отправить
                </button>
              </div>
            </form>
          </article>
        </div>

        <aside className="space-y-4">
          <article className="space-y-2 rounded-2xl border border-line p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Участники</h3>
              <button
                className="text-xs text-steel underline"
                onClick={() => setParticipantsOpen(true)}
                type="button"
              >
                изменить
              </button>
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

          <article className="space-y-2 rounded-2xl border border-line p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-ink">Оборудование</h3>
              <button
                className="text-xs text-steel underline"
                onClick={() => setEquipmentOpen(true)}
                type="button"
              >
                изменить
              </button>
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

          <article className="space-y-2 rounded-2xl border border-line p-4 text-sm">
            <h3 className="text-sm font-semibold text-ink">Вложения</h3>
            <ul className="space-y-1">
              {(attachmentsQuery.data ?? []).map((attachment) => (
                <li key={attachment.id} className="flex items-center gap-2">
                  <button
                    className="text-left text-ink hover:underline"
                    onClick={() => void downloadAttachment(token, taskId, attachment)}
                    type="button"
                  >
                    {attachment.fileName}
                  </button>
                  <span className="text-xs text-steel">{Math.round(attachment.fileSize / 1024)} КБ</span>
                  <button
                    className="text-xs text-steel underline"
                    onClick={() => void openPreview(attachment)}
                    type="button"
                  >
                    просмотр
                  </button>
                  <button
                    className="ml-auto text-xs text-[color:var(--danger)]"
                    onClick={() => attachmentDelete.mutate(attachment.id)}
                    type="button"
                  >
                    удалить
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <input
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setAttachmentFiles(Array.from(event.target.files ?? []))
                }
                type="file"
                multiple
              />
              <button
                className="rounded-xl border border-line px-3 py-1 text-ink disabled:opacity-50"
                disabled={attachmentFiles.length === 0}
                onClick={() => attachmentUpload.mutate()}
                type="button"
              >
                Загрузить
              </button>
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
        <TaskEquipmentModal
          open={equipmentOpen}
          token={token}
          task={task}
          onClose={() => setEquipmentOpen(false)}
          onSaved={() => {
            setEquipmentOpen(false);
            refreshTask();
          }}
        />
      ) : null}
      {preview ? (
        <Modal title={preview.name} open onClose={closePreview}>
          {preview.mime?.startsWith("image/") ? (
            <img alt={preview.name} className="max-h-[70vh] w-full object-contain" src={preview.url} />
          ) : preview.mime === "application/pdf" ? (
            <iframe className="h-[70vh] w-full" src={preview.url} title={preview.name} />
          ) : (
            <p className="text-sm text-steel">Предпросмотр недоступен — используйте скачивание.</p>
          )}
        </Modal>
      ) : null}
    </section>
  );
}
