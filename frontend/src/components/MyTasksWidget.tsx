import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { TASK_STATUS_LABELS, fetchTasks, type TaskListItem } from "@/api/tasks";

const TERMINAL_STATUSES = new Set(["DONE", "CANCELLED", "ARCHIVED"]);

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
};

export function MyTasksWidget({ token, userId }: MyTasksWidgetProps) {
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
    .slice(0, 8);

  if (items.length === 0) {
    return <p className="text-sm text-steel">Активных задач, где ты ответственный или исполнитель, нет.</p>;
  }

  return (
    <ul className={["space-y-2", "max-h-[20rem] overflow-y-auto"].join(" ")}>
      {items.map((task) => (
        <li key={task.id} className="tone-child mr-4 rounded-2xl border border-line px-4 py-3">
          <Link className="flex items-center justify-between gap-3 text-sm" to={`/tasks/${task.id}`}>
            <span className="min-w-0 truncate font-medium text-ink">{task.title}</span>
            <span className="shrink-0 text-xs text-steel">
              {TASK_STATUS_LABELS[task.status]} ·{" "}
              <span className={task.isOverdue ? "text-[color:var(--danger)]" : ""}>
                {formatDate(task.dueDate)}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
