import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { TASK_PRIORITY_LABELS, TASK_STATUS_LABELS, fetchTasks } from "@/api/tasks";

type EquipmentTasksSectionProps = {
  equipmentId: number;
  token: string;
};

export function EquipmentTasksSection({ equipmentId, token }: EquipmentTasksSectionProps) {
  const query = useQuery({
    queryKey: ["tasks", "equipment", equipmentId],
    queryFn: () => fetchTasks(token, { equipmentId, limit: 50 }),
    enabled: Boolean(token) && Number.isFinite(equipmentId),
  });

  const items = query.data?.items ?? [];

  return (
    <section className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
      <h3 className="text-lg font-semibold text-ink">Задачи</h3>
      <p className="mt-1 text-sm text-steel">Задачи, привязанные к этому прибору.</p>
      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-steel">Задач по этому прибору нет.</p>
        ) : (
          items.map((task) => (
            <Link
              key={task.id}
              className="tone-child flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink transition hover:border-signal-info"
              to={`/tasks/${task.id}`}
            >
              <span className="min-w-0 truncate font-medium">{task.title}</span>
              <span className="shrink-0 text-xs text-steel">
                {TASK_STATUS_LABELS[task.status]} · {TASK_PRIORITY_LABELS[task.priority]}
              </span>
            </Link>
          ))
        )}
      </div>
    </section>
  );
}
