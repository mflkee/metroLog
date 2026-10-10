import { numericInputValue, sanitizeNumericInput } from "@/lib/numericInput";

describe("sanitizeNumericInput", () => {
  it("keeps digits and drops everything else", () => {
    expect(sanitizeNumericInput("2024")).toBe("2024");
    expect(sanitizeNumericInput("2о24")).toBe("224");
    expect(sanitizeNumericInput("год 2024")).toBe("2024");
    expect(sanitizeNumericInput("")).toBe("");
  });

  it("drops what a browser number field would accept", () => {
    expect(sanitizeNumericInput("2e4")).toBe("24");
    expect(sanitizeNumericInput("+12")).toBe("12");
    expect(sanitizeNumericInput("-5")).toBe("5");
    expect(sanitizeNumericInput("1 000")).toBe("1000");
  });

  it("truncates to maxLength, so a pasted year cannot grow", () => {
    expect(sanitizeNumericInput("20240", { maxLength: 4 })).toBe("2024");
    expect(sanitizeNumericInput("2024", { maxLength: 4 })).toBe("2024");
  });

  it("keeps one separator when decimals are allowed", () => {
    expect(sanitizeNumericInput("1.25", { allowDecimal: true })).toBe("1.25");
    expect(sanitizeNumericInput("1,25", { allowDecimal: true })).toBe("1.25");
    expect(sanitizeNumericInput("1.2.3", { allowDecimal: true })).toBe("1.23");
    expect(sanitizeNumericInput("1.25")).toBe("125");
  });

  it("keeps only a leading minus when negatives are allowed", () => {
    expect(sanitizeNumericInput("-12", { allowNegative: true })).toBe("-12");
    expect(sanitizeNumericInput("1-2", { allowNegative: true })).toBe("12");
    expect(sanitizeNumericInput("-1-2", { allowNegative: true })).toBe("-12");
  });
});

describe("numericInputValue", () => {
  it("shows an absent value as an empty field", () => {
    expect(numericInputValue(null)).toBe("");
    expect(numericInputValue(undefined)).toBe("");
  });

  it("shows a stored number as it is", () => {
    expect(numericInputValue(0)).toBe("0");
    expect(numericInputValue(365)).toBe("365");
  });
});
