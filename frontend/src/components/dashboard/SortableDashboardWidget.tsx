import { type ReactNode } from "react";

import { useSortable } from "@dnd-kit/sortable";

import { DashboardWidgetShell } from "@/components/dashboard/DashboardWidgetShell";
import { dragTransformStyle } from "@/lib/dragTransform";
import type { DashboardWidgetKey, DashboardWidgetSize } from "@/lib/dashboard";

type SortableDashboardWidgetProps = {
  widgetKey: DashboardWidgetKey;
  spanClass: string;
  title: string;
  size: DashboardWidgetSize;
  collapsed: boolean;
  editing: boolean;
  dragEnabled: boolean;
  onSizeChange: (size: DashboardWidgetSize) => void;
  onToggleCollapsed: () => void;
  children: ReactNode;
};

/**
 * A dashboard module that can be dragged to another position. The grid cell carries the width
 * preset and the drag transform; the shell renders the card itself.
 */
export function SortableDashboardWidget({
  widgetKey,
  spanClass,
  dragEnabled,
  ...shellProps
}: SortableDashboardWidgetProps) {
  const { attributes, isDragging, listeners, setActivatorNodeRef, setNodeRef, transform, transition } =
    useSortable({ id: widgetKey, disabled: !dragEnabled });

  return (
    <div
      ref={setNodeRef}
      className={[spanClass, "min-h-0", isDragging ? "z-10 opacity-80" : ""].filter(Boolean).join(" ")}
      style={{ ...dragTransformStyle(transform), transition }}
    >
      <DashboardWidgetShell
        {...shellProps}
        dragEnabled={dragEnabled}
        dragHandle={{ attributes, listeners, setActivatorNodeRef }}
      />
    </div>
  );
}
