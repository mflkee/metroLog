import { getFirstString } from "./esiModules";
import { EquipmentType } from "@/api/equipment/registry";
import { EquipmentSIVerification } from "@/api/equipment/verifications";
import { ESIRelatedProfileRow, ESIRelatedVerificationRow } from "@/components/equipment-details/EsiSections";
import { SIReferenceTableRow } from "@/components/equipment-details/SiSections";
import { buildEtalonLines, buildEtalonTableRows, buildFallbackLine, buildSemicolonLine, buildVerificationMeansTableRows, formatBooleanLabel, formatSIReferenceRank, getNestedObject, getNestedString, getNumber, resolveCurrentEsiVerificationYear } from "@/pages/EquipmentDetailsPage";

// Pure helpers for the equipment card (formatting and Arshin detail parsing).

export function extractSiCardDetail(
  equipmentType: EquipmentType,
  si: EquipmentSIVerification,
) {
  const raw = (si.detailPayloadJson ?? si.rawPayloadJson ?? {}) as Record<string, unknown>;
  const miInfo = getNestedObject(raw, ["miInfo"]);
  const miSingle =
    getNestedObject(miInfo, ["singleMI"]) ??
    getNestedObject(miInfo, ["mi"]) ??
    getNestedObject(miInfo, ["etaMI"]) ??
    {};
  const vriInfo = getNestedObject(raw, ["vriInfo"]) ?? {};
  const info = getNestedObject(raw, ["info"]) ?? {};

  return {
    certificateNumber:
      equipmentType === "ESI"
        ? (
            getFirstString(raw.number, si.resultDocnum)
            ?? null
          )
        : (
            getNestedString(vriInfo, ["applicable", "certNum"])
            ?? si.certificateNumber
            ?? si.resultDocnum
            ?? null
          ),
    sourceCertificateNumber:
      equipmentType === "ESI"
        ? (getNestedString(vriInfo, ["applicable", "certNum"]) ?? si.certificateNumber ?? null)
        : null,
    organization: getFirstString(
      vriInfo.organization,
      vriInfo.orgTitle,
      raw.organization,
      si.orgTitle,
    ),
    regNumber: getFirstString(miSingle.mitypeNumber, raw.mitype_num, si.mitNumber),
    typeDesignation: getFirstString(miSingle.mitypeType, normalizeNotation(raw.minotation), si.mitNotation),
    typeName: getFirstString(miSingle.mitypeTitle, raw.mitype, si.mitTitle),
    serialNumber: getFirstString(miSingle.manufactureNum, raw.factory_num, si.miNumber),
    manufactureYear: getNumber(miSingle.manufactureYear) ?? getNumber(raw.year),
    modification: getFirstString(miSingle.modification, raw.modification),
    schemeType: getFirstString(raw.schematype),
    schemeTitle: getFirstString(raw.schematitle, miSingle.schemaTitle),
    npeNumber: getFirstString(raw.npenumber),
    rankCode: getFirstString(raw.rankcode, miSingle.rankCode),
    rankClass: getFirstString(raw.rankclass, miSingle.rankTitle),
    ownerName: getFirstString(vriInfo.miOwner, vriInfo.owner, vriInfo.ownerName),
    verificationMarkCipher: getFirstString(vriInfo.signCipher, vriInfo.markCipher),
    verificationType: getFirstString(vriInfo.verificationType, vriInfo.typeTitle, vriInfo.verificationTitle),
    verificationDate: getFirstString(
      vriInfo.vrfDate,
      typeof raw.verification_date === "string" ? normalizeDisplayDate(raw.verification_date) : null,
      normalizeDisplayDate(si.verificationDate),
    ),
    validUntil: getFirstString(
      vriInfo.validDate,
      typeof raw.valid_date === "string" ? normalizeDisplayDate(raw.valid_date) : null,
      normalizeDisplayDate(si.validDate),
    ),
    documentTitle: getFirstString(vriInfo.docTitle, info.docTitle, info.doc_title),
    isUsable: getBool(vriInfo.applicable ?? raw.applicability),
    passportMark: getBool(vriInfo.signPass ?? vriInfo.signInPassport ?? info.signPass ?? info.signInPassport),
    deviceMark: getBool(vriInfo.signMi ?? vriInfo.signOnMi ?? info.signMi ?? info.signOnMi),
    reducedScope: getBool(vriInfo.shortScope ?? vriInfo.reducedScope ?? info.shortScope ?? info.reducedScope),
    etalonLines: buildEtalonLines(raw),
    meansLines: buildVerificationMeansLines(raw),
    etalonTableRows: buildEtalonTableRows(raw),
    meansTableRows: buildVerificationMeansTableRows(raw),
    relatedEsiProfiles: buildRelatedEsiProfileRows(raw),
    relatedEsiVerificationRecords: buildRelatedEsiVerificationRows(raw),
  };
}

function normalizeNotation(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed)) {
        const items = parsed.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0,
        );
        if (items.length) {
          return items.join(", ");
        }
      }
    } catch {
      return normalized;
    }
  }
  return normalized;
}

