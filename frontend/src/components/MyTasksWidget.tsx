import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  fetchTasks,
  type TaskListItem,
} from "@/api/tasks";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  isCondensedWidget,
  type DashboardWidgetSize,
} from "@/lib/dashboard";
import { selectMyTasks, MY_TASKS_LIMITS } from "@/lib/myTasks";
import {
  TASK_TABLE_COLUMNS,
  formatTaskDate,
  taskPriorityTone,
  taskTableCellClass,
  taskTableHeaderClass,
} from "@/lib/taskTable";
import { TASK_STATUS_TONES } from "@/lib/taskStatusTone";

type MyTasksWidgetProps = {
  token: string;
  userId: number;
  /** The module's width preset decides how much of each task is shown. */
  size: DashboardWidgetSize;
};

export function MyTasksWidget({ token, userId, size }: MyTasksWidgetProps) {
  const navigate = useNavigate();
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
  // The most important first, then the nearest deadline, as many as the width preset allows.
  const items = selectMyTasks(Array.from(byId.values()), MY_TASKS_LIMITS[size]);

  if (items.length === 0) {
    return <p className="text-sm text-steel">Активных задач, где ты ответственный или исполнитель, нет.</p>;
  }

  // Full width is a table: one row per task, the columns filling the width, so nothing is left empty
  // in the middle and the module is *shorter* than the cards while showing more (see `taskTable.ts`).
  if (size === "full") {
    return (
      <div className="max-h-[20rem] overflow-y-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-steel">
              {TASK_TABLE_COLUMNS.map((column) => (
                <th className={taskTableHeaderClass(column)} key={column.key} scope="col">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((task) => (
              <tr
                className="cursor-pointer border-b border-line transition last:border-b-0 hover:bg-[var(--accent-soft)]/40"
                key={task.id}
                onClick={(event) => {
                  // The title is a real link, so a click on it navigates once, not twice.
                  if ((event.target as HTMLElement).closest("a")) {
                    return;
                  }
                  void navigate(`/tasks/${task.id}`);
                }}
              >
                {TASK_TABLE_COLUMNS.map((column) => (
                  <td className={taskTableCellClass(column, task)} key={column.key}>
                    {column.key === "title" ? (
                      <Link className="text-ink hover:underline" to={`/tasks/${task.id}`}>
                        {column.value(task)}
                      </Link>
                    ) : column.key === "status" ? (
                      <StatusBadge tone={TASK_STATUS_TONES[task.status]}>
                        {column.value(task)}
                      </StatusBadge>
                    ) : (
                      column.value(task)
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // A third keeps the identity of the task and the one fact that matters (the deadline); a half adds
  // the priority and the folder.
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
                  <span className={`font-semibold uppercase ${taskPriorityTone[task.priority]}`}>
                    {TASK_PRIORITY_LABELS[task.priority]}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="min-w-0 truncate">{task.folderName ?? "Без папки"}</span>
                </span>
              )}
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
                {formatTaskDate(task.dueDate)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
