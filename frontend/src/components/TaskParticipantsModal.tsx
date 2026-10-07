import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { updateTask, type Task } from "@/api/tasks";
import { fetchMentionUsers } from "@/api/users";
import { Modal } from "@/components/Modal";

type TaskParticipantsModalProps = {
  open: boolean;
  token: string;
  task: Task;
  onClose: () => void;
  onSaved: () => void;
};

function toggle(list: number[], id: number): number[] {
  return list.includes(id) ? list.filter((value) => value !== id) : [...list, id];
}

export function TaskParticipantsModal({
  open,
  token,
  task,
  onClose,
  onSaved,
}: TaskParticipantsModalProps) {
  const usersQuery = useQuery({
    queryKey: ["mention-users"],
    queryFn: () => fetchMentionUsers(token),
    enabled: open && Boolean(token),
  });

  const [responsibleId, setResponsibleId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [observerIds, setObserverIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setResponsibleId(
      String(task.participants.find((participant) => participant.role === "RESPONSIBLE")?.userId ?? ""),
    );
    setAssigneeIds(
      task.participants.filter((participant) => participant.role === "ASSIGNEE").map((p) => p.userId),
    );
    setObserverIds(
      task.participants.filter((participant) => participant.role === "OBSERVER").map((p) => p.userId),
    );
    setError(null);
  }, [open, task]);

  async function save() {
    if (!responsibleId) {
      setError("Выберите ответственного.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateTask(token, task.id, {
        responsibleUserId: Number(responsibleId),
        assigneeUserIds: assigneeIds,
        observerUserIds: observerIds,
      });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить участников.");
    } finally {
      setSaving(false);
    }
  }

  const users = usersQuery.data ?? [];
  const label = (userId: number) =>
    users.find((user) => user.id === userId)?.displayName ??
    task.participants.find((participant) => participant.userId === userId)?.displayName ??
    `#${userId}`;

  return (
    <Modal title="Участники задачи" open={open} onClose={onClose}>
      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-steel">Ответственный</span>
          <select
            className="form-input"
            value={responsibleId}
            onChange={(event) => setResponsibleId(event.target.value)}
          >
            <option value="">— выберите —</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.displayName || user.email}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-steel">Исполнители</span>
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
              {users.map((user) => (
                <label key={user.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    checked={assigneeIds.includes(user.id)}
                    onChange={() => setAssigneeIds((current) => toggle(current, user.id))}
                    type="checkbox"
                  />
                  <span className="truncate">{user.displayName || user.email}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-steel">
              Выбрано: {assigneeIds.map(label).join(", ") || "—"}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-steel">Наблюдатели</span>
            <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
              {users.map((user) => (
                <label key={user.id} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    checked={observerIds.includes(user.id)}
                    onChange={() => setObserverIds((current) => toggle(current, user.id))}
                    type="checkbox"
                  />
                  <span className="truncate">{user.displayName || user.email}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-steel">
              Выбрано: {observerIds.map(label).join(", ") || "—"}
            </p>
          </div>
        </div>

        {error ? <p className="text-sm text-[color:var(--danger)]">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <button className="rounded-xl border border-line px-3 py-2 text-sm text-steel" onClick={onClose} type="button">
            Отмена
          </button>
          <button
            className="rounded-xl border border-[color:var(--accent)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-ink disabled:opacity-50"
            disabled={saving}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
