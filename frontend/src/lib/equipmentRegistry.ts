import { ESIInternalModuleCandidate } from "./esiModules";
import { ArshinSearchResult, ArshinVriDetail } from "@/api/arshin";
import { EquipmentFolderRefreshRow } from "@/api/equipment/folders";
import { DeadlinePreset, EquipmentSortDirection, EquipmentSortKey, EquipmentStatus, EquipmentType, UpdateEquipmentPayload, isArshinEquipmentType } from "@/api/equipment/registry";
import { VerificationFlowMode, buildSIVerificationPayloadFromArshin } from "@/api/equipment/verifications";

// Types, defaults and pure helpers of the equipment registry page.

export const equipmentTypeOptions: EquipmentType[] = ["SI", "ESI", "IO", "VO", "OTHER"];

export const equipmentStatusOptions: EquipmentStatus[] = ["IN_WORK", "IN_VERIFICATION", "IN_REPAIR", "REPAIRED", "NOT_REPAIRABLE", "ARCHIVED"];

export const subtleButtonClass = "btn-secondary";

export const subtleButtonWithIconClass = "btn-secondary inline-flex items-center gap-2";

export const equipmentPageSize = 100;

export const complianceIntervalOptions = [
  { value: "12", label: "1 год" },
  { value: "24", label: "2 года" },
  { value: "36", label: "3 года" },
  { value: "48", label: "4 года" },
  { value: "60", label: "5 лет" },
] as const;

export type FolderFormState = {
  name: string;
  description: string;
  sortOrder: number;
  deadlinePresetId: number | null;
  initialDeadlinePresetId: number | null;
};

export type EquipmentFormState = {
  objectName: string;
  equipmentType: EquipmentType;
  createdManually: boolean;
  excludeFromArshinRefresh: boolean;
  name: string;
  modification: string;
  serialNumber: string;
  manufactureYear: string;
  measurementRangeStart: string;
  measurementRangeEnd: string;
  measurementUnit: string;
  manualCertificateNumber: string;
  manualRegistryNumber: string;
  manualVerificationDate: string;
  manualValidDate: string;
  manualVerificationIntervalMonths: string;
  status: EquipmentStatus;
  currentLocationManual: string;
  complianceDate: string;
  complianceIntervalMonths: string;
};

export type SISearchFormState = {
  certificateNumber: string;
};

export type ESIInternalModuleFormState = ESIInternalModuleCandidate & {
  measurementLimit: string;
};

export type VerificationBatchFormState = {
  batchName: string;
  flowMode: VerificationFlowMode;
  stageTemplateVariantId: string;
  routeCity: string;
  routeDestination: string;
  sentToVerificationAt: string;
  initialMessageText: string;
  initialMessageIsPrivate: boolean;
  files: File[];
};

export type RepairBatchFormState = {
  batchName: string;
  isOnSite: boolean;
  stageTemplateVariantId: string;
  routeCity: string;
  routeDestination: string;
  sentToRepairAt: string;
  initialMessageText: string;
  initialMessageIsPrivate: boolean;
  files: File[];
};

export type EquipmentSortState = {
  key: EquipmentSortKey;
  direction: EquipmentSortDirection;
};

export type DeleteTarget =
  | { kind: "folder"; id: number; title: string; message: string }
  | { kind: "equipment"; id: number; title: string; message: string }
  | { kind: "equipment-batch"; ids: number[]; title: string; message: string };

export type ActiveModal =
  | null
  | { kind: "folder"; mode: "create" | "edit"; folderId?: number }
  | { kind: "equipment"; mode: "create" | "edit"; equipmentId?: number }
  | { kind: "si-import" }
  | { kind: "repair-batch" }
  | { kind: "verification-batch" };

export const defaultFolderForm: FolderFormState = {
  name: "",
  description: "",
  sortOrder: 0,
  deadlinePresetId: null,
  initialDeadlinePresetId: null,
};

export const defaultEquipmentForm: EquipmentFormState = {
  objectName: "",
  equipmentType: "OTHER",
  createdManually: false,
  excludeFromArshinRefresh: false,
  name: "",
  modification: "",
  serialNumber: "",
  manufactureYear: "",
  measurementRangeStart: "",
  measurementRangeEnd: "",
  measurementUnit: "",
  manualCertificateNumber: "",
  manualRegistryNumber: "",
  manualVerificationDate: "",
  manualValidDate: "",
  manualVerificationIntervalMonths: "",
  status: "IN_WORK",
  currentLocationManual: "",
  complianceDate: "",
  complianceIntervalMonths: "",
};

