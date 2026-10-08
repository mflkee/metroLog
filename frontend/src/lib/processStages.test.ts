import { describe, expect, it, vi } from "vitest";

import { applyStageDateChange } from "@/lib/processStages";
import type { ProcessCustomStage } from "@/api/equipment";

function stage(overrides: Partial<ProcessCustomStage> = {}): ProcessCustomStage {
  return {
    id: "stage-1",
    afterKey: "sent_to_repair_at",
    label: "Передано в ремонт",
    date: null,
    deadlineDays: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe("applyStageDateChange", () => {
  it("writes to the template field when the row has a formKey", () => {
    const setForm = vi.fn();
    const setCustomStages = vi.fn();

    applyStageDateChange({
      formKey: "sentToRepairAt",
      customStageId: null,
      value: "2026-05-01",
      setForm,
      setCustomStages,
    });

    expect(setCustomStages).not.toHaveBeenCalled();
    const updater = setForm.mock.calls[0][0] as (current: Record<string, string>) => Record<string, string>;
    expect(updater({ sentToRepairAt: "" })).toEqual({ sentToRepairAt: "2026-05-01" });
  });

  it("writes to the matching custom stage when the row is custom", () => {
    const setForm = vi.fn();
    const setCustomStages = vi.fn();

    applyStageDateChange({
      formKey: null,
      customStageId: "stage-1",
      value: "2026-06-02",
      setForm,
      setCustomStages,
    });

    expect(setForm).not.toHaveBeenCalled();
    const updater = setCustomStages.mock.calls[0][0] as (
      current: ProcessCustomStage[],
    ) => ProcessCustomStage[];
    const next = updater([stage(), stage({ id: "stage-2" })]);
    expect(next[0].date).toBe("2026-06-02");
    expect(next[1].date).toBeNull();
  });

  it("clears the date when the value is blank", () => {
    const setCustomStages = vi.fn();

    applyStageDateChange({
      formKey: null,
      customStageId: "stage-1",
      value: "   ",
      setForm: vi.fn(),
      setCustomStages,
    });

    const updater = setCustomStages.mock.calls[0][0] as (
      current: ProcessCustomStage[],
    ) => ProcessCustomStage[];
    expect(updater([stage({ date: "2026-01-01" })])[0].date).toBeNull();
  });

  it("does nothing when the row owns neither a form field nor a custom stage", () => {
    const setForm = vi.fn();
    const setCustomStages = vi.fn();

    applyStageDateChange({
      formKey: null,
      customStageId: null,
      value: "2026-05-01",
      setForm,
      setCustomStages,
    });

    expect(setForm).not.toHaveBeenCalled();
    expect(setCustomStages).not.toHaveBeenCalled();
  });
});
