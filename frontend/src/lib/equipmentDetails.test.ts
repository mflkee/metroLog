import { describe, expect, it } from "vitest";

import { findVerificationInstrumentMismatch } from "@/lib/equipmentDetails";

describe("findVerificationInstrumentMismatch", () => {
  it("предупреждает, когда свидетельство принадлежит другому прибору", () => {
    // Живой случай: карточка «Измеритель влажности ИВТМ-7М», а в поверке — манометр.
    const warning = findVerificationInstrumentMismatch({
      equipmentName: "Измеритель влажности и температуры",
      equipmentModification: "ИВТМ-7М",
      certificateRegistryNumber: "1844-63",
      certificateTypeName: "Манометры, вакуумметры, мановакуумметры для точных измерений",
      certificateModification: null,
    });

    expect(warning).toContain("другого прибора");
    expect(warning).toContain("1844-63");
  });

  it("молчит, когда модификация в свидетельстве совпадает с карточкой", () => {
    // Тот же короткий зав. №, но прибор опознан по модификации: карточка «Анализатор МКУ».
    const warning = findVerificationInstrumentMismatch({
      equipmentName: "Анализатор",
      equipmentModification: "МКУ",
      certificateRegistryNumber: "56431-14",
      certificateTypeName: "Манометры, вакуумметры и мановакуумметры",
      certificateModification: "МКУ",
    });

    expect(warning).toBeNull();
  });

  it("молчит на верной поверке весов", () => {
    const warning = findVerificationInstrumentMismatch({
      equipmentName: "Весы неавтоматического действия",
      equipmentModification: "GH-252",
      certificateRegistryNumber: "58669-14",
      certificateTypeName: "Весы неавтоматического действия",
      certificateModification: "GH-252",
    });

    expect(warning).toBeNull();
  });

  it("сравнивает по основе слова, а не по окончанию", () => {
    const warning = findVerificationInstrumentMismatch({
      equipmentName: "Весы лабораторные",
      equipmentModification: "ВЛА-225М",
      certificateRegistryNumber: "73040-18",
      certificateTypeName: "Весы лабораторные",
      certificateModification: "N372039",
    });

    expect(warning).toBeNull();
  });

  it("ничего не говорит, когда в свидетельстве нет данных о приборе", () => {
    const warning = findVerificationInstrumentMismatch({
      equipmentName: "Весы лабораторные",
      equipmentModification: "ВЛА-225М",
      certificateRegistryNumber: null,
      certificateTypeName: null,
      certificateModification: null,
    });

    expect(warning).toBeNull();
  });
});
