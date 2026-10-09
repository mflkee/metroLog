import {
  buildDashboardPlan,
  dashboardSummaryColumnsClass,
  dashboardWidgetDefaultSizes,
  defaultDashboardLayout,
  defaultDashboardWidgetOrder,
  isCheckExpired,
  isDashboardDragEnabled,
  isDatePast,
  normalizeDashboardLayout,
  reorderDashboardLayout,
  updateDashboardWidget,
} from "@/lib/dashboard";

const TODAY = new Date("2026-10-09T12:00:00Z");

function siDevice(validDate: string | null, status = "IN_WORK") {
  return {
    equipmentType: "SI",
    complianceDate: null,
    complianceIntervalMonths: null,
    siVerification: validDate ? { validDate } : null,
    status,
  } as Parameters<typeof isCheckExpired>[0];
}

describe("isCheckExpired", () => {
  it("flags a device whose verification date has passed", () => {
    expect(isCheckExpired(siDevice("2026-09-30"), TODAY)).toBe(true);
  });

  it("leaves a device whose verification is still valid alone", () => {
    expect(isCheckExpired(siDevice("2026-12-31"), TODAY)).toBe(false);
  });

  it("ignores archived devices and devices without a date", () => {
    expect(isCheckExpired(siDevice("2026-09-30", "ARCHIVED"), TODAY)).toBe(false);
    expect(isCheckExpired(siDevice(null), TODAY)).toBe(false);
  });
});

describe("isDatePast", () => {
  it("is true only for dates already behind us", () => {
    expect(isDatePast("2026-09-30", TODAY)).toBe(true);
    expect(isDatePast("2026-12-31", TODAY)).toBe(false);
    expect(isDatePast(null, TODAY)).toBe(false);
    expect(isDatePast("не дата", TODAY)).toBe(false);
  });
});

describe("defaultDashboardLayout", () => {
  it("keeps the order and the widths the dashboard used before the arrangement was data", () => {
    expect(defaultDashboardLayout.map((entry) => entry.key)).toEqual(defaultDashboardWidgetOrder);
    expect(defaultDashboardLayout.map((entry) => entry.size)).toEqual(
      defaultDashboardWidgetOrder.map((key) => dashboardWidgetDefaultSizes[key]),
    );
    expect(defaultDashboardLayout.every((entry) => !entry.collapsed)).toBe(true);
  });
});

describe("normalizeDashboardLayout", () => {
  it("falls back to the default arrangement for an unreadable value", () => {
    expect(normalizeDashboardLayout(null)).toEqual(defaultDashboardLayout);
    expect(normalizeDashboardLayout("nonsense")).toEqual(defaultDashboardLayout);
    expect(normalizeDashboardLayout([null, 42, "top_locations"])).toEqual(defaultDashboardLayout);
  });

  it("drops unknown widgets, clamps the width and keeps one entry per widget", () => {
    expect(
      normalizeDashboardLayout([
        { key: "top_locations", size: "third", collapsed: true },
        { key: "removed_widget", size: "full", collapsed: false },
        { key: "top_locations", size: "full", collapsed: false },
        { key: "status_distribution", size: "enormous", collapsed: "yes" },
      ]),
    ).toEqual([
      { key: "top_locations", size: "third", collapsed: true },
      { key: "status_distribution", size: dashboardWidgetDefaultSizes.status_distribution, collapsed: true },
      ...defaultDashboardWidgetOrder
        .filter((key) => key !== "top_locations" && key !== "status_distribution")
        .map((key) => ({ key, size: dashboardWidgetDefaultSizes[key], collapsed: false })),
    ]);
  });

  it("appends a widget added by a later release at the end", () => {
    const withoutTasks = defaultDashboardLayout.filter((entry) => entry.key !== "my_tasks");
    const normalized = normalizeDashboardLayout(withoutTasks);

    expect(normalized.map((entry) => entry.key)).toEqual([
      ...defaultDashboardWidgetOrder.filter((key) => key !== "my_tasks"),
      "my_tasks",
    ]);
    expect(normalized[normalized.length - 1]).toEqual({
      key: "my_tasks",
      size: dashboardWidgetDefaultSizes.my_tasks,
      collapsed: false,
    });
  });
});

