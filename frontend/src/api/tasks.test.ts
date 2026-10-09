import { afterEach, describe, expect, it, vi } from "vitest";

import { TASK_STATUSES, TASK_STATUS_LABELS, fetchTasks, mapTask, updateTask } from "@/api/tasks";

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
      can_mutate: true,
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
    expect(task.canMutate).toBe(true);
  });
});

describe("mapTaskListItem", () => {
  it("carries the read-only flag through from the API, which is what hides the controls", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            items: [
              {
                id: 3,
                folder_id: 1,
                folder_name: "Папка",
                title: "Задача",
                status: "NEW",
                priority: "NORMAL",
                kind: null,
                tags: [],
                due_date: null,
                responsible_display_name: "Иванов И.И.",
                assignee_count: 0,
                observer_count: 2,
                equipment_count: 0,
                checklist_done: 0,
                checklist_total: 0,
                completed_at: null,
                created_at: "2026-10-01T00:00:00Z",
                updated_at: "2026-10-02T00:00:00Z",
                is_overdue: false,
                can_mutate: false,
              },
            ],
            total: 1,
            limit: 20,
            offset: 0,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const page = await fetchTasks("token");

    expect(page.items[0].canMutate).toBe(false);
    vi.unstubAllGlobals();
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

const RAW_TASK = {
  id: 1,
  folder_id: 2,
  folder_name: "Папка",
  title: "Задача",
  description: null,
  status: "NEW",
  priority: "NORMAL",
  kind: null,
  tags: [],
  due_date: null,
  created_by_user_id: 5,
  created_by_display_name: "Иванов И.И.",
  completed_at: null,
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
  is_overdue: false,
  can_mutate: false,
  participants: [],
  equipment: [],
  checklist: [],
  checklist_done: 0,
  checklist_total: 0,
};

function stubFetchOk(): { body: () => unknown } {
  let captured: RequestInit | undefined;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (...args: unknown[]) => {
      captured = args[1] as RequestInit;
      return new Response(JSON.stringify(RAW_TASK), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return { body: () => JSON.parse(String(captured?.body)) };
}

describe("updateTask due date", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the picked date", async () => {
    const request = stubFetchOk();

    await updateTask("token", 7, { dueDate: "2026-10-20" });

    expect(request.body()).toEqual({ due_date: "2026-10-20" });
  });

  it("clears the date with an explicit null, which the API treats as a reset", async () => {
    const request = stubFetchOk();

    await updateTask("token", 7, { dueDate: null });

    expect(request.body()).toEqual({ due_date: null });
  });
});
