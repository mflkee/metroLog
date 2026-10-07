import { describe, expect, it } from "vitest";

import { TASK_STATUSES, TASK_STATUS_LABELS, mapTask } from "@/api/tasks";

describe("mapTask", () => {
  it("maps raw task fields to the camelCase model", () => {
    const task = mapTask({
      id: 1,
      folder_id: 2,
      folder_name: "Папка",
      title: "Проверить прибор",
      description: null,
      status: "IN_PROGRESS",
      priority: "HIGH",
      kind: null,
      tags: ["план"],
      due_date: "2026-10-10",
      created_by_user_id: 5,
      created_by_display_name: "Иванов И.И.",
      completed_at: null,
      created_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-02T00:00:00Z",
      is_overdue: false,
      participants: [{ user_id: 5, role: "RESPONSIBLE", display_name: "Иванов И.И.", email: "i@x" }],
      equipment: [
        {
          equipment_id: 9,
          note: null,
          sort_order: 0,
          object_name: "Объект",
          name: "Манометр",
          modification: null,
          serial_number: "SN-1",
          equipment_type: "SI",
        },
      ],
      checklist: [{ id: 3, label: "Шаг", is_done: true, sort_order: 0 }],
      checklist_done: 1,
      checklist_total: 1,
    });

    expect(task.status).toBe("IN_PROGRESS");
    expect(task.priority).toBe("HIGH");
    expect(task.folderName).toBe("Папка");
    expect(task.participants[0].displayName).toBe("Иванов И.И.");
    expect(task.equipment[0].equipmentId).toBe(9);
    expect(task.checklist[0].isDone).toBe(true);
    expect(task.checklistDone).toBe(1);
  });
});

describe("task board statuses", () => {
  it("lists every status used by the board columns with a label", () => {
    for (const status of TASK_STATUSES) {
      expect(TASK_STATUS_LABELS[status]).toBeTruthy();
    }
    expect(TASK_STATUSES).not.toContain("ARCHIVED");
  });
});
