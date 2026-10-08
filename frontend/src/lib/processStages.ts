import type { ProcessCustomStage, ProcessStageTemplateItem } from "@/api/equipment";

/**
 * Shared process-stage helpers used by both the repair and the verification queues.
 * They were duplicated verbatim in the two pages before this module existed.
 */

export function createLocalProcessCustomStageId(): string {
  return `cs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeProcessCustomStages(
  stages: ProcessCustomStage[],
  stageTemplate: ProcessStageTemplateItem[],
): ProcessCustomStage[] {
  const allowedKeys = new Set(stageTemplate.map((stage) => stage.key));
  const stageOrderByKey = new Map(stageTemplate.map((stage, index) => [stage.key, index]));
  const normalized = stages
    .filter((stage) => allowedKeys.has(stage.afterKey))
    .map((stage, index) => ({
      id: stage.id?.trim() ? stage.id : createLocalProcessCustomStageId(),
      afterKey: stage.afterKey,
      label: stage.label.trim(),
      date: stage.date?.trim() ? stage.date : null,
      deadlineDays: typeof stage.deadlineDays === "number" ? stage.deadlineDays : null,
      sortOrder: Number.isFinite(stage.sortOrder) ? stage.sortOrder : index,
      index,
    }))
    .filter((stage) => stage.label.length > 0)
    .sort((left, right) => {
      const leftOrder = stageOrderByKey.get(left.afterKey) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = stageOrderByKey.get(right.afterKey) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.index - right.index;
    });

  const nextSortOrderByAfterKey = new Map<string, number>();
  const usedIds = new Set<string>();
  return normalized.map((stage) => {
    const currentSortOrder = nextSortOrderByAfterKey.get(stage.afterKey) ?? 0;
    nextSortOrderByAfterKey.set(stage.afterKey, currentSortOrder + 1);
    const id = usedIds.has(stage.id) ? createLocalProcessCustomStageId() : stage.id;
    usedIds.add(id);
    return {
      id,
      afterKey: stage.afterKey,
      label: stage.label,
      date: stage.date,
      deadlineDays: stage.deadlineDays,
      sortOrder: currentSortOrder,
    };
  });
}

export function canMoveProcessCustomStage(
  currentStages: ProcessCustomStage[],
  stageId: string | null,
  direction: "up" | "down",
): boolean {
  if (!stageId) {
    return false;
  }
  const target = currentStages.find((stage) => stage.id === stageId);
  if (!target) {
    return false;
  }
  const sameAnchorStages = currentStages
    .filter((stage) => stage.afterKey === target.afterKey)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const index = sameAnchorStages.findIndex((stage) => stage.id === stageId);
  return direction === "up" ? index > 0 : index >= 0 && index < sameAnchorStages.length - 1;
}

export function areProcessCustomStagesEqual(
  left: ProcessCustomStage[],
  right: ProcessCustomStage[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (
      left[index].id !== right[index].id
      || left[index].afterKey !== right[index].afterKey
      || left[index].label !== right[index].label
      || left[index].date !== right[index].date
      || left[index].deadlineDays !== right[index].deadlineDays
      || left[index].sortOrder !== right[index].sortOrder
    ) {
      return false;
    }
  }
  return true;
}

export function renumberProcessCustomStages(stages: ProcessCustomStage[]): ProcessCustomStage[] {
  const grouped = new Map<string, ProcessCustomStage[]>();
  for (const stage of stages) {
    const current = grouped.get(stage.afterKey);
    if (current) {
      current.push(stage);
    } else {
      grouped.set(stage.afterKey, [stage]);
    }
  }
  const result: ProcessCustomStage[] = [];
  for (const items of grouped.values()) {
    items
      .slice()
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .forEach((stage, index) => {
        result.push({
          ...stage,
          sortOrder: index,
        });
      });
  }
  return result;
}

export function moveProcessCustomStage(
  currentStages: ProcessCustomStage[],
  stageId: string,
  direction: "up" | "down",
): ProcessCustomStage[] {
  const target = currentStages.find((stage) => stage.id === stageId);
  if (!target) {
    return currentStages;
  }
  const sameAnchorStages = currentStages
    .filter((stage) => stage.afterKey === target.afterKey)
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const currentIndex = sameAnchorStages.findIndex((stage) => stage.id === stageId);
  const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  const swapStage = sameAnchorStages[nextIndex];
  if (currentIndex < 0 || !swapStage) {
    return currentStages;
  }
  return renumberProcessCustomStages(
    currentStages.map((stage) => {
      if (stage.id === target.id) {
        return { ...stage, sortOrder: swapStage.sortOrder };
      }
      if (stage.id === swapStage.id) {
        return { ...stage, sortOrder: target.sortOrder };
      }
      return stage;
    }),
  );
}

export function insertProcessCustomStage(
  currentStages: ProcessCustomStage[],
  payload: {
    anchorKey: string;
    insertSortOrder: number;
    label: string;
    date: string | null;
  },
): ProcessCustomStage[] {
  const shifted = currentStages.map((stage) =>
    stage.afterKey === payload.anchorKey && stage.sortOrder >= payload.insertSortOrder
      ? { ...stage, sortOrder: stage.sortOrder + 1 }
      : stage,
  );
  return renumberProcessCustomStages([
    ...shifted,
    {
      id: createLocalProcessCustomStageId(),
      afterKey: payload.anchorKey,
      label: payload.label,
      date: payload.date,
      deadlineDays: null,
      sortOrder: payload.insertSortOrder,
    },
  ]);
}

export function getStageRowsProgressLabel(
  stageRows: ReadonlyArray<{ actualValue: string | null; label: string }>,
  closedAt: string | null,
  closedLabel: string,
): string {
  if (closedAt) {
    return closedLabel;
  }
  let latest:
    | {
        label: string;
        timestamp: number;
        order: number;
      }
    | null = null;
  for (const [index, row] of stageRows.entries()) {
    if (!row.actualValue) {
      continue;
    }
    const timestamp = Date.parse(`${row.actualValue.slice(0, 10)}T00:00:00`);
    if (Number.isNaN(timestamp)) {
      continue;
    }
    if (
      !latest
      || timestamp > latest.timestamp
      || (timestamp === latest.timestamp && index > latest.order)
    ) {
      latest = { label: row.label, timestamp, order: index };
    }
  }
  return latest?.label ?? stageRows[0]?.label ?? "Этап";
}

/**
 * Apply a stage date edit to whichever store owns the row: a fixed template field (via
 * `formKey`) or a user-created custom stage (via `customStageId`). Both queue pages repeated
 * this branching inline; keeping it here makes it testable and consistent.
 */
export function applyStageDateChange<Form extends Record<string, string>>(params: {
  formKey: string | null;
  customStageId: string | null;
  value: string;
  setForm: (updater: (current: Form) => Form) => void;
  setCustomStages: (updater: (current: ProcessCustomStage[]) => ProcessCustomStage[]) => void;
}): void {
  const { formKey, customStageId, value, setForm, setCustomStages } = params;
  if (formKey) {
    setForm((current) => ({ ...current, [formKey]: value }));
    return;
  }
  if (!customStageId) {
    return;
  }
  setCustomStages((current) =>
    current.map((stage) =>
      stage.id === customStageId ? { ...stage, date: value.trim() ? value : null } : stage,
    ),
  );
}
