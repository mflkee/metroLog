import { Link, useSearchParams } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";

import {
  fetchEquipmentFolders,
  fetchFolderEsiMonitoring,
  type ESIEquipmentMonitoringItem,
  type ESIEquipmentMonitoringModule,
} from "@/api/equipment";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/store/auth";

type MonitoringRow = {
  equipmentId: number;
  equipmentName: string;
  equipmentSerialNumber: string | null;
  rowSpan: number;
  showEquipmentColumns: boolean;
  module: ESIEquipmentMonitoringModule;
};

export function EsiMonitoringPage() {
  const token = useAuthStore((state) => state.token);
  const [searchParams] = useSearchParams();
  const selectedFolderId = Number(searchParams.get("folderId") ?? "");
  const folderId = Number.isInteger(selectedFolderId) && selectedFolderId > 0 ? selectedFolderId : null;

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders"],
    queryFn: () => fetchEquipmentFolders(token ?? ""),
    enabled: Boolean(token),
  });

  const monitoringQuery = useQuery({
    queryKey: ["equipment-esi-monitoring", folderId ?? "none"],
    queryFn: () => fetchFolderEsiMonitoring(token ?? "", folderId ?? 0),
    enabled: Boolean(token) && folderId !== null,
  });

  if (!token) {
    return null;
  }

  const folders = foldersQuery.data ?? [];
  const selectedFolder = folders.find((item) => item.id === folderId) ?? null;
  const monitoringItems = monitoringQuery.data ?? [];
  const rows = buildMonitoringRows(monitoringItems);

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <PageHeader
          title="Мониторинг эталонов"
          description={
            selectedFolder
              ? `Сводная таблица по эталонам из папки «${selectedFolder.name}».`
              : "Выбери папку и просматривай все ЭСИ вместе с внутренними и внешними модулями."
          }
        />
        <Link
          className="btn-secondary self-start"
          to={folderId ? `/equipment?folderId=${folderId}` : "/equipment"}
        >
          Назад к оборудованию
        </Link>
      </div>

      {foldersQuery.isLoading ? (
        <div className="rounded-3xl border border-line bg-white px-5 py-4 text-sm text-steel shadow-panel">
          Загружаем папки...
        </div>
      ) : null}

      {foldersQuery.isError ? (
        <div className="rounded-3xl border border-line bg-white px-5 py-4 text-sm text-[#b04c43] shadow-panel">
          {foldersQuery.error instanceof Error
            ? foldersQuery.error.message
            : "Не удалось загрузить список папок."}
        </div>
      ) : null}

      {!foldersQuery.isLoading && !folderId ? (
        <div className="rounded-3xl border border-line bg-white px-5 py-4 text-sm text-steel shadow-panel">
          Открой мониторинг из выбранной папки в разделе «Оборудование».
        </div>
      ) : null}

      {folderId ? (
        <section className="space-y-4 rounded-[30px] border border-line bg-white p-5 shadow-panel">
          {monitoringQuery.isLoading ? (
            <div className="text-sm text-steel">Загружаем таблицу эталонов...</div>
          ) : null}

          {monitoringQuery.isError ? (
            <div className="text-sm text-[#b04c43]">
              {monitoringQuery.error instanceof Error
                ? monitoringQuery.error.message
                : "Не удалось загрузить мониторинг эталонов."}
            </div>
          ) : null}

          {!monitoringQuery.isLoading && !monitoringQuery.isError && rows.length === 0 ? (
            <div className="text-sm text-steel">
              В выбранной папке пока нет эталонов для мониторинга.
            </div>
          ) : null}

          {rows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-[1180px] w-full table-auto border-collapse text-left text-sm">
                <thead className="tone-child text-[11px] uppercase tracking-[0.12em] text-steel">
                  <tr>
                    <th className="border-b border-line px-3 py-2 font-semibold">Наименование</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Заводской номер</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Рег. номер эталона</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Пределы измерения</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Разряд</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Дата поверки</th>
                    <th className="border-b border-line px-3 py-2 font-semibold">Свидетельство</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.equipmentId}-${row.module.entryId ?? row.module.registryNumber ?? index}`}>
                      {row.showEquipmentColumns ? (
                        <>
                          <td
                            className="border-b border-line px-3 py-3 text-sm font-medium text-ink"
                            rowSpan={row.rowSpan}
                          >
                            <Link
                              className="transition hover:text-[color:var(--accent)] hover:underline"
                              to={`/equipment/${row.equipmentId}`}
                            >
                              {row.equipmentName}
                            </Link>
                          </td>
                          <td
                            className="border-b border-line px-3 py-3 font-mono text-xs text-ink"
                            rowSpan={row.rowSpan}
                          >
                            {row.equipmentSerialNumber ?? "—"}
                          </td>
                        </>
                      ) : null}
                      <td className="border-b border-line px-3 py-3 font-mono text-xs text-ink">
                        {row.module.registryNumber ?? "—"}
                      </td>
                      <td className="border-b border-line px-3 py-3 text-xs leading-5 text-ink">
                        {row.module.measurementLimit ?? "Не указан"}
                      </td>
                      <td className="border-b border-line px-3 py-3 text-xs leading-5 text-ink">
                        {row.module.rank ?? "—"}
                      </td>
                      <td className="border-b border-line px-3 py-3 text-xs text-ink">
                        {formatVerificationWindow(row.module)}
                      </td>
                      <td className="border-b border-line px-3 py-3 font-mono text-xs text-ink">
                        {row.module.certificateNumber && row.module.verificationArshinUrl ? (
                          <a
                            className="transition hover:text-[color:var(--accent)] hover:underline"
                            href={row.module.verificationArshinUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {row.module.certificateNumber}
                          </a>
                        ) : (
                          row.module.certificateNumber ?? "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function buildMonitoringRows(items: ESIEquipmentMonitoringItem[]): MonitoringRow[] {
  const rows: MonitoringRow[] = [];

  for (const item of items) {
    const modules = [...item.modules].sort((left, right) => {
      if (left.moduleKind !== right.moduleKind) {
        return left.moduleKind === "INTERNAL" ? -1 : 1;
      }
      const leftDate = toSortableTime(left.verificationDate);
      const rightDate = toSortableTime(right.verificationDate);
      if (leftDate !== rightDate) {
        return rightDate - leftDate;
      }
      return (left.registryNumber ?? "").localeCompare(right.registryNumber ?? "", "ru");
    });

    modules.forEach((module, index) => {
      rows.push({
        equipmentId: item.equipmentId,
        equipmentName: [item.equipmentName, item.equipmentModification].filter(Boolean).join(", "),
        equipmentSerialNumber: item.equipmentSerialNumber,
        rowSpan: modules.length,
        showEquipmentColumns: index === 0,
        module,
      });
    });
  }

  return rows;
}

function formatVerificationWindow(module: ESIEquipmentMonitoringModule): string {
  if (module.verificationDate && module.validUntil) {
    return `${module.verificationDate} до ${module.validUntil}`;
  }
  return module.verificationDate ?? module.validUntil ?? "—";
}

function toSortableTime(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const displayMatch = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (displayMatch) {
    return new Date(
      Number(displayMatch[3]),
      Number(displayMatch[2]) - 1,
      Number(displayMatch[1]),
    ).getTime();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Number.NEGATIVE_INFINITY : parsed.getTime();
}
