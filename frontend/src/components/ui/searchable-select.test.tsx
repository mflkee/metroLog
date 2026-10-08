import { fireEvent, render, screen } from "@testing-library/react";

import { SearchableMultiSelect, SearchableSelect } from "@/components/ui/searchable-select";

const OPTIONS = [
  { value: 1, label: "Иванов Иван" },
  { value: 2, label: "Петров Пётр" },
  { value: 3, label: "Сидоров Сидор" },
];

describe("SearchableSelect", () => {
  it("filters the options by the typed query and selects one", () => {
    const onChange = vi.fn();
    render(<SearchableSelect onChange={onChange} options={OPTIONS} value={null} />);

    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "петр" } });

    expect(screen.getByRole("option", { name: "Петров Пётр" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Иванов Иван" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "Петров Пётр" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});

describe("SearchableMultiSelect", () => {
  it("renders one result per the cap, adds on click and removes through the chip", () => {
    const onChange = vi.fn();
    render(
      <SearchableMultiSelect maxResults={2} onChange={onChange} options={OPTIONS} value={[]} />,
    );

    fireEvent.focus(screen.getByRole("combobox"));

    expect(screen.getAllByRole("option")).toHaveLength(2);

    fireEvent.click(screen.getByRole("option", { name: "Иванов Иван" }));
    expect(onChange).toHaveBeenCalledWith([1]);
  });

  it("shows the selected entries as removable chips", () => {
    const onChange = vi.fn();
    render(<SearchableMultiSelect onChange={onChange} options={OPTIONS} value={[3]} />);

    const remove = screen.getByRole("button", { name: "Убрать Сидоров Сидор" });
    fireEvent.click(remove);

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
