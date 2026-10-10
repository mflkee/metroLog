import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  fetchTasks,
  type TaskListItem,
  type TaskPriority,
} from "@/api/tasks";
import {
  dashboardWidgetRowLimit,
  isCondensedWidget,
  type DashboardWidgetSize,
} from "@/lib/dashboard";

const TERMINAL_STATUSES = new Set(["DONE", "CANCELLED", "ARCHIVED"]);

const PRIORITY_TONE: Record<TaskPriority, string> = {
  LOW: "text-steel",
  NORMAL: "text-ink",
  HIGH: "text-[color:var(--warning)]",
  CRITICAL: "text-[color:var(--danger)]",
};

function formatDate(value: string | null): string {
  if (!value) {
    return "без срока";
  }
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

type MyTasksWidgetProps = {
  token: string;
  userId: number;
  /** The module's width preset decides how much of each task is shown. */
  size: DashboardWidgetSize;
};

export function MyTasksWidget({ token, userId, size }: MyTasksWidgetProps) {
  const responsibleQuery = useQuery({
    queryKey: ["tasks", "widget", "responsible", userId],
    queryFn: () => fetchTasks(token, { responsibleUserId: userId, sort: "due", limit: 30 }),
    enabled: Boolean(token) && Boolean(userId),
  });
  const assigneeQuery = useQuery({
    queryKey: ["tasks", "widget", "assignee", userId],
    queryFn: () => fetchTasks(token, { assigneeUserId: userId, sort: "due", limit: 30 }),
    enabled: Boolean(token) && Boolean(userId),
  });

  const byId = new Map<number, TaskListItem>();
  for (const item of [
    ...(responsibleQuery.data?.items ?? []),
    ...(assigneeQuery.data?.items ?? []),
  ]) {
    byId.set(item.id, item);
  }
  const items = Array.from(byId.values())
    .filter((task) => !TERMINAL_STATUSES.has(task.status))
    .sort((left, right) => (left.dueDate ?? "9999").localeCompare(right.dueDate ?? "9999"))
    .slice(0, dashboardWidgetRowLimit[size]);

  if (items.length === 0) {
    return <p className="text-sm text-steel">Активных задач, где ты ответственный или исполнитель, нет.</p>;
  }

  // A third-wide module keeps the identity of the task and the one fact that matters (the deadline);
  // a half adds the priority and the folder, and only a full-width module has room for the people,
  // the checklist and the equipment.
  const condensed = isCondensedWidget(size);

  return (
    <ul className={["space-y-2", "max-h-[20rem] overflow-y-auto"].join(" ")}>
      {items.map((task) => (
        <li
          key={task.id}
          className="tone-child mr-4 rounded-2xl border border-line px-4 py-3 transition hover:bg-[var(--accent-soft)]/40"
        >
          <Link className="flex items-start justify-between gap-3 text-sm" to={`/tasks/${task.id}`}>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-ink">{task.title}</span>
              {condensed ? null : (
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-steel">
                  <span className={`font-semibold uppercase ${PRIORITY_TONE[task.priority]}`}>
                    {TASK_PRIORITY_LABELS[task.priority]}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="min-w-0 truncate">{task.folderName ?? "Без папки"}</span>
                </span>
              )}
              {size === "full" ? (
                <span className="mt-1 block text-xs text-steel">
                  {[
                    task.responsibleDisplayName ? `Отв.: ${task.responsibleDisplayName}` : null,
                    task.assigneeCount > 0 ? `исполнителей: ${task.assigneeCount}` : null,
                    task.checklistTotal > 0
                      ? `чек-лист ${task.checklistDone}/${task.checklistTotal}`
                      : null,
                    task.equipmentCount > 0 ? `приборов: ${task.equipmentCount}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 text-right text-xs text-steel">
              <span className="block">{TASK_STATUS_LABELS[task.status]}</span>
              <span
                className={
                  task.isOverdue
                    ? "mt-1 block font-semibold text-[color:var(--danger)]"
                    : "mt-1 block"
                }
              >
                {formatDate(task.dueDate)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
