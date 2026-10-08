// Split out of the former single src/api/equipment.ts module.
// Re-exported by src/api/equipment.ts so existing imports keep working.

import { RawEquipment, mapEquipment } from "./registry";
import { mapSIVerificationPayload } from "./verifications";

import { apiRequest } from "@/api/client";
import { EquipmentItem } from "./registry";
import { CreateEquipmentSIVerificationPayload } from "./verifications";

export async function refreshEquipmentSi(
  token: string,
  equipmentId: number,
  payload: CreateEquipmentSIVerificationPayload,
): Promise<EquipmentItem> {
  const response = await apiRequest<RawEquipment>(`/equipment/${equipmentId}/si/refresh`, {
    method: "POST",
    token,
    body: {
      si_verification: mapSIVerificationPayload(payload),
    },
  });
  return mapEquipment(response);
}

export async function updateEquipmentArshinRefreshExclusion(
  token: string,
  equipmentId: number,
  excludeFromArshinRefresh: boolean,
): Promise<EquipmentItem> {
  const response = await apiRequest<RawEquipment>(`/equipment/${equipmentId}`, {
    method: "PATCH",
    token,
    body: {
      exclude_from_arshin_refresh: excludeFromArshinRefresh,
    },
  });
  return mapEquipment(response);
}
