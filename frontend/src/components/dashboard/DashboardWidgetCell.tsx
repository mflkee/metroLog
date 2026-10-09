import { type ReactNode } from "react";

import { useDraggable } from "@dnd-kit/core";

import { DashboardWidgetShell } from "@/components/dashboard/DashboardWidgetShell";
import type { DashboardWidgetKey, DashboardWidgetSize } from "@/lib/dashboard";

type DashboardWidgetCellProps = {
  widgetKey: DashboardWidgetKey;
  spanClass: string;
  title: string;
  size: DashboardWidgetSize;
  collapsed: boolean;
  editing: boolean;
  dragEnabled: boolean;
  /** While this module is the one being dragged the cell becomes the dashed landing slot. */
  dragging: boolean;
  /** Height the cell had when the drag started, so the empty slot keeps its size. */
  placeholderHeight: number | null;
  onSizeChange: (size: DashboardWidgetSize) => void;
  onToggleCollapsed: () => void;
  onHandleKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  children: ReactNode;
};

/**
 * One cell of the dashboard grid. The cell itself carries the width preset and stays in the flow —
 * that is the dashed slot the module will land in; the module that follows the pointer is rendered
 * by the grid's overlay, so this cell is empty while it is dragged.
 */
export function DashboardWidgetCell({
  widgetKey,
  spanClass,
  dragging,
  placeholderHeight,
  children,
  ...shellProps
}: DashboardWidgetCellProps) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef } = useDraggable({
    id: widgetKey,
    disabled: !shellProps.dragEnabled,
  });

  if (dragging) {
    return (
      <div
        ref={setNodeRef}
        className={`${spanClass} min-h-0 transition-transform duration-200`}
        data-drag-key={widgetKey}
        data-flip-key={widgetKey}
        style={placeholderHeight ? { height: placeholderHeight } : undefined}
      >
        <div className="h-full min-h-24 rounded-3xl border-2 border-dashed border-line bg-[var(--accent-soft)]/25" />
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`${spanClass} min-h-0 transition-transform duration-200`}
      data-drag-key={widgetKey}
      data-flip-key={widgetKey}
    >
      <DashboardWidgetShell
        {...shellProps}
        dragHandle={{ attributes, listeners, setActivatorNodeRef }}
      >
        {children}
      </DashboardWidgetShell>
    </div>
  );
}
