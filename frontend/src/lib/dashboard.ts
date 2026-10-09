import { getEquipmentNextDueDate, type EquipmentItem } from "@/api/equipment/registry";

export const dashboardWidgetOptions = [
  {
    value: "summary_cards",
    label: "Сводка",
    description: "Ключевые числа по оборудованию, активным ремонтам, поверкам и архиву.",
  },
  {
    value: "status_distribution",
    label: "Статусы",
    description: "Показывает, сколько приборов сейчас в работе, ремонте, поверке и архиве.",
  },
  {
    value: "type_distribution",
    label: "Категории",
    description: "Распределение приборов по категориям: СИ, ИО, ВО и прочее оборудование.",
  },
  {
    value: "top_locations",
    label: "Местонахождения",
    description: "Где сейчас сосредоточено больше всего приборов в выбранной папке.",
  },
  {
    value: "verification_expiry",
    label: "Ближайшие сроки",
    description: "Приборы, у которых контроль, аттестация или поверка подходят к сроку.",
  },
  {
    value: "completed_processes",
    label: "Завершенные процессы",
    description: "Сколько ремонтов и поверок уже закрыто за выбранный период работы.",
  },
  {
    value: "average_durations",
    label: "Средняя длительность",
    description: "Средняя продолжительность ремонтов и поверок по архивным данным.",
  },
  {
    value: "my_tasks",
    label: "Мои задачи",
    description: "Задачи, где текущий пользователь ответственный или исполнитель.",
  },
  {
    value: "recent_events",
    label: "Последние события",
    description: "Свежие изменения по приборам, ремонтам, поверкам и комментариям.",
  },
] as const;

export type DashboardWidgetKey = (typeof dashboardWidgetOptions)[number]["value"];

export const defaultDashboardWidgets: DashboardWidgetKey[] = dashboardWidgetOptions.map(
  (option) => option.value,
);

export function normalizeDashboardWidgets(
  values: Array<string | null | undefined> | null | undefined,
): DashboardWidgetKey[] {
  const allowed = new Set<DashboardWidgetKey>(defaultDashboardWidgets);
  const normalized = (values ?? [])
    .map((value) => String(value ?? "").trim() as DashboardWidgetKey)
    .filter((value) => allowed.has(value));

  if (!normalized.length) {
    return [...defaultDashboardWidgets];
  }

  return Array.from(new Set(normalized));
}

export type DashboardWidgetSize = "third" | "half" | "full";

export type DashboardLayoutEntry = {
  key: DashboardWidgetKey;
  size: DashboardWidgetSize;
  collapsed: boolean;
};

/** The order the dashboard rendered its widgets in before the arrangement became data. */
export const defaultDashboardWidgetOrder: DashboardWidgetKey[] = [
  "summary_cards",
  "my_tasks",
  "status_distribution",
  "type_distribution",
  "top_locations",
  "verification_expiry",
  "completed_processes",
  "average_durations",
  "recent_events",
];

/** The width each widget had before the arrangement became data. */
export const dashboardWidgetDefaultSizes: Record<DashboardWidgetKey, DashboardWidgetSize> = {
  summary_cards: "full",
  my_tasks: "full",
  status_distribution: "third",
  type_distribution: "third",
  top_locations: "half",
  verification_expiry: "half",
  completed_processes: "half",
  average_durations: "half",
  recent_events: "full",
};

export const dashboardWidgetSizeSpanClass: Record<DashboardWidgetSize, string> = {
  third: "xl:col-span-4",
  half: "xl:col-span-6",
  full: "xl:col-span-12",
};

export const dashboardWidgetSizeLabels: Record<DashboardWidgetSize, string> = {
  third: "Треть",
  half: "Половина",
  full: "Во всю ширину",
};

/** The summary strip carries five figures, so its inner columns follow the module's own width. */
export const dashboardSummaryColumnsClass: Record<DashboardWidgetSize, string> = {
  third: "grid-cols-1",
  half: "grid-cols-1 sm:grid-cols-2",
  full: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-5",
};

export const dashboardWidgetTitles: Record<DashboardWidgetKey, string> = {
  summary_cards: "Сводка",
  my_tasks: "Мои задачи",
  status_distribution: "Статусы оборудования",
  type_distribution: "Категории оборудования",
  top_locations: "Количество приборов",
  verification_expiry: "Ближайшие сроки контроля",
  completed_processes: "Завершённые процессы",
  average_durations: "Средняя длительность",
  recent_events: "Последние события",
};

/** The layout a user sees before they arrange anything: the same order and widths as before. */
export const defaultDashboardLayout: DashboardLayoutEntry[] = defaultDashboardWidgetOrder.map((key) => ({
  key,
  size: dashboardWidgetDefaultSizes[key],
  collapsed: false,
}));

