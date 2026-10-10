import type { TaskListItem, TaskPriority, TaskStatus } from "@/api/tasks";
import { MY_TASKS_LIMITS, selectMyTasks } from "@/lib/myTasks";

function task(
  id: number,
  priority: TaskPriority,
  dueDate: string | null,
  status: TaskStatus = "IN_PROGRESS",
): TaskListItem {
  return {
    id,
    folderId: 1,
    folderName: "Ленск",
    title: `Задача ${id}`,
    status,
    priority,
    kind: null,
    tags: [],
    dueDate,
    responsibleDisplayName: "Иванов И.И.",
    assigneeCount: 0,
    observerCount: 0,
    equipmentCount: 0,
    checklistDone: 0,
    checklistTotal: 0,
    completedAt: null,
    createdAt: "2026-10-01T09:00:00Z",
    updatedAt: "2026-10-01T09:00:00Z",
    isOverdue: false,
    canMutate: true,
  };
}

const ids = (items: TaskListItem[]) => items.map((item) => item.id);

describe("the «Мои задачи» module picks the most urgent tasks", () => {
  it("shows as many as the width preset allows", () => {
    const many = Array.from({ length: 12 }, (_, index) => task(index + 1, "NORMAL", "2026-11-01"));
    expect(selectMyTasks(many, MY_TASKS_LIMITS.third)).toHaveLength(3);
    expect(selectMyTasks(many, MY_TASKS_LIMITS.half)).toHaveLength(6);
    expect(selectMyTasks(many, MY_TASKS_LIMITS.full)).toHaveLength(9);
  });

  it("keeps the ladder growing from a third to a half to full", () => {
    expect(MY_TASKS_LIMITS).toEqual({ third: 3, half: 6, full: 9 });
  });

  it("never returns more than it was given", () => {
    expect(selectMyTasks([task(1, "HIGH", null)], MY_TASKS_LIMITS.full)).toHaveLength(1);
    expect(selectMyTasks([], MY_TASKS_LIMITS.full)).toEqual([]);
  });

  it("puts the most important first, not the nearest deadline", () => {
    const items = [
      task(1, "LOW", "2026-10-11"),
      task(2, "CRITICAL", "2026-12-01"),
      task(3, "NORMAL", "2026-10-12"),
      task(4, "HIGH", "2026-11-01"),
    ];
    expect(ids(selectMyTasks(items))).toEqual([2, 4, 3]);
  });

  it("among equals takes the nearest deadline", () => {
    const items = [
      task(1, "HIGH", "2026-12-01"),
      task(2, "HIGH", "2026-10-11"),
      task(3, "HIGH", "2026-11-01"),
    ];
    expect(ids(selectMyTasks(items))).toEqual([2, 3, 1]);
  });

  it("puts a task without a deadline after every dated one of the same importance", () => {
    const items = [
      task(1, "NORMAL", null),
      task(2, "NORMAL", "2026-12-01"),
      task(3, "NORMAL", "2026-11-01"),
    ];
    expect(ids(selectMyTasks(items))).toEqual([3, 2, 1]);
  });

  it("still ranks importance above the deadline, so an urgent task with no date comes first", () => {
    const items = [
      task(1, "LOW", "2026-10-11"),
      task(2, "CRITICAL", null),
      task(3, "NORMAL", "2026-10-12"),
    ];
    expect(ids(selectMyTasks(items))).toEqual([2, 3, 1]);
  });

  it("leaves out what is already closed", () => {
    const items = [
      task(1, "CRITICAL", "2026-10-11", "DONE"),
      task(2, "HIGH", "2026-10-12", "CANCELLED"),
      task(3, "LOW", "2026-10-13", "ARCHIVED"),
      task(4, "NORMAL", "2026-11-01"),
    ];
    expect(ids(selectMyTasks(items))).toEqual([4]);
  });

  it("is stable when importance and deadline are both equal", () => {
    const items = [
      task(3, "NORMAL", "2026-11-01"),
      task(1, "NORMAL", "2026-11-01"),
      task(2, "NORMAL", "2026-11-01"),
    ];
    expect(ids(selectMyTasks(items))).toEqual([1, 2, 3]);
  });

  it("does not reorder the caller's array", () => {
    const items = [task(1, "LOW", null), task(2, "CRITICAL", null)];
    selectMyTasks(items);
    expect(ids(items)).toEqual([1, 2]);
  });
});
