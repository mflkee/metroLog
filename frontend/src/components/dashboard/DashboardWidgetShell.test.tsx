import { render, screen } from "@testing-library/react";

import { DashboardWidgetShell } from "@/components/dashboard/DashboardWidgetShell";

describe("DashboardWidgetShell", () => {
  it("shows the title and the body outside edit mode, without arrangement controls", () => {
    render(
      <DashboardWidgetShell
        collapsed={false}
        dragEnabled={false}
        editing={false}
        size="half"
        title="Ближайшие сроки контроля"
        onToggleCollapsed={() => undefined}
      >
        <p>Содержимое модуля</p>
      </DashboardWidgetShell>,
    );

    expect(screen.getByRole("heading", { name: "Ближайшие сроки контроля" })).toBeInTheDocument();
    expect(screen.getByText("Содержимое модуля")).toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Перетащить модуль/ })).not.toBeInTheDocument();
  });

  it("offers the width presets and the drag handle only in edit mode", () => {
    const onSizeChange = vi.fn();
    render(
      <DashboardWidgetShell
        collapsed={false}
        dragEnabled
        editing
        size="half"
        title="Количество приборов"
        onSizeChange={onSizeChange}
        onToggleCollapsed={() => undefined}
      >
        <p>Содержимое модуля</p>
      </DashboardWidgetShell>,
    );

    expect(screen.getByRole("button", { name: "Перетащить модуль «Количество приборов»" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Половина" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("dashboard-widget-body").className).toContain("pointer-events-none");

    screen.getByRole("button", { name: "Во всю ширину" }).click();
    expect(onSizeChange).toHaveBeenCalledWith("full");
  });

  it("collapses to the title and expands again", () => {
    const onToggleCollapsed = vi.fn();
    render(
      <DashboardWidgetShell
        collapsed
        dragEnabled={false}
        editing={false}
        size="full"
        title="Мои задачи"
        onToggleCollapsed={onToggleCollapsed}
      >
        <p>Содержимое модуля</p>
      </DashboardWidgetShell>,
    );

    expect(screen.getByRole("heading", { name: "Мои задачи" })).toBeInTheDocument();
    expect(screen.queryByText("Содержимое модуля")).not.toBeInTheDocument();

    const expand = screen.getByRole("button", { name: "Развернуть модуль «Мои задачи»" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expand.click();
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });
});
