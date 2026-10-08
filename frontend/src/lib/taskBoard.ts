import type { TaskListItem, TaskStatus } from "@/api/tasks";

/**
 * Decides the status change for a board drop. Returns null when the drop is a no-op: outside any
 * column, onto the same column, or for a task that is no longer in the list.
 */
export function resolveBoardDrop(
  activeId: unknown,
  overId: unknown,
  tasks: TaskListItem[],
): { id: number; status: TaskStatus } | null {
  if (overId === undefined || overId === null) {
    return null;
  }
  const id = Number(activeId);
  if (!Number.isFinite(id)) {
    return null;
  }
  const task = tasks.find((item) => item.id === id);
  if (!task) {
    return null;
  }
  const status = String(overId) as TaskStatus;
  if (task.status === status) {
    return null;
  }
  return { id, status };
}
