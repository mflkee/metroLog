import {
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  type TaskListItem,
  type TaskPriority,
} from "@/api/tasks";

/** Priority reads as a tone wherever a task is shown. */
export const taskPriorityTone: Record<TaskPriority, string> = {
  LOW: "text-steel",
  NORMAL: "text-ink",
  HIGH: "text-[color:var(--warning)]",
  CRITICAL: "text-[color:var(--danger)]",
};

/** `dd.mm.yyyy`, and «без срока» when the task has no deadline. */
export function formatTaskDate(value: string | null): string {
  if (!value) {
    return "без срока";
  }
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}

/**
 * A full-width tasks module is mostly empty in the middle when every task is a card: the title sits
 * on the left and the deadline on the right with nothing between them. It renders the table the task
 * list page already uses instead — one row per task, columns that fill the width — and the columns
 * appear as the *module* gets wider, which is what a container query measures (the module's body is
 * the container, never the viewport): the status and the deadline always, the folder and the
 * priority from 36rem, the responsible and the equipment from 64rem.
 *
 * A real `<table>` with `width: 100%`, not a grid with fixed tracks: the browser sizes each column to
 * its content and spreads the leftover width across the columns, so a short title no longer leaves a
 * hole after it and a long name («Макеев Глеб Борисович») is no longer truncated. Measured in
 * Chromium at the step boundaries: a 7-column table at 1280px gives the title 556px, the responsible
 * 194px and no column more than ~80px of slack.
 *
 * ⚠️ The visibility classes are literal strings, because Tailwind reads the source text — a class
 * assembled at runtime is never generated — and a table cell has to become `table-cell`, not `block`,
 * or the table layout falls apart. `taskTable.test.ts` pins the steps and the order.
 */
export const TASK_TABLE_STEPS = [0, 36, 64] as const;

export type TaskTableColumn = {
  key: "title" | "folder" | "status" | "priority" | "responsible" | "due" | "equipment";
  label: string;
  /** The container width (rem) the column appears from; `0` is always. */
  from: (typeof TASK_TABLE_STEPS)[number];
  /** The literal visibility classes for the step the column appears at. */
  visibility: string;
  /** The cell classes that do not depend on the row. */
  cellClass: string;
  /** Right-aligns the cell (a number or a date). */
  align?: "right";
  /** A tone class for the cell, when the value carries meaning. */
  tone?: (task: TaskListItem) => string;
  value: (task: TaskListItem) => string;
};

/** The same columns, in the same order, as the task list page. */
export const TASK_TABLE_COLUMNS: TaskTableColumn[] = [
  {
    key: "title",
    label: "Задача",
    from: 0,
    visibility: "",
    // The only column that is allowed to wrap: it holds the free text, and wrapping keeps it from
    // squeezing the columns that carry a fixed value.
    cellClass: "text-sm font-medium text-ink",
    value: (task) => task.title,
  },
  {
    key: "folder",
    label: "Папка",
    from: 36,
    visibility: "hidden @xl:table-cell",
    cellClass: "whitespace-nowrap text-xs text-steel",
    value: (task) => task.folderName ?? "—",
  },
  {
    key: "status",
    label: "Статус",
    from: 0,
    visibility: "",
    cellClass: "whitespace-nowrap text-xs",
    value: (task) => TASK_STATUS_LABELS[task.status],
  },
  {
    key: "priority",
    label: "Приоритет",
    from: 36,
    visibility: "hidden @xl:table-cell",
    cellClass: "whitespace-nowrap text-xs font-semibold",
    tone: (task) => taskPriorityTone[task.priority],
    value: (task) => TASK_PRIORITY_LABELS[task.priority],
  },
  {
    key: "responsible",
    label: "Ответственный",
    from: 64,
    visibility: "hidden @5xl:table-cell",
    cellClass: "whitespace-nowrap text-xs text-steel",
    value: (task) => task.responsibleDisplayName ?? "—",
  },
  {
    key: "due",
    label: "Срок",
    from: 0,
    visibility: "",
    align: "right",
    cellClass: "whitespace-nowrap text-xs",
    tone: (task) => (task.isOverdue ? "font-semibold text-[color:var(--danger)]" : "text-steel"),
    value: (task) => formatTaskDate(task.dueDate),
  },
  {
    key: "equipment",
    label: "Приборы",
    from: 64,
    visibility: "hidden @5xl:table-cell",
    align: "right",
    cellClass: "whitespace-nowrap text-xs text-steel",
    value: (task) => String(task.equipmentCount),
  },
];

export function taskTableCellClass(column: TaskTableColumn, task: TaskListItem): string {
  return [
    column.visibility,
    "px-2 py-2 align-middle",
    column.cellClass,
    column.align === "right" ? "text-right" : "",
    column.tone ? column.tone(task) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function taskTableHeaderClass(column: TaskTableColumn): string {
  return [
    column.visibility,
    "px-2 pb-1.5 align-bottom font-semibold",
    column.align === "right" ? "text-right" : "text-left",
  ]
    .filter(Boolean)
    .join(" ");
}
