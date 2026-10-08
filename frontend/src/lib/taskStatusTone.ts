import type { TaskStatus } from "@/api/tasks";
import type { StatusTone } from "@/components/ui/status-badge";

/**
 * Maps the task statuses to the adopted StatusBadge tones, so the task pages can render their
 * statuses with the shared component while the tone vocabulary stays in one place.
 */
export const TASK_STATUS_TONES: Record<TaskStatus, StatusTone> = {
  NEW: "info",
  IN_PROGRESS: "primary",
  ON_HOLD: "warning",
  DONE: "success",
  CANCELLED: "neutral",
  ARCHIVED: "neutral",
};
