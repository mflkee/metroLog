import { type ReactNode } from "react";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";

import { DashboardWidgetShell } from "@/components/dashboard/DashboardWidgetShell";
import { SortableDashboardWidget } from "@/components/dashboard/SortableDashboardWidget";
import type {
  DashboardWidgetKey,
  DashboardWidgetPlan,
  DashboardWidgetSize,
} from "@/lib/dashboard";

type DashboardWidgetGridProps = {
  plan: DashboardWidgetPlan[];
  editing: boolean;
  /** Dragging needs the multi-column grid, so a narrow viewport never enables it. */
  dragEnabled: boolean;
  onReorder: (activeKey: DashboardWidgetKey, overKey: DashboardWidgetKey) => void;
  onSizeChange: (key: DashboardWidgetKey, size: DashboardWidgetSize) => void;
  onToggleCollapsed: (key: DashboardWidgetKey) => void;
  renderBody: (key: DashboardWidgetKey, size: DashboardWidgetSize) => ReactNode;
};

/**
 * The dashboard grid: the arranged modules, in order, each in its width preset. Dragging is wired
 * only while editing, so a reader never pays for the drag context.
 */
export function DashboardWidgetGrid({
  plan,
  editing,
  dragEnabled,
  onReorder,
  onSizeChange,
  onToggleCollapsed,
  renderBody,
}: DashboardWidgetGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    onReorder(active.id as DashboardWidgetKey, over.id as DashboardWidgetKey);
  }

  if (!editing) {
    return (
      <div className="grid gap-4 xl:grid-cols-12">
        {plan.map((entry) => (
          <div key={entry.key} className={`${entry.spanClass} min-h-0`}>
            <DashboardWidgetShell
              collapsed={entry.collapsed}
              dragEnabled={false}
              editing={false}
              size={entry.size}
              title={entry.title}
              onToggleCollapsed={() => onToggleCollapsed(entry.key)}
            >
              {renderBody(entry.key, entry.size)}
            </DashboardWidgetShell>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-12">
      <DndContext collisionDetection={closestCenter} sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={plan.map((entry) => entry.key)} strategy={rectSortingStrategy}>
          {plan.map((entry) => (
            <SortableDashboardWidget
              key={entry.key}
              collapsed={entry.collapsed}
              dragEnabled={dragEnabled}
              editing
              size={entry.size}
              spanClass={entry.spanClass}
              title={entry.title}
              widgetKey={entry.key}
              onSizeChange={(size) => onSizeChange(entry.key, size)}
              onToggleCollapsed={() => onToggleCollapsed(entry.key)}
            >
              {renderBody(entry.key, entry.size)}
            </SortableDashboardWidget>
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
