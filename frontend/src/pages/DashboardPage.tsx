import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useMutation, useQuery } from "@tanstack/react-query";

import { updateProfile } from "@/api/auth";
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
import { DashboardWidgetGrid } from "@/components/dashboard/DashboardWidgetGrid";
import { MyTasksWidget } from "@/components/MyTasksWidget";
import { PageHeader } from "@/components/layout/PageHeader";
import { useIsWideScreen } from "@/hooks/useIsWideScreen";
import {
  applyVisibleOrder,
  buildDashboardPlan,
  dashboardSummaryColumnsClass,
  defaultDashboardLayout,
  defaultDashboardWidgets,
  getDashboardFolderIds,
  isCheckExpired,
  isDashboardDragEnabled,
  isDatePast,
  normalizeDashboardLayout,
  normalizeDashboardWidgets,
  type DashboardLayoutEntry,
  type DashboardWidgetKey,
  type DashboardWidgetSize,
  updateDashboardWidget,
} from "@/lib/dashboard";
import { hasOperatorAccess } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";

type DistributionEntry = {
  label: string;
  value: number;
  color: string;
};

const DASHBOARD_SCROLL_FRAME_CLASS = "h-full min-h-0 max-h-[39rem] overflow-y-auto";
const DASHBOARD_SCROLL_LIST_CLASS = "space-y-2";
const DASHBOARD_SCROLL_ITEM_CLASS = "tone-child mr-4 rounded-2xl border border-line px-4 py-3";

/** The summary strip carries five figures, so its inner columns follow the module's own width. */
const SUMMARY_COLUMNS_CLASS = dashboardSummaryColumnsClass;