export const defaultSISearchForm: SISearchFormState = {
  certificateNumber: "",
};

export type SIImportFormState = {
  objectName: string;
  status: EquipmentStatus;
  currentLocationManual: string;
  file: File | null;
};

export const defaultSIImportForm: SIImportFormState = {
  objectName: "",
  status: "IN_WORK",
  currentLocationManual: "",
  file: null,
};

export const defaultVerificationBatchForm: VerificationBatchFormState = {
  batchName: "",
  flowMode: "OFFSITE_WITH_DEMOLITION",
  stageTemplateVariantId: "",
  routeCity: "",
  routeDestination: "",
  sentToVerificationAt: getTodayDateInputValue(),
  initialMessageText: "",
  initialMessageIsPrivate: false,
  files: [],
};

export const defaultRepairBatchForm: RepairBatchFormState = {
  batchName: "",
  isOnSite: false,
  stageTemplateVariantId: "",
  routeCity: "",
  routeDestination: "",
  sentToRepairAt: getTodayDateInputValue(),
  initialMessageText: "",
  initialMessageIsPrivate: false,
  files: [],
};

export function mapEquipmentFormToPayload(
  form: EquipmentFormState,
  folderId: number,
  selectedSiResult: ArshinSearchResult | null,
  selectedSiDetail: ArshinVriDetail | null,
  esiInternalModules: ESIInternalModuleFormState[],
): UpdateEquipmentPayload {
  return {
    folderId,
    objectName: form.objectName,
    equipmentType: form.equipmentType,
    name: form.name,
    modification: form.modification,
    serialNumber: form.serialNumber,
    manufactureYear: form.manufactureYear ? Number(form.manufactureYear) : null,
    measurementRangeStart: form.measurementRangeStart,
    measurementRangeEnd: form.measurementRangeEnd,
    measurementUnit: form.measurementUnit,
    status: form.status,
    createdManually: isArshinEquipmentType(form.equipmentType) ? form.createdManually : false,
    excludeFromArshinRefresh:
      isArshinEquipmentType(form.equipmentType) && form.createdManually
        ? form.excludeFromArshinRefresh
        : false,
    currentLocationManual: form.currentLocationManual,
    complianceDate: form.complianceDate || null,
    complianceIntervalMonths: form.complianceIntervalMonths
      ? Number(form.complianceIntervalMonths)
      : null,
    manualVerificationIntervalMonths:
      form.equipmentType === "SI" && form.manualVerificationIntervalMonths
        ? Number(form.manualVerificationIntervalMonths)
        : null,
    siVerification:
      isArshinEquipmentType(form.equipmentType)
        ? (
            form.createdManually
              ? {
                  vriId: null,
                  arshinUrl: null,
                  orgTitle: null,
                  mitNumber: null,
                  mitTitle: form.name.trim() || null,
                  mitNotation: form.modification.trim() || null,
                  miNumber: form.serialNumber.trim() || null,
                  certificateNumber: form.manualCertificateNumber.trim() || null,
                  resultDocnum:
                    form.equipmentType === "ESI"
                      ? (form.manualRegistryNumber.trim() || null)
                      : (form.manualCertificateNumber.trim() || null),
                  verificationDate: form.manualVerificationDate || null,
                  validDate:
                    form.equipmentType === "SI" && form.manualVerificationIntervalMonths
                      ? null
                      : (form.manualValidDate || null),
                  rawPayloadJson: null,
                  detailPayloadJson: null,
                }
              : (
                  selectedSiResult
                    ? buildSIVerificationPayloadFromArshin(selectedSiResult, selectedSiDetail)
                    : null
                )
          )
        : null,
    esiInternalModules:
      form.equipmentType === "ESI"
        ? esiInternalModules.map((item) => ({
            registryNumber: item.registryNumber,
            measurementLimit: item.measurementLimit,
          }))
        : [],
  };
}

export function getArshinSearchResultManufactureYear(result: ArshinSearchResult | null): string | null {
  const year = result?.rawPayloadJson?.year;
  return typeof year === "number" && Number.isFinite(year) ? String(year) : null;
}

