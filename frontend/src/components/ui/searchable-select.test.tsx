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

describe("SearchableSelect search", () => {
  const EQUIPMENT = [
    { value: 1, label: "Анализатор Влажности" },
    { value: 2, label: "Ёмкость мерная" },
    { value: 3, label: "Весы лабораторные" },
  ];

  function openWith(query: string) {
    render(<SearchableSelect onChange={vi.fn()} options={EQUIPMENT} value={null} />);
    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: query } });
  }

  it("finds an option when the words are typed in another order", () => {
    openWith("влажности анализатор");

    expect(screen.getByRole("option", { name: "Анализатор Влажности" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Весы лабораторные" })).not.toBeInTheDocument();
  });

  it("ignores case and ё", () => {
    openWith("емкость");

    expect(screen.getByRole("option", { name: "Ёмкость мерная" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Анализатор Влажности" })).not.toBeInTheDocument();
  });

  it("keeps every match when a word only matches one of them", () => {
    openWith("мерная ёмкость");

    expect(screen.getByRole("option", { name: "Ёмкость мерная" })).toBeInTheDocument();
  });
});

