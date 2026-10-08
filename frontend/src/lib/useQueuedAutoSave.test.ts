import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useQueuedAutoSave } from "@/lib/useQueuedAutoSave";

const isEqual = (left: number, right: number) => left === right;

function setup(save: (value: number) => Promise<void>) {
  return renderHook(
    ({ value }: { value: number }) =>
      useQueuedAutoSave<number>({
        value,
        baseline: 0,
        delayMs: 100,
        isEqual,
        save,
      }),
    { initialProps: { value: 0 } },
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useQueuedAutoSave", () => {
  it("debounces and saves a changed value", async () => {
    const save = vi.fn(async () => {});
    const { rerender } = setup(save);

    rerender({ value: 5 });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(save).toHaveBeenCalledWith(5);
  });

  it("does not save when the value is unchanged", async () => {
    const save = vi.fn(async () => {});
    const { rerender } = setup(save);

    rerender({ value: 0 });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(save).not.toHaveBeenCalled();
  });

  it("flushes a pending edit on unmount instead of dropping it", async () => {
    const save = vi.fn(async () => {});
    const { rerender, unmount } = setup(save);

    rerender({ value: 7 });
    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(save).toHaveBeenCalledWith(7);
  });

  it("does not flush on unmount when nothing is pending", async () => {
    const save = vi.fn(async () => {});
    const { unmount } = setup(save);

    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(save).not.toHaveBeenCalled();
  });

  it("blocks a reload while an edit is unsaved", () => {
    const save = vi.fn(async () => {});
    const { rerender } = setup(save);

    rerender({ value: 3 });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("does not block a reload when the value is saved", () => {
    const save = vi.fn(async () => {});
    setup(save);

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
