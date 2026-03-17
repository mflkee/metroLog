import { type ReactNode, useMemo } from "react";
import { Link } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";

import { fetchEvents, type EventLogItem } from "@/api/events";
import {
  equipmentTypeLabels,
  fetchEquipment,
  fetchEquipmentFolders,
  fetchRepairQueue,
  fetchVerificationQueue,
  getEquipmentNextDueDate,
  isArshinEquipmentType,
  type EquipmentFolder,
  type EquipmentItem,
  type EquipmentType,
  type RepairQueueItem,
  type VerificationQueueItem,
} from "@/api/equipment";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  defaultDashboardWidgets,
  getDashboardFolderIds,
  normalizeDashboardWidgets,
} from "@/lib/dashboard";
import { hasOperatorAccess } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";

type WidgetCardProps = {
  title: string;
  children: ReactNode;
};

type DistributionEntry = {
  label: string;
  value: number;
  color: string;
};

const DASHBOARD_SCROLL_FRAME_CLASS = "h-full min-h-0 max-h-[39rem] overflow-y-auto";
const DASHBOARD_SCROLL_LIST_CLASS = "space-y-2";
const DASHBOARD_SCROLL_ITEM_CLASS = "tone-child mr-4 rounded-2xl border border-line px-4 py-3";

export function DashboardPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const selectedFolderIds = useMemo(
    () => getDashboardFolderIds(user),
    [user],
  );
  const canViewRecentEvents = hasOperatorAccess(user?.role);
  const visibleWidgets = useMemo(
    () =>
      normalizeDashboardWidgets(user?.dashboardWidgets ?? defaultDashboardWidgets).filter((widget) =>
        canViewRecentEvents ? true : widget !== "recent_events",
      ),
    [canViewRecentEvents, user?.dashboardWidgets],
  );
  const recentDateFrom = useMemo(() => getDateDaysAgoIso(30), []);

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders", "dashboard"],
    queryFn: () => fetchEquipmentFolders(token ?? ""),
    enabled: Boolean(token),
  });

  const equipmentQuery = useQuery({
    queryKey: ["dashboard-equipment", selectedFolderIds],
    queryFn: async () =>
      (
        await Promise.all(
          selectedFolderIds.map((folderId) => fetchEquipment(token ?? "", { folderId })),
        )
      ).flat(),
    enabled: Boolean(token) && selectedFolderIds.length > 0,
  });

  const repairsQuery = useQuery({
    queryKey: ["dashboard-repairs", "active", selectedFolderIds],
    queryFn: async () =>
      (
        await Promise.all(
          selectedFolderIds.map((folderId) =>
            fetchRepairQueue(token ?? "", {
              lifecycleStatus: "active",
              folderId,
            })
          ),
        )
      ).flat(),
    enabled: Boolean(token) && selectedFolderIds.length > 0,
  });

  const verificationsQuery = useQuery({
    queryKey: ["dashboard-verifications", "active", selectedFolderIds],
    queryFn: async () =>
      (
        await Promise.all(
          selectedFolderIds.map((folderId) =>
            fetchVerificationQueue(token ?? "", {
              lifecycleStatus: "active",
              folderId,
            })
          ),
        )
      ).flat(),
    enabled: Boolean(token) && selectedFolderIds.length > 0,
  });

  const archivedRepairsQuery = useQuery({
    queryKey: ["dashboard-repairs", "archived", selectedFolderIds],
    queryFn: async () =>
      (
        await Promise.all(
          selectedFolderIds.map((folderId) =>
            fetchRepairQueue(token ?? "", {
              lifecycleStatus: "archived",
              folderId,
            })
          ),
        )
      ).flat(),
    enabled: Boolean(token) && selectedFolderIds.length > 0,
  });

  const archivedVerificationsQuery = useQuery({
    queryKey: ["dashboard-verifications", "archived", selectedFolderIds],
    queryFn: async () =>
      (
        await Promise.all(
          selectedFolderIds.map((folderId) =>
            fetchVerificationQueue(token ?? "", {
              lifecycleStatus: "archived",
              folderId,
            })
          ),
        )
      ).flat(),
    enabled: Boolean(token) && selectedFolderIds.length > 0,
  });

  const eventsQuery = useQuery({
    queryKey: ["dashboard-events", selectedFolderIds, recentDateFrom],
    queryFn: async () =>
      (
        await Promise.all(
          selectedFolderIds.map((folderId) =>
            fetchEvents(token ?? "", {
              folderId,
              dateFrom: recentDateFrom,
              limit: 20,
            })
          ),
        )
      )
        .flat()
        .sort((left, right) => getDashboardEventTimestamp(right) - getDashboardEventTimestamp(left))
        .slice(0, 20),
    enabled:
      canViewRecentEvents
      && Boolean(token)
      && selectedFolderIds.length > 0,
  });

  const selectedFolders = useMemo(
    () =>
      selectedFolderIds
        .map((folderId) => foldersQuery.data?.find((folder) => folder.id === folderId) ?? null)
        .filter((folder): folder is EquipmentFolder => folder !== null),
    [foldersQuery.data, selectedFolderIds],
  );

  const equipmentItems = useMemo(() => equipmentQuery.data ?? [], [equipmentQuery.data]);
  const repairItems = useMemo(() => repairsQuery.data ?? [], [repairsQuery.data]);
  const verificationItems = useMemo(() => verificationsQuery.data ?? [], [verificationsQuery.data]);
  const archivedRepairItems = useMemo(() => archivedRepairsQuery.data ?? [], [archivedRepairsQuery.data]);
  const archivedVerificationItems = useMemo(
    () => archivedVerificationsQuery.data ?? [],
    [archivedVerificationsQuery.data],
  );
  const recentEvents = useMemo(
    () => (eventsQuery.data ?? []).slice(0, 8),
    [eventsQuery.data],
  );

  const summary = useMemo(() => buildDashboardSummary(equipmentItems, repairItems, verificationItems), [
    equipmentItems,
    repairItems,
    verificationItems,
  ]);
  const statusEntries = useMemo(() => buildStatusEntries(equipmentItems), [equipmentItems]);
  const typeEntries = useMemo(() => buildTypeEntries(equipmentItems), [equipmentItems]);
  const topLocations = useMemo(() => buildTopLocations(equipmentItems), [equipmentItems]);
  const upcomingVerifications = useMemo(
    () => buildUpcomingChecks(equipmentItems),
    [equipmentItems],
  );
  const overdueEntries = useMemo(() => buildRepairOverdueEntries(repairItems), [repairItems]);
  const completedProcessEntries = useMemo(
    () => buildCompletedProcessEntries(archivedRepairItems, archivedVerificationItems),
    [archivedRepairItems, archivedVerificationItems],
  );
  const averageDurationEntries = useMemo(
    () => buildAverageDurationEntries(archivedRepairItems, archivedVerificationItems),
    [archivedRepairItems, archivedVerificationItems],
  );

  const isLoading =
    foldersQuery.isLoading
    || equipmentQuery.isLoading
    || repairsQuery.isLoading
    || verificationsQuery.isLoading
    || archivedRepairsQuery.isLoading
    || archivedVerificationsQuery.isLoading
    || (canViewRecentEvents && eventsQuery.isLoading);

  const error =
    foldersQuery.error
    ?? equipmentQuery.error
    ?? repairsQuery.error
    ?? verificationsQuery.error
    ?? archivedRepairsQuery.error
    ?? archivedVerificationsQuery.error
    ?? (canViewRecentEvents ? eventsQuery.error : null);

  return (
    <section className="space-y-6">
      <PageHeader
        title="Главная"
        description="Аналитический обзор по выбранной папке: активные процессы, статусы, сроки и последние события."
      />

      {!selectedFolderIds.length ? (
        <div className="tone-parent rounded-3xl border border-line p-6 shadow-panel">
          <h2 className="text-lg font-semibold text-ink">Папки для анализа не выбраны</h2>
          <p className="mt-2 max-w-[64ch] text-sm text-steel">
            Выбери одну или несколько папок и нужные виджеты в настройках, и главная страница начнет
            показывать объединенную аналитику именно по этим рабочим областям.
          </p>
          <Link className="btn-secondary mt-4 inline-flex" to="/settings">
            Перейти в настройки
          </Link>
        </div>
      ) : null}

      {selectedFolderIds.length > 0 && selectedFolders.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-line px-4 py-2 text-sm text-steel">
              Анализируемые папки: <span className="font-semibold text-ink">{selectedFolders.length}</span>
            </span>
            {selectedFolders.map((folder) => (
              <Link
                key={folder.id}
                className="rounded-full border border-line px-3 py-2 text-sm text-steel transition hover:border-signal-info hover:text-ink"
                to={`/equipment?folderId=${folder.id}`}
              >
                {folder.name}
              </Link>
            ))}
          </div>
          <Link className="btn-secondary btn-sm" to="/settings">
            Настроить виджеты
          </Link>
        </div>
      ) : null}

      {selectedFolderIds.length > 0 && isLoading ? (
        <p className="text-sm text-steel">Собираем аналитику по выбранным папкам...</p>
      ) : null}

      {selectedFolderIds.length > 0 && error ? (
        <p className="text-sm text-[#b04c43]">
          {error instanceof Error ? error.message : "Не удалось загрузить данные информационной панели."}
        </p>
      ) : null}

      {selectedFolderIds.length > 0 && !isLoading && !error ? (
        <div className="grid gap-4 xl:grid-cols-12">
          {visibleWidgets.includes("summary_cards") ? (
            <div className="grid gap-4 md:grid-cols-2 xl:col-span-12 xl:grid-cols-5">
              {summary.map((item) => (
                <article
                  key={item.title}
                  className="tone-parent rounded-3xl border border-line px-5 py-4 shadow-panel"
                >
                  <p className="text-sm font-medium text-steel">{item.title}</p>
                  <p className="mt-3 text-3xl font-semibold text-ink">{item.value}</p>
                  <p className="mt-2 text-xs text-steel">{item.hint}</p>
                </article>
              ))}
            </div>
          ) : null}

          {visibleWidgets.includes("status_distribution") ? (
            <div className="xl:col-span-4">
              <WidgetCard title="Статусы оборудования">
                <DonutCard entries={statusEntries} emptyLabel="Нет приборов в папке" />
              </WidgetCard>
            </div>
          ) : null}

          {visibleWidgets.includes("type_distribution") ? (
            <div className="xl:col-span-4">
              <WidgetCard title="Категории оборудования">
                <DonutCard entries={typeEntries} emptyLabel="Нет приборов в папке" />
              </WidgetCard>
            </div>
          ) : null}

          {visibleWidgets.includes("repair_overdue") ? (
            <div className="xl:col-span-4">
              <WidgetCard title="Просрочки по ремонтам">
                <div className="grid gap-3 sm:grid-cols-2">
                  {overdueEntries.map((entry) => (
                    <div
                      key={entry.label}
                      className="tone-child rounded-2xl border border-line px-4 py-3"
                    >
                      <p className="text-xs text-steel">{entry.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-ink">{entry.value}</p>
                    </div>
                  ))}
                </div>
              </WidgetCard>
            </div>
          ) : null}

          {visibleWidgets.includes("top_locations") ? (
            <div className="min-h-0 xl:col-span-6">
              <WidgetCard title="Количество приборов">
                <div className={DASHBOARD_SCROLL_FRAME_CLASS}>
                  {topLocations.length ? (
                    <div className={DASHBOARD_SCROLL_LIST_CLASS}>
                      {topLocations.map((entry) => (
                        entry.folderId ? (
                          <Link
                            key={entry.label}
                            className={`${DASHBOARD_SCROLL_ITEM_CLASS} block space-y-2 transition hover:border-signal-info hover:bg-[var(--accent-soft)]/35`}
                            to={buildEquipmentLocationTarget(entry)}
                          >
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="min-w-0 truncate text-ink">{entry.label}</span>
                              <span className="shrink-0 text-steel">{entry.value}</span>
                            </div>
                            <div className="tone-child h-2 rounded-full border border-line">
                              <div
                                className="h-full rounded-full bg-[var(--accent)]"
                                style={{ width: `${entry.percent}%` }}
                              />
                            </div>
                          </Link>
                        ) : (
                          <div key={entry.label} className={`${DASHBOARD_SCROLL_ITEM_CLASS} space-y-2`}>
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="min-w-0 truncate text-ink">{entry.label}</span>
                              <span className="shrink-0 text-steel">{entry.value}</span>
                            </div>
                            <div className="tone-child h-2 rounded-full border border-line">
                              <div
                                className="h-full rounded-full bg-[var(--accent)]"
                                style={{ width: `${entry.percent}%` }}
                              />
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-steel">Для приборов этой папки еще не указаны местонахождения.</p>
                  )}
                </div>
              </WidgetCard>
            </div>
          ) : null}

          {visibleWidgets.includes("verification_expiry") ? (
            <div className="min-h-0 xl:col-span-6">
              <WidgetCard title="Ближайшие сроки контроля">
                <div className={DASHBOARD_SCROLL_FRAME_CLASS}>
                  {upcomingVerifications.length ? (
                    <div className={DASHBOARD_SCROLL_LIST_CLASS}>
                      {upcomingVerifications.map((item) => (
                        <Link
                          key={item.id}
                          className={`${DASHBOARD_SCROLL_ITEM_CLASS} flex items-center justify-between gap-3 transition hover:border-signal-info`}
                          to={`/equipment/${item.id}`}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">
                              {item.name}
                              {item.modification ? ` · ${item.modification}` : ""}
                            </p>
                            <p className="mt-1 text-xs text-steel">
                              {[item.kindLabel, item.serialNumber ? `зав. № ${item.serialNumber}` : null]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <div className="text-right text-xs text-steel">
                            <p>{formatDisplayDate(item.validDate)}</p>
                            <p className="mt-1">{item.daysLeft} дн.</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-steel">Для приборов этой папки пока нет ближайших сроков контроля.</p>
                  )}
                </div>
              </WidgetCard>
            </div>
          ) : null}

          {visibleWidgets.includes("completed_processes") ? (
            <div className="xl:col-span-6">
              <WidgetCard title="Завершенные процессы">
                <div className="grid gap-3 sm:grid-cols-2">
                  {completedProcessEntries.map((entry) => (
                    <div
                      key={entry.label}
                      className="tone-child rounded-2xl border border-line px-4 py-3"
                    >
                      <p className="text-xs text-steel">{entry.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-ink">{entry.value}</p>
                      <p className="mt-1 text-xs text-steel">{entry.hint}</p>
                    </div>
                  ))}
                </div>
              </WidgetCard>
            </div>
          ) : null}

          {visibleWidgets.includes("average_durations") ? (
            <div className="xl:col-span-6">
              <WidgetCard title="Средняя длительность">
                <div className="grid gap-3 sm:grid-cols-2">
                  {averageDurationEntries.map((entry) => (
                    <div
                      key={entry.label}
                      className="tone-child rounded-2xl border border-line px-4 py-3"
                    >
                      <p className="text-xs text-steel">{entry.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-ink">{entry.value}</p>
                      <p className="mt-1 text-xs text-steel">{entry.hint}</p>
                    </div>
                  ))}
                </div>
              </WidgetCard>
            </div>
          ) : null}

          {visibleWidgets.includes("recent_events") ? (
            <div className="xl:col-span-12">
              <WidgetCard title="Последние события">
                <div className="space-y-3">
                  {recentEvents.length ? (
                    recentEvents.map((item) => (
                      <Link
                        key={item.id}
                        className="tone-child flex items-start justify-between gap-3 rounded-2xl border border-line px-4 py-3 transition hover:border-signal-info"
                        to={buildEventTarget(item)}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink">{item.title}</p>
                          <p className="mt-1 text-xs text-steel">
                            {item.equipmentName
                              ? [
                                  item.equipmentName,
                                  item.equipmentModification,
                                  item.equipmentSerialNumber
                                    ? `зав. № ${item.equipmentSerialNumber}`
                                    : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")
                              : item.description || "Событие без привязки к прибору"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right text-xs text-steel">
                          <p>{formatDateTime(item.createdAt)}</p>
                          <p className="mt-1">{item.userDisplayName}</p>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <p className="text-sm text-steel">За последние 30 дней по этой папке событий не было.</p>
                  )}
                </div>
              </WidgetCard>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function WidgetCard({ title, children }: WidgetCardProps) {
  return (
    <article className="tone-parent flex h-full min-h-0 flex-col rounded-3xl border border-line px-5 py-4 shadow-panel">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <div className="mt-4 min-h-0 flex-1">{children}</div>
    </article>
  );
}

function DonutCard({
  entries,
  emptyLabel,
}: {
  entries: DistributionEntry[];
  emptyLabel: string;
}) {
  const total = entries.reduce((sum, entry) => sum + entry.value, 0);
  if (!total) {
    return <p className="text-sm text-steel">{emptyLabel}</p>;
  }

  const gradient = buildDonutGradient(entries, total);
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
      <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-full border border-line p-4">
        <div
          className="flex h-full w-full items-center justify-center rounded-full"
          style={{
            background: gradient,
          }}
        >
          <div className="tone-parent flex h-[68%] w-[68%] items-center justify-center rounded-full border border-line text-center">
            <div>
              <p className="text-3xl font-semibold text-ink">{total}</p>
              <p className="text-xs text-steel">всего</p>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        {entries.map((entry) => (
          <div key={entry.label} className="flex items-center gap-3 text-sm">
            <span
              className="block h-3 w-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="min-w-0 flex-1 text-ink">{entry.label}</span>
            <span className="shrink-0 text-steel">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildDashboardSummary(
  equipmentItems: EquipmentItem[],
  repairItems: RepairQueueItem[],
  verificationItems: VerificationQueueItem[],
) {
  const expiringSoon = buildUpcomingChecks(equipmentItems).filter((item) => item.daysLeft <= 30);
  const anyOverdue = repairItems.filter((item) => item.maxOverdueDays > 0).length;

  return [
    {
      title: "Приборов в папке",
      value: String(equipmentItems.length),
      hint: "Все записи текущего рабочего реестра.",
    },
    {
      title: "Активные ремонты",
      value: String(repairItems.length),
      hint: "Открытые ремонты по этой папке.",
    },
    {
      title: "Активные поверки",
      value: String(verificationItems.length),
      hint: "СИ, которые сейчас в процессе поверки.",
    },
    {
      title: "Есть просрочка",
      value: String(anyOverdue),
      hint: "Ремонты, где уже нарушен хотя бы один срок.",
    },
    {
      title: "Скоро истекает",
      value: String(expiringSoon.length),
      hint: "СИ, у которых поверка закончится в ближайшие 30 дней.",
    },
  ];
}

function buildStatusEntries(equipmentItems: EquipmentItem[]): DistributionEntry[] {
  const map = new Map<string, number>();
  for (const item of equipmentItems) {
    const key =
      item.activeRepair && item.activeVerification
        ? "BOTH"
        : item.activeRepair
          ? "IN_REPAIR"
          : item.activeVerification
            ? "IN_VERIFICATION"
            : item.status;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [
    { label: "В работе", value: map.get("IN_WORK") ?? 0, color: "var(--chart-work)" },
    { label: "В ремонте", value: map.get("IN_REPAIR") ?? 0, color: "var(--chart-repair)" },
    { label: "В поверке", value: map.get("IN_VERIFICATION") ?? 0, color: "var(--chart-verification)" },
    { label: "В ремонте/поверке", value: map.get("BOTH") ?? 0, color: "var(--chart-both)" },
    { label: "В архиве", value: map.get("ARCHIVED") ?? 0, color: "var(--chart-archived)" },
  ].filter((entry) => entry.value > 0);
}

function buildTypeEntries(equipmentItems: EquipmentItem[]): DistributionEntry[] {
  const map = new Map<EquipmentType, number>();
  for (const item of equipmentItems) {
    map.set(item.equipmentType, (map.get(item.equipmentType) ?? 0) + 1);
  }
  return (Object.entries(equipmentTypeLabels) as Array<[EquipmentType, string]>)
    .map(([key, label], index) => ({
      label,
      value: map.get(key) ?? 0,
      color: [
        "var(--chart-work)",
        "var(--chart-both)",
        "var(--chart-repair)",
        "var(--chart-verification)",
      ][index] ?? "var(--chart-archived)",
    }))
    .filter((entry) => entry.value > 0);
}

function buildTopLocations(equipmentItems: EquipmentItem[]) {
  const counts = new Map<
    string,
    { objectName: string; location: string; folderIds: Set<number>; value: number }
  >();
  for (const item of equipmentItems) {
    if (!item.currentLocationManual) {
      continue;
    }
    const objectName = item.objectName.trim();
    const location = item.currentLocationManual.trim();
    const key = `${objectName}\u0000${location}`;
    const current = counts.get(key);
    if (current) {
      current.value += 1;
      if (item.folderId) {
        current.folderIds.add(item.folderId);
      }
      continue;
    }
    counts.set(key, {
      objectName,
      location,
      folderIds: new Set(item.folderId ? [item.folderId] : []),
      value: 1,
    });
  }
  const rows = Array.from(counts.values())
    .sort(
      (left, right) =>
        right.value - left.value
        || left.objectName.localeCompare(right.objectName, "ru")
        || left.location.localeCompare(right.location, "ru"),
    );
  const max = rows[0]?.value ?? 1;
  return rows.map((row) => ({
    currentLocation: row.location,
    folderId: row.folderIds.size === 1 ? Array.from(row.folderIds)[0] : null,
    label: row.objectName ? `${row.objectName} · ${row.location}` : row.location,
    objectName: row.objectName,
    value: row.value,
    percent: Math.max(12, Math.round((row.value / max) * 100)),
  }));
}

function buildEquipmentLocationTarget(entry: {
  folderId: number | null;
  objectName: string;
  currentLocation: string;
}) {
  if (entry.folderId === null) {
    return "/equipment";
  }
  const searchParams = new URLSearchParams();
  searchParams.set("folderId", String(entry.folderId));
  searchParams.set("query", entry.currentLocation);
  if (entry.objectName) {
    searchParams.set("objectName", entry.objectName);
  }
  searchParams.set("currentLocation", entry.currentLocation);
  return `/equipment?${searchParams.toString()}`;
}

function buildUpcomingChecks(equipmentItems: EquipmentItem[]) {
  const today = new Date();
  return equipmentItems
    .flatMap((item) => {
      const dueDate = getEquipmentNextDueDate(item);
      if (!dueDate) {
        return [];
      }
      const parsed = new Date(dueDate);
      const daysLeft = Math.ceil((parsed.getTime() - today.getTime()) / 86_400_000);
      return [
        {
          id: item.id,
          name: item.name,
          modification: item.modification,
          serialNumber: item.serialNumber,
          validDate: dueDate,
          kindLabel:
            isArshinEquipmentType(item.equipmentType)
              ? "Поверка"
              : item.equipmentType === "IO"
                ? "Аттестация"
                : item.equipmentType === "VO"
                  ? "Тех. освидетельствование"
                  : "Срок контроля",
          daysLeft,
        },
      ];
    })
    .sort((left, right) => left.daysLeft - right.daysLeft);
}

function buildRepairOverdueEntries(repairItems: RepairQueueItem[]) {
  return [
    {
      label: "Ремонт",
      value: repairItems.filter((item) => item.repairOverdueDays > 0).length,
    },
    {
      label: "Прибытие обратно",
      value: repairItems.filter((item) => item.registrationOverdueDays > 0).length,
    },
    {
      label: "Входной контроль",
      value: repairItems.filter((item) => item.controlOverdueDays > 0).length,
    },
    {
      label: "Оплата",
      value: repairItems.filter((item) => item.paymentOverdueDays > 0).length,
    },
  ];
}

function buildCompletedProcessEntries(
  archivedRepairItems: RepairQueueItem[],
  archivedVerificationItems: VerificationQueueItem[],
) {
  return [
    {
      label: "Завершенные ремонты",
      value: String(archivedRepairItems.length),
      hint: "Все архивные ремонты по выбранной папке.",
    },
    {
      label: "Завершенные поверки",
      value: String(archivedVerificationItems.length),
      hint: "Все архивные поверки по выбранной папке.",
    },
  ];
}

function buildAverageDurationEntries(
  archivedRepairItems: RepairQueueItem[],
  archivedVerificationItems: VerificationQueueItem[],
) {
  return [
    {
      label: "Средний ремонт",
      value: formatAverageDays(archivedRepairItems, (item) => item.sentToRepairAt, (item) => item.closedAt),
      hint: "От отправки в ремонт до закрытия записи.",
    },
    {
      label: "Средняя поверка",
      value: formatAverageDays(
        archivedVerificationItems,
        (item) => item.sentToVerificationAt,
        (item) => item.closedAt,
      ),
      hint: "От отправки в поверку до закрытия записи.",
    },
  ];
}

function formatAverageDays<T>(
  items: T[],
  getStart: (item: T) => string | null,
  getEnd: (item: T) => string | null,
): string {
  const durations = items.flatMap((item) => {
    const start = getStart(item);
    const end = getEnd(item);
    if (!start || !end) {
      return [];
    }
    const duration = Math.max(0, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000));
    return [duration];
  });

  if (!durations.length) {
    return "—";
  }

  const average = Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
  return `${average} дн.`;
}

function buildDonutGradient(entries: DistributionEntry[], total: number): string {
  let current = 0;
  const parts = entries.map((entry) => {
    const start = current;
    const end = current + (entry.value / total) * 100;
    current = end;
    return `${entry.color} ${start}% ${end}%`;
  });
  return `conic-gradient(${parts.join(", ")})`;
}

function formatDisplayDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getDateDaysAgoIso(days: number): string {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return value.toISOString().slice(0, 10);
}

function getDashboardEventTimestamp(item: EventLogItem): number {
  const candidates = [item.eventDate, item.createdAt];
  for (const candidate of candidates) {
    const timestamp = Date.parse(candidate);
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }
  return 0;
}

function buildEventTarget(item: EventLogItem): string {
  const lifecycleTab = item.action.includes("closed") ? "archived" : "active";

  if (item.batchKey && item.category === "REPAIR") {
    return `/repairs?tab=${lifecycleTab}&batchKey=${encodeURIComponent(item.batchKey)}`;
  }
  if (item.batchKey && item.category === "VERIFICATION") {
    return `/verification/si?tab=${lifecycleTab}&batchKey=${encodeURIComponent(item.batchKey)}`;
  }
  if (item.equipmentId && item.category === "REPAIR") {
    return `/repairs?tab=${lifecycleTab}&equipmentId=${item.equipmentId}`;
  }
  if (item.equipmentId && item.category === "VERIFICATION") {
    return `/verification/si?tab=${lifecycleTab}&equipmentId=${item.equipmentId}`;
  }
  if (item.equipmentId) {
    return `/equipment/${item.equipmentId}`;
  }
  return "/events";
}
