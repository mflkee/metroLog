import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  fetchEquipmentFolderSuggestions,
  fetchEquipmentFolders,
  fetchEquipmentPage,
} from "@/api/equipment";
import { updateTask, type Task } from "@/api/tasks";
import { Modal } from "@/components/Modal";
import { SearchableMultiSelect } from "@/components/ui/searchable-select";
import { useSearchHistory } from "@/lib/searchHistory";

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
  const { history, remember } = useSearchHistory("metroLog.search.task-equipment");
  const loadedIds = new Set(items.map((item) => item.id));
  // Keep the initially linked equipment visible even when it is not on the loaded page.
  const options = [
    ...items.map((item) => ({
      value: item.id,
      label: `${item.name}${item.modification ? ` · ${item.modification}` : ""}`,
      hint:
        [item.serialNumber ? `зав. № ${item.serialNumber}` : null, item.objectName]
          .filter(Boolean)
          .join(" · ") || undefined,
    })),
    ...task.equipment
      .filter((link) => !loadedIds.has(link.equipmentId))
      .map((link) => ({
        value: link.equipmentId,
        label: `${link.name ?? `Прибор #${link.equipmentId}`}${
          link.modification ? ` · ${link.modification}` : ""
        }`,
        hint: link.serialNumber ? `зав. № ${link.serialNumber}` : undefined,
      })),
  ];

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
        <div className="space-y-1 text-sm text-steel">
          <span>Приборы</span>
          <SearchableMultiSelect
            emptyLabel="Ничего не найдено по выбранным фильтрам."
            filterLocally={false}
            history={history}
            loading={equipmentQuery.isLoading}
            maxResults={5}
            onChange={setSelected}
            onQueryChange={setQuery}
            onQueryCommitted={remember}
            options={options}
            placeholder="Название, зав. № или объект"
            value={selected}
          />
        </div>

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