export function extractArshinResultCertificateNumber(result: ArshinSearchResult | null): string | null {
  if (!result?.rawPayloadJson || typeof result.rawPayloadJson !== "object") {
    return null;
  }
  const raw = result.rawPayloadJson as Record<string, unknown>;
  const vriInfo =
    raw.vriInfo && typeof raw.vriInfo === "object" && !Array.isArray(raw.vriInfo)
      ? (raw.vriInfo as Record<string, unknown>)
      : null;
  const applicable =
    vriInfo?.applicable && typeof vriInfo.applicable === "object" && !Array.isArray(vriInfo.applicable)
      ? (vriInfo.applicable as Record<string, unknown>)
      : null;
  const certificate = applicable?.certNum ?? applicable?.certificateNumber;
  return typeof certificate === "string" && certificate.trim() ? certificate.trim() : null;
}

export function formatEquipmentValidityDate(value: string | null): string {
  if (!value) {
    return "-";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export function getInitialSortDirection(key: EquipmentSortKey): EquipmentSortDirection {
  if (key === "manufactureYear" || key === "validFrom") {
    return "desc";
  }
  return "asc";
}

export function getMutationErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function getFolderRefreshTaskStatusLabel(status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED"): string {
  switch (status) {
    case "PENDING":
      return "Ожидает запуск";
    case "PROCESSING":
      return "Идет поиск";
    case "COMPLETED":
      return "Готово";
    case "FAILED":
      return "Ошибка";
    default:
      return status;
  }
}

export function getFolderRefreshRowStatusLabel(status: EquipmentFolderRefreshRow["status"]): string {
  switch (status) {
    case "UPDATED":
      return "Обновить";
    case "UPDATED_UNCERTAIN":
      return "Обновить?";
    case "UNCHANGED":
      return "Без изменений";
    case "NOT_FOUND":
      return "Не найдено";
    case "ERROR":
      return "Ошибка";
    default:
      return status;
  }
}

export function getFolderRefreshStatusBadgeClass(status: EquipmentFolderRefreshRow["status"]): string {
  switch (status) {
    case "UPDATED":
      return "rounded-full bg-[#e7f3eb] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#2f7a4f]";
    case "UPDATED_UNCERTAIN":
      return "rounded-full bg-[#f3efe5] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8c6a2b]";
    case "UNCHANGED":
      return "rounded-full bg-[#edf2f5] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel";
    case "NOT_FOUND":
      return "rounded-full bg-[#f3efe5] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8c6a2b]";
    case "ERROR":
      return "rounded-full bg-[#f8e8e6] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#b04c43]";
    default:
      return "rounded-full bg-[#edf2f5] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel";
  }
}

export function getFolderRefreshRowTargetLabel(row: EquipmentFolderRefreshRow): string {
  const prefix =
    row.targetKind === "SI"
      ? "СИ"
      : row.targetKind === "ESI"
        ? "ЭСИ"
        : row.targetKind === "ESI_INTERNAL"
          ? "Внутренний модуль ЭСИ"
          : "Внешний модуль ЭСИ";
  const suffix = [row.targetTitle, row.targetSerialNumber, row.measurementLimit]
    .filter(Boolean)
    .join(" · ");
  return suffix ? `${prefix} · ${suffix}` : prefix;
}

export function formatRefreshWindow(
  verificationDate: string | null,
  validDate: string | null,
): string {
  if (verificationDate && validDate) {
    return `${formatEquipmentValidityDate(verificationDate)} до ${formatEquipmentValidityDate(validDate)}`;
  }
  if (verificationDate) {
    return formatEquipmentValidityDate(verificationDate);
  }
  if (validDate) {
    return formatEquipmentValidityDate(validDate);
  }
  return "—";
}

export function getPreferredDeadlinePresetId(presets: DeadlinePreset[]): number | null {
  if (!presets.length) {
    return null;
  }
  return presets.find((preset) => preset.code === "tyungd")?.id ?? presets[0]?.id ?? null;
}

function getTodayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getOnSiteProcessRouteValue(): string {
  return "На месте";
}

export function isVerificationFlowOnSite(flowMode: VerificationFlowMode): boolean {
  return flowMode !== "OFFSITE_WITH_DEMOLITION";
}

export function getVerificationStartDateLabel(flowMode: VerificationFlowMode): string {
  if (flowMode === "ONSITE_WITHOUT_DEMOLITION") {
    return "Подготовка к поверке";
  }
  return "Демонтаж / подготовка к поверке";
}
