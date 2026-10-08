// Split out of the former single src/api/equipment.ts module.
// Re-exported by src/api/equipment.ts so existing imports keep working.

import { emptyToNull } from "./registry";
import { RawSIVerification, mapEquipmentSIVerification, mapSIVerificationPayload } from "./verifications";



import { apiRequest } from "@/api/client";
import { CreateEquipmentSIVerificationPayload, EquipmentSIVerification } from "./verifications";

export type ESIModuleKind = "INTERNAL" | "EXTERNAL";

export type RawEquipmentESICompositionEntry = RawSIVerification & {
  module_kind: ESIModuleKind;
  measurement_limit: string | null;
  sort_order: number;
};

type RawESIEquipmentMonitoringModule = {
  entry_id: number | null;
  module_kind: ESIModuleKind;
  vri_id: string | null;
  registry_number: string | null;
  rank: string | null;
  name: string | null;
  modification: string | null;
  serial_number: string | null;
  measurement_limit: string | null;
  verification_date: string | null;
  valid_until: string | null;
  certificate_number: string | null;
  arshin_url: string | null;
  verification_arshin_url: string | null;
};

export type RawESIEquipmentMonitoringItem = {
  equipment_id: number;
  folder_id: number | null;
  equipment_name: string;
  equipment_modification: string | null;
  equipment_serial_number: string | null;
  modules: RawESIEquipmentMonitoringModule[];
};

export type EquipmentESICompositionEntry = EquipmentSIVerification & {
  moduleKind: ESIModuleKind;
  measurementLimit: string | null;
  sortOrder: number;
};

export type ESIEquipmentMonitoringModule = {
  entryId: number | null;
  moduleKind: ESIModuleKind;
  vriId: string | null;
  registryNumber: string | null;
  rank: string | null;
  name: string | null;
  modification: string | null;
  serialNumber: string | null;
  measurementLimit: string | null;
  verificationDate: string | null;
  validUntil: string | null;
  certificateNumber: string | null;
  arshinUrl: string | null;
  verificationArshinUrl: string | null;
};

export type ESIEquipmentMonitoringItem = {
  equipmentId: number;
  folderId: number | null;
  equipmentName: string;
  equipmentModification: string | null;
  equipmentSerialNumber: string | null;
  modules: ESIEquipmentMonitoringModule[];
};

export type ESIInternalModuleMeasurementPayload = {
  registryNumber: string;
  measurementLimit: string;
};

export type CreateEquipmentESICompositionEntryPayload = {
  moduleKind?: ESIModuleKind;
  measurementLimit?: string;
  siVerification: CreateEquipmentSIVerificationPayload;
};

export type UpdateEquipmentESICompositionEntryPayload = {
  measurementLimit: string;
};

export async function createEquipmentEsiCompositionEntry(
  token: string,
  equipmentId: number,
  payload: CreateEquipmentESICompositionEntryPayload,
): Promise<EquipmentESICompositionEntry> {
  const response = await apiRequest<RawEquipmentESICompositionEntry>(
    `/equipment/${equipmentId}/esi-composition`,
    {
      method: "POST",
      token,
      body: {
        module_kind: payload.moduleKind ?? "EXTERNAL",
        measurement_limit: emptyToNull(payload.measurementLimit ?? ""),
        si_verification: mapSIVerificationPayload(payload.siVerification),
      },
    },
  );
  return mapEquipmentESICompositionEntry(response);
}

export async function updateEquipmentEsiCompositionEntry(
  token: string,
  equipmentId: number,
  entryId: number,
  payload: UpdateEquipmentESICompositionEntryPayload,
): Promise<EquipmentESICompositionEntry> {
  const response = await apiRequest<RawEquipmentESICompositionEntry>(
    `/equipment/${equipmentId}/esi-composition/${entryId}`,
    {
      method: "PATCH",
      token,
      body: {
        measurement_limit: emptyToNull(payload.measurementLimit),
      },
    },
  );
  return mapEquipmentESICompositionEntry(response);
}

export async function deleteEquipmentEsiCompositionEntry(
  token: string,
  equipmentId: number,
  entryId: number,
): Promise<void> {
  await apiRequest(`/equipment/${equipmentId}/esi-composition/${entryId}`, {
    method: "DELETE",
    token,
  });
}

export function mapEquipmentESICompositionEntry(
  entry: RawEquipmentESICompositionEntry,
): EquipmentESICompositionEntry {
  return {
    ...mapEquipmentSIVerification(entry),
    moduleKind: entry.module_kind,
    measurementLimit: entry.measurement_limit,
    sortOrder: entry.sort_order,
  };
}

export function mapEsiEquipmentMonitoringItem(
  item: RawESIEquipmentMonitoringItem,
): ESIEquipmentMonitoringItem {
  return {
    equipmentId: item.equipment_id,
    folderId: item.folder_id,
    equipmentName: item.equipment_name,
    equipmentModification: item.equipment_modification,
    equipmentSerialNumber: item.equipment_serial_number,
    modules: item.modules.map((module) => ({
      entryId: module.entry_id,
      moduleKind: module.module_kind,
      vriId: module.vri_id,
      registryNumber: module.registry_number,
      rank: module.rank,
      name: module.name,
      modification: module.modification,
      serialNumber: module.serial_number,
      measurementLimit: module.measurement_limit,
      verificationDate: module.verification_date,
      validUntil: module.valid_until,
      certificateNumber: module.certificate_number,
      arshinUrl: module.arshin_url,
      verificationArshinUrl: module.verification_arshin_url,
    })),
  };
}
