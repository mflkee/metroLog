import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  fetchEquipmentFolderSuggestions,
  fetchEquipmentFolders,
  fetchEquipmentPage,
} from "@/api/equipment";
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
  const [folderId, setFolderId] = useState<number>(task.folderId);
  const [objectName, setObjectName] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setFolderId(task.folderId);
      setObjectName("");
      setSelected(task.equipment.map((link) => link.equipmentId));
      setQuery("");
      setError(null);
    }
  }, [open, task]);

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders"],
    queryFn: () => fetchEquipmentFolders(token),
    enabled: open && Boolean(token),
  });
  const suggestionsQuery = useQuery({
    queryKey: ["equipment-folder-suggestions", folderId],
    queryFn: () => fetchEquipmentFolderSuggestions(token, folderId),
    enabled: open && Boolean(token) && Boolean(folderId),
  });
  const equipmentQuery = useQuery({
    queryKey: ["equipment-picker", folderId, objectName, query],
    queryFn: () =>
      fetchEquipmentPage(token, {
        folderId,
        objectName: objectName || null,
        query,
        limit: 25,
        offset: 0,
      }),
    enabled: open && Boolean(token) && Boolean(folderId),
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
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm text-steel">
            Папка
            <select
              className="form-input"
              value={folderId || ""}
              onChange={(event) => {
                setFolderId(Number(event.target.value));
                setObjectName("");
              }}
            >
              {(foldersQuery.data ?? []).map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm text-steel">
            Объект
            <select
              className="form-input"
              value={objectName}
              onChange={(event) => setObjectName(event.target.value)}
            >
              <option value="">Все объекты</option>
              {(suggestionsQuery.data?.objectNames ?? []).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm text-steel">
          Поиск
          <input
            className="form-input"
            placeholder="Название, зав. № или объект"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-line p-2">
          {equipmentQuery.isLoading ? <p className="text-sm text-steel">Загрузка…</p> : null}
          {!equipmentQuery.isLoading && items.length === 0 ? (
            <p className="text-sm text-steel">Ничего не найдено по выбранным фильтрам.</p>
          ) : null}
          {items.map((item) => (
            <label key={item.id} className="flex items-center gap-2 text-sm text-ink">
              <input checked={selected.includes(item.id)} onChange={() => toggle(item.id)} type="checkbox" />
              <span className="min-w-0 truncate">
                {item.name}
                {item.modification ? ` · ${item.modification}` : ""}
                {item.serialNumber ? ` · зав. № ${item.serialNumber}` : ""}
                {item.objectName ? ` · ${item.objectName}` : ""}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-steel">Выбрано приборов: {selected.length}</p>

        {error ? <p className="text-sm text-[color:var(--danger)]">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary btn-sm" onClick={onClose} type="button">
            Отмена
          </button>
          <button className="btn-primary btn-sm" disabled={saving} onClick={() => void save()} type="button">
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
