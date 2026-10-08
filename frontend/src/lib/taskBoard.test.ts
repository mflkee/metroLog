import type { TaskListItem, TaskStatus } from "@/api/tasks";
import { resolveBoardDrop } from "@/lib/taskBoard";

function task(id: number, status: TaskStatus): TaskListItem {
  return { id, status } as TaskListItem;
}

const TASKS = [task(1, "NEW"), task(2, "DONE")];

describe("resolveBoardDrop", () => {
  it("returns the status change when a card lands on another column", () => {
    expect(resolveBoardDrop(1, "DONE", TASKS)).toEqual({ id: 1, status: "DONE" });
  });

  it("is a no-op when the card is dropped on its own column", () => {
    expect(resolveBoardDrop(1, "NEW", TASKS)).toBeNull();
  });

  it("is a no-op outside any column", () => {
    expect(resolveBoardDrop(1, undefined, TASKS)).toBeNull();
    expect(resolveBoardDrop(1, null, TASKS)).toBeNull();
  });

  it("is a no-op for an unknown task", () => {
    expect(resolveBoardDrop(99, "DONE", TASKS)).toBeNull();
  });

  it("accepts the numeric drag id the library reports", () => {
    expect(resolveBoardDrop("2", "NEW", TASKS)).toEqual({ id: 2, status: "NEW" });
  });
});