export function isDashboardWidgetSize(value: unknown): value is DashboardWidgetSize {
  return value === "third" || value === "half" || value === "full";
}

/**
 * Merge a stored arrangement with the known widgets: drop unknown keys, clamp the width, keep one
 * entry per widget, and append anything missing in the default order. An unreadable value becomes
 * the default arrangement, so a stored arrangement can never break the page.
 */
export function normalizeDashboardLayout(values: unknown): DashboardLayoutEntry[] {
  const known = new Set<DashboardWidgetKey>(defaultDashboardWidgetOrder);
  const entries: DashboardLayoutEntry[] = [];
  const seen = new Set<DashboardWidgetKey>();

  const source = Array.isArray(values) ? values : [];
  for (const raw of source) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const candidate = raw as { key?: unknown; size?: unknown; collapsed?: unknown };
    const key = String(candidate.key ?? "").trim() as DashboardWidgetKey;
    if (!known.has(key) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    entries.push({
      key,
      size: isDashboardWidgetSize(candidate.size) ? candidate.size : dashboardWidgetDefaultSizes[key],
      collapsed: Boolean(candidate.collapsed),
    });
  }

  for (const key of defaultDashboardWidgetOrder) {
    if (!seen.has(key)) {
      entries.push({ key, size: dashboardWidgetDefaultSizes[key], collapsed: false });
    }
  }

  return entries;
}

/** Move a widget to another widget's position, keeping everything else in order. */
export function reorderDashboardLayout(
  entries: DashboardLayoutEntry[],
  activeKey: DashboardWidgetKey,
  overKey: DashboardWidgetKey,
): DashboardLayoutEntry[] {
  const from = entries.findIndex((entry) => entry.key === activeKey);
  const to = entries.findIndex((entry) => entry.key === overKey);
  if (from < 0 || to < 0 || from === to) {
    return entries;
  }
  const next = [...entries];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Apply a width or collapsed change to one widget, leaving the rest of the arrangement intact. */
export function updateDashboardWidget(
  entries: DashboardLayoutEntry[],
  key: DashboardWidgetKey,
  patch: Partial<Pick<DashboardLayoutEntry, "size" | "collapsed">>,
): DashboardLayoutEntry[] {
  return entries.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry));
}

export type DashboardWidgetPlan = {
  key: DashboardWidgetKey;
  title: string;
  size: DashboardWidgetSize;
  spanClass: string;
  collapsed: boolean;
};

/**
 * What to render: the arranged widgets that are visible right now. An entry for a hidden widget
 * stays in the stored arrangement, so the widget comes back in its own place when it is shown again.
 */
export function buildDashboardPlan(
  layout: DashboardLayoutEntry[],
  visibleKeys: readonly DashboardWidgetKey[],
): DashboardWidgetPlan[] {
  const visible = new Set<DashboardWidgetKey>(visibleKeys);
  return layout
    .filter((entry) => visible.has(entry.key))
    .map((entry) => ({
      key: entry.key,
      title: dashboardWidgetTitles[entry.key],
      size: entry.size,
      spanClass: dashboardWidgetSizeSpanClass[entry.size],
      collapsed: entry.collapsed,
    }));
}

/** Dragging is offered only while editing and only where the multi-column grid exists. */
export function isDashboardDragEnabled(editing: boolean, isWideScreen: boolean): boolean {
  return editing && isWideScreen;
}

export function getDashboardFolderIds(
  user: {
    dashboardFolderId?: number | null;
    dashboardFolderIds?: number[] | null;
  } | null | undefined,
): number[] {
  if (user?.dashboardFolderIds?.length) {
    return user.dashboardFolderIds;
  }
  return user?.dashboardFolderId ? [user.dashboardFolderId] : [];
}

/** True when the date is set and already behind us. */
export function isDatePast(value: string | null | undefined, today: Date = new Date()): boolean {
  if (!value) {
    return false;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed.getTime() < today.getTime();
}

/** The parts of an equipment item this rule needs, so tests do not have to build a whole device. */
type CheckableEquipment = Pick<
  EquipmentItem,
  "equipmentType" | "complianceDate" | "complianceIntervalMonths" | "siVerification" | "status"
>;

/**
 * True when the device's verification (attestation, control) date is already behind us and the
 * device is still in the registry — the «Есть просрочка» summary counts those next to overdue
 * repair stages. Archived devices are ignored: there is nothing left to do about them.
 */
export function isCheckExpired(item: CheckableEquipment, today: Date = new Date()): boolean {
  if (item.status === "ARCHIVED") {
    return false;
  }
  return isDatePast(getEquipmentNextDueDate(item), today);
}