describe("reorderDashboardLayout", () => {
  it("moves a widget to another widget's position", () => {
    const reordered = reorderDashboardLayout(defaultDashboardLayout, "recent_events", "summary_cards");

    expect(reordered.map((entry) => entry.key).slice(0, 2)).toEqual(["recent_events", "summary_cards"]);
    expect(reordered).toHaveLength(defaultDashboardLayout.length);
  });

  it("keeps the arrangement when the move cannot be resolved", () => {
    expect(reorderDashboardLayout(defaultDashboardLayout, "summary_cards", "summary_cards")).toBe(
      defaultDashboardLayout,
    );
    expect(
      reorderDashboardLayout(defaultDashboardLayout, "summary_cards", "not_a_widget" as never),
    ).toBe(defaultDashboardLayout);
  });
});

describe("updateDashboardWidget", () => {
  it("changes only the addressed widget", () => {
    const resized = updateDashboardWidget(defaultDashboardLayout, "top_locations", { size: "full" });
    const collapsed = updateDashboardWidget(resized, "top_locations", { collapsed: true });

    expect(collapsed.find((entry) => entry.key === "top_locations")).toEqual({
      key: "top_locations",
      size: "full",
      collapsed: true,
    });
    expect(collapsed.filter((entry) => entry.key !== "top_locations")).toEqual(
      defaultDashboardLayout.filter((entry) => entry.key !== "top_locations"),
    );
  });
});

describe("buildDashboardPlan", () => {
  it("follows the arrangement and maps the width preset to a column span", () => {
    const layout = normalizeDashboardLayout([
      { key: "top_locations", size: "full", collapsed: true },
      { key: "summary_cards", size: "third", collapsed: false },
    ]);
    const plan = buildDashboardPlan(layout, ["top_locations", "summary_cards"]);

    expect(plan).toEqual([
      { key: "top_locations", title: "Количество приборов", size: "full", spanClass: "xl:col-span-12", collapsed: true },
      { key: "summary_cards", title: "Сводка", size: "third", spanClass: "xl:col-span-4", collapsed: false },
    ]);
  });

  it("hides a widget that is not visible right now but keeps its place in the arrangement", () => {
    const layout = normalizeDashboardLayout([
      { key: "recent_events", size: "half", collapsed: true },
      { key: "summary_cards", size: "third", collapsed: false },
    ]);

    expect(buildDashboardPlan(layout, ["summary_cards"]).map((entry) => entry.key)).toEqual([
      "summary_cards",
    ]);
    // The entry survives, so the widget returns in its own place rather than at the end.
    expect(layout[0]).toEqual({ key: "recent_events", size: "half", collapsed: true });
    expect(buildDashboardPlan(layout, ["summary_cards", "recent_events"])[0].key).toBe("recent_events");
  });
});

describe("isDashboardDragEnabled", () => {
  it("offers dragging only while editing on a wide screen", () => {
    expect(isDashboardDragEnabled(true, true)).toBe(true);
    expect(isDashboardDragEnabled(true, false)).toBe(false);
    expect(isDashboardDragEnabled(false, true)).toBe(false);
  });
});

describe("dashboardSummaryColumnsClass", () => {
  it("gives the summary strip fewer inner columns as the module narrows", () => {
    expect(dashboardSummaryColumnsClass.third).toBe("grid-cols-1");
    expect(dashboardSummaryColumnsClass.half).toContain("sm:grid-cols-2");
    expect(dashboardSummaryColumnsClass.half).not.toContain("xl:grid-cols-5");
    expect(dashboardSummaryColumnsClass.full).toContain("xl:grid-cols-5");
  });
});
