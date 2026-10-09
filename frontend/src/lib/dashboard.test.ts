import { isCheckExpired, isDatePast } from "@/lib/dashboard";

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
