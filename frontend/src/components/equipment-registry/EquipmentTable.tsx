

import { Link } from "react-router-dom";

import { formatEquipmentValidityDate, type EquipmentSortState } from "@/lib/equipmentRegistry";
import { EquipmentItem, EquipmentSortKey, equipmentTypeLabels, getEquipmentNextDueDate, getEquipmentStatusColor, getEquipmentStatusLabel, getEquipmentValidFromDate } from "@/api/equipment/registry";

// Registry table row and sortable header.

export function EquipmentRow({
  item,
  canManage,
  isSelected,
  onToggleSelected,
  rowIndex,
}: {
  item: EquipmentItem;
  canManage: boolean;
  isSelected: boolean;
  onToggleSelected: () => void;
  rowIndex: number;
}) {
  return (
    <tr className={`${rowIndex % 2 === 0 ? "tone-parent" : "tone-child"} text-sm text-ink`}>
      {canManage ? (
        <td className="w-10 px-3 py-3 align-top">
          <input
            checked={isSelected}
            className="mt-1 h-4 w-4 accent-[var(--accent)]"
            onChange={onToggleSelected}
            type="checkbox"
          />
        </td>
      ) : null}
      <td className="px-3 py-3 align-top">
        <Link
          className="block min-w-[280px] font-semibold text-ink transition hover:text-signal-info"
          to={`/equipment/${item.id}`}
        >
          {item.name}
        </Link>
        <div className="mt-1 text-xs text-steel">{item.modification || "Без модификации"}</div>
      </td>
      <td className="px-3 py-3 align-top">
        <span className="rounded-full bg-[#edf2f5] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
          {equipmentTypeLabels[item.equipmentType]}
        </span>
      </td>
      <td className="px-3 py-3 align-top">
        <span style={{ color: getEquipmentStatusColor(item) }}>{getEquipmentStatusLabel(item)}</span>
      </td>
      <td className="px-3 py-3 align-top">{item.serialNumber || "—"}</td>
      <td className="px-3 py-3 align-top">{item.manufactureYear || "—"}</td>
      <td className="px-3 py-3 align-top">{item.objectName}</td>
      <td className="px-3 py-3 align-top">{item.currentLocationManual || "Не указано"}</td>
      <td className="px-3 py-3 align-top">{formatEquipmentValidityDate(getEquipmentValidFromDate(item))}</td>
      <td className="px-3 py-3 align-top">{formatEquipmentValidityDate(getEquipmentNextDueDate(item))}</td>
    </tr>
  );
}

export function SortableTableHeader({
  label,
  sortKey,
  activeSort,
  onSort,
  className,
}: {
  label: string;
  sortKey: EquipmentSortKey;
  activeSort: EquipmentSortState | null;
  onSort: (key: EquipmentSortKey) => void;
  className?: string;
}) {
  const isActive = activeSort?.key === sortKey;
  const arrow =
    !isActive ? "↕" : activeSort.direction === "asc" ? "↑" : "↓";

  return (
    <th className={`px-3 py-2 ${className ?? ""}`}>
      <button
        className={`inline-flex items-center gap-2 transition ${
          isActive ? "text-ink" : "text-steel hover:text-ink"
        }`}
        onClick={() => onSort(sortKey)}
        type="button"
      >
        <span>{label}</span>
        <span className={`text-[11px] ${isActive ? "text-ink" : "text-steel/80"}`}>{arrow}</span>
      </button>
    </th>
  );
}
