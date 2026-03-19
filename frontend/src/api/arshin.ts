import { apiRequest } from "@/api/client";

type RawArshinSearchResult = {
  vri_id: string;
  arshin_url: string;
  org_title: string | null;
  mit_number: string | null;
  mit_title: string | null;
  mit_notation: string | null;
  mi_modification: string | null;
  mi_number: string | null;
  result_docnum: string | null;
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

export type ArshinSearchResult = {
  vriId: string;
  arshinUrl: string;
  orgTitle: string | null;
  mitNumber: string | null;
  mitTitle: string | null;
  mitNotation: string | null;
  miModification: string | null;
  miNumber: string | null;
  resultDocnum: string | null;
  verificationDate: string | null;
  validDate: string | null;
  rawPayloadJson: Record<string, unknown> | null;
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

export async function searchArshinByCertificate(
  token: string,
  payload: {
    certificateNumber: string;
  },
): Promise<ArshinSearchResult[]> {
  const response = await apiRequest<RawArshinSearchResult[]>("/arshin/search", {
    method: "POST",
    token,
    body: {
      certificate_number: payload.certificateNumber,
    },
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
