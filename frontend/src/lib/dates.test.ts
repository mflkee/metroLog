import { formatDateRu, formatDateTimeRu } from "@/lib/dates";

describe("formatDateRu", () => {
  it("renders a date-only ISO value as dd.mm.yyyy without shifting the day", () => {
    expect(formatDateRu("2026-12-22")).toBe("22.12.2026");
    expect(formatDateRu("2026-01-05")).toBe("05.01.2026");
  });

  it("keeps the calendar day for a timestamp too", () => {
    expect(formatDateRu("2026-12-22T18:30:00Z")).toBe("22.12.2026");
  });

  it("falls back to a dash for empty values and keeps unparsable input", () => {
    expect(formatDateRu(null)).toBe("—");
    expect(formatDateRu(undefined)).toBe("—");
    expect(formatDateRu("не дата")).toBe("не дата");
  });
});

describe("formatDateTimeRu", () => {
  it("renders dd.mm.yyyy HH:MM", () => {
    expect(formatDateTimeRu("2026-12-22T18:30:00")).toMatch(/^22\.12\.2026 \d{2}:\d{2}$/);
  });

  it("falls back to a dash for empty values", () => {
    expect(formatDateTimeRu(null)).toBe("—");
  });
});