function getBool(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const certificate = getFirstString(
      (value as Record<string, unknown>).certNum,
      (value as Record<string, unknown>).certificateNumber,
    );
    if (certificate) {
      return true;
    }
    if (typeof (value as Record<string, unknown>).applicable === "boolean") {
      return (value as Record<string, unknown>).applicable as boolean;
    }
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["да", "yes", "true", "1"].includes(normalized)) {
      return true;
    }
    if (["нет", "no", "false", "0"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function buildVerificationMeansLines(raw: Record<string, unknown>): string[] {
  const means = getNestedObject(raw, ["means"]);
  if (!means) {
    return [];
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(means)) {
    if (key === "mieta" || !Array.isArray(value)) {
      continue;
    }
    for (const item of value) {
      const line =
        buildSemicolonLine(item, [
          "mitypeNumber",
          "mitypeTitle",
          "notation",
          "modification",
          "manufactureNum",
          "manufactureYear",
          "number",
          "title",
          "name",
        ]) ?? buildFallbackLine(item);
      if (line) {
        lines.push(line);
      }
    }
  }

  return lines;
}

function buildRelatedEsiProfileRows(raw: Record<string, unknown>): ESIRelatedProfileRow[] {
  const items = Array.isArray(raw.metrolog_related_esi_profiles)
    ? raw.metrolog_related_esi_profiles
    : [];
  const verificationYear = resolveCurrentEsiVerificationYear(raw);
  const verificationRows = buildRelatedEsiVerificationRows(raw);
  const verificationByRegistryNumber = new Map(
    verificationRows
      .filter((item) => item.registryNumber)
      .map((item) => [item.registryNumber as string, item] as const),
  );

  return items
    .map<ESIRelatedProfileRow | null>((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const registryNumber = getFirstString(record.number);
      const relatedVerification =
        registryNumber ? verificationByRegistryNumber.get(registryNumber) ?? null : null;
      return {
        entryId: null,
        moduleKind: "INTERNAL",
        selected: Boolean(record.selected),
        vriId: getFirstString(record.vri_id),
        rawPayloadJson: {
          ...record,
          metrolog_related_esi_verification_records:
            Array.isArray(raw.metrolog_related_esi_verification_records)
              ? raw.metrolog_related_esi_verification_records
              : [],
        },
        registryNumber,
        measurementLimit: null,
        rank: formatSIReferenceRank(
          getFirstString(record.rankcode),
          getFirstString(record.rankclass),
        ),
        title: getFirstString(record.mitype, record.minotation),
        modification: getFirstString(record.modification),
        serialNumber: getFirstString(record.factory_num),
        manufactureYear: getFirstString(record.year),
        verificationDate: normalizeDisplayDate(getFirstString(record.verification_date)),
        validUntil: relatedVerification?.validUntil ?? normalizeDisplayDate(getFirstString(record.valid_date)),
        certificateNumber: relatedVerification?.certificateNumber ?? getFirstString(record.certificate_number),
        arshinUrl: getFirstString(record.arshin_url),
        canDelete: false,
      };
    })
    .filter((item): item is ESIRelatedProfileRow => item !== null)
    .filter(
      (item) =>
        item.selected
        || verificationYear === null
        || extractYearFromDateValue(item.verificationDate) === verificationYear,
    );
}

export function buildRelatedEsiVerificationRows(raw: Record<string, unknown>): ESIRelatedVerificationRow[] {
  const items = Array.isArray(raw.metrolog_related_esi_verification_records)
    ? raw.metrolog_related_esi_verification_records
    : [];
  const verificationYear = resolveCurrentEsiVerificationYear(raw);

  return items
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      return {
        selected: Boolean(record.selected),
        certificateNumber: getFirstString(record.certificate_number),
        registryNumber: getFirstString(record.eta_number),
        modification: getFirstString(record.mi_modification),
        verificationDate: normalizeDisplayDate(getFirstString(record.verification_date)),
        validUntil: normalizeDisplayDate(getFirstString(record.valid_date)),
        documentTitle: getFirstString(record.document_title),
        applicability: formatBooleanLabel(getBool(record.applicability)),
        arshinUrl: getFirstString(record.arshin_url),
      } satisfies ESIRelatedVerificationRow;
    })
    .filter((item): item is ESIRelatedVerificationRow => item !== null)
    .filter((item) => item.selected || verificationYear === null || extractYearFromDateValue(item.verificationDate) === verificationYear);
}

export function extractYearFromDateValue(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const displayMatch = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (displayMatch) {
    const parsedYear = Number(displayMatch[3]);
    return Number.isFinite(parsedYear) ? parsedYear : null;
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoMatch) {
    const parsedYear = Number(isoMatch[1]);
    return Number.isFinite(parsedYear) ? parsedYear : null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.getFullYear();
}

export function buildSIReferenceTableRow(
  value: unknown,
  source: string | null,
): SIReferenceTableRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const rank = formatSIReferenceRank(
    getFirstString(record.rankCode, record.rankcode),
    getFirstString(record.rankTitle, record.rankclass),
  );

  const row: SIReferenceTableRow = {
    source,
    registryNumber: getFirstString(record.regNumber, record.number),
    typeNumber: getFirstString(record.mitypeNumber),
    title: getFirstString(record.mitypeTitle, record.title, record.name),
    notation: getFirstString(record.notation, record.mitypeType, record.type),
    modification: getFirstString(record.modification),
    serialNumber: getFirstString(record.manufactureNum),
    manufactureYear: getFirstString(record.manufactureYear),
    rank,
    documentTitle: getFirstString(record.schemaTitle, record.metroChars),
  };

  const hasData = Object.values(row).some((item) => Boolean(item));
  return hasData ? row : null;
}

export function normalizeDisplayDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const displayMatch = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (displayMatch) {
    const day = displayMatch[1].padStart(2, "0");
    const month = displayMatch[2].padStart(2, "0");
    return `${day}.${month}.${displayMatch[3]}`;
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoMatch) {
    return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}
