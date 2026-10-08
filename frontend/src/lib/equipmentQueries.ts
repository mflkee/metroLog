import type { QueryClient } from "@tanstack/react-query";

/**
 * Invalidate the registry views (list, page, bulk selection) after an equipment mutation.
 * Extracted from the equipment card so hooks and pages share one definition.
 */
export async function invalidateEquipmentRegistryQueries(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
  await queryClient.invalidateQueries({ queryKey: ["equipment-items-page"] });
  await queryClient.invalidateQueries({ queryKey: ["equipment-selected-items"] });
}
