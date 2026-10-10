import type { TaskListItem, TaskPriority, TaskStatus } from "@/api/tasks";
import type { DashboardWidgetSize } from "@/lib/dashboard";

/**
 * How many tasks the «Мои задачи» module shows at each width preset. The module is a reminder rather
 * than a list, so the numbers stay small even full width — the ordering below decides *which* tasks
 * those are.
 */
export const MY_TASKS_LIMITS: Record<DashboardWidgetSize, number> = {
  third: 3,
  half: 6,
  full: 9,
};

/** The order of importance: `CRITICAL` first, `LOW` last. */
const PRIORITY_RANK: Record<TaskPriority, number> = {
  CRITICAL: 0,
  HIGH: 1,
  NORMAL: 2,
  LOW: 3,
};

const TERMINAL_STATUSES = new Set<TaskStatus>(["DONE", "CANCELLED", "ARCHIVED"]);

/**
 * What the module shows: the most important tasks first, and among equals the one whose deadline
 * comes first — a task without a deadline goes after every dated one of the same importance. The id
 * breaks the remaining ties, so the order does not change between renders.
 *
 * `limit` comes from the module's width preset (`MY_TASKS_LIMITS`): a third shows the three most
 * urgent, a half six, a full nine.
 */
export function selectMyTasks(
  items: TaskListItem[],
  limit: number = MY_TASKS_LIMITS.third,
): TaskListItem[] {
  return items
    .filter((task) => !TERMINAL_STATUSES.has(task.status))
    .sort((left, right) => {
      const byImportance = PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority];
      if (byImportance !== 0) {
        return byImportance;
      }

      const byDeadline = (left.dueDate ?? "9999").localeCompare(right.dueDate ?? "9999");
      if (byDeadline !== 0) {
        return byDeadline;
      }

      return left.id - right.id;
    })
    .slice(0, limit);
}
