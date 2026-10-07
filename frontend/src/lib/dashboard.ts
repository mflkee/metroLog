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
    value: "repair_overdue",
    label: "Просрочки ремонта",
    description: "Сводка по текущим просрочкам на этапах ремонта и получения.",
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
