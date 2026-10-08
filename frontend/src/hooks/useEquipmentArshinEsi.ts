import { ArshinSearchResult, ArshinVriDetail, fetchArshinEsiDetail, fetchArshinVriDetail, searchArshin } from "@/api/arshin";
import { createEquipmentEsiCompositionEntry, deleteEquipmentEsiCompositionEntry, updateEquipmentEsiCompositionEntry } from "@/api/equipment/esi";
import { refreshEquipmentSi } from "@/api/equipment/refresh";
import { EquipmentType } from "@/api/equipment/registry";
import { buildSIVerificationPayloadFromArshin } from "@/api/equipment/verifications";
import { ESIRelatedProfileRow } from "@/components/equipment-details/EsiSections";
import { ESICompositionFormState } from "@/pages/EquipmentDetailsPage";
import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateEquipmentRegistryQueries } from "@/lib/equipmentQueries";

type UseEquipmentArshinEsiParams = {
  token: string | null,
  equipmentId: number,
  equipmentType: EquipmentType | null,
};

/** Arshin refresh and ESI-composition tooling of the equipment card. */
export function useEquipmentArshinEsi({
  token,
  equipmentId,
  equipmentType,
}: UseEquipmentArshinEsiParams) {
  const queryClient = useQueryClient();

  const [siRefreshCertificate, setSiRefreshCertificate] = useState("");
  const [siRefreshResults, setSiRefreshResults] = useState<ArshinSearchResult[]>([]);
  const [selectedSiRefreshResult, setSelectedSiRefreshResult] = useState<ArshinSearchResult | null>(null);
  const [selectedSiRefreshDetail, setSelectedSiRefreshDetail] = useState<ArshinVriDetail | null>(null);
  const [esiCompositionModalOpen, setEsiCompositionModalOpen] = useState(false);
  const [esiCompositionForm, setEsiCompositionForm] = useState<ESICompositionFormState>({
    certificateNumber: "",
    measurementLimit: "",
  });
  const [esiCompositionSearchResults, setEsiCompositionSearchResults] = useState<ArshinSearchResult[]>([]);
  const [selectedEsiCompositionResult, setSelectedEsiCompositionResult] = useState<ArshinSearchResult | null>(null);
  const [selectedEsiCompositionDetail, setSelectedEsiCompositionDetail] = useState<ArshinVriDetail | null>(null);
  const [esiCompositionPreview, setEsiCompositionPreview] = useState<{
    row: ESIRelatedProfileRow;
    detail: ArshinVriDetail;
  } | null>(null);
  const [editingEsiModule, setEditingEsiModule] = useState<ESIRelatedProfileRow | null>(null);
  const [editingEsiMeasurementLimit, setEditingEsiMeasurementLimit] = useState("");
  const [esiModuleToDelete, setEsiModuleToDelete] = useState<ESIRelatedProfileRow | null>(null);



  function openEsiCompositionModal(): void {
    setEsiCompositionModalOpen(true);
  }

  function closeEsiCompositionModal(): void {
    setEsiCompositionModalOpen(false);
    setEsiCompositionForm({ certificateNumber: "", measurementLimit: "" });
    setEsiCompositionSearchResults([]);
    setSelectedEsiCompositionResult(null);
    setSelectedEsiCompositionDetail(null);
    searchEsiCompositionMutation.reset();
    loadEsiCompositionDetailMutation.reset();
    createEsiCompositionEntryMutation.reset();
  }

  function openEditEsiModuleModal(row: ESIRelatedProfileRow): void {
    setEditingEsiModule(row);
    setEditingEsiMeasurementLimit(row.measurementLimit ?? "");
    updateEsiCompositionEntryMutation.reset();
  }

  const searchSiRefreshMutation = useMutation({
    mutationFn: (documentNumber: string) =>
      searchArshin(token ?? "", {
        registryKind: equipmentType === "ESI" ? "ESI" : "SI",
        ...(equipmentType === "ESI"
          ? { certificateNumber: documentNumber }
          : { resultDocnum: documentNumber }),
      }),
    onSuccess: (results) => {
      setSiRefreshResults(results);
      setSelectedSiRefreshResult(null);
      setSelectedSiRefreshDetail(null);
      if (results.length === 1) {
        void loadSiRefreshDetailMutation.mutateAsync(results[0]);
      }
    },
  });

  const loadSiRefreshDetailMutation = useMutation({
    mutationFn: async (result: ArshinSearchResult) => {
      const detail =
        equipmentType === "ESI"
          ? await fetchArshinEsiDetail(token ?? "", result)
          : await fetchArshinVriDetail(token ?? "", result.vriId);
      return {
        detail,
        result,
      };
    },
    onSuccess: ({ detail, result }) => {
      setSelectedSiRefreshResult(result);
      setSelectedSiRefreshDetail(detail);
    },
  });

  const refreshSiMutation = useMutation({
    mutationFn: async () => {
      if (
        !selectedSiRefreshResult
        || (equipmentType === "SI" && !selectedSiRefreshDetail)
      ) {
        throw new Error("Сначала выбери новую запись Аршина.");
      }
      return refreshEquipmentSi(
        token ?? "",
        equipmentId,
        buildSIVerificationPayloadFromArshin(selectedSiRefreshResult, selectedSiRefreshDetail),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", equipmentId] });
      await invalidateEquipmentRegistryQueries(queryClient);
      setSiRefreshCertificate("");
      setSiRefreshResults([]);
      setSelectedSiRefreshResult(null);
      setSelectedSiRefreshDetail(null);
    },
  });

  const loadEsiCompositionPreviewMutation = useMutation({
    mutationFn: async (row: ESIRelatedProfileRow) => {
      if (row.vriId && !row.vriId.startsWith("esi-profile:")) {
        const detail = await fetchArshinVriDetail(token ?? "", row.vriId);
        return {
          row,
          detail: {
            ...detail,
            arshinUrl: row.arshinUrl ?? detail.arshinUrl,
            certificateNumber: row.certificateNumber ?? detail.certificateNumber,
            verificationDate: row.verificationDate ?? detail.verificationDate,
            validUntil: row.validUntil ?? detail.validUntil,
            rawPayloadJson: row.rawPayloadJson ?? detail.rawPayloadJson,
          },
        };
      }
      if (!row.certificateNumber) {
        throw new Error("Для этой строки нет номера свидетельства.");
      }
      const results = await searchArshin(token ?? "", {
        registryKind: "ESI",
        certificateNumber: row.certificateNumber,
      });
      const matchedResult =
        results.find((item) => item.resultDocnum === row.registryNumber)
        ?? results[0];
      if (!matchedResult) {
        throw new Error("По этому свидетельству запись Аршина не найдена.");
      }
      const detail = await fetchArshinEsiDetail(token ?? "", matchedResult);
      return { row, detail };
    },
    onSuccess: ({ row, detail }) => {
      setEsiCompositionPreview({ row, detail });
    },
  });

  const searchEsiCompositionMutation = useMutation({
    mutationFn: (certificateNumber: string) =>
      searchArshin(token ?? "", {
        registryKind: "ESI",
        certificateNumber,
      }),
    onSuccess: (results) => {
      setEsiCompositionSearchResults(results);
      setSelectedEsiCompositionResult(null);
      setSelectedEsiCompositionDetail(null);
      setEsiCompositionForm((current) => ({ ...current, measurementLimit: "" }));
      if (results.length === 1) {
        void loadEsiCompositionDetailMutation.mutateAsync(results[0]);
      }
    },
  });

  const loadEsiCompositionDetailMutation = useMutation({
    mutationFn: async (result: ArshinSearchResult) => {
      const detail = await fetchArshinEsiDetail(token ?? "", result);
      return {
        detail,
        result,
      };
    },
    onSuccess: ({ detail, result }) => {
      setSelectedEsiCompositionResult(result);
      setSelectedEsiCompositionDetail(detail);
    },
  });

  const createEsiCompositionEntryMutation = useMutation({
    mutationFn: async () => {
      if (!selectedEsiCompositionResult || !selectedEsiCompositionDetail) {
        throw new Error("Сначала выбери запись Аршина для состава ЭСИ.");
      }
      return createEquipmentEsiCompositionEntry(token ?? "", equipmentId, {
        moduleKind: "EXTERNAL",
        measurementLimit: esiCompositionForm.measurementLimit,
        siVerification: buildSIVerificationPayloadFromArshin(
          selectedEsiCompositionResult,
          selectedEsiCompositionDetail,
        ),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      closeEsiCompositionModal();
    },
  });

  const updateEsiCompositionEntryMutation = useMutation({
    mutationFn: async () => {
      if (!editingEsiModule?.entryId) {
        throw new Error("Модуль ЭСИ для редактирования не выбран.");
      }
      return updateEquipmentEsiCompositionEntry(
        token ?? "",
        equipmentId,
        editingEsiModule.entryId,
        {
          measurementLimit: editingEsiMeasurementLimit,
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      setEditingEsiModule(null);
      setEditingEsiMeasurementLimit("");
    },
  });

  const deleteEsiCompositionEntryMutation = useMutation({
    mutationFn: async () => {
      if (!esiModuleToDelete?.entryId) {
        throw new Error("Модуль ЭСИ для удаления не выбран.");
      }
      return deleteEquipmentEsiCompositionEntry(
        token ?? "",
        equipmentId,
        esiModuleToDelete.entryId,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      setEsiModuleToDelete(null);
    },
  });

  return {
    siRefreshCertificate,
    setSiRefreshCertificate,
    siRefreshResults,
    setSiRefreshResults,
    selectedSiRefreshResult,
    setSelectedSiRefreshResult,
    selectedSiRefreshDetail,
    setSelectedSiRefreshDetail,
    esiCompositionModalOpen,
    setEsiCompositionModalOpen,
    esiCompositionForm,
    setEsiCompositionForm,
    esiCompositionSearchResults,
    setEsiCompositionSearchResults,
    selectedEsiCompositionResult,
    setSelectedEsiCompositionResult,
    selectedEsiCompositionDetail,
    setSelectedEsiCompositionDetail,
    esiCompositionPreview,
    setEsiCompositionPreview,
    editingEsiModule,
    setEditingEsiModule,
    editingEsiMeasurementLimit,
    setEditingEsiMeasurementLimit,
    esiModuleToDelete,
    setEsiModuleToDelete,
    openEsiCompositionModal,
    closeEsiCompositionModal,
    openEditEsiModuleModal,
    searchSiRefreshMutation,
    loadSiRefreshDetailMutation,
    refreshSiMutation,
    loadEsiCompositionPreviewMutation,
    searchEsiCompositionMutation,
    loadEsiCompositionDetailMutation,
    createEsiCompositionEntryMutation,
    updateEsiCompositionEntryMutation,
    deleteEsiCompositionEntryMutation,
  };
}
