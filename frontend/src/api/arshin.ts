import { apiRequest } from "@/api/client";

type RawArshinSearchResult = {
  vri_id: string;
  arshin_url: string | null;
  org_title: string | null;
  mit_number: string | null;
  mit_title: string | null;
  mit_notation: string | null;
  mi_modification: string | null;
  mi_number: string | null;
  result_docnum: string | null;
  applicability: boolean | null;
  verification_date: string | null;
  valid_date: string | null;
  raw_payload_json: Record<string, unknown> | null;
};

type RawArshinVriDetail = {
  vri_id: string;
  arshin_url: string;
  certificate_number: string | null;
  organization: string | null;
  reg_number: string | null;
  type_designation: string | null;
  type_name: string | null;
  serial_number: string | null;
  manufacture_year: number | null;
  modification: string | null;
  owner_name: string | null;
  verification_mark_cipher: string | null;
  verification_type: string | null;
  verification_date: string | null;
  valid_until: string | null;
  document_title: string | null;
  is_usable: boolean | null;
  passport_mark: boolean | null;
  device_mark: boolean | null;
  reduced_scope: boolean | null;
  etalon_lines: string[];
  means_lines: string[];
  raw_payload_json: Record<string, unknown> | null;
};

type RawArshinStatus = {
  available: boolean;
  message: string | null;
};

export type ArshinSearchResult = {
  vriId: string;
  arshinUrl: string | null;
  orgTitle: string | null;
  mitNumber: string | null;
  mitTitle: string | null;
  mitNotation: string | null;
  miModification: string | null;
  miNumber: string | null;
  resultDocnum: string | null;
  applicability: boolean | null;
  verificationDate: string | null;
  validDate: string | null;
  rawPayloadJson: Record<string, unknown> | null;
};

export type ArshinRegistryKind = "SI" | "ESI";

export type ArshinSearchFilters = {
  registryKind?: ArshinRegistryKind;
  search?: string;
  orgTitle?: string;
  mitNumber?: string;
  mitTitle?: string;
  mitNotation?: string;
  miModification?: string;
  miNumber?: string;
  npeNumber?: string;
  rank?: string;
  certificateNumber?: string;
  resultDocnum?: string;
  applicability?: boolean | null;
  verificationDate?: string;
  validDate?: string;
  year?: number | null;
};

export type ArshinVriDetail = {
  vriId: string;
  arshinUrl: string;
  certificateNumber: string | null;
  organization: string | null;
  regNumber: string | null;
  typeDesignation: string | null;
  typeName: string | null;
  serialNumber: string | null;
  manufactureYear: number | null;
  modification: string | null;
  ownerName: string | null;
  verificationMarkCipher: string | null;
  verificationType: string | null;
  verificationDate: string | null;
  validUntil: string | null;
  documentTitle: string | null;
  isUsable: boolean | null;
  passportMark: boolean | null;
  deviceMark: boolean | null;
  reducedScope: boolean | null;
  etalonLines: string[];
  meansLines: string[];
  rawPayloadJson: Record<string, unknown> | null;
};

export type ArshinStatus = {
  available: boolean;
  message: string | null;
};

export const ARSHIN_UNAVAILABLE_MESSAGE =
  "Аршин не ответил на этот запрос. Попробуй повторить через несколько секунд.";

export async function searchArshinByCertificate(
  token: string,
  payload: {
    certificateNumber: string;
  },
): Promise<ArshinSearchResult[]> {
  return searchArshin(token, {
    registryKind: "SI",
    resultDocnum: payload.certificateNumber,
  });
}

export async function searchArshinByRegistryNumber(
  token: string,
  payload: {
    registryNumber: string;
  },
): Promise<ArshinSearchResult[]> {
  return searchArshin(token, {
    registryKind: "ESI",
    resultDocnum: payload.registryNumber,
  });
}

export async function searchArshin(
  token: string,
  filters: ArshinSearchFilters,
): Promise<ArshinSearchResult[]> {
  const response = await apiRequest<RawArshinSearchResult[]>("/arshin/search", {
    method: "POST",
    token,
    body: buildArshinSearchRequest(filters),
  });
  return response.map(mapArshinSearchResult);
}

export async function fetchArshinVriDetail(
  token: string,
  vriId: string,
): Promise<ArshinVriDetail> {
  const response = await apiRequest<RawArshinVriDetail>(`/arshin/vri/${vriId}`, {
    method: "GET",
    token,
  });
  return mapArshinVriDetail(response);
}

export async function fetchArshinEsiDetail(
  token: string,
  result: ArshinSearchResult,
): Promise<ArshinVriDetail> {
  const response = await apiRequest<RawArshinVriDetail>("/arshin/esi/detail", {
    method: "POST",
    token,
    body: {
      vri_id: result.vriId,
      org_title: result.orgTitle,
      mit_number: result.mitNumber,
      mit_title: result.mitTitle,
      mit_notation: result.mitNotation,
      mi_modification: result.miModification,
      mi_number: result.miNumber,
      result_docnum: result.resultDocnum,
      applicability: result.applicability,
      verification_date: result.verificationDate,
      valid_date: result.validDate,
      raw_payload_json: result.rawPayloadJson,
    },
  });
  return mapArshinVriDetail(response);
}

