import type { ArshinVriDetail } from "@/api/arshin";
import { extractEsiInternalModuleCandidates } from "@/lib/esiModules";

describe("extractEsiInternalModuleCandidates", () => {
  it("keeps related ESI profiles even when a verification record is missing", () => {
    const detail = {
      vriId: "1-415504034",
      organization: 'ФБУ "КАЛУЖСКИЙ ЦСМ"',
      regNumber: "73828-19",
      typeDesignation: "ЭЛМЕТРО-Паскаль-03, Паскаль-03",
      typeName: "Калибраторы многофункциональные",
      modification: "ЭЛМЕТРО-Паскаль-03-0,005",
      serialNumber: "0414",
      manufactureYear: 2024,
      ownerName: 'ООО "МКАИР"',
      verificationMarkCipher: null,
      verificationType: "Периодическая",
      verificationDate: "04.03.2025",
      validUntil: "03.03.2026",
      documentTitle: "Методика поверки",
      isUsable: true,
      passportMark: false,
      deviceMark: false,
      reducedScope: false,
      etalonLines: [],
      meansLines: [],
      certificateNumber: "С-ГА/04-03-2025/415504034",
      arshinUrl: "https://fgis.gost.ru/fundmetrology/cm/etalons/1262789",
      rawPayloadJson: {
        number: "73828.19.3Р.01262789",
        metrolog_related_esi_profiles: [
          {
            number: "73828.19.3Р.01262789",
            rankcode: "3Р",
            rankclass: "Эталон 3-го разряда",
            mitype: "Калибраторы многофункциональные",
            modification: "ЭЛМЕТРО-Паскаль-03-0,005",
            factory_num: "0414",
            year: 2024,
            verification_date: "04.03.2025",
            valid_date: "03.03.2026",
            selected: true,
          },
          {
            number: "73828.19.1Р.01262800",
            rankcode: "1Р",
            rankclass: "Эталон 1-го разряда",
            mitype: "Калибраторы многофункциональные",
            modification: "нет модификации",
            factory_num: "0414",
            year: 2024,
            verification_date: "04.03.2025",
            valid_date: "03.03.2026",
            selected: false,
          },
        ],
        metrolog_related_esi_verification_records: [
          {
            eta_number: "73828.19.3Р.01262789",
            certificate_number: "С-ГА/04-03-2025/415504034",
            verification_date: "04.03.2025",
            valid_date: "03.03.2026",
          },
        ],
      },
    } as ArshinVriDetail;

    const rows = extractEsiInternalModuleCandidates(detail);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.registryNumber)).toEqual([
      "73828.19.3Р.01262789",
      "73828.19.1Р.01262800",
    ]);
    expect(rows[1]?.certificateNumber).toBeNull();
    expect(rows[1]?.verificationDate).toBe("04.03.2025");
  });
});
