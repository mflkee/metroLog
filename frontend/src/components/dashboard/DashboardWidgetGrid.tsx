import { type ReactNode, useRef } from "react";

import { closestCenter, DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";

import { DashboardWidgetCell } from "@/components/dashboard/DashboardWidgetCell";
import { DashboardWidgetShell } from "@/components/dashboard/DashboardWidgetShell";
import type { DashboardWidgetKey, DashboardWidgetPlan, DashboardWidgetSize } from "@/lib/dashboard";
import { useDragReorder } from "@/lib/useDragReorder";

type DashboardWidgetGridProps = {
  plan: DashboardWidgetPlan[];
  editing: boolean;
  /** Dragging needs the multi-column grid, so a narrow viewport never enables it. */
  dragEnabled: boolean;
  /** Live order while dragging: render it, do not save it yet. */
  onReorderLive: (order: DashboardWidgetKey[]) => void;
  /** Called once on drop, only when the order really changed. */
  onReorderCommit: () => void;
  onSizeChange: (key: DashboardWidgetKey, size: DashboardWidgetSize) => void;
  onToggleCollapsed: (key: DashboardWidgetKey) => void;
  renderBody: (key: DashboardWidgetKey, size: DashboardWidgetSize) => ReactNode;
};

/**
 * The dashboard grid: the arranged modules, in order, each in its width preset.
 *
 * Reordering changes the rendered order while the user drags, so the grid lays the modules out for
 * real and the neighbours glide to their new slots (FLIP). The dragged module is drawn by the
 * overlay and its cell stays behind as the dashed landing slot — no transform has to guess at the
 * size of another module's slot, which is what broke a grid of mixed widths before.
 */
export function DashboardWidgetGrid({
  plan,
  editing,
  dragEnabled,
  onReorderLive,
  onReorderCommit,
  onSizeChange,
  onToggleCollapsed,
  renderBody,
}: DashboardWidgetGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useDragReorder<DashboardWidgetKey>({
    order: plan.map((entry) => entry.key),
    containerRef,
    onChange: onReorderLive,
    onCommit: () => onReorderCommit(),
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const active = plan.find((entry) => entry.key === drag.activeKey) ?? null;
  const placeholderHeight = drag.activeRect
    ? Math.round(drag.activeRect.bottom - drag.activeRect.top)
    : null;

  function handleKeyDown(key: DashboardWidgetKey) {
    return (event: React.KeyboardEvent<HTMLElement>) => {
      const delta =
        event.key === "ArrowDown" || event.key === "ArrowRight"
          ? 1
          : event.key === "ArrowUp" || event.key === "ArrowLeft"
            ? -1
            : 0;
      if (!delta) {
        return;
      }
      event.preventDefault();
      drag.moveKeyBy(key, delta);
    };
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      sensors={sensors}
      onDragCancel={drag.handleDragCancel}
      onDragEnd={drag.handleDragEnd}
      onDragMove={drag.handleDragMove}
      onDragStart={drag.handleDragStart}
    >
      <div className="grid gap-4 xl:grid-cols-12" ref={containerRef}>
        {plan.map((entry) => (
          <DashboardWidgetCell
            key={entry.key}
            collapsed={entry.collapsed}
            dragEnabled={dragEnabled}
            dragging={entry.key === drag.activeKey}
            editing={editing}
            placeholderHeight={placeholderHeight}
            size={entry.size}
            spanClass={entry.spanClass}
            title={entry.title}
            widgetKey={entry.key}
            onHandleKeyDown={handleKeyDown(entry.key)}
            onSizeChange={(size) => onSizeChange(entry.key, size)}
            onToggleCollapsed={() => onToggleCollapsed(entry.key)}
          >
            {renderBody(entry.key, entry.size)}
          </DashboardWidgetCell>
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {active ? (
          <DashboardWidgetShell
            collapsed={active.collapsed}
            dragEnabled={false}
            editing={false}
            size={active.size}
            title={active.title}
            onToggleCollapsed={() => undefined}
          >
            {renderBody(active.key, active.size)}
          </DashboardWidgetShell>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