export async function fetchArshinStatus(token: string): Promise<ArshinStatus> {
  const response = await apiRequest<RawArshinStatus>("/arshin/status", {
    method: "GET",
    token,
  });
  return {
    available: response.available,
    message: response.message,
  };
}

export function getArshinErrorMessage(error: unknown, fallbackMessage: string): string {
  if (error instanceof Error && isArshinUnavailableMessage(error.message)) {
    return ARSHIN_UNAVAILABLE_MESSAGE;
  }
  return error instanceof Error ? error.message : fallbackMessage;
}

export function isArshinUnavailableMessage(message: string | null | undefined): boolean {
  const normalized = (message ?? "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return (
    normalized.includes("arshin search is temporarily unavailable")
    || normalized.includes("arshin detail request is temporarily unavailable")
    || normalized.includes("arshin esi detail request is temporarily unavailable")
    || normalized.includes("unable to reach arshin service")
    || normalized.includes("в данный момент аршин недоступен")
  );
}

function mapArshinSearchResult(result: RawArshinSearchResult): ArshinSearchResult {
  return {
    vriId: result.vri_id,
    arshinUrl: result.arshin_url,
    orgTitle: result.org_title,
    mitNumber: result.mit_number,
    mitTitle: result.mit_title,
    mitNotation: result.mit_notation,
    miModification: result.mi_modification,
    miNumber: result.mi_number,
    resultDocnum: result.result_docnum,
    applicability: result.applicability,
    verificationDate: result.verification_date,
    validDate: result.valid_date,
    rawPayloadJson: result.raw_payload_json,
  };
}

function mapArshinVriDetail(detail: RawArshinVriDetail): ArshinVriDetail {
  return {
    vriId: detail.vri_id,
    arshinUrl: detail.arshin_url,
    certificateNumber: detail.certificate_number,
    organization: detail.organization,
    regNumber: detail.reg_number,
    typeDesignation: detail.type_designation,
    typeName: detail.type_name,
    serialNumber: detail.serial_number,
    manufactureYear: detail.manufacture_year,
    modification: detail.modification,
    ownerName: detail.owner_name,
    verificationMarkCipher: detail.verification_mark_cipher,
    verificationType: detail.verification_type,
    verificationDate: detail.verification_date,
    validUntil: detail.valid_until,
    documentTitle: detail.document_title,
    isUsable: detail.is_usable,
    passportMark: detail.passport_mark,
    deviceMark: detail.device_mark,
    reducedScope: detail.reduced_scope,
    etalonLines: detail.etalon_lines,
    meansLines: detail.means_lines,
    rawPayloadJson: detail.raw_payload_json,
  };
}

function buildArshinSearchRequest(filters: ArshinSearchFilters): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const registryKind = filters.registryKind ?? "SI";

  body.registry_kind = registryKind;

  if (filters.search?.trim()) {
    body.search = filters.search.trim();
  }
  if (filters.orgTitle?.trim()) {
    body.org_title = filters.orgTitle.trim();
  }
  if (filters.mitNumber?.trim()) {
    body.mit_number = filters.mitNumber.trim();
  }
  if (filters.mitTitle?.trim()) {
    body.mit_title = filters.mitTitle.trim();
  }
  if (filters.mitNotation?.trim()) {
    body.mit_notation = filters.mitNotation.trim();
  }
  if (filters.miModification?.trim()) {
    body.mi_modification = filters.miModification.trim();
  }
  if (filters.miNumber?.trim()) {
    body.mi_number = filters.miNumber.trim();
  }
  if (filters.npeNumber?.trim()) {
    body.npe_number = filters.npeNumber.trim();
  }
  if (filters.rank?.trim()) {
    body.rank = filters.rank.trim();
  }
  if (filters.certificateNumber?.trim()) {
    body.certificate_number = filters.certificateNumber.trim();
  }
  if (filters.resultDocnum?.trim()) {
    if (registryKind === "ESI") {
      body.number = filters.resultDocnum.trim();
    } else {
      body.result_docnum = filters.resultDocnum.trim();
    }
  }
  if (typeof filters.applicability === "boolean") {
    body.applicability = filters.applicability;
  }
  if (filters.verificationDate?.trim()) {
    body.verification_date = filters.verificationDate.trim();
  }
  if (filters.validDate?.trim()) {
    body.valid_date = filters.validDate.trim();
  }
  if (typeof filters.year === "number" && Number.isFinite(filters.year)) {
    body.year = filters.year;
  }

  return body;
}
