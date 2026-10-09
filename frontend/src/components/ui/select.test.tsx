import { fireEvent, render, screen } from "@testing-library/react";

import { Select } from "@/components/ui/select";

const OPTIONS = [
  { value: "ALL", label: "Все" },
  { value: "SI", label: "СИ" },
  { value: "ESI", label: "ЭСИ" },
];

describe("Select", () => {
  it("shows the current choice and opens the app's own list", () => {
    render(<Select options={OPTIONS} value="SI" onChange={() => undefined} />);

    expect(screen.getByRole("combobox")).toHaveTextContent("СИ");

    fireEvent.click(screen.getByRole("combobox"));

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Все",
      "СИ",
      "ЭСИ",
    ]);
    expect(screen.getByRole("option", { name: "СИ" })).toHaveAttribute("aria-selected", "true");
  });

  it("reports the chosen value and closes", () => {
    const onChange = vi.fn();
    render(<Select options={OPTIONS} value="ALL" onChange={onChange} />);

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "ЭСИ" }));

    expect(onChange).toHaveBeenCalledWith("ESI");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("is operable from the keyboard", () => {
    const onChange = vi.fn();
    render(<Select options={OPTIONS} value="ALL" onChange={onChange} />);

    const trigger = screen.getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.keyDown(trigger, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("SI");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes on Escape without choosing", () => {
    const onChange = vi.fn();
    render(<Select options={OPTIONS} value="ALL" onChange={onChange} />);

    const trigger = screen.getByRole("combobox");
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: "Escape" });

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
