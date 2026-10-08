import { fireEvent, render, screen } from "@testing-library/react";

import { AppDialog } from "@/components/ui/app-dialog";

function renderDialog() {
  const onClose = vi.fn();
  render(
    <AppDialog title="Новая задача" description="Проверка контракта" open onClose={onClose}>
      <input aria-label="Название" defaultValue="черновик" />
    </AppDialog>,
  );
  return onClose;
}

describe("AppDialog dismissal contract", () => {
  it("keeps the dialog open and the content intact on a backdrop click", () => {
    const onClose = renderDialog();

    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Название")).toHaveValue("черновик");
  });

  it("closes through the explicit close control", () => {
    const onClose = renderDialog();

    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on the Escape key", () => {
    const onClose = renderDialog();

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
