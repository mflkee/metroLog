import type { ArshinVriDetail } from "@/api/arshin";

export type ESIInternalModuleCandidate = {
  registryNumber: string;
  rank: string | null;
  title: string | null;
  modification: string | null;
  serialNumber: string | null;
  manufactureYear: string | null;
  verificationDate: string | null;
  validUntil: string | null;
  certificateNumber: string | null;
  arshinUrl: string | null;
  selected: boolean;
};

export function extractEsiInternalModuleCandidates(
  detail: ArshinVriDetail | null,
): ESIInternalModuleCandidate[] {
  if (!detail?.rawPayloadJson || typeof detail.rawPayloadJson !== "object") {
    return [];
  }

  const raw = detail.rawPayloadJson as Record<string, unknown>;
  const relatedProfiles = Array.isArray(raw.metrolog_related_esi_profiles)
    ? raw.metrolog_related_esi_profiles
    : [];
  const relatedVerificationRecords = Array.isArray(raw.metrolog_related_esi_verification_records)
    ? raw.metrolog_related_esi_verification_records
    : [];
  const verificationByRegistry = new Map<string, Record<string, unknown>>();

  for (const item of relatedVerificationRecords) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const registryNumber = getFirstString(record.eta_number);
    if (!registryNumber) {
      continue;
    }
    verificationByRegistry.set(registryNumber, record);
  }

  const rows: ESIInternalModuleCandidate[] = [];
  const seen = new Set<string>();

  for (const item of relatedProfiles) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const registryNumber = getFirstString(record.number);
    if (!registryNumber || seen.has(registryNumber)) {
      continue;
    }
    const verification = verificationByRegistry.get(registryNumber) ?? null;
    const row = buildModuleCandidate({
      registryNumber,
      profile: record,
      verification,
      detail,
    });
    if (!row) {
      continue;
    }
    seen.add(registryNumber);
    rows.push(row);
  }

  const selectedRegistryNumber = getFirstString(raw.number, detail.regNumber);
  if (selectedRegistryNumber && !seen.has(selectedRegistryNumber)) {
    const verification = verificationByRegistry.get(selectedRegistryNumber) ?? null;
    const selectedRow = buildModuleCandidate({
      registryNumber: selectedRegistryNumber,
      profile: null,
      verification,
      detail,
      forceSelected: true,
    });
    if (selectedRow) {
      rows.push(selectedRow);
    }
  }

  return rows.sort((left, right) => {
    if (left.selected !== right.selected) {
      return left.selected ? -1 : 1;
    }
    const leftDate = toSortableTime(left.verificationDate);
    const rightDate = toSortableTime(right.verificationDate);
    if (leftDate !== rightDate) {
      return rightDate - leftDate;
    }
    return left.registryNumber.localeCompare(right.registryNumber, "ru");
  });
}

function buildModuleCandidate({
  registryNumber,
  profile,
  verification,
  detail,
  forceSelected = false,
}: {
  registryNumber: string;
  profile: Record<string, unknown> | null;
  verification: Record<string, unknown> | null;
  detail: ArshinVriDetail;
  forceSelected?: boolean;
}): ESIInternalModuleCandidate | null {
  const selected = forceSelected || Boolean(profile?.selected);
  return {
    registryNumber,
    rank: formatRank(
      getFirstString(
        profile?.rankcode,
        selected ? (detail.rawPayloadJson as Record<string, unknown>).rankcode : null,
      ),
      getFirstString(
        profile?.rankclass,
        selected ? (detail.rawPayloadJson as Record<string, unknown>).rankclass : null,
      ),
    ),
    title: getFirstString(profile?.mitype, detail.typeName),
    modification: getFirstString(profile?.modification, detail.modification),
    serialNumber: getFirstString(profile?.factory_num, detail.serialNumber),
    manufactureYear: getFirstString(profile?.year, detail.manufactureYear),
    verificationDate: normalizeDisplayDate(
      getFirstString(
        verification?.verification_date,
        profile?.verification_date,
        selected ? detail.verificationDate : null,
      ),
    ),
    validUntil: normalizeDisplayDate(
      getFirstString(
        verification?.valid_date,
        profile?.valid_date,
        selected ? detail.validUntil : null,
      ),
    ),
    certificateNumber: getFirstString(
      verification?.certificate_number,
      selected ? detail.certificateNumber : null,
    ),
    arshinUrl: getFirstString(profile?.arshin_url, detail.arshinUrl),
    selected,
  };
}

function getFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function formatRank(code: string | null, title: string | null): string | null {
  if (code && title) {
    return `${code} · ${title}`;
  }
  return code ?? title ?? null;
}

function normalizeDisplayDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const displayMatch = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (displayMatch) {
    return `${displayMatch[1].padStart(2, "0")}.${displayMatch[2].padStart(2, "0")}.${displayMatch[3]}`;
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

function toSortableTime(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const normalized = value.trim();
  const displayMatch = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (displayMatch) {
    return new Date(
      Number(displayMatch[3]),
      Number(displayMatch[2]) - 1,
      Number(displayMatch[1]),
    ).getTime();
  }
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? Number.NEGATIVE_INFINITY : parsed.getTime();
}
