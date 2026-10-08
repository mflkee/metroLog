import { getArshinSearchResultManufactureYear } from "@/lib/equipmentRegistry";
import { ArshinSearchResult, ArshinVriDetail, fetchArshinEsiDetail, fetchArshinVriDetail, searchArshin } from "@/api/arshin";
import { EquipmentSIBulkImportResult, exportEquipmentRegistryXlsx, importSIEquipmentExcel } from "@/api/equipment/exports";
import { EquipmentStatus, EquipmentType } from "@/api/equipment/registry";
import { invalidateEquipmentRegistryQueries } from "@/lib/equipmentQueries";
import { ESIInternalModuleFormState, EquipmentFormState, SIImportFormState, SISearchFormState, defaultSIImportForm, defaultSISearchForm } from "@/lib/equipmentRegistry";
import { extractEsiInternalModuleCandidates } from "@/lib/esiModules";
import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

type UseSiImportExportParams = {
  selectedEquipmentIds: number[],
  query: string | null,
  status: EquipmentStatus | "ALL",
  equipmentType: EquipmentType | "ALL",
  token: string | null,
  folderId: number | null,
  equipmentForm: EquipmentFormState,
  setEquipmentForm: (updater: (current: EquipmentFormState) => EquipmentFormState) => void,
};

/** Arshin SI import and registry export slice of the registry page. */
export function useSiImportExport({
  token,
  folderId,
  selectedEquipmentIds,
  query,
  status,
  equipmentType,
  equipmentForm,
  setEquipmentForm,
}: UseSiImportExportParams) {
  const queryClient = useQueryClient();

  const [siSearchForm, setSiSearchForm] = useState<SISearchFormState>(defaultSISearchForm);
  const [siSearchResults, setSiSearchResults] = useState<ArshinSearchResult[]>([]);
  const [selectedSiResult, setSelectedSiResult] = useState<ArshinSearchResult | null>(null);
  const [selectedSiDetail, setSelectedSiDetail] = useState<ArshinVriDetail | null>(null);
  const [esiInternalModules, setEsiInternalModules] = useState<ESIInternalModuleFormState[]>([]);
  const [siImportForm, setSiImportForm] = useState<SIImportFormState>(defaultSIImportForm);
  const [siImportResult, setSiImportResult] = useState<EquipmentSIBulkImportResult | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);



  function handleSelectSiResult(result: ArshinSearchResult) {
    const nextType = equipmentForm.equipmentType;
    setSelectedSiResult(result);
    setSelectedSiDetail(null);
    setEsiInternalModules([]);
    setEquipmentForm((current) => ({
      ...current,
      equipmentType: nextType,
      name: result.mitTitle ?? current.name,
      modification: result.miModification ?? "",
      serialNumber: result.miNumber ?? "",
      manufactureYear: getArshinSearchResultManufactureYear(result) ?? current.manufactureYear,
    }));
  }

  const siSearchMutation = useMutation({
    mutationFn: ({ documentNumber, equipmentType }: { documentNumber: string; equipmentType: EquipmentType }) =>
      searchArshin(token ?? "", {
        registryKind: equipmentType === "ESI" ? "ESI" : "SI",
        ...(equipmentType === "ESI"
          ? { certificateNumber: documentNumber }
          : { resultDocnum: documentNumber }),
      }),
    onSuccess: (results) => {
      setSiSearchResults(results);
      setSelectedSiResult(null);
      setSelectedSiDetail(null);
      setEsiInternalModules([]);
      if (results.length === 1) {
        handleSelectSiResult(results[0]);
      }
    },
  });

  const siDetailMutation = useMutation({
    mutationFn: ({
      equipmentType,
      result,
    }: {
      equipmentType: EquipmentType;
      result: ArshinSearchResult;
    }) =>
      equipmentType === "ESI"
        ? fetchArshinEsiDetail(token ?? "", result)
        : fetchArshinVriDetail(token ?? "", result.vriId),
    onSuccess: (detail) => {
      setSelectedSiDetail(detail);
      setEsiInternalModules(
        equipmentForm.equipmentType === "ESI"
          ? extractEsiInternalModuleCandidates(detail).map((item) => ({
              ...item,
              measurementLimit: "",
            }))
          : [],
      );
      setEquipmentForm((current) => ({
        ...current,
        name: detail.typeName ?? current.name,
        modification: detail.modification ?? "",
        serialNumber: detail.serialNumber ?? "",
        manufactureYear: detail.manufactureYear ? String(detail.manufactureYear) : "",
      }));
    },
  });

  const importSIExcelMutation = useMutation({
    mutationFn: () => {
      if (!folderId) {
        throw new Error("Сначала выбери папку для импорта.");
      }
      if (!siImportForm.file) {
        throw new Error("Выбери Excel-файл для импорта.");
      }
      return importSIEquipmentExcel(token ?? "", {
        folderId: folderId,
        objectName: siImportForm.objectName,
        status: siImportForm.status,
        currentLocationManual: siImportForm.currentLocationManual,
        file: siImportForm.file,
      });
    },
    onSuccess: async (result) => {
      setSiImportResult(result);
      await invalidateEquipmentRegistryQueries(queryClient);
    },
  });

  const exportEquipmentMutation = useMutation({
    mutationFn: () =>
      exportEquipmentRegistryXlsx(
        token ?? "",
        selectedEquipmentIds.length > 0
          ? {
              folderId: folderId,
              equipmentIds: selectedEquipmentIds,
            }
          : {
              folderId: folderId,
              query: query ?? undefined,
              status: status === "ALL" ? null : status,
              equipmentType: equipmentType === "ALL" ? null : equipmentType,
            },
      ),
  });

  return {
    siSearchForm,
    setSiSearchForm,
    siSearchResults,
    setSiSearchResults,
    selectedSiResult,
    setSelectedSiResult,
    selectedSiDetail,
    setSelectedSiDetail,
    esiInternalModules,
    setEsiInternalModules,
    siImportForm,
    setSiImportForm,
    siImportResult,
    setSiImportResult,
    exportError,
    setExportError,
    handleSelectSiResult,
    siSearchMutation,
    siDetailMutation,
    importSIExcelMutation,
    exportEquipmentMutation,
  };
}
