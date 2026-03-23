export const dashboardWidgetOptions = [
  { value: "summary_cards", label: "Сводка" },
  { value: "status_distribution", label: "Статусы" },
  { value: "type_distribution", label: "Категории" },
  { value: "top_locations", label: "Местонахождения" },
  { value: "repair_overdue", label: "Просрочки ремонта" },
  { value: "verification_expiry", label: "Ближайшие сроки" },
  { value: "completed_processes", label: "Завершенные процессы" },
  { value: "average_durations", label: "Средняя длительность" },
  { value: "recent_events", label: "Последние события" },
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
