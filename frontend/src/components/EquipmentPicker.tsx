import { useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import {
  fetchEquipmentFolderSuggestions,
  fetchEquipmentFolders,
  fetchEquipmentPage,
} from "@/api/equipment";
import { equipmentTypeLabels, getEquipmentStatusLabel } from "@/api/equipment/registry";

const PAGE_SIZE = 50;

export type PickedEquipment = {
  id: number;
  label: string;
  hint?: string;
};

type EquipmentPickerProps = {
  token: string;
  /** Equipment already attached to the task; the picker hands the whole new set back. */
  initialSelection: PickedEquipment[];
  /** Folder to open first, when the caller knows one (the task's own folder). */
  defaultFolderId?: number | null;
  cancelLabel?: string;
  onCancel: () => void;
  /** The whole new set, labels included, so callers can render chips without refetching. */
  onConfirm: (picked: PickedEquipment[]) => void;
};

/**
 * The registry shrunk to a picker: choose a folder from the ones you may see, search inside it and
 * tick what you need. It is a plain body (no dialog of its own) so it can be shown inside the task
 * dialog as well as in a modal of its own — a dialog nested in a dialog cannot be clicked or
 * scrolled, because Radix freezes everything outside the dialog it owns.
 */
export function EquipmentPicker({
  token,
  initialSelection,
  defaultFolderId = null,
  cancelLabel = "Отмена",
  onCancel,
  onConfirm,
}: EquipmentPickerProps) {
  const [folderId, setFolderId] = useState<number | null>(defaultFolderId);
  const [query, setQuery] = useState("");
  const [objectName, setObjectName] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [picked, setPicked] = useState<PickedEquipment[]>(initialSelection);

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders"],
    queryFn: () => fetchEquipmentFolders(token),
    enabled: Boolean(token),
  });
  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);

  // The first accessible folder is a sane place to start when nothing points at one.
  useEffect(() => {
    if (folderId === null && folders.length > 0) {
      setFolderId(folders[0].id);
    }
  }, [folderId, folders]);

  const suggestionsQuery = useQuery({
    queryKey: ["equipment-folder-suggestions", folderId],
    queryFn: () => fetchEquipmentFolderSuggestions(token, folderId ?? 0),
    enabled: Boolean(token) && folderId !== null,
  });

  const equipmentQuery = useQuery({
    queryKey: ["equipment-picker", "browse", folderId, objectName, query, visibleCount],
    queryFn: () =>
      fetchEquipmentPage(token, {
        folderId,
        objectName: objectName || null,
        query: query.trim() || undefined,
        limit: visibleCount,
        offset: 0,
      }),
    enabled: Boolean(token) && folderId !== null,
  });

  const items = equipmentQuery.data?.items ?? [];
  const total = equipmentQuery.data?.total ?? 0;
  const pickedIds = useMemo(() => new Set(picked.map((item) => item.id)), [picked]);

  function describe(item: { name: string; modification: string | null; serialNumber: string | null }) {
    return {
      id: 0,
      label: `${item.name}${item.modification ? ` · ${item.modification}` : ""}`,
      hint: item.serialNumber ? `зав. № ${item.serialNumber}` : undefined,
    };
  }

  function toggle(entry: PickedEquipment) {
    setPicked((current) =>
      current.some((item) => item.id === entry.id)
        ? current.filter((item) => item.id !== entry.id)
        : [...current, entry],
    );
  }

  const everyLoadedPicked = items.length > 0 && items.every((item) => pickedIds.has(item.id));

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="block text-sm text-steel">
          Папка
          <select
            className="form-input form-input--compact"
            value={folderId ?? ""}
            onChange={(event) => {
              setFolderId(Number(event.target.value));
              setObjectName("");
              setVisibleCount(PAGE_SIZE);
            }}
          >
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-steel">
          Объект
          <select
            className="form-input form-input--compact"
            value={objectName}
            onChange={(event) => {
              setObjectName(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            <option value="">Все объекты</option>
            {(suggestionsQuery.data?.objectNames ?? []).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-steel">
          Поиск
          <input
            className="form-input form-input--compact"
            placeholder="Название, зав. №…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
          />
        </label>
      </div>

      <div className="max-h-[46vh] overflow-auto rounded-2xl border border-line">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="sticky top-0 z-10 bg-[var(--accent-soft)] text-xs uppercase tracking-wide text-steel">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  aria-label="Отметить всё на этой странице"
                  checked={everyLoadedPicked}
                  className="h-4 w-4 accent-[var(--accent)]"
                  onChange={() =>
                    setPicked((current) => {
                      const withoutLoaded = current.filter(
                        (entry) => !items.some((item) => item.id === entry.id),
                      );
                      return everyLoadedPicked
                        ? withoutLoaded
                        : [
                            ...withoutLoaded,
                            ...items.map((item) => ({
                              ...describe(item),
                              id: item.id,
                            })),
                          ];
                    })
                  }
                  type="checkbox"
                />
              </th>
              <th className="px-3 py-2">Прибор</th>
              <th className="px-3 py-2">Тип</th>
              <th className="px-3 py-2">Зав. №</th>
              <th className="px-3 py-2">Объект</th>
              <th className="px-3 py-2">Состояние</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const entry = { ...describe(item), id: item.id };
              const isPicked = pickedIds.has(item.id);
              return (
                <tr
                  key={item.id}
                  className={[
                    index % 2 === 0 ? "tone-parent" : "tone-child",
                    "cursor-pointer border-t border-line text-ink",
                    isPicked ? "bg-[var(--accent-soft)]" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => toggle(entry)}
                >
                  <td className="px-3 py-2">
                    <input
                      aria-label={`Выбрать ${item.name}`}
                      checked={isPicked}
                      className="h-4 w-4 accent-[var(--accent)]"
                      onChange={() => toggle(entry)}
                      onClick={(event) => event.stopPropagation()}
                      type="checkbox"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-semibold">{item.name}</span>
                    {item.modification ? (
                      <span className="block text-xs text-steel">{item.modification}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-steel">{equipmentTypeLabels[item.equipmentType]}</td>
                  <td className="px-3 py-2 text-steel">{item.serialNumber || "—"}</td>
                  <td className="px-3 py-2 text-steel">{item.objectName || "—"}</td>
                  <td className="px-3 py-2 text-steel">{getEquipmentStatusLabel(item)}</td>
                </tr>
              );
            })}
            {!equipmentQuery.isLoading && items.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-steel" colSpan={6}>
                  Ничего не найдено по выбранным фильтрам.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-steel">
        <span>
          {equipmentQuery.isLoading
            ? "Загрузка…"
            : `Показано ${items.length} из ${total}${total > items.length ? "" : "."}`}
        </span>
        {total > items.length ? (
          <button
            className="btn-secondary btn-sm"
            disabled={equipmentQuery.isFetching}
            onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
            type="button"
          >
            {equipmentQuery.isFetching ? "Загружаем…" : "Показать ещё"}
          </button>
        ) : null}
      </div>

      {picked.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-steel">Отмеченные приборы</p>
          <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
            {picked.map((item) => (
              <span
                key={item.id}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-ink"
              >
                <span className="truncate">{item.label}</span>
                <button
                  aria-label={`Убрать ${item.label}`}
                  className="text-steel transition hover:text-[color:var(--danger)]"
                  onClick={() => setPicked((current) => current.filter((entry) => entry.id !== item.id))}
                  type="button"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <span className="text-xs text-steel">
          Отмечено: {picked.length}
          {picked.length === 0 ? " — задача будет без папки" : " — папка задачи определится по ним"}
        </span>
        <div className="flex items-center gap-2">
          <button className="btn-secondary btn-sm" onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button className="btn-primary btn-sm" onClick={() => onConfirm(picked)} type="button">
            Добавить ({picked.length})
          </button>
        </div>
      </div>
    </div>
  );
}
