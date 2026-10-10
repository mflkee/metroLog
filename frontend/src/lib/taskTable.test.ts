import type { TaskListItem } from "@/api/tasks";
import {
  TASK_TABLE_COLUMNS,
  TASK_TABLE_STEPS,
  formatTaskDate,
  taskTableCellClass,
  taskTableHeaderClass,
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
 * The table sizes its own columns (a real `<table>` with `width: 100%`, so the browser spreads the
 * leftover width by content), and the only thing written by hand is which columns exist at which
 * module width. These are the invariants of that plan.
 */
describe("the tasks table column plan", () => {
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

  /*
   * The always-visible columns (status, deadline) sit between the ones that appear later, because the
   * order has to stay the one the task list page uses. What must hold is that the columns *revealed*
   * as the module widens come in left-to-right order, so nothing pops in to the left of a neighbour.
   */
  it("reveals columns left to right as the module widens", () => {
    const revealed = TASK_TABLE_COLUMNS.filter((column) => column.from > 0).map(
      (column) => column.from,
    );
    expect(revealed).toEqual([...revealed].sort((left, right) => left - right));
  });

  /*
   * A table cell must become `table-cell`, never `block`: `block` on a `<td>`/`<th>` breaks the table
   * layout, so the visibility class is pinned here rather than left to a review.
   */
  it("shows a column always or from a declared step, and always as a table cell", () => {
    const visibilityForStep: Record<number, string> = {
      0: "",
      36: "hidden @xl:table-cell",
      64: "hidden @5xl:table-cell",
    };
    for (const column of TASK_TABLE_COLUMNS) {
      expect(TASK_TABLE_STEPS).toContain(column.from);
      expect(column.visibility).toBe(visibilityForStep[column.from]);
    }
  });

  it("pads every cell and keeps the values on one line", () => {
    const sample = task();
    for (const column of TASK_TABLE_COLUMNS) {
      const cell = taskTableCellClass(column, sample);
      expect(cell).toContain("px-2");
      expect(cell).toContain("py-2");
      if (column.key !== "title") {
        expect(cell).toContain("whitespace-nowrap");
      }
    }
  });

  it("carries the module's step into the header too, so the header follows the body", () => {
    for (const column of TASK_TABLE_COLUMNS) {
      expect(taskTableHeaderClass(column)).toContain(column.visibility);
    }
  });
});

describe("task table cells", () => {
  it("marks the deadline that is already behind us", () => {
    const due = TASK_TABLE_COLUMNS.find((column) => column.key === "due")!;
    expect(taskTableCellClass(due, task({ isOverdue: true }))).toContain("var(--danger)");
    expect(taskTableCellClass(due, task())).toContain("text-steel");
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
