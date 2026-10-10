import { type ReactNode } from "react";

import type { DraggableAttributes, DraggableSyntheticListeners } from "@dnd-kit/core";

import { type DashboardWidgetSize, dashboardWidgetSizeLabels } from "@/lib/dashboard";

const SIZE_ORDER: DashboardWidgetSize[] = ["third", "half", "full"];

const SIZE_SHORT_LABELS: Record<DashboardWidgetSize, string> = {
  third: "1/3",
  half: "1/2",
  full: "1/1",
};

export type DashboardWidgetDragHandle = {
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  setActivatorNodeRef: (node: HTMLElement | null) => void;
};

type DashboardWidgetShellProps = {
  title: string;
  size: DashboardWidgetSize;
  collapsed: boolean;
  editing: boolean;
  /** Dragging is offered only in edit mode on a wide screen; the handle follows that rule. */
  dragEnabled: boolean;
  dragHandle?: DashboardWidgetDragHandle;
  onSizeChange?: (size: DashboardWidgetSize) => void;
  onToggleCollapsed: () => void;
  /** Arrow keys move the module, so it can be arranged without a pointer. */
  onHandleKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
  children: ReactNode;
};

/**
 * One dashboard module: a title row, the width control while editing, a collapse control, and the
 * body. Outside edit mode it looks exactly like the plain cards the dashboard used to render.
 */
export function DashboardWidgetShell({
  title,
  size,
  collapsed,
  editing,
  dragEnabled,
  dragHandle,
  onSizeChange,
  onToggleCollapsed,
  onHandleKeyDown,
  children,
}: DashboardWidgetShellProps) {
  return (
    <article className="tone-parent flex h-full min-h-0 flex-col rounded-3xl border border-line px-5 py-4 shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {dragEnabled ? (
            <button
              ref={dragHandle?.setActivatorNodeRef}
              aria-label={`Перетащить модуль «${title}»`}
              className="tone-child -ml-1 inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-lg border border-line text-steel active:cursor-grabbing"
              type="button"
              {...dragHandle?.attributes}
              {...dragHandle?.listeners}
              onKeyDown={onHandleKeyDown}
            >
              <svg
                aria-hidden="true"
                className="h-4 w-4"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <circle cx="7.5" cy="4.5" r="1.4" />
                <circle cx="12.5" cy="4.5" r="1.4" />
                <circle cx="7.5" cy="10" r="1.4" />
                <circle cx="12.5" cy="10" r="1.4" />
                <circle cx="7.5" cy="15.5" r="1.4" />
                <circle cx="12.5" cy="15.5" r="1.4" />
              </svg>
            </button>
          ) : null}
          <h2 className="min-w-0 truncate text-base font-semibold text-ink">{title}</h2>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {editing && onSizeChange ? (
            <div
              aria-label={`Ширина модуля «${title}»`}
              className="tone-child inline-flex items-center rounded-lg border border-line p-0.5"
              role="group"
            >
              {SIZE_ORDER.map((value) => (
                <button
                  key={value}
                  aria-label={dashboardWidgetSizeLabels[value]}
                  aria-pressed={size === value}
                  className={[
                    "rounded-md px-2 py-1 text-[11px] font-semibold transition",
                    size === value ? "bg-[var(--accent-soft)] text-ink" : "text-steel hover:text-ink",
                  ].join(" ")}
                  title={dashboardWidgetSizeLabels[value]}
                  type="button"
                  onClick={() => onSizeChange(value)}
                >
                  {SIZE_SHORT_LABELS[value]}
                </button>
              ))}
            </div>
          ) : null}

          <button
            aria-expanded={!collapsed}
            aria-label={collapsed ? `Развернуть модуль «${title}»` : `Свернуть модуль «${title}»`}
            className="tone-child inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-line text-steel transition hover:text-ink"
            type="button"
            onClick={onToggleCollapsed}
          >
            <svg
              aria-hidden="true"
              className={["h-4 w-4 transition-transform", collapsed ? "" : "rotate-180"].join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {collapsed ? null : (
        <div
          className={[
            "mt-4 min-h-0 flex-1 @container",
            editing ? "pointer-events-none select-none" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          data-testid="dashboard-widget-body"
        >
          {children}
        </div>
      )}
    </article>
  );
}
