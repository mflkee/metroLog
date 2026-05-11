import { describe, expect, it } from "vitest";

import { getVerificationProgressLabel, type EquipmentVerification } from "@/api/equipment";

const baseVerification: Pick<
  EquipmentVerification,
  | "stageTemplate"
  | "sentToVerificationAt"
  | "receivedAtDestinationAt"
  | "handedToCsmAt"
  | "verificationCompletedAt"
  | "pickedUpFromCsmAt"
  | "shippedBackAt"
  | "returnedFromVerificationAt"
  | "customStages"
  | "closedAt"
> = {
  stageTemplate: [
    {
      key: "sent_to_verification_at",
      label: "Демонтаж",
      enabled: true,
      required: true,
    },
    {
      key: "shipped_back_at",
      label: "Отправлено обратно",
      enabled: true,
      required: false,
    },
    {
      key: "returned_from_verification_at",
      label: "Монтаж",
      enabled: true,
      required: true,
    },
  ],
  sentToVerificationAt: "2026-05-01",
  receivedAtDestinationAt: null,
  handedToCsmAt: null,
  verificationCompletedAt: null,
  pickedUpFromCsmAt: null,
  shippedBackAt: null,
  returnedFromVerificationAt: null,
  customStages: [],
  closedAt: null,
};

describe("getVerificationProgressLabel", () => {
  it("uses the latest entered date instead of the last template row", () => {
    expect(
      getVerificationProgressLabel({
        ...baseVerification,
        shippedBackAt: "2026-05-04",
        returnedFromVerificationAt: "2026-05-03",
      }),
    ).toBe("Отправлено обратно");
  });

  it("includes custom stages in progress calculation", () => {
    expect(
      getVerificationProgressLabel({
        ...baseVerification,
        shippedBackAt: "2026-05-04",
        customStages: [
          {
            id: "custom-stage",
            afterKey: "sent_to_verification_at",
            label: "Внутренний контроль",
            date: "2026-05-05",
            deadlineDays: null,
            sortOrder: 0,
          },
        ],
      }),
    ).toBe("Внутренний контроль");
  });
});
