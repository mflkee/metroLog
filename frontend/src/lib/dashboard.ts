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
  const dueDate = getEquipmentNextDueDate(item);
  if (!dueDate) {
    return false;
  }
  const parsed = new Date(dueDate);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }
  return parsed.getTime() < today.getTime();
}
