import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DateInput } from "@/components/DateInput";

function ControlledDateInput({ onValueChange }: { onValueChange: (value: string) => void }) {
  const [value, setValue] = useState("");

  return (
    <DateInput
      value={value}
      onChange={(nextValue) => {
        setValue(nextValue);
        onValueChange(nextValue);
      }}
    />
  );
}

describe("DateInput", () => {
  it("formats pasted or typed digits as dd.mm.yyyy", () => {
    const handleValueChange = vi.fn();
    render(<ControlledDateInput onValueChange={handleValueChange} />);

    const input = screen.getByPlaceholderText("дд.мм.гггг");
    fireEvent.change(input, { target: { value: "01052026" } });

    expect(input).toHaveValue("01.05.2026");
    expect(handleValueChange).toHaveBeenLastCalledWith("2026-05-01");
  });

  it("continues year input after an auto-inserted month separator", () => {
    const handleValueChange = vi.fn();
    render(<ControlledDateInput onValueChange={handleValueChange} />);

    const input = screen.getByPlaceholderText("дд.мм.гггг");
    fireEvent.change(input, { target: { value: "0105" } });
    expect(input).toHaveValue("01.05");

    fireEvent.change(input, { target: { value: "01.052" } });
    expect(input).toHaveValue("01.05.2");

    fireEvent.change(input, { target: { value: "01.05.2026" } });
    expect(input).toHaveValue("01.05.2026");
    expect(handleValueChange).toHaveBeenLastCalledWith("2026-05-01");
  });
});