export function DashboardPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const isWideScreen = useIsWideScreen();
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

  const storedLayout = useMemo(
    () => normalizeDashboardLayout(user?.dashboardLayout),
    [user?.dashboardLayout],
  );
  const [layout, setLayout] = useState<DashboardLayoutEntry[]>(storedLayout);
  const [editing, setEditing] = useState(false);
  const [layoutError, setLayoutError] = useState<string | null>(null);

  useEffect(() => {
    setLayout(storedLayout);
  }, [storedLayout]);

  const layoutMutation = useMutation({
    mutationFn: (next: DashboardLayoutEntry[]) =>
      updateProfile(token ?? "", { dashboardLayout: next }),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      setLayoutError(null);
    },
    onError: (error) => {
      // Put the arrangement the server still holds back on screen, so the page never shows a
      // change that was not saved.
      setLayout(storedLayout);
      setLayoutError(
        error instanceof Error ? error.message : "Не удалось сохранить раскладку модулей.",
      );
    },
  });

  function commitLayout(next: DashboardLayoutEntry[]) {
    setLayout(next);
    setLayoutError(null);
    layoutMutation.mutate(next);
  }

  /** Live arrangement while a module is dragged: rendered at once, saved only on drop. */
  function previewLayout(next: DashboardLayoutEntry[]) {
    setLayout(next);
    setLayoutError(null);
  }

  function handleReorderLive(order: DashboardWidgetKey[]) {
    previewLayout(applyVisibleOrder(layout, order));
  }

  function handleReorderCommit() {
    commitLayout(layout);
  }

  const dragEnabled = isDashboardDragEnabled(editing, isWideScreen);

  function handleSizeChange(key: DashboardWidgetKey, size: DashboardWidgetSize) {
    commitLayout(updateDashboardWidget(layout, key, { size }));
  }

  function handleToggleCollapsed(key: DashboardWidgetKey) {
    const entry = layout.find((item) => item.key === key);
    if (!entry) {
      return;
    }
    commitLayout(updateDashboardWidget(layout, key, { collapsed: !entry.collapsed }));
  }

  function resetLayout() {
    commitLayout(defaultDashboardLayout);
  }

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
  const completedProcessEntries = useMemo(
    () => buildCompletedProcessEntries(archivedRepairItems, archivedVerificationItems),
    [archivedRepairItems, archivedVerificationItems],
  );
  const averageDurationEntries = useMemo(
    () => buildAverageDurationEntries(archivedRepairItems, archivedVerificationItems),
    [archivedRepairItems, archivedVerificationItems],
  );

  // "Мои задачи" needs a signed-in user; the rest of the arrangement is untouched by that.
  const renderableWidgets = useMemo(
    () => visibleWidgets.filter((widget) => widget !== "my_tasks" || Boolean(user)),
    [user, visibleWidgets],
  );
  const plan = useMemo(
    () => buildDashboardPlan(layout, renderableWidgets),
    [layout, renderableWidgets],
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

  function renderWidgetBody(key: DashboardWidgetKey, size: DashboardWidgetSize): ReactNode {
    switch (key) {
      case "summary_cards":
        return (
          <div className={`grid gap-4 ${SUMMARY_COLUMNS_CLASS[size]}`}>
            {summary.map((item) => (
              <article
                key={item.title}
                className="tone-child rounded-2xl border border-line px-4 py-4"
              >
                <p className="text-sm font-medium text-steel">{item.title}</p>
                <p className="mt-3 text-3xl font-semibold text-ink">{item.value}</p>
                <p className="mt-2 text-xs text-steel">{item.hint}</p>
              </article>
            ))}
          </div>
        );

      case "my_tasks":
        return user ? <MyTasksWidget token={token ?? ""} userId={user.id} /> : null;

      case "status_distribution":
        return <DonutCard entries={statusEntries} emptyLabel="Нет приборов в папке" />;

      case "type_distribution":
        return <DonutCard entries={typeEntries} emptyLabel="Нет приборов в папке" />;

      case "top_locations":
        return (
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
        );

      case "verification_expiry":
        return (
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
                      <p
                        className={
                          item.daysLeft < 0
                            ? "mt-1 font-semibold text-[color:var(--danger)]"
                            : "mt-1"
                        }
                      >
                        {item.daysLeft < 0 ? "просрочено" : `${item.daysLeft} дн.`}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-steel">Для приборов этой папки пока нет ближайших сроков контроля.</p>
            )}
          </div>
        );

      case "completed_processes":
        return (
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
        );

      case "average_durations":
        return (
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
        );

      case "recent_events":
        return (
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
        );

      default:
        return null;
    }
  }

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
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <button className="btn-secondary btn-sm" type="button" onClick={resetLayout}>
                Сбросить раскладку
              </button>
            ) : null}
            <button
              className={editing ? "btn-primary btn-sm" : "btn-secondary btn-sm"}
              type="button"
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? "Готово" : "Настроить раскладку"}
            </button>
            <Link className="btn-secondary btn-sm" to="/settings">
              Настроить виджеты
            </Link>
          </div>
        </div>
      ) : null}

      {selectedFolderIds.length > 0 && selectedFolders.length > 0 && editing ? (
        <p className="text-sm text-steel">
          Перетаскивайте модули за ручку, выбирайте ширину 1/3, 1/2 или 1/1 и сворачивайте лишнее.
          Изменения сохраняются сразу.
        </p>
      ) : null}

      {layoutError ? <p className="text-sm text-[#b04c43]">{layoutError}</p> : null}

      {selectedFolderIds.length > 0 && isLoading ? (
        <p className="text-sm text-steel">Собираем аналитику по выбранным папкам...</p>
      ) : null}

      {selectedFolderIds.length > 0 && error ? (
        <p className="text-sm text-[#b04c43]">
          {error instanceof Error ? error.message : "Не удалось загрузить данные информационной панели."}
        </p>
      ) : null}

      {selectedFolderIds.length > 0 && !isLoading && !error ? (
        <DashboardWidgetGrid
          dragEnabled={dragEnabled}
          editing={editing}
          plan={plan}
          renderBody={renderWidgetBody}
          onReorderCommit={handleReorderCommit}
          onReorderLive={handleReorderLive}
          onSizeChange={handleSizeChange}
          onToggleCollapsed={handleToggleCollapsed}
        />
      ) : null}
    </section>
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
  // Only what is still ahead: already-expired checks belong to «Истекшие сроки поверки», and
  // counting them here as well made the two cards overlap.
  const expiringSoon = buildUpcomingChecks(equipmentItems).filter(
    (item) => item.daysLeft >= 0 && item.daysLeft <= 30,
  );
  const expiredChecks = equipmentItems.filter((item) => isCheckExpired(item)).length;
  // Running work past its deadline: a repair stage past its planned date, or a verification whose
  // device certificate expired while the process is still open — the certificate is the deadline.
  const overdueRepairs = repairItems.filter((item) => item.maxOverdueDays > 0).length;
  const overdueVerifications = verificationItems.filter((item) => isDatePast(item.validDate)).length;

  return [
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
      value: String(overdueRepairs + overdueVerifications),
      hint: "Ремонты с нарушенным сроком этапа и поверки, у которых срок истёк, а работа ещё идёт.",
    },
    {
      title: "Скоро истекает",
      value: String(expiringSoon.length),
      hint: "СИ, у которых поверка закончится в ближайшие 30 дней.",
    },
    {
      title: "Истекшие сроки поверки",
      value: String(expiredChecks),
      hint: "Приборы, у которых срок поверки (аттестации, контроля) уже прошёл.",
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
    { label: "Отремонтировано", value: map.get("REPAIRED") ?? 0, color: "var(--chart-repaired)" },
    { label: "Неремонтопригодно", value: map.get("NOT_REPAIRABLE") ?? 0, color: "var(--chart-not-repairable)" },
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
