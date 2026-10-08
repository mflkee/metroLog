import { EquipmentFolder } from "@/api/equipment/folders";
import { DeadlinePreset } from "@/api/equipment/registry";
import { updateEquipmentArshinRefreshExclusion } from "@/api/equipment/refresh";
import { EquipmentItem, deleteEquipment } from "@/api/equipment/registry";
import { createEquipmentRepair } from "@/api/equipment/repairs";
import { createEquipmentVerification } from "@/api/equipment/verifications";
import { invalidateEquipmentRegistryQueries } from "@/lib/equipmentQueries";
import { getProcessVariantById, getRepairPresetVariants, getVerificationFlowModeForVariant, getVerificationPresetVariants } from "@/lib/processVariants";
import { RepairFormState, VerificationFormState, getCurrentProcessFolder, getOnSiteProcessRouteValue, getTodayDateInputValue, isVerificationFlowOnSite } from "@/pages/EquipmentDetailsPage";
import { useRef, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

type UseEquipmentProcessActionsParams = {
  token: string | null,
  equipmentId: number,
  equipment: EquipmentItem | null,
  navigate: ReturnType<typeof useNavigate>,
  folders: EquipmentFolder[],
  deadlinePresets: DeadlinePreset[],
  setRepairActionError: (message: string | null) => void,
  setVerificationActionError: (message: string | null) => void,
};

/** Process creation, deletion and Arshin-exclusion actions of the equipment card. */
export function useEquipmentProcessActions({
  token,
  equipmentId,
  equipment,
  navigate,
  folders,
  deadlinePresets,
  setRepairActionError,
  setVerificationActionError,
}: UseEquipmentProcessActionsParams) {
  const queryClient = useQueryClient();

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [repairForm, setRepairForm] = useState<RepairFormState>({
    isOnSite: false,
    stageTemplateVariantId: "",
    routeCity: "",
    routeDestination: "",
    sentToRepairAt: getTodayDateInputValue(),
    initialMessageText: "",
    initialMessageIsPrivate: false,
    files: [],
  });
  const [verificationForm, setVerificationForm] = useState<VerificationFormState>({
    flowMode: "OFFSITE_WITH_DEMOLITION",
    stageTemplateVariantId: "",
    routeCity: "",
    routeDestination: "",
    sentToVerificationAt: getTodayDateInputValue(),
    initialMessageText: "",
    initialMessageIsPrivate: false,
    files: [],
  });

  const repairInitialFilesInputRef = useRef<HTMLInputElement | null>(null);
  const verificationInitialFilesInputRef = useRef<HTMLInputElement | null>(null);

  const updateArshinRefreshExclusionMutation = useMutation({
    mutationFn: (excludeFromArshinRefresh: boolean) =>
      updateEquipmentArshinRefreshExclusion(
        token ?? "",
        equipmentId,
        excludeFromArshinRefresh,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", equipmentId] });
      await invalidateEquipmentRegistryQueries(queryClient);
    },
  });

  const createRepairMutation = useMutation({
    mutationFn: () => {
      const processFolder = getCurrentProcessFolder(folders, equipment);
      const livePreset =
        (deadlinePresets).find(
          (preset) => preset.id === processFolder?.deadlinePresetId,
        ) ?? null;
      const selectedVariant = getProcessVariantById(
        livePreset?.repairStageTemplates?.variants
          ?? getRepairPresetVariants(processFolder),
        repairForm.stageTemplateVariantId,
      );
      const isOnSite = selectedVariant
        ? selectedVariant.routeKind === "on_site"
        : repairForm.isOnSite;
      return createEquipmentRepair(token ?? "", equipmentId, {
        isOnSite,
        stageTemplateVariantId: selectedVariant?.id ?? null,
        routeCity: isOnSite ? getOnSiteProcessRouteValue() : repairForm.routeCity,
        routeDestination: isOnSite ? getOnSiteProcessRouteValue() : repairForm.routeDestination,
        sentToRepairAt: repairForm.sentToRepairAt,
        initialMessageText: repairForm.initialMessageText,
        initialMessageIsPrivate: repairForm.initialMessageIsPrivate,
        files: repairForm.files,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", equipmentId] });
      await invalidateEquipmentRegistryQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["equipment-repair-messages", equipmentId] });
      setRepairModalOpen(false);
      setRepairActionError(null);
      setRepairForm({
        isOnSite: false,
        stageTemplateVariantId: "",
        routeCity: "",
        routeDestination: "",
        sentToRepairAt: getTodayDateInputValue(),
        initialMessageText: "",
        initialMessageIsPrivate: false,
        files: [],
      });
      if (repairInitialFilesInputRef.current) {
        repairInitialFilesInputRef.current.value = "";
      }
    },
  });

  const createVerificationMutation = useMutation({
    mutationFn: () => {
      const processFolder = getCurrentProcessFolder(folders, equipment);
      const livePreset =
        (deadlinePresets).find(
          (preset) => preset.id === processFolder?.deadlinePresetId,
        ) ?? null;
      const selectedVariant = getProcessVariantById(
        livePreset?.verificationStageTemplates?.variants
          ?? getVerificationPresetVariants(processFolder),
        verificationForm.stageTemplateVariantId,
      );
      const flowMode = getVerificationFlowModeForVariant(selectedVariant)
        ?? verificationForm.flowMode;
      return createEquipmentVerification(token ?? "", equipmentId, {
        flowMode,
        stageTemplateVariantId: selectedVariant?.id ?? null,
        routeCity: isVerificationFlowOnSite(flowMode)
          ? getOnSiteProcessRouteValue()
          : verificationForm.routeCity,
        routeDestination: isVerificationFlowOnSite(flowMode)
          ? getOnSiteProcessRouteValue()
          : verificationForm.routeDestination,
        sentToVerificationAt: verificationForm.sentToVerificationAt,
        initialMessageText: verificationForm.initialMessageText,
        initialMessageIsPrivate: verificationForm.initialMessageIsPrivate,
        files: verificationForm.files,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", equipmentId] });
      await invalidateEquipmentRegistryQueries(queryClient);
      await queryClient.invalidateQueries({
        queryKey: ["equipment-verification-messages", equipmentId],
      });
      setVerificationModalOpen(false);
      setVerificationActionError(null);
      setVerificationForm({
        flowMode: "OFFSITE_WITH_DEMOLITION",
        stageTemplateVariantId: "",
        routeCity: "",
        routeDestination: "",
        sentToVerificationAt: getTodayDateInputValue(),
        initialMessageText: "",
        initialMessageIsPrivate: false,
        files: [],
      });
      if (verificationInitialFilesInputRef.current) {
        verificationInitialFilesInputRef.current.value = "";
      }
    },
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: () => deleteEquipment(token ?? "", equipmentId),
    onSuccess: () => {
      setConfirmDeleteOpen(false);
      navigate("/equipment");
      void Promise.all([
        invalidateEquipmentRegistryQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: ["equipment-details", equipmentId] }),
        queryClient.invalidateQueries({ queryKey: ["equipment-item", equipmentId] }),
      ]);
    },
  });

  return {
    confirmDeleteOpen,
    setConfirmDeleteOpen,
    repairModalOpen,
    setRepairModalOpen,
    verificationModalOpen,
    setVerificationModalOpen,
    repairForm,
    setRepairForm,
    verificationForm,
    setVerificationForm,
    repairInitialFilesInputRef,
    verificationInitialFilesInputRef,
    updateArshinRefreshExclusionMutation,
    createRepairMutation,
    createVerificationMutation,
    deleteEquipmentMutation,
  };
}
