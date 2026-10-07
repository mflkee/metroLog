import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { fetchEquipmentPage } from "@/api/equipment";
import { updateTask, type Task } from "@/api/tasks";
import { Modal } from "@/components/Modal";

type TaskEquipmentModalProps = {
  open: boolean;
  token: string;
  task: Task;
  onClose: () => void;
  onSaved: () => void;
};

export function TaskEquipmentModal({ open, token, task, onClose, onSaved }: TaskEquipmentModalProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(task.equipment.map((link) => link.equipmentId));
      setQuery("");
      setError(null);
    }
  }, [open, task]);

  const equipmentQuery = useQuery({
    queryKey: ["equipment-picker", task.folderId, query],
    queryFn: () => fetchEquipmentPage(token, { folderId: task.folderId, query, limit: 25, offset: 0 }),
    enabled: open && Boolean(token),
  });

  function toggle(equipmentId: number) {
    setSelected((current) =>
      current.includes(equipmentId)
        ? current.filter((value) => value !== equipmentId)
        : [...current, equipmentId],
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateTask(token, task.id, { equipmentIds: selected });
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить приборы.");
    } finally {
      setSaving(false);
    }
  }

  const items = equipmentQuery.data?.items ?? [];

  return (
    <Modal title="Приборы задачи" open={open} onClose={onClose}>
      <div className="space-y-3">
        <input
          className="form-input"
          placeholder="Поиск по названию, зав. № или объекту"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
          {equipmentQuery.isLoading ? <p className="text-sm text-steel">Загрузка…</p> : null}
          {!equipmentQuery.isLoading && items.length === 0 ? (
            <p className="text-sm text-steel">Ничего не найдено в папке задачи.</p>
          ) : null}
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm text-ink">
              <input checked={selected.includes(item.id)} onChange={() => toggle(item.id)} type="checkbox" />
              <span className="min-w-0 truncate">
                {item.name}
                {item.modification ? ` · ${item.modification}` : ""}
                {item.serialNumber ? ` · зав. № ${item.serialNumber}` : ""}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-steel">Выбрано приборов: {selected.length}</p>

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
