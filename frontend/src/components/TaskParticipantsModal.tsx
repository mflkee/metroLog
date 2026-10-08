import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { updateTask, type Task } from "@/api/tasks";
import { fetchMentionUsers } from "@/api/users";
import { Modal } from "@/components/Modal";
import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/searchable-select";

type TaskParticipantsModalProps = {
  open: boolean;
  token: string;
  task: Task;
  onClose: () => void;
  onSaved: () => void;
};

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
  const userOptions = users.map((user) => ({
    value: user.id,
    label: user.displayName || user.email,
  }));

  return (
    <Modal title="Участники задачи" open={open} onClose={onClose}>
      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="text-xs uppercase tracking-wide text-steel">Ответственный</span>
          <SearchableSelect
            onChange={(next) => setResponsibleId(next === null ? "" : String(next))}
            options={userOptions}
            placeholder="— выберите —"
            value={responsibleId ? Number(responsibleId) : null}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-steel">Исполнители</span>
            <SearchableMultiSelect
              loading={usersQuery.isLoading}
              onChange={setAssigneeIds}
              options={userOptions}
              placeholder="Поиск сотрудника…"
              value={assigneeIds}
            />
          </div>

          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wide text-steel">Наблюдатели</span>
            <SearchableMultiSelect
              loading={usersQuery.isLoading}
              onChange={setObserverIds}
              options={userOptions}
              placeholder="Поиск сотрудника…"
              value={observerIds}
            />
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
