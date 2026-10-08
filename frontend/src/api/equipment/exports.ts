// Split out of the former single src/api/equipment.ts module.
// Re-exported by src/api/equipment.ts so existing imports keep working.

import { FetchEquipmentFilters, buildEquipmentFilterSearch, parseContentDispositionFileName } from "./registry";



import { ApiError, apiBaseUrl, apiRequest, getResponseErrorMessage } from "@/api/client";
import { EquipmentStatus } from "./registry";

export type ImportSIExcelPayload = {
  folderId: number;
  objectName: string;
  status: EquipmentStatus;
  currentLocationManual: string;
  file: File;
};

export type EquipmentSIBulkImportRow = {
  rowNumber: number;
  certificateNumber: string;
  status: "created" | "skipped" | "error";
  message: string;
  equipmentId: number | null;
  equipmentName: string | null;
  vriId: string | null;
};

export type EquipmentSIBulkImportResult = {
  totalRows: number;
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  rows: EquipmentSIBulkImportRow[];
};

type RawEquipmentSIBulkImportRow = {
  row_number: number;
  certificate_number: string;
  status: "created" | "skipped" | "error";
  message: string;
  equipment_id: number | null;
  equipment_name: string | null;
  vri_id: string | null;
};

type RawEquipmentSIBulkImportResult = {
  total_rows: number;
  created_count: number;
  skipped_count: number;
  error_count: number;
  rows: RawEquipmentSIBulkImportRow[];
};

export async function exportEquipmentRegistryXlsx(
  token: string,
  filters: FetchEquipmentFilters = {},
): Promise<{ blob: Blob; fileName: string }> {
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/equipment/export/xlsx${buildEquipmentFilterSearch(filters)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new ApiError(
      0,
      "Не удалось связаться с сервером. Проверь доступность приложения и настройки API.",
    );
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      await getResponseErrorMessage(response, "Не удалось выгрузить Excel-файл."),
    );
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileName = parseContentDispositionFileName(contentDisposition) ?? "equipment-registry.xlsx";
  return { blob, fileName };
}

export async function importSIEquipmentExcel(
  token: string,
  payload: ImportSIExcelPayload,
): Promise<EquipmentSIBulkImportResult> {
  const formData = new FormData();
  formData.set("folder_id", String(payload.folderId));
  formData.set("object_name", payload.objectName);
  formData.set("status_value", payload.status);
  formData.set("current_location_manual", payload.currentLocationManual);
  formData.set("file", payload.file);

  const response = await apiRequest<RawEquipmentSIBulkImportResult>("/equipment/si/import", {
    method: "POST",
    token,
    body: formData,
  });
  return mapEquipmentSIBulkImportResult(response);
}

function mapEquipmentSIBulkImportResult(
  result: RawEquipmentSIBulkImportResult,
): EquipmentSIBulkImportResult {
  return {
    totalRows: result.total_rows,
    createdCount: result.created_count,
    skippedCount: result.skipped_count,
    errorCount: result.error_count,
    rows: result.rows.map((row) => ({
      rowNumber: row.row_number,
      certificateNumber: row.certificate_number,
      status: row.status,
      message: row.message,
      equipmentId: row.equipment_id,
      equipmentName: row.equipment_name,
      vriId: row.vri_id,
    })),
  };
}
