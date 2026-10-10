import type { TaskListItem } from "@/api/tasks";
import {
  TASK_TABLE_COLUMNS,
  TASK_TABLE_ROW_CLASS,
  TASK_TABLE_STEPS,
  formatTaskDate,
  taskTableCellClass,
} from "@/lib/taskTable";

function task(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: 1,
    folderId: 1,
    folderName: "Ленск",
    title: "Замена датчика",
    status: "IN_PROGRESS",
    priority: "HIGH",
    kind: null,
    tags: [],
    dueDate: "2026-11-12",
    responsibleDisplayName: "Иванов И.И.",
    assigneeCount: 2,
    observerCount: 0,
    equipmentCount: 3,
    checklistDone: 2,
    checklistTotal: 5,
    completedAt: null,
    createdAt: "2026-10-01T09:00:00Z",
    updatedAt: "2026-10-01T09:00:00Z",
    isOverdue: false,
    canMutate: true,
    ...overrides,
  };
}

/*
 * The row template and the per-column visibility are two halves of one contract, written by hand
 * because Tailwind reads the source text. If they drift apart a cell wraps onto its own line and the
 * table falls apart silently, so the two halves are compared here.
 */
describe("the tasks table keeps its two halves in step", () => {
  const templates = [...TASK_TABLE_ROW_CLASS.matchAll(/grid-cols-\[([^\]]+)\]/g)].map((match) =>
    match[1].split("_"),
  );

  it("writes one template per step, in the order of the steps", () => {
    expect(templates).toHaveLength(TASK_TABLE_STEPS.length);
  });

  it("gives every step exactly the tracks of the columns visible at it", () => {
    TASK_TABLE_STEPS.forEach((min, index) => {
      const visible = TASK_TABLE_COLUMNS.filter((column) => column.from <= min);
      expect(templates[index]).toHaveLength(visible.length);
    });
  });

  it("starts every template with the flexible title track", () => {
    for (const tracks of templates) {
      expect(tracks[0]).toBe("minmax(0,1fr)");
    }
  });

  it("adds columns as the module widens, never removes them", () => {
    const counts = templates.map((tracks) => tracks.length);
    expect(counts).toEqual([...counts].sort((left, right) => left - right));
  });

  it("keeps the columns in the order the task list page uses", () => {
    expect(TASK_TABLE_COLUMNS.map((column) => column.key)).toEqual([
      "title",
      "folder",
      "status",
      "priority",
      "responsible",
      "due",
      "equipment",
    ]);
  });

  it("hides a column only behind a step it declares", () => {
    for (const column of TASK_TABLE_COLUMNS) {
      expect(TASK_TABLE_STEPS).toContain(column.from);
      expect(column.visibility.includes("hidden")).toBe(column.from > 0);
    }
  });
});

describe("task table cells", () => {
  it("marks the deadline that is already behind us", () => {
    const due = TASK_TABLE_COLUMNS.find((column) => column.key === "due");
    expect(due).toBeDefined();
    expect(taskTableCellClass(due!, task({ isOverdue: true }))).toContain("var(--danger)");
    expect(taskTableCellClass(due!, task())).toContain("text-steel");
  });

  it("right-aligns the deadline and the equipment count", () => {
    const due = TASK_TABLE_COLUMNS.find((column) => column.key === "due")!;
    const equipment = TASK_TABLE_COLUMNS.find((column) => column.key === "equipment")!;
    expect(taskTableCellClass(due, task())).toContain("text-right");
    expect(taskTableCellClass(equipment, task())).toContain("text-right");
    expect(taskTableCellClass(TASK_TABLE_COLUMNS[0], task())).not.toContain("text-right");
  });

  it("reads every value off the task, with a dash where it is not set", () => {
    const values = Object.fromEntries(
      TASK_TABLE_COLUMNS.map((column) => [column.key, column.value(task())]),
    );
    expect(values).toEqual({
      title: "Замена датчика",
      folder: "Ленск",
      status: "В работе",
      priority: "Высокий",
      responsible: "Иванов И.И.",
      due: "12.11.2026",
      equipment: "3",
    });

    const empty = Object.fromEntries(
      TASK_TABLE_COLUMNS.map((column) => [
        column.key,
        column.value(task({ folderName: null, responsibleDisplayName: null })),
      ]),
    );
    expect(empty.folder).toBe("—");
    expect(empty.responsible).toBe("—");
  });
});

describe("formatTaskDate", () => {
  it("prints a deadline as dd.mm.yyyy", () => {
    expect(formatTaskDate("2026-11-12")).toBe("12.11.2026");
  });

  it("says so when there is no deadline", () => {
    expect(formatTaskDate(null)).toBe("без срока");
  });
});
