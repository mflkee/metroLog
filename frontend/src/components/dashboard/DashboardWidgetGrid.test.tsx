import { render, screen } from "@testing-library/react";

import { DashboardWidgetGrid } from "@/components/dashboard/DashboardWidgetGrid";
import {
  buildDashboardPlan,
  defaultDashboardLayout,
  defaultDashboardWidgetOrder,
  normalizeDashboardLayout,
} from "@/lib/dashboard";

const PLAN = buildDashboardPlan(
  normalizeDashboardLayout([
    { key: "verification_expiry", size: "half", collapsed: false },
    { key: "summary_cards", size: "full", collapsed: true },
    { key: "status_distribution", size: "third", collapsed: false },
  ]),
  ["summary_cards", "status_distribution", "verification_expiry"],
);

const NOOP = () => undefined;

describe("DashboardWidgetGrid", () => {
  it("renders the arranged modules in order with their width preset", () => {
    const { container } = render(
      <DashboardWidgetGrid
        dragEnabled={false}
        editing={false}
        plan={PLAN}
        renderBody={(key) => <p>{`тело ${key}`}</p>}
        onReorderLive={NOOP}
        onReorderCommit={NOOP}
        onSizeChange={NOOP}
        onToggleCollapsed={NOOP}
      />,
    );

    const cells = Array.from(container.querySelectorAll<HTMLDivElement>(".grid > div"));
    expect(cells.map((cell) => cell.className)).toEqual([
      "xl:col-span-6 min-h-0 transition-transform duration-200",
      "xl:col-span-12 min-h-0 transition-transform duration-200",
      "xl:col-span-4 min-h-0 transition-transform duration-200",
    ]);
    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "Ближайшие сроки контроля",
      "Сводка",
      "Статусы оборудования",
    ]);
    // A collapsed module keeps its title and hides its body.
    expect(screen.queryByText("тело summary_cards")).not.toBeInTheDocument();
    expect(screen.getByText("тело verification_expiry")).toBeInTheDocument();
  });

  it("does not offer dragging when the drag is not enabled", () => {
    render(
      <DashboardWidgetGrid
        dragEnabled={false}
        editing
        plan={PLAN}
        renderBody={(key) => <p>{`тело ${key}`}</p>}
        onReorderLive={NOOP}
        onReorderCommit={NOOP}
        onSizeChange={NOOP}
        onToggleCollapsed={NOOP}
      />,
    );

    expect(screen.queryByRole("button", { name: /Перетащить модуль/ })).not.toBeInTheDocument();
    // Editing still offers the width control.
    expect(screen.getAllByRole("group")).toHaveLength(PLAN.length);
  });

  it("renders the default arrangement with the widths the dashboard used before", () => {
    const { container } = render(
      <DashboardWidgetGrid
        dragEnabled={false}
        editing={false}
        plan={buildDashboardPlan(defaultDashboardLayout, defaultDashboardWidgetOrder)}
        renderBody={(key) => <p>{`тело ${key}`}</p>}
        onReorderLive={NOOP}
        onReorderCommit={NOOP}
        onSizeChange={NOOP}
        onToggleCollapsed={NOOP}
      />,
    );

    const cells = Array.from(container.querySelectorAll<HTMLDivElement>(".grid > div"));
    expect(cells.map((cell) => cell.className)).toEqual([
      "xl:col-span-12 min-h-0 transition-transform duration-200",
      "xl:col-span-12 min-h-0 transition-transform duration-200",
      "xl:col-span-6 min-h-0 transition-transform duration-200",
      "xl:col-span-6 min-h-0 transition-transform duration-200",
      "xl:col-span-6 min-h-0 transition-transform duration-200",
      "xl:col-span-6 min-h-0 transition-transform duration-200",
      "xl:col-span-6 min-h-0 transition-transform duration-200",
      "xl:col-span-6 min-h-0 transition-transform duration-200",
      "xl:col-span-12 min-h-0 transition-transform duration-200",
    ]);
    // The default tiles the twelve-column grid without leaving a gap.
    const spans = cells.map((cell) => Number(cell.className.match(/col-span-(\d+)/)?.[1] ?? 0));
    expect(spans.reduce((sum, span) => sum + span, 0)).toBe(72);
  });
});
