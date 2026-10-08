import { type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchArshinEsiDetail,
  fetchArshinVriDetail,
  getArshinErrorMessage,
  searchArshin,
  type ArshinSearchResult,
  type ArshinVriDetail,
} from "@/api/arshin";
import {
  buildSIVerificationPayloadFromArshin,
  canChangeEquipmentTypeAfterCreation,
  createEquipmentEsiCompositionEntry,
  deleteEquipmentEsiCompositionEntry,
  createEquipmentRepair,
  createEquipmentVerification,
  createEquipmentRepairMessage,
  createEquipmentVerificationMessage,
  createEquipmentComment,
  deleteEquipmentCommentDraftAttachment,
  deleteEquipmentRepairMessage,
  deleteEquipmentVerificationMessage,
  deleteEquipmentComment,
  deleteEquipmentAttachment,
  deleteEquipment,
  downloadEquipmentCommentAttachment,
  downloadRepairMessageAttachment,
  downloadVerificationMessageAttachment,
  downloadEquipmentAttachment,
  formatComplianceIntervalMonths,
  getArshinDocumentLabel,
  getArshinDocumentShortLabel,
  getEditableEquipmentTypeOptions,
  getEquipmentStatusLabel,
  getEquipmentStatusColor,
  getEquipmentComplianceDateLabel,
  getEquipmentCompliancePeriodLabel,
  getEquipmentNextDueDate,
  getEquipmentNextDueColumnLabel,
  getVerificationProgressLabel,
  isArshinEquipmentType,
  equipmentStatusLabels,
  equipmentTypeSelectionLabels,
  equipmentTypeLabels,
  fetchDeadlinePresets,
  fetchEquipmentDetails,
  fetchEquipmentFolderSuggestions,
  fetchEquipmentFolders,
  fetchEquipmentShareRecipients,
  fetchEquipmentRepairMessages,
  fetchEquipmentVerificationMessages,
  type EquipmentAttachment,
  type EquipmentComment,
  type EquipmentCommentAttachment,
  type EquipmentCommentDraftAttachment,
  type EquipmentDetailsResult,
  type EquipmentESICompositionEntry,
  type EquipmentFolder,
  type EquipmentItem,
  type ESIModuleKind,
  type RepairMessage,
  type RepairMessageAttachment,
  type EquipmentSIVerification,
  type EquipmentStatus,
  type EquipmentType,
  type VerificationMessage,
  type VerificationMessageAttachment,
  type VerificationFlowMode,
  refreshEquipmentSi,
  shareEquipment,
  supportsVerification,
  updateEquipmentArshinRefreshExclusion,
  updateEquipmentEsiCompositionEntry,
  updateEquipmentComment,
  updateEquipmentRepairMessage,
  updateEquipmentVerificationMessage,
  uploadEquipmentAttachment,
  uploadEquipmentCommentDraftAttachment,
  updateEquipment,
} from "@/api/equipment";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { AutocompleteTextarea } from "@/components/AutocompleteTextarea";
import { AttachmentPreviewList } from "@/components/AttachmentPreviewList";
import { DateInput } from "@/components/DateInput";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { EmojiPickerButton } from "@/components/EmojiPickerButton";
import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";
import { IconActionLink } from "@/components/IconActionLink";
import { Modal } from "@/components/Modal";
import { PendingAttachmentList } from "@/components/PendingAttachmentList";
import { ProcessVariantSelector } from "@/components/ProcessVariantSelector";
import { PrivateNoteBadge, PrivateNoteToggleButton } from "@/components/PrivateNoteControls";
import { EquipmentTasksSection } from "@/components/EquipmentTasksSection";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  appendPendingFiles,
  buildPendingFileKey,
  formatAttachmentShortMeta,
  openFilePicker,
  removePendingFile,
} from "@/lib/attachments";
import { buildMentionSuggestionOptions, sortAutocompleteSuggestions } from "@/lib/autocomplete";
import {
  handleTextareaSubmitShortcut,
  insertEmojiAtCursor,
  resizeTextareaToContent as resizeCommentInput,
} from "@/lib/textarea";
import {
  getProcessFormatButtonClass,
  getProcessVariantById,
  getRepairPresetVariants,
  getVerificationFlowModeForVariant,
  getVerificationPresetVariants,
} from "@/lib/processVariants";
import { hasOperatorAccess, roleLabels } from "@/lib/roles";
import { buildUserExtraInfo, matchesUserSearch, userSearchPlaceholder } from "@/lib/userSearch";
import { useAuthStore } from "@/store/auth";
import { fetchMentionUsers } from "@/api/users";

type EquipmentFormState = {
  folderId: string;
  objectName: string;
  equipmentType: EquipmentType;
  name: string;
  modification: string;
  serialNumber: string;
  manufactureYear: string;
  measurementRangeStart: string;
  measurementRangeEnd: string;
  measurementUnit: string;
  status: EquipmentStatus;
  currentLocationManual: string;
  complianceDate: string;
  complianceIntervalMonths: string;
  manualVerificationIntervalMonths: string;
};

type RepairFormState = {
  isOnSite: boolean;
  stageTemplateVariantId: string;
  routeCity: string;
  routeDestination: string;
  sentToRepairAt: string;
  initialMessageText: string;
  initialMessageIsPrivate: boolean;
  files: File[];
};

type VerificationFormState = {
  flowMode: VerificationFlowMode;
  stageTemplateVariantId: string;
  routeCity: string;
  routeDestination: string;
  sentToVerificationAt: string;
  initialMessageText: string;
  initialMessageIsPrivate: boolean;
  files: File[];
};

type ESICompositionFormState = {
  certificateNumber: string;
  measurementLimit: string;
};

const equipmentStatusOptions: EquipmentStatus[] = ["IN_WORK", "IN_VERIFICATION", "IN_REPAIR", "REPAIRED", "NOT_REPAIRABLE", "ARCHIVED"];
const complianceIntervalOptions = [
  { value: "12", label: "1 год" },
  { value: "24", label: "2 года" },
  { value: "36", label: "3 года" },
  { value: "48", label: "4 года" },
  { value: "60", label: "5 лет" },
] as const;

export function EquipmentDetailsPage() {
  const { equipmentId } = useParams();
  const parsedEquipmentId = Number(equipmentId);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EquipmentFormState | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
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
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<number | null>(null);
  const [downloadingCommentAttachmentId, setDownloadingCommentAttachmentId] = useState<number | null>(null);
  const [downloadingRepairAttachmentId, setDownloadingRepairAttachmentId] = useState<number | null>(null);
  const [downloadingVerificationAttachmentId, setDownloadingVerificationAttachmentId] = useState<number | null>(null);
  const [attachmentActionError, setAttachmentActionError] = useState<string | null>(null);
  const [commentActionError, setCommentActionError] = useState<string | null>(null);
  const [repairActionError, setRepairActionError] = useState<string | null>(null);
  const [verificationActionError, setVerificationActionError] = useState<string | null>(null);
  const [attachmentToDelete, setAttachmentToDelete] = useState<EquipmentAttachment | null>(null);
  const [pendingAttachmentFiles, setPendingAttachmentFiles] = useState<File[]>([]);
  const [uploadingAttachmentFileKeys, setUploadingAttachmentFileKeys] = useState<string[]>([]);
  const [attachmentUploadErrorsByKey, setAttachmentUploadErrorsByKey] = useState<
    Record<string, string>
  >({});
  const [commentDraft, setCommentDraft] = useState("");
  const [commentDraftIsPrivate, setCommentDraftIsPrivate] = useState(false);
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [commentUploadedAttachments, setCommentUploadedAttachments] = useState<
    Record<string, EquipmentCommentDraftAttachment>
  >({});
  const [uploadingCommentFileKeys, setUploadingCommentFileKeys] = useState<string[]>([]);
  const [commentUploadErrorsByKey, setCommentUploadErrorsByKey] = useState<
    Record<string, string>
  >({});
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [repairMessageDraft, setRepairMessageDraft] = useState("");
  const [repairMessageDraftIsPrivate, setRepairMessageDraftIsPrivate] = useState(false);
  const [verificationMessageDraft, setVerificationMessageDraft] = useState("");
  const [verificationMessageDraftIsPrivate, setVerificationMessageDraftIsPrivate] = useState(false);
  const [repairMessageFiles, setRepairMessageFiles] = useState<File[]>([]);
  const [verificationMessageFiles, setVerificationMessageFiles] = useState<File[]>([]);
  const [repairExpanded, setRepairExpanded] = useState(false);
  const [verificationExpanded, setVerificationExpanded] = useState(false);
  const [repairDialogExpanded, setRepairDialogExpanded] = useState(false);
  const [verificationDialogExpanded, setVerificationDialogExpanded] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [siExpanded, setSiExpanded] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [selectedShareUserIds, setSelectedShareUserIds] = useState<number[]>([]);
  const [shareUserSearchQuery, setShareUserSearchQuery] = useState("");
  const [shareFeedbackMessage, setShareFeedbackMessage] = useState<string | null>(null);
  const [esiCompositionModalOpen, setEsiCompositionModalOpen] = useState(false);
  const [esiCompositionForm, setEsiCompositionForm] = useState<ESICompositionFormState>({
    certificateNumber: "",
    measurementLimit: "",
  });
  const [esiCompositionSearchResults, setEsiCompositionSearchResults] = useState<ArshinSearchResult[]>([]);
  const [selectedEsiCompositionResult, setSelectedEsiCompositionResult] = useState<ArshinSearchResult | null>(null);
  const [selectedEsiCompositionDetail, setSelectedEsiCompositionDetail] = useState<ArshinVriDetail | null>(null);
  const [siRefreshCertificate, setSiRefreshCertificate] = useState("");
  const [siRefreshResults, setSiRefreshResults] = useState<ArshinSearchResult[]>([]);
  const [selectedSiRefreshResult, setSelectedSiRefreshResult] = useState<ArshinSearchResult | null>(null);
  const [selectedSiRefreshDetail, setSelectedSiRefreshDetail] = useState<ArshinVriDetail | null>(null);
  const [esiCompositionPreview, setEsiCompositionPreview] = useState<{
    row: ESIRelatedProfileRow;
    detail: ArshinVriDetail;
  } | null>(null);
  const [editingEsiModule, setEditingEsiModule] = useState<ESIRelatedProfileRow | null>(null);
  const [editingEsiMeasurementLimit, setEditingEsiMeasurementLimit] = useState("");
  const [esiModuleToDelete, setEsiModuleToDelete] = useState<ESIRelatedProfileRow | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [commentEditDraft, setCommentEditDraft] = useState("");
  const [editingRepairMessageId, setEditingRepairMessageId] = useState<number | null>(null);
  const [repairMessageEditDraft, setRepairMessageEditDraft] = useState("");
  const [editingVerificationMessageId, setEditingVerificationMessageId] = useState<number | null>(null);
  const [verificationMessageEditDraft, setVerificationMessageEditDraft] = useState("");
  const [commentToDelete, setCommentToDelete] = useState<EquipmentComment | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const commentFilesInputRef = useRef<HTMLInputElement | null>(null);
  const repairInitialFilesInputRef = useRef<HTMLInputElement | null>(null);
  const verificationInitialFilesInputRef = useRef<HTMLInputElement | null>(null);
  const repairMessageFilesInputRef = useRef<HTMLInputElement | null>(null);
  const verificationMessageFilesInputRef = useRef<HTMLInputElement | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const commentFilesRef = useRef<File[]>([]);
  const commentUploadedAttachmentsRef = useRef<Record<string, EquipmentCommentDraftAttachment>>(
    {},
  );
  const commentUploadPromisesRef = useRef(
    new Map<string, Promise<EquipmentCommentDraftAttachment | null>>(),
  );
  const repairMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const verificationMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const editCommentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const editRepairMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const editVerificationMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const canManage = hasOperatorAccess(user?.role);
  const targetCommentId = Number(searchParams.get("commentId") ?? "");
  const [flashingCommentId, setFlashingCommentId] = useState<number | null>(null);

  const equipmentQuery = useQuery({
    queryKey: ["equipment-details", parsedEquipmentId],
    queryFn: () => fetchEquipmentDetails(token ?? "", parsedEquipmentId),
    enabled: Boolean(token) && Number.isInteger(parsedEquipmentId) && parsedEquipmentId > 0,
  });

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders"],
    queryFn: () => fetchEquipmentFolders(token ?? ""),
    enabled: Boolean(token),
  });
  const deadlinePresetsQuery = useQuery({
    queryKey: ["deadline-presets", "equipment-details"],
    queryFn: () => fetchDeadlinePresets(token ?? "", { includeInactive: true }),
    enabled: Boolean(token) && canManage,
  });

  const suggestionsFolderId = Number(
    form?.folderId ?? equipmentQuery.data?.equipment.folderId ?? 0,
  );
  const folderSuggestionsQuery = useQuery({
    queryKey: ["equipment-folder-suggestions", suggestionsFolderId || "none"],
    queryFn: () => fetchEquipmentFolderSuggestions(token ?? "", suggestionsFolderId),
    enabled: Boolean(token) && suggestionsFolderId > 0,
  });

  const mentionUsersQuery = useQuery({
    queryKey: ["mention-users"],
    queryFn: () => fetchMentionUsers(token ?? ""),
    enabled: Boolean(token),
  });

  const shareRecipientsQuery = useQuery({
    queryKey: ["equipment-share-recipients", parsedEquipmentId],
    queryFn: () => fetchEquipmentShareRecipients(token ?? "", parsedEquipmentId),
    enabled:
      Boolean(token)
      && Number.isInteger(parsedEquipmentId)
      && parsedEquipmentId > 0
      && shareModalOpen,
  });

  async function invalidateEquipmentRegistryQueries() {
    await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
    await queryClient.invalidateQueries({ queryKey: ["equipment-items-page"] });
    await queryClient.invalidateQueries({ queryKey: ["equipment-selected-items"] });
  }

  const repairMessagesQuery = useQuery({
    queryKey: ["equipment-repair-messages", parsedEquipmentId],
    queryFn: () => fetchEquipmentRepairMessages(token ?? "", parsedEquipmentId),
    enabled:
      Boolean(token)
      && Number.isInteger(parsedEquipmentId)
      && parsedEquipmentId > 0
      && Boolean(equipmentQuery.data?.equipment.activeRepair)
      && repairExpanded
      && repairDialogExpanded,
  });

  const verificationMessagesQuery = useQuery({
    queryKey: ["equipment-verification-messages", parsedEquipmentId],
    queryFn: () => fetchEquipmentVerificationMessages(token ?? "", parsedEquipmentId),
    enabled:
      Boolean(token)
      && Number.isInteger(parsedEquipmentId)
      && parsedEquipmentId > 0
      && Boolean(equipmentQuery.data?.equipment.activeVerification)
      && verificationExpanded
      && verificationDialogExpanded,
  });

  const equipment = equipmentQuery.data?.equipment ?? null;
  const filteredShareRecipients = useMemo(
    () =>
      (shareRecipientsQuery.data?.users ?? []).filter((userItem) =>
        matchesUserSearch(userItem, shareUserSearchQuery),
      ),
    [shareRecipientsQuery.data?.users, shareUserSearchQuery],
  );

  const updateEquipmentMutation = useMutation({
    mutationFn: () => {
      if (!form) {
        throw new Error("Форма не инициализирована.");
      }
      if (!form.folderId) {
        throw new Error("Папка обязательна для прибора.");
      }
      return updateEquipment(token ?? "", parsedEquipmentId, {
        folderId: Number(form.folderId),
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
        createdManually: equipment?.createdManually ?? false,
        excludeFromArshinRefresh: equipment?.excludeFromArshinRefresh ?? false,
        currentLocationManual: form.currentLocationManual,
        complianceDate: form.complianceDate || null,
        complianceIntervalMonths: form.complianceIntervalMonths
          ? Number(form.complianceIntervalMonths)
          : null,
        manualVerificationIntervalMonths:
          form.equipmentType === "SI" && form.manualVerificationIntervalMonths
            ? Number(form.manualVerificationIntervalMonths)
            : null,
      });
    },
    onSuccess: async () => {
      setIsEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", parsedEquipmentId] });
      await invalidateEquipmentRegistryQueries();
    },
  });

  const updateArshinRefreshExclusionMutation = useMutation({
    mutationFn: (excludeFromArshinRefresh: boolean) =>
      updateEquipmentArshinRefreshExclusion(
        token ?? "",
        parsedEquipmentId,
        excludeFromArshinRefresh,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", parsedEquipmentId] });
      await invalidateEquipmentRegistryQueries();
    },
  });

  const createRepairMutation = useMutation({
    mutationFn: () => {
      const processFolder = getCurrentProcessFolder(foldersQuery.data ?? [], equipment);
      const livePreset =
        (deadlinePresetsQuery.data ?? []).find(
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
      return createEquipmentRepair(token ?? "", parsedEquipmentId, {
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
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", parsedEquipmentId] });
      await invalidateEquipmentRegistryQueries();
      await queryClient.invalidateQueries({ queryKey: ["equipment-repair-messages", parsedEquipmentId] });
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
      const processFolder = getCurrentProcessFolder(foldersQuery.data ?? [], equipment);
      const livePreset =
        (deadlinePresetsQuery.data ?? []).find(
          (preset) => preset.id === processFolder?.deadlinePresetId,
        ) ?? null;
      const selectedVariant = getProcessVariantById(
        livePreset?.verificationStageTemplates?.variants
          ?? getVerificationPresetVariants(processFolder),
        verificationForm.stageTemplateVariantId,
      );
      const flowMode = getVerificationFlowModeForVariant(selectedVariant)
        ?? verificationForm.flowMode;
      return createEquipmentVerification(token ?? "", parsedEquipmentId, {
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
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", parsedEquipmentId] });
      await invalidateEquipmentRegistryQueries();
      await queryClient.invalidateQueries({
        queryKey: ["equipment-verification-messages", parsedEquipmentId],
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

  const createRepairMessageMutation = useMutation({
    mutationFn: () =>
      createEquipmentRepairMessage(token ?? "", parsedEquipmentId, {
        text: repairMessageDraft,
        isPrivate: repairMessageDraftIsPrivate,
        files: repairMessageFiles,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-repair-messages", parsedEquipmentId] });
      setRepairActionError(null);
      setRepairMessageDraft("");
      setRepairMessageDraftIsPrivate(false);
      setRepairMessageFiles([]);
      if (repairMessageFilesInputRef.current) {
        repairMessageFilesInputRef.current.value = "";
      }
    },
  });

  const createVerificationMessageMutation = useMutation({
    mutationFn: () =>
      createEquipmentVerificationMessage(token ?? "", parsedEquipmentId, {
        text: verificationMessageDraft,
        isPrivate: verificationMessageDraftIsPrivate,
        files: verificationMessageFiles,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      await queryClient.invalidateQueries({
        queryKey: ["equipment-verification-messages", parsedEquipmentId],
      });
      setVerificationActionError(null);
      setVerificationMessageDraft("");
      setVerificationMessageDraftIsPrivate(false);
      setVerificationMessageFiles([]);
      if (verificationMessageFilesInputRef.current) {
        verificationMessageFilesInputRef.current.value = "";
      }
    },
  });

  const deleteVerificationMessageMutation = useMutation({
    mutationFn: (messageId: number) =>
      deleteEquipmentVerificationMessage(token ?? "", parsedEquipmentId, messageId),
    onSuccess: async () => {
      setVerificationActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      await queryClient.invalidateQueries({
        queryKey: ["equipment-verification-messages", parsedEquipmentId],
      });
    },
  });

  const deleteRepairMessageMutation = useMutation({
    mutationFn: (messageId: number) =>
      deleteEquipmentRepairMessage(token ?? "", parsedEquipmentId, messageId),
    onSuccess: async () => {
      setRepairActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-repair-messages", parsedEquipmentId] });
    },
  });

  const updateRepairMessageMutation = useMutation({
    mutationFn: ({
      messageId,
      text,
    }: {
      messageId: number;
      text: string;
    }) => updateEquipmentRepairMessage(token ?? "", parsedEquipmentId, messageId, { text }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-repair-messages", parsedEquipmentId] });
      setEditingRepairMessageId(null);
      setRepairMessageEditDraft("");
      setRepairActionError(null);
    },
  });

  const updateVerificationMessageMutation = useMutation({
    mutationFn: ({
      messageId,
      text,
    }: {
      messageId: number;
      text: string;
    }) =>
      updateEquipmentVerificationMessage(token ?? "", parsedEquipmentId, messageId, { text }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      await queryClient.invalidateQueries({
        queryKey: ["equipment-verification-messages", parsedEquipmentId],
      });
      setEditingVerificationMessageId(null);
      setVerificationMessageEditDraft("");
      setVerificationActionError(null);
    },
  });


  const deleteEquipmentMutation = useMutation({
    mutationFn: () => deleteEquipment(token ?? "", parsedEquipmentId),
    onSuccess: () => {
      setConfirmDeleteOpen(false);
      navigate("/equipment");
      void Promise.all([
        invalidateEquipmentRegistryQueries(),
        queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] }),
        queryClient.invalidateQueries({ queryKey: ["equipment-item", parsedEquipmentId] }),
      ]);
    },
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const uploadedKeys: string[] = [];
      const uploadedAttachments: EquipmentAttachment[] = [];
      const failedUploads: Array<{ fileKey: string; fileName: string; message: string }> = [];

      for (const file of files) {
        try {
          const uploadedAttachment = await uploadEquipmentAttachment(token ?? "", parsedEquipmentId, file);
          uploadedKeys.push(buildPendingFileKey(file));
          uploadedAttachments.push(uploadedAttachment);
        } catch (error) {
          failedUploads.push({
            fileKey: buildPendingFileKey(file),
            fileName: file.name,
            message:
              error instanceof Error ? error.message : "Не удалось загрузить вложение.",
          });
        }
      }

      return { uploadedAttachments, uploadedKeys, failedUploads };
    },
    onMutate: (files) => {
      setAttachmentActionError(null);
      setUploadingAttachmentFileKeys(files.map((file) => buildPendingFileKey(file)));
      setAttachmentUploadErrorsByKey((current) => {
        const next = { ...current };
        for (const file of files) {
          delete next[buildPendingFileKey(file)];
        }
        return next;
      });
    },
    onSuccess: async ({ failedUploads, uploadedAttachments, uploadedKeys }) => {
      if (uploadedKeys.length) {
        setPendingAttachmentFiles((current) =>
          current.filter((file) => !uploadedKeys.includes(buildPendingFileKey(file))),
        );
        if (attachmentInputRef.current) {
          attachmentInputRef.current.value = "";
        }
      }

      if (uploadedAttachments.length) {
        queryClient.setQueryData<EquipmentDetailsResult | undefined>(
          ["equipment-details", parsedEquipmentId],
          (current) =>
            current
              ? {
                  ...current,
                  attachments: mergeEquipmentAttachments(current.attachments, uploadedAttachments),
                }
              : current,
        );
        await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      }

      if (!failedUploads.length) {
        setAttachmentUploadErrorsByKey((current) => {
          const next = { ...current };
          for (const uploadedKey of uploadedKeys) {
            delete next[uploadedKey];
          }
          return next;
        });
        setAttachmentActionError(null);
        return;
      }

      setAttachmentUploadErrorsByKey((current) => {
        const next = { ...current };
        for (const uploadedKey of uploadedKeys) {
          delete next[uploadedKey];
        }
        for (const failedUpload of failedUploads) {
          next[failedUpload.fileKey] = failedUpload.message;
        }
        return next;
      });
      setAttachmentActionError(
        failedUploads.length === 1
          ? `Не удалось загрузить файл ${failedUploads[0].fileName}: ${failedUploads[0].message}`
          : `Не удалось загрузить ${failedUploads.length} файлов. Проверь сообщения у проблемных вложений.`,
      );
    },
    onSettled: () => {
      setUploadingAttachmentFileKeys([]);
    },
  });
  const isAttachmentUploadPending = uploadAttachmentMutation.isPending;
  const triggerAttachmentUpload = uploadAttachmentMutation.mutateAsync;

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: number) =>
      deleteEquipmentAttachment(token ?? "", parsedEquipmentId, attachmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      setAttachmentToDelete(null);
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: ({
      text,
      isPrivate,
      uploadedAttachmentTokens,
    }: {
      text: string;
      isPrivate: boolean;
      uploadedAttachmentTokens: string[];
    }) =>
      createEquipmentComment(token ?? "", parsedEquipmentId, {
        text,
        isPrivate,
        uploadedAttachmentTokens,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      setCommentDraft("");
      setCommentDraftIsPrivate(false);
      setCommentFiles([]);
      commentFilesRef.current = [];
      setCommentUploadedAttachments({});
      commentUploadedAttachmentsRef.current = {};
      setCommentUploadErrorsByKey({});
      setCommentActionError(null);
      if (commentFilesInputRef.current) {
        commentFilesInputRef.current.value = "";
      }
    },
  });

  const updateCommentMutation = useMutation({
    mutationFn: ({
      commentId,
      text,
    }: {
      commentId: number;
      text: string;
    }) => updateEquipmentComment(token ?? "", parsedEquipmentId, commentId, { text }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      setEditingCommentId(null);
      setCommentEditDraft("");
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: number) => deleteEquipmentComment(token ?? "", parsedEquipmentId, commentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      setCommentToDelete(null);
    },
  });

  const searchSiRefreshMutation = useMutation({
    mutationFn: (documentNumber: string) =>
      searchArshin(token ?? "", {
        registryKind: equipment?.equipmentType === "ESI" ? "ESI" : "SI",
        ...(equipment?.equipmentType === "ESI"
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
        equipment?.equipmentType === "ESI"
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
        || (equipment?.equipmentType === "SI" && !selectedSiRefreshDetail)
      ) {
        throw new Error("Сначала выбери новую запись Аршина.");
      }
      return refreshEquipmentSi(
        token ?? "",
        parsedEquipmentId,
        buildSIVerificationPayloadFromArshin(selectedSiRefreshResult, selectedSiRefreshDetail),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", parsedEquipmentId] });
      await invalidateEquipmentRegistryQueries();
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
      return createEquipmentEsiCompositionEntry(token ?? "", parsedEquipmentId, {
        moduleKind: "EXTERNAL",
        measurementLimit: esiCompositionForm.measurementLimit,
        siVerification: buildSIVerificationPayloadFromArshin(
          selectedEsiCompositionResult,
          selectedEsiCompositionDetail,
        ),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
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
        parsedEquipmentId,
        editingEsiModule.entryId,
        {
          measurementLimit: editingEsiMeasurementLimit,
        },
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
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
        parsedEquipmentId,
        esiModuleToDelete.entryId,
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-details", parsedEquipmentId] });
      setEsiModuleToDelete(null);
    },
  });

  const shareEquipmentMutation = useMutation({
    mutationFn: async () => {
      if (!token) {
        throw new Error("Сессия неактивна. Войди заново.");
      }
      return shareEquipment(token, parsedEquipmentId, selectedShareUserIds);
    },
    onSuccess: (result) => {
      setShareFeedbackMessage(result.message);
      closeShareModal();
    },
  });

  function openShareModal(): void {
    setSelectedShareUserIds([]);
    setShareUserSearchQuery("");
    setShareFeedbackMessage(null);
    shareEquipmentMutation.reset();
    setShareModalOpen(true);
  }

  function closeShareModal(): void {
    setShareModalOpen(false);
    setSelectedShareUserIds([]);
    setShareUserSearchQuery("");
    shareEquipmentMutation.reset();
  }

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

  const equipmentFormResetKey = equipment ? `${equipment.id}:${equipment.updatedAt}` : null;
  const equipmentFormSeedRef = useRef<EquipmentFormState | null>(null);
  equipmentFormSeedRef.current = equipment
    ? {
        folderId: equipment.folderId ? String(equipment.folderId) : "",
        objectName: equipment.objectName,
        equipmentType: equipment.equipmentType,
        name: equipment.name,
        modification: equipment.modification ?? "",
        serialNumber: equipment.serialNumber ?? "",
        manufactureYear: equipment.manufactureYear ? String(equipment.manufactureYear) : "",
        measurementRangeStart: equipment.measurementRangeStart ?? "",
        measurementRangeEnd: equipment.measurementRangeEnd ?? "",
        measurementUnit: equipment.measurementUnit ?? "",
        status: equipment.status,
        currentLocationManual: equipment.currentLocationManual ?? "",
        complianceDate: equipment.complianceDate ?? "",
        complianceIntervalMonths: equipment.complianceIntervalMonths
          ? String(equipment.complianceIntervalMonths)
          : "",
        manualVerificationIntervalMonths: equipment.manualVerificationIntervalMonths
          ? String(equipment.manualVerificationIntervalMonths)
          : "",
      }
    : null;

  useEffect(() => {
    if (!equipmentFormResetKey || !equipmentFormSeedRef.current) {
      return;
    }

    setForm(equipmentFormSeedRef.current);
  }, [equipmentFormResetKey]);
  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const folderSuggestions = folderSuggestionsQuery.data;
  const editableEquipmentTypeOptions = equipment
    ? getEditableEquipmentTypeOptions(equipment.equipmentType)
    : [];
  const canEditEquipmentType = equipment
    ? canChangeEquipmentTypeAfterCreation(equipment.equipmentType)
    : false;
  const objectNameSuggestions = useMemo(
    () => Array.from(new Set(folderSuggestions?.objectNames ?? [])).sort(),
    [folderSuggestions?.objectNames],
  );
  const currentLocationSuggestions = useMemo(
    () => Array.from(new Set(folderSuggestions?.currentLocations ?? [])).sort(),
    [folderSuggestions?.currentLocations],
  );
  const measurementUnitSuggestions = useMemo(
    () => Array.from(new Set(folderSuggestions?.measurementUnits ?? [])).sort(),
    [folderSuggestions?.measurementUnits],
  );
  const routeCitySuggestions = useMemo(
    () => Array.from(new Set(folderSuggestions?.repairRouteCities ?? [])).sort(),
    [folderSuggestions?.repairRouteCities],
  );
  const routeDestinationSuggestions = useMemo(
    () => Array.from(new Set(folderSuggestions?.repairRouteDestinations ?? [])).sort(),
    [folderSuggestions?.repairRouteDestinations],
  );
  const processTextSuggestions = useMemo(
    () =>
      sortAutocompleteSuggestions([
        folders.find((folder) => folder.id === equipment?.folderId)?.name,
        equipment?.objectName,
        equipment?.name,
        equipment?.modification,
        equipment?.serialNumber,
        equipment?.currentLocationManual,
        equipment?.siVerification?.resultDocnum,
        equipment?.siVerification?.mitNumber,
        equipment?.siVerification?.miNumber,
        ...objectNameSuggestions,
        ...currentLocationSuggestions,
        ...routeCitySuggestions,
        ...routeDestinationSuggestions,
      ]),
    [
      currentLocationSuggestions,
      equipment?.currentLocationManual,
      equipment?.folderId,
      equipment?.modification,
      equipment?.name,
      equipment?.objectName,
      equipment?.serialNumber,
      equipment?.siVerification?.miNumber,
      equipment?.siVerification?.mitNumber,
      equipment?.siVerification?.resultDocnum,
      folders,
      objectNameSuggestions,
      routeCitySuggestions,
      routeDestinationSuggestions,
    ],
  );
  const mentionSuggestions = useMemo(
    () => buildMentionSuggestionOptions(mentionUsersQuery.data ?? []),
    [mentionUsersQuery.data],
  );
  const textareaSuggestions = useMemo(
    () => [...mentionSuggestions, ...processTextSuggestions],
    [mentionSuggestions, processTextSuggestions],
  );
  const currentFolder = folders.find((folder) => folder.id === equipment?.folderId) ?? null;
  const currentFolderDeadlinePreset =
    (deadlinePresetsQuery.data ?? []).find(
      (preset) => preset.id === currentFolder?.deadlinePresetId,
    ) ?? null;
  const repairPresetVariants =
    currentFolderDeadlinePreset?.repairStageTemplates?.variants
    ?? getRepairPresetVariants(currentFolder);
  const verificationPresetVariants =
    currentFolderDeadlinePreset?.verificationStageTemplates?.variants
    ?? getVerificationPresetVariants(currentFolder);
  const hasRepairPresetVariantConfig = Boolean(
    currentFolderDeadlinePreset?.repairStageTemplates
    ?? currentFolder?.deadlinePresetSnapshot?.repairStageTemplates,
  );
  const hasVerificationPresetVariantConfig = Boolean(
    currentFolderDeadlinePreset?.verificationStageTemplates
    ?? currentFolder?.deadlinePresetSnapshot?.verificationStageTemplates,
  );
  const selectedRepairPresetVariant = getProcessVariantById(
    repairPresetVariants,
    repairForm.stageTemplateVariantId,
  );
  const selectedVerificationPresetVariant = getProcessVariantById(
    verificationPresetVariants,
    verificationForm.stageTemplateVariantId,
  );
  const effectiveRepairIsOnSite = selectedRepairPresetVariant
    ? selectedRepairPresetVariant.routeKind === "on_site"
    : repairForm.isOnSite;
  const effectiveVerificationFlowMode =
    getVerificationFlowModeForVariant(selectedVerificationPresetVariant)
    ?? verificationForm.flowMode;
  useEffect(() => {
    if (!repairModalOpen || repairForm.stageTemplateVariantId || !repairPresetVariants.length) {
      return;
    }
    const firstVariant = repairPresetVariants[0];
    setRepairForm((current) => ({
      ...current,
      stageTemplateVariantId: firstVariant.id,
      isOnSite: firstVariant.routeKind === "on_site",
    }));
  }, [repairForm.stageTemplateVariantId, repairModalOpen, repairPresetVariants]);
  useEffect(() => {
    if (
      !verificationModalOpen
      || verificationForm.stageTemplateVariantId
      || !verificationPresetVariants.length
    ) {
      return;
    }
    const firstVariant = verificationPresetVariants[0];
    setVerificationForm((current) => ({
      ...current,
      stageTemplateVariantId: firstVariant.id,
      flowMode: getVerificationFlowModeForVariant(firstVariant) ?? current.flowMode,
    }));
  }, [
    verificationForm.stageTemplateVariantId,
    verificationModalOpen,
    verificationPresetVariants,
  ]);
  const attachments = useMemo(() => equipmentQuery.data?.attachments ?? [], [equipmentQuery.data]);
  const uploadingAttachmentFileKeySet = useMemo(
    () => new Set(uploadingAttachmentFileKeys),
    [uploadingAttachmentFileKeys],
  );
  const uploadingAttachmentCount = useMemo(
    () =>
      pendingAttachmentFiles.filter((file) =>
        uploadingAttachmentFileKeySet.has(buildPendingFileKey(file)),
      ).length,
    [pendingAttachmentFiles, uploadingAttachmentFileKeySet],
  );
  const queuedAttachmentCount = Math.max(
    0,
    pendingAttachmentFiles.length - uploadingAttachmentCount,
  );
  const comments = useMemo(() => equipmentQuery.data?.comments ?? [], [equipmentQuery.data]);
  const activeRepair = equipment?.activeRepair ?? null;
  const activeVerification = equipment?.activeVerification ?? null;
  const repairMessages = useMemo(
    () => repairMessagesQuery.data ?? [],
    [repairMessagesQuery.data],
  );
  const repairMessageCount = Math.max(
    equipmentQuery.data?.activeRepairMessageCount ?? 0,
    repairMessages.length,
  );
  const verificationMessages = useMemo(
    () => verificationMessagesQuery.data ?? [],
    [verificationMessagesQuery.data],
  );
  const verificationMessageCount = Math.max(
    equipmentQuery.data?.activeVerificationMessageCount ?? 0,
    verificationMessages.length,
  );
  const verificationHistory = useMemo(
    () => equipmentQuery.data?.verificationHistory ?? [],
    [equipmentQuery.data],
  );
  const repairHistory = useMemo(() => equipmentQuery.data?.repairHistory ?? [], [equipmentQuery.data]);
  const latestArchivedVerification = verificationHistory.length
    ? verificationHistory[0]
    : null;
  const latestArchivedRepair = repairHistory.length
    ? repairHistory[0]
    : null;
  const nextDueDate = equipment ? getEquipmentNextDueDate(equipment) : null;
  const activeRepairLink = activeRepair
    ? `/repairs?tab=active&equipmentId=${parsedEquipmentId}${
      activeRepair.batchKey
        ? `&batchKey=${encodeURIComponent(activeRepair.batchKey)}`
        : `&repairId=${activeRepair.id}`
    }`
    : null;
  const activeVerificationLink = activeVerification
    ? `/verification/si?tab=active&equipmentId=${parsedEquipmentId}${
      activeVerification.batchKey
        ? `&batchKey=${encodeURIComponent(activeVerification.batchKey)}`
        : `&verificationId=${activeVerification.id}`
    }`
    : null;
  const siDetail = useMemo(
    () =>
      equipment?.siVerification
        ? extractSiCardDetail(equipment.equipmentType, equipment.siVerification)
        : null,
    [equipment?.equipmentType, equipment?.siVerification],
  );
  const esiCompositionRows = useMemo(() => {
    if (equipment?.equipmentType !== "ESI") {
      return [] as ESIRelatedProfileRow[];
    }

    const persistedRows = (equipmentQuery.data?.esiCompositionEntries ?? []).map((entry) => ({
      entryId: entry.id,
      moduleKind: entry.moduleKind,
      selected: equipment.siVerification?.vriId === entry.vriId,
      vriId: entry.vriId,
      rawPayloadJson: entry.detailPayloadJson ?? entry.rawPayloadJson,
      registryNumber: entry.resultDocnum,
      measurementLimit: entry.measurementLimit,
      rank: buildStoredEsiCompositionRank(entry),
      title: entry.mitTitle,
      modification: buildStoredEsiCompositionModification(entry),
      serialNumber: entry.miNumber,
      manufactureYear: buildStoredEsiCompositionYear(entry),
      verificationDate: normalizeDisplayDate(entry.verificationDate),
      validUntil: normalizeDisplayDate(entry.validDate),
      certificateNumber: buildStoredEsiCompositionCertificate(entry),
      arshinUrl: entry.arshinUrl,
      canDelete: entry.moduleKind === "EXTERNAL",
    }));
    if (persistedRows.length > 0) {
      return sortEsiCompositionRows(persistedRows);
    }

    return sortEsiCompositionRows(siDetail?.relatedEsiProfiles ?? []);
  }, [equipment, equipmentQuery.data?.esiCompositionEntries, siDetail?.relatedEsiProfiles]);
  const siIdentityRows: Array<[string, string | null]> =
    [];
  const siEtalonMetaRows: Array<[string, string | null]> =
    [];
  const siVerificationDocumentRows: Array<[string, string | null]> =
    equipment && siDetail
        ? [[getArshinDocumentLabel(equipment.equipmentType), siDetail.certificateNumber]]
        : [];
  const latestComment = comments.length > 0 ? comments[comments.length - 1] : null;
  const canSubmitComment = commentDraft.trim().length > 0 || commentFiles.length > 0;
  const isCommentComposerBusy = isSubmittingComment || createCommentMutation.isPending;

  useEffect(() => {
    commentFilesRef.current = commentFiles;
  }, [commentFiles]);

  useEffect(() => {
    commentUploadedAttachmentsRef.current = commentUploadedAttachments;
  }, [commentUploadedAttachments]);

  useEffect(() => {
    if (!commentInputRef.current) {
      return;
    }
    resizeCommentInput(commentInputRef.current);
  }, [commentDraft]);

  useEffect(() => {
    if (!repairMessageInputRef.current) {
      return;
    }
    resizeCommentInput(repairMessageInputRef.current);
  }, [repairMessageDraft]);

  useEffect(() => {
    if (!verificationMessageInputRef.current) {
      return;
    }
    resizeCommentInput(verificationMessageInputRef.current);
  }, [verificationMessageDraft]);

  useEffect(() => {
    if (!editCommentInputRef.current) {
      return;
    }
    resizeCommentInput(editCommentInputRef.current);
  }, [commentEditDraft, editingCommentId]);

  useEffect(() => {
    if (!editRepairMessageInputRef.current) {
      return;
    }
    resizeCommentInput(editRepairMessageInputRef.current);
  }, [editingRepairMessageId, repairMessageEditDraft]);

  useEffect(() => {
    if (!editVerificationMessageInputRef.current) {
      return;
    }
    resizeCommentInput(editVerificationMessageInputRef.current);
  }, [editingVerificationMessageId, verificationMessageEditDraft]);

  useEffect(() => {
    setSiExpanded(false);
    setSiRefreshCertificate("");
    setSiRefreshResults([]);
    setSelectedSiRefreshResult(null);
    setSelectedSiRefreshDetail(null);
    setRepairActionError(null);
    setVerificationActionError(null);
    setRepairExpanded(false);
    setVerificationExpanded(false);
    setRepairDialogExpanded(false);
    setVerificationDialogExpanded(false);
    setCommentsExpanded(false);
  }, [parsedEquipmentId]);

  useEffect(() => {
    if (!Number.isInteger(targetCommentId) || targetCommentId <= 0 || !comments.length) {
      return;
    }
    if (!comments.some((comment) => comment.id === targetCommentId)) {
      return;
    }

    setCommentsExpanded(true);
    setFlashingCommentId(targetCommentId);
    window.setTimeout(() => {
      document
        .getElementById(`equipment-comment-${targetCommentId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
    const timeoutId = window.setTimeout(() => setFlashingCommentId(null), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [comments, targetCommentId]);

  useEffect(() => {
    if (isAttachmentUploadPending) {
      return;
    }

    const filesToUpload = pendingAttachmentFiles.filter(
      (file) => !attachmentUploadErrorsByKey[buildPendingFileKey(file)],
    );
    if (!filesToUpload.length) {
      return;
    }

    void triggerAttachmentUpload(filesToUpload);
  }, [
    attachmentUploadErrorsByKey,
    isAttachmentUploadPending,
    pendingAttachmentFiles,
    triggerAttachmentUpload,
  ]);

  if (!token) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await updateEquipmentMutation.mutateAsync();
  }

  async function handleCreateRepair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createRepairMutation.mutateAsync();
  }

  async function handleCreateVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createVerificationMutation.mutateAsync();
  }

  function handleRepairInitialFilesPick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setRepairForm((current) => ({
      ...current,
      files: appendPendingFiles(current.files, files),
    }));
    event.target.value = "";
  }

  function handleVerificationInitialFilesPick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setVerificationForm((current) => ({
      ...current,
      files: appendPendingFiles(current.files, files),
    }));
    event.target.value = "";
  }

  function handleRepairMessageFilesPick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setRepairMessageFiles((current) => appendPendingFiles(current, files));
    event.target.value = "";
  }

  function handleVerificationMessageFilesPick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setVerificationMessageFiles((current) => appendPendingFiles(current, files));
    event.target.value = "";
  }

  function handleAttachmentPick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setPendingAttachmentFiles((current) => appendPendingFiles(current, files));
    setAttachmentActionError(null);
    setAttachmentUploadErrorsByKey((current) => {
      const next = { ...current };
      for (const file of files) {
        delete next[buildPendingFileKey(file)];
      }
      return next;
    });
    event.target.value = "";
  }

  async function handleAttachmentDownload(attachment: EquipmentAttachment) {
    setAttachmentActionError(null);
    setDownloadingAttachmentId(attachment.id);
    try {
      const { blob, fileName } = await downloadEquipmentAttachment(
        token ?? "",
        parsedEquipmentId,
        attachment.id,
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setAttachmentActionError(
        error instanceof Error ? error.message : "Не удалось скачать вложение.",
      );
    } finally {
      setDownloadingAttachmentId(null);
    }
  }

  async function loadEquipmentAttachmentPreview(attachment: EquipmentAttachment) {
    const { blob } = await downloadEquipmentAttachment(token ?? "", parsedEquipmentId, attachment.id);
    return blob;
  }

  function handleCommentFilesPick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setCommentFiles((current) => {
      const next = appendPendingFiles(current, files);
      commentFilesRef.current = next;
      return next;
    });
    setCommentActionError(null);
    event.target.value = "";
    for (const file of files) {
      void uploadCommentDraftFile(file);
    }
  }

  function handleRemovePendingAttachment(file: File) {
    setPendingAttachmentFiles((current) => removePendingFile(current, file));
    setAttachmentUploadErrorsByKey((current) => {
      const fileKey = buildPendingFileKey(file);
      if (!(fileKey in current)) {
        return current;
      }
      const next = { ...current };
      delete next[fileKey];
      return next;
    });
  }

  function handleRemoveCommentFile(file: File) {
    const fileKey = buildPendingFileKey(file);
    setCommentFiles((current) => {
      const next = removePendingFile(current, file);
      commentFilesRef.current = next;
      return next;
    });
    setCommentUploadErrorsByKey((current) => {
      if (!(fileKey in current)) {
        return current;
      }
      const next = { ...current };
      delete next[fileKey];
      return next;
    });

    const uploadedAttachment = commentUploadedAttachmentsRef.current[fileKey];
    if (!uploadedAttachment) {
      return;
    }

    setCommentUploadedAttachments((current) => {
      const next = { ...current };
      delete next[fileKey];
      commentUploadedAttachmentsRef.current = next;
      return next;
    });
    void deleteEquipmentCommentDraftAttachment(
      token ?? "",
      parsedEquipmentId,
      uploadedAttachment.uploadToken,
    ).catch(() => undefined);
  }

  function handleRemoveRepairMessageFile(file: File) {
    setRepairMessageFiles((current) => removePendingFile(current, file));
  }

  function handleRemoveVerificationMessageFile(file: File) {
    setVerificationMessageFiles((current) => removePendingFile(current, file));
  }

  function handleRemoveRepairInitialFile(file: File) {
    setRepairForm((current) => ({
      ...current,
      files: removePendingFile(current.files, file),
    }));
  }

  function handleRemoveVerificationInitialFile(file: File) {
    setVerificationForm((current) => ({
      ...current,
      files: removePendingFile(current.files, file),
    }));
  }

  async function handleCommentAttachmentDownload(
    comment: EquipmentComment,
    attachment: EquipmentCommentAttachment,
  ) {
    setCommentActionError(null);
    setDownloadingCommentAttachmentId(attachment.id);
    try {
      const { blob, fileName } = await downloadEquipmentCommentAttachment(
        token ?? "",
        parsedEquipmentId,
        comment.id,
        attachment.id,
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setCommentActionError(
        error instanceof Error ? error.message : "Не удалось скачать вложение комментария.",
      );
    } finally {
      setDownloadingCommentAttachmentId(null);
    }
  }

  async function loadCommentAttachmentPreview(
    commentId: number,
    attachment: EquipmentCommentAttachment,
  ) {
    const { blob } = await downloadEquipmentCommentAttachment(
      token ?? "",
      parsedEquipmentId,
      commentId,
      attachment.id,
    );
    return blob;
  }

  async function uploadCommentDraftFile(
    file: File,
  ): Promise<EquipmentCommentDraftAttachment | null> {
    const fileKey = buildPendingFileKey(file);
    const uploadedAttachment = commentUploadedAttachmentsRef.current[fileKey];
    if (uploadedAttachment) {
      return uploadedAttachment;
    }

    const currentPromise = commentUploadPromisesRef.current.get(fileKey);
    if (currentPromise) {
      return currentPromise;
    }

    setCommentUploadErrorsByKey((current) => {
      if (!(fileKey in current)) {
        return current;
      }
      const next = { ...current };
      delete next[fileKey];
      return next;
    });
    setUploadingCommentFileKeys((current) =>
      current.includes(fileKey) ? current : [...current, fileKey],
    );

    const uploadPromise = uploadEquipmentCommentDraftAttachment(
      token ?? "",
      parsedEquipmentId,
      file,
    )
      .then(async (attachment) => {
        const isStillPresent = commentFilesRef.current.some(
          (currentFile) => buildPendingFileKey(currentFile) === fileKey,
        );
        if (!isStillPresent) {
          await deleteEquipmentCommentDraftAttachment(
            token ?? "",
            parsedEquipmentId,
            attachment.uploadToken,
          ).catch(() => undefined);
          return null;
        }

        setCommentUploadedAttachments((current) => {
          const next = { ...current, [fileKey]: attachment };
          commentUploadedAttachmentsRef.current = next;
          return next;
        });
        return attachment;
      })
      .catch((error) => {
        setCommentUploadErrorsByKey((current) => ({
          ...current,
          [fileKey]:
            error instanceof Error
              ? error.message
              : "Не удалось заранее загрузить вложение комментария.",
        }));
        return null;
      })
      .finally(() => {
        commentUploadPromisesRef.current.delete(fileKey);
        setUploadingCommentFileKeys((current) =>
          current.filter((currentFileKey) => currentFileKey !== fileKey),
        );
      });

    commentUploadPromisesRef.current.set(fileKey, uploadPromise);
    return uploadPromise;
  }

  async function ensureCommentAttachmentsUploaded(files: File[]): Promise<string[]> {
    await Promise.all(files.map((file) => uploadCommentDraftFile(file)));

    const uploadTokens: string[] = [];
    const failedFiles: string[] = [];
    for (const file of files) {
      const uploadedAttachment =
        commentUploadedAttachmentsRef.current[buildPendingFileKey(file)];
      if (!uploadedAttachment) {
        failedFiles.push(file.name);
        continue;
      }
      uploadTokens.push(uploadedAttachment.uploadToken);
    }

    if (failedFiles.length) {
      throw new Error(
        failedFiles.length === 1
          ? `Не удалось загрузить вложение: ${failedFiles[0]}.`
          : `Не удалось загрузить ${failedFiles.length} вложений.`,
      );
    }

    return uploadTokens;
  }

  function getCommentPendingFileStatus(file: File): string | null {
    const fileKey = buildPendingFileKey(file);
    if (commentUploadErrorsByKey[fileKey]) {
      return "Ошибка";
    }
    if (commentUploadedAttachments[fileKey]) {
      return "Готово";
    }
    return "В очереди";
  }

  async function handleCreateComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCommentActionError(null);
    if (!commentDraft.trim() && commentFiles.length === 0) {
      return;
    }
    setIsSubmittingComment(true);
    try {
      const uploadedAttachmentTokens = await ensureCommentAttachmentsUploaded(commentFiles);
      await createCommentMutation.mutateAsync({
        text: commentDraft,
        isPrivate: commentDraftIsPrivate,
        uploadedAttachmentTokens,
      });
    } catch (error) {
      setCommentActionError(
        error instanceof Error ? error.message : "Не удалось добавить комментарий.",
      );
    } finally {
      setIsSubmittingComment(false);
    }
  }

  async function handleCreateRepairMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRepairActionError(null);
    try {
      await createRepairMessageMutation.mutateAsync();
    } catch (error) {
      setRepairActionError(
        error instanceof Error ? error.message : "Не удалось добавить сообщение ремонта.",
      );
    }
  }

  async function handleCreateVerificationMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVerificationActionError(null);
    try {
      await createVerificationMessageMutation.mutateAsync();
    } catch (error) {
      setVerificationActionError(
        error instanceof Error ? error.message : "Не удалось добавить сообщение поверки.",
      );
    }
  }

  async function handleUpdateComment(event: FormEvent<HTMLFormElement>, commentId: number) {
    event.preventDefault();
    await updateCommentMutation.mutateAsync({
      commentId,
      text: commentEditDraft,
    });
  }

  async function handleUpdateRepairMessage(
    event: FormEvent<HTMLFormElement>,
    messageId: number,
  ) {
    event.preventDefault();
    await updateRepairMessageMutation.mutateAsync({
      messageId,
      text: repairMessageEditDraft,
    });
  }

  async function handleUpdateVerificationMessage(
    event: FormEvent<HTMLFormElement>,
    messageId: number,
  ) {
    event.preventDefault();
    await updateVerificationMessageMutation.mutateAsync({
      messageId,
      text: verificationMessageEditDraft,
    });
  }

  function handleInsertCommentEmoji(emoji: string) {
    setCommentDraft((current) => insertEmojiAtCursor(commentInputRef.current, current, emoji));
  }

  function handleInsertRepairInitialEmoji(emoji: string) {
    setRepairForm((current) => ({
      ...current,
      initialMessageText: insertEmojiAtCursor(null, current.initialMessageText, emoji),
    }));
  }

  function handleInsertVerificationInitialEmoji(emoji: string) {
    setVerificationForm((current) => ({
      ...current,
      initialMessageText: insertEmojiAtCursor(null, current.initialMessageText, emoji),
    }));
  }

  function handleInsertRepairMessageEmoji(emoji: string) {
    setRepairMessageDraft((current) =>
      insertEmojiAtCursor(repairMessageInputRef.current, current, emoji),
    );
  }

  function handleInsertVerificationMessageEmoji(emoji: string) {
    setVerificationMessageDraft((current) =>
      insertEmojiAtCursor(verificationMessageInputRef.current, current, emoji),
    );
  }

  function handleInsertEditCommentEmoji(emoji: string) {
    setCommentEditDraft((current) =>
      insertEmojiAtCursor(editCommentInputRef.current, current, emoji),
    );
  }

  function handleInsertEditRepairMessageEmoji(emoji: string) {
    setRepairMessageEditDraft((current) =>
      insertEmojiAtCursor(editRepairMessageInputRef.current, current, emoji),
    );
  }

  function handleInsertEditVerificationMessageEmoji(emoji: string) {
    setVerificationMessageEditDraft((current) =>
      insertEmojiAtCursor(editVerificationMessageInputRef.current, current, emoji),
    );
  }

  async function handleRepairAttachmentDownload(
    message: RepairMessage,
    attachment: RepairMessageAttachment,
  ) {
    setRepairActionError(null);
    setDownloadingRepairAttachmentId(attachment.id);
    try {
      const { blob, fileName } = await downloadRepairMessageAttachment(
        token ?? "",
        parsedEquipmentId,
        message.id,
        attachment.id,
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setRepairActionError(
        error instanceof Error ? error.message : "Не удалось скачать вложение ремонта.",
      );
    } finally {
      setDownloadingRepairAttachmentId(null);
    }
  }

  async function loadRepairAttachmentPreview(
    messageId: number,
    attachment: RepairMessageAttachment,
  ) {
    const { blob } = await downloadRepairMessageAttachment(
      token ?? "",
      parsedEquipmentId,
      messageId,
      attachment.id,
    );
    return blob;
  }

  async function handleVerificationAttachmentDownload(
    message: VerificationMessage,
    attachment: VerificationMessageAttachment,
  ) {
    setVerificationActionError(null);
    setDownloadingVerificationAttachmentId(attachment.id);
    try {
      const { blob, fileName } = await downloadVerificationMessageAttachment(
        token ?? "",
        parsedEquipmentId,
        message.id,
        attachment.id,
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setVerificationActionError(
        error instanceof Error ? error.message : "Не удалось скачать вложение поверки.",
      );
    } finally {
      setDownloadingVerificationAttachmentId(null);
    }
  }

  async function loadVerificationAttachmentPreview(
    messageId: number,
    attachment: VerificationMessageAttachment,
  ) {
    const { blob } = await downloadVerificationMessageAttachment(
      token ?? "",
      parsedEquipmentId,
      messageId,
      attachment.id,
    );
    return blob;
  }

  async function handleSearchSiRefresh(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await searchSiRefreshMutation.mutateAsync(siRefreshCertificate);
  }

  return (
    <section>
      <PageHeader
        title={equipment ? equipment.name : `Карточка прибора ${equipmentId ?? ""}`.trim()}
        description="Карточка прибора с общей эксплуатационной информацией. SI-специфичные данные будут расширяться отдельно."
      />

      {equipmentQuery.isLoading ? (
        <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
          <p className="text-sm text-steel">Загружаем карточку прибора...</p>
        </div>
      ) : null}

      {equipmentQuery.isError ? (
        <div className="rounded-3xl border border-line bg-white p-5 shadow-panel">
          <p className="text-sm text-[#b04c43]">
            {equipmentQuery.error instanceof Error
              ? equipmentQuery.error.message
              : "Не удалось загрузить карточку прибора."}
          </p>
        </div>
      ) : null}

      {equipment && form ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                className="rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-signal-info"
                to={`/equipment?folderId=${equipment.folderId}`}
              >
                Назад к оборудованию
              </Link>
              {currentFolder ? (
                <span className="tone-child inline-block rounded-full border border-line px-4 py-2 text-sm text-steel">
                  Папка: {currentFolder.name}
                </span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              <IconActionButton
                className="icon-action-button--info"
                icon={<Icon className="h-5 w-5" name="share" />}
                label="Поделиться ссылкой на прибор"
                onClick={openShareModal}
              />
              {canManage ? (
                <div className="flex flex-wrap gap-3">
                  {!activeRepair ? (
                    <IconActionButton
                      className="icon-action-button--warning"
                      icon={<Icon className="h-5 w-5" name="repairs" />}
                      label="Отправить в ремонт"
                      onClick={() => setRepairModalOpen(true)}
                    />
                  ) : null}
                  {supportsVerification(equipment.equipmentType) && !activeVerification ? (
                    <IconActionButton
                      className="icon-action-button--success"
                      icon={<Icon className="h-5 w-5" name="verification" />}
                      label="Отправить в поверку"
                      onClick={() => setVerificationModalOpen(true)}
                    />
                  ) : null}
                  <IconActionButton
                    className="icon-action-button--accent"
                    icon={<Icon className="h-5 w-5" name="edit" />}
                    label="Редактировать прибор"
                    onClick={() => setIsEditing(true)}
                  />
                  <IconActionButton
                    className="icon-action-button--danger"
                    icon={<Icon className="h-5 w-5" name="delete" />}
                    label="Удалить прибор"
                    onClick={() => setConfirmDeleteOpen(true)}
                  />
                </div>
              ) : null}
            </div>
          </div>

          {shareFeedbackMessage ? (
            <div className="mb-4 rounded-2xl border border-line bg-[var(--accent-soft)] px-4 py-3 text-sm text-ink">
              {shareFeedbackMessage}
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(390px,0.20fr)]">
            <div className="space-y-4">
              <dl className="overflow-hidden rounded-3xl border border-line bg-white shadow-panel">
                {[
                  ["Категория", equipmentTypeLabels[equipment.equipmentType]],
                  ["Статус", getEquipmentStatusLabel(equipment)],
                  ["Объект", equipment.objectName],
                  ["Модификация", equipment.modification || "Не указана"],
                  ["Заводской номер", equipment.serialNumber || "Не указан"],
                  [
                    "Год выпуска",
                    equipment.manufactureYear ? String(equipment.manufactureYear) : "Не указан",
                  ],
                  ...(
                    equipment.equipmentType === "SI"
                      ? [
                          [
                            "Диапазон измерения",
                            formatMeasurementRange(
                              equipment.measurementRangeStart,
                              equipment.measurementRangeEnd,
                            ),
                          ],
                          ["Единица измерения", equipment.measurementUnit || "Не указана"],
                        ]
                      : []
                  ),
                  ["Текущее местоположение", equipment.currentLocationManual || "Не указано"],
                  ...(
                    equipment.equipmentType === "SI"
                      ? [[
                          "Ручной межповерочный интервал",
                          formatComplianceIntervalMonths(equipment.manualVerificationIntervalMonths),
                        ]]
                      : []
                  ),
                  ...(
                    equipment.equipmentType === "IO" || equipment.equipmentType === "VO"
                      ? [
                          [
                            getEquipmentComplianceDateLabel(equipment.equipmentType) ?? "Контрольная дата",
                            equipment.complianceDate
                              ? formatDateOnly(equipment.complianceDate)
                              : "Не указана",
                          ],
                          [
                            getEquipmentCompliancePeriodLabel(equipment.equipmentType) ?? "Контрольный период",
                            formatComplianceIntervalMonths(equipment.complianceIntervalMonths),
                          ],
                        ]
                      : []
                  ),
                  ...(
                    getEquipmentNextDueColumnLabel(equipment)
                      ? [[getEquipmentNextDueColumnLabel(equipment), nextDueDate ? formatDateOnly(nextDueDate) : "-"]]
                      : []
                  ),
                ].map(([label, value], index) => (
                  <div
                    key={label}
                    className={[
                      "grid gap-2 px-4 py-3 text-sm sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-4",
                      index > 0 ? "border-t border-line" : "",
                    ].join(" ")}
                  >
                    <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">
                      {label}
                    </dt>
                    <dd className="min-w-0 break-words font-medium text-ink">
                      {label === "Статус" ? (
                        <span style={{ color: getEquipmentStatusColor(equipment) }}>{value}</span>
                      ) : (
                        value
                      )}
                    </dd>
                  </div>
                ))}
              </dl>

              {activeRepair ? (
                <section className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
                  <div
                    aria-expanded={repairExpanded}
                    className="flex w-full items-start justify-between gap-3 text-left"
                    role="button"
                    tabIndex={0}
                    onClick={() => setRepairExpanded((current) => !current)}
                    onKeyDown={(event) =>
                      handleExpandableToggleKeyDown(event, () =>
                        setRepairExpanded((current) => !current),
                      )
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        {activeRepairLink ? (
                          <Link
                            className="text-base font-semibold text-ink transition hover:text-signal-info focus-visible:text-signal-info"
                            to={activeRepairLink}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            Прибор находится в ремонте
                          </Link>
                        ) : (
                          <h3 className="text-base font-semibold text-ink">Прибор находится в ремонте</h3>
                        )}
                        <span className="rounded-full bg-[var(--bg-primary)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-signal-info">
                          Активный
                        </span>
                      </div>
                      <div className="mt-2 min-w-0">
                        <div className="truncate text-xs text-steel">
                          {formatProcessRouteSummary({
                            isOnSite: activeRepair.isOnSite,
                            routeCity: activeRepair.routeCity,
                            routeDestination: activeRepair.routeDestination,
                          })}
                        </div>
                        <p className="mt-1 line-clamp-2 break-words text-sm text-ink">
                          {[
                            `демонтаж ${formatDateOnly(activeRepair.sentToRepairAt)}`,
                            `дедлайн ${formatDateOnly(activeRepair.repairDeadlineAt)}`,
                          ].join(" · ")}
                        </p>
                      </div>
                    </div>
                    <span className="mt-1 shrink-0 text-steel">
                      <svg
                        className={["h-5 w-5 transition-transform", repairExpanded ? "rotate-180" : ""].join(" ")}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  </div>

                  {repairExpanded ? (
                    <>
                      <div className="mt-4 flex justify-end">
                        <Link
                          className="rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-signal-info"
                          to="/repairs"
                        >
                          Ремонты
                        </Link>
                      </div>
                      <dl className="mt-4 overflow-hidden rounded-3xl border border-line bg-white">
                        {[
                          ...(activeRepair.isOnSite
                            ? [["Формат", "На месте"]]
                            : [
                                ["Откуда", activeRepair.routeCity],
                                ["Куда", activeRepair.routeDestination],
                              ]),
                          ["Демонтаж", formatDateOnly(activeRepair.sentToRepairAt)],
                          ["Дедлайн ремонта", formatDateOnly(activeRepair.repairDeadlineAt)],
                        ].map(([label, value], index) => (
                          <div
                            key={label}
                            className={[
                              "grid gap-2 px-4 py-3 text-sm sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-4",
                              index > 0 ? "border-t border-line" : "",
                            ].join(" ")}
                          >
                            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">
                              {label}
                            </dt>
                            <dd className="min-w-0 break-words font-medium text-ink">{value}</dd>
                          </div>
                        ))}
                      </dl>

                      <section className="tone-child mt-4 overflow-hidden rounded-3xl border border-line">
                    <button
                      aria-expanded={repairDialogExpanded}
                      className="tone-grandchild flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3 text-left"
                      onClick={() => setRepairDialogExpanded((current) => !current)}
                      type="button"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-ink">Диалог ремонта</h4>
                          <svg
                            className={["h-4 w-4 text-steel transition-transform", repairDialogExpanded ? "rotate-180" : ""].join(" ")}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                          </svg>
                        </div>
                        <p className="mt-1 text-xs text-steel">Фото, документы, чеки и рабочие сообщения по текущему ремонту.</p>
                      </div>
                      <span className="tone-parent rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
                        {repairMessageCount}
                      </span>
                    </button>

                    {repairDialogExpanded ? (
                    <div className="space-y-3 px-4 py-4">
                      {repairMessagesQuery.isLoading ? (
                        <p className="text-sm text-steel">Загружаем диалог ремонта...</p>
                      ) : null}
                      {repairMessagesQuery.isError ? (
                        <p className="text-sm text-[#b04c43]">
                          {repairMessagesQuery.error instanceof Error
                            ? repairMessagesQuery.error.message
                            : "Не удалось загрузить сообщения ремонта."}
                        </p>
                      ) : null}
                      {!repairMessagesQuery.isLoading && !repairMessages.length ? (
                        <p className="text-sm text-steel">
                          Диалог пока пуст. Первое сообщение можно было добавить при отправке в ремонт или добавить сейчас.
                        </p>
                      ) : null}
                      {repairActionError ? (
                        <p className="text-sm text-[#b04c43]">{repairActionError}</p>
                      ) : null}
                      {repairMessages.map((message) => (
                        <article
                          key={message.id}
                          className="tone-grandchild rounded-2xl border border-line px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-xs text-steel">
                                {formatRepairMessageMeta(message)}
                              </div>
                              {message.isPrivate ? <PrivateNoteBadge /> : null}
                            </div>
                            {message.authorUserId === user?.id ? (
                              <div className="flex shrink-0 gap-2">
                                <IconActionButton
                                  className="icon-action-button--accent"
                                  icon={
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                    </svg>
                                  }
                                  label="Редактировать сообщение ремонта"
                                  size="tiny"
                                  onClick={() => {
                                    setEditingRepairMessageId(message.id);
                                    setRepairMessageEditDraft(message.text ?? "");
                                  }}
                                />
                                <IconActionButton
                                  className="icon-action-button--danger"
                                  icon={
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.108 0 00-7.5 0" />
                                    </svg>
                                  }
                                  label="Удалить сообщение ремонта"
                                  size="tiny"
                                  onClick={() => void deleteRepairMessageMutation.mutateAsync(message.id)}
                                />
                              </div>
                            ) : canManage ? (
                              <IconActionButton
                                className="icon-action-button--danger"
                                icon={
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.108 0 00-7.5 0" />
                                  </svg>
                                }
                                label="Удалить сообщение ремонта"
                                size="tiny"
                                onClick={() => void deleteRepairMessageMutation.mutateAsync(message.id)}
                              />
                            ) : null}
                          </div>
                          {editingRepairMessageId === message.id ? (
                            <form
                              className="mt-2 space-y-2"
                              onSubmit={(event) => void handleUpdateRepairMessage(event, message.id)}
                            >
                              <AutocompleteTextarea
                                ref={editRepairMessageInputRef}
                                className="form-input min-h-[56px] resize-none overflow-hidden py-3"
                                maxLength={4000}
                                rows={2}
                                suggestions={textareaSuggestions}
                                value={repairMessageEditDraft}
                                onChange={setRepairMessageEditDraft}
                                onKeyDown={handleTextareaSubmitShortcut}
                                onInput={(event) => resizeCommentInput(event.currentTarget)}
                              />
                              {updateRepairMessageMutation.isError ? (
                                <p className="text-sm text-[#b04c43]">
                                  {updateRepairMessageMutation.error instanceof Error
                                    ? updateRepairMessageMutation.error.message
                                    : "Не удалось сохранить сообщение ремонта."}
                                </p>
                              ) : null}
                              <div className="flex justify-end gap-2">
                                <EmojiPickerButton
                                  disabled={updateRepairMessageMutation.isPending}
                                  onPick={handleInsertEditRepairMessageEmoji}
                                />
                                <IconActionButton
                                  className="icon-action-button--accent"
                                  icon={
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                    </svg>
                                  }
                                  label="Отменить редактирование сообщения ремонта"
                                  size="tiny"
                                  onClick={() => {
                                    setEditingRepairMessageId(null);
                                    setRepairMessageEditDraft("");
                                  }}
                                />
                                <IconActionButton
                                  className="icon-action-button--success"
                                  disabled={
                                    updateRepairMessageMutation.isPending
                                    || (!repairMessageEditDraft.trim() && !message.attachments.length)
                                  }
                                  icon={
                                    updateRepairMessageMutation.isPending ? (
                                      <span className="text-sm leading-none">…</span>
                                    ) : (
                                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    )
                                  }
                                  label="Сохранить сообщение ремонта"
                                  size="tiny"
                                  type="submit"
                                />
                              </div>
                            </form>
                          ) : message.text ? (
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                              {message.text}
                            </p>
                          ) : null}
                          <AttachmentPreviewList
                            attachments={message.attachments}
                            className="mt-3"
                            downloadingId={downloadingRepairAttachmentId}
                            getMeta={formatCompactAttachmentMeta}
                            loadPreview={(attachment) =>
                              loadRepairAttachmentPreview(message.id, attachment)
                            }
                            onDownload={(attachment) =>
                              void handleRepairAttachmentDownload(message, attachment)
                            }
                            previewVariant="compact"
                          />
                        </article>
                      ))}
                    </div>
                    ) : null}

                    {canManage && repairDialogExpanded ? (
                      <form className="border-t border-line px-4 py-4" onSubmit={(event) => void handleCreateRepairMessage(event)}>
                        <AutocompleteTextarea
                          ref={repairMessageInputRef}
                          className="form-input min-h-[56px] resize-none overflow-hidden py-3"
                          maxLength={4000}
                          placeholder="Новое сообщение по ремонту"
                          rows={2}
                          suggestions={textareaSuggestions}
                          value={repairMessageDraft}
                          onChange={setRepairMessageDraft}
                          onKeyDown={handleTextareaSubmitShortcut}
                          onInput={(event) => resizeCommentInput(event.currentTarget)}
                        />
                        <input
                          ref={repairMessageFilesInputRef}
                          className="sr-only"
                          multiple
                          type="file"
                          onChange={handleRepairMessageFilesPick}
                        />
                        <PendingAttachmentList
                          className="mt-3"
                          files={repairMessageFiles}
                          onRemove={handleRemoveRepairMessageFile}
                        />
                        <div className="mt-3 flex justify-end gap-2">
                          <PrivateNoteToggleButton
                            active={repairMessageDraftIsPrivate}
                            disabled={createRepairMessageMutation.isPending}
                            onClick={() =>
                              setRepairMessageDraftIsPrivate((current) => !current)
                            }
                          />
                          <EmojiPickerButton
                            disabled={createRepairMessageMutation.isPending}
                            onPick={handleInsertRepairMessageEmoji}
                          />
                          <IconActionButton
                            className="icon-action-button--info h-10 w-10"
                            icon={
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.25 20.25a6 6 0 0 1-8.49-8.49l9.9-9.9a4.5 4.5 0 1 1 6.36 6.36l-9.2 9.19a3 3 0 0 1-4.24-4.24l8.49-8.49" />
                              </svg>
                            }
                            label="Прикрепить файлы к сообщению ремонта"
                            onClick={() => openFilePicker(repairMessageFilesInputRef.current)}
                          />
                          <IconActionButton
                            className="icon-action-button--accent h-10 w-10"
                            disabled={
                              createRepairMessageMutation.isPending
                              || (!repairMessageDraft.trim() && !repairMessageFiles.length)
                            }
                            icon={
                              createRepairMessageMutation.isPending ? (
                                <span className="text-sm leading-none">…</span>
                              ) : (
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3 21l18-9L3 3l3 9Zm0 0h7.5" />
                                </svg>
                              )
                            }
                            label="Отправить сообщение ремонта"
                            type="submit"
                          />
                        </div>
                      </form>
                    ) : null}
                      </section>
                    </>
                  ) : null}
                </section>
              ) : null}

              {activeVerification ? (
                <section className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
                  <div
                    aria-expanded={verificationExpanded}
                    className="flex w-full items-start justify-between gap-3 text-left"
                    role="button"
                    tabIndex={0}
                    onClick={() => setVerificationExpanded((current) => !current)}
                    onKeyDown={(event) =>
                      handleExpandableToggleKeyDown(event, () =>
                        setVerificationExpanded((current) => !current),
                      )
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        {activeVerificationLink ? (
                          <Link
                            className="text-base font-semibold text-ink transition hover:text-signal-info focus-visible:text-signal-info"
                            to={activeVerificationLink}
                            onClick={(event) => event.stopPropagation()}
                            onKeyDown={(event) => event.stopPropagation()}
                          >
                            Прибор находится в поверке
                          </Link>
                        ) : (
                          <h3 className="text-base font-semibold text-ink">Прибор находится в поверке</h3>
                        )}
                        <span className="rounded-full bg-[var(--bg-primary)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-signal-info">
                          Активная
                        </span>
                      </div>
                      <div className="mt-2 min-w-0">
                        <div className="truncate text-xs text-steel">
                          {formatProcessRouteSummary({
                            isOnSite: activeVerification.isOnSite,
                            routeCity: activeVerification.routeCity,
                            routeDestination: activeVerification.routeDestination,
                          })}
                        </div>
                        <p className="mt-1 line-clamp-2 break-words text-sm text-ink">
                          {getVerificationProgressLabel(activeVerification)}
                        </p>
                      </div>
                    </div>
                    <span className="mt-1 shrink-0 text-steel">
                      <svg
                        className={[
                          "h-5 w-5 transition-transform",
                          verificationExpanded ? "rotate-180" : "",
                        ].join(" ")}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  </div>

                  {verificationExpanded ? (
                    <>
                      <dl className="mt-4 overflow-hidden rounded-3xl border border-line bg-white">
                        {[
                          ...(activeVerification.isOnSite
                            ? [["Формат", formatVerificationFlowModeLabel(activeVerification.flowMode)]]
                            : [
                                ["Откуда", activeVerification.routeCity],
                                ["Куда", activeVerification.routeDestination],
                              ]),
                          [
                            getVerificationStartDateLabel(activeVerification.flowMode),
                            formatDateOnly(activeVerification.sentToVerificationAt),
                          ],
                        ].map(([label, value], index) => (
                          <div
                            key={label}
                            className={[
                              "grid gap-2 px-4 py-3 text-sm sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-4",
                              index > 0 ? "border-t border-line" : "",
                            ].join(" ")}
                          >
                            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">
                              {label}
                            </dt>
                            <dd className="min-w-0 break-words font-medium text-ink">{value}</dd>
                          </div>
                        ))}
                      </dl>

                      <section className="tone-child mt-4 overflow-hidden rounded-3xl border border-line">
                    <button
                      aria-expanded={verificationDialogExpanded}
                      className="tone-grandchild flex w-full items-center justify-between gap-3 border-b border-line px-4 py-3 text-left"
                      onClick={() => setVerificationDialogExpanded((current) => !current)}
                      type="button"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-ink">Диалог поверки</h4>
                          <svg
                            className={["h-4 w-4 text-steel transition-transform", verificationDialogExpanded ? "rotate-180" : ""].join(" ")}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                          </svg>
                        </div>
                        <p className="mt-1 text-xs text-steel">Сообщения, фото и документы по текущей поверке.</p>
                      </div>
                      <span className="tone-parent rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
                        {verificationMessageCount}
                      </span>
                    </button>

                    {verificationDialogExpanded ? (
                    <div className="space-y-3 px-4 py-4">
                      {verificationMessagesQuery.isLoading ? (
                        <p className="text-sm text-steel">Загружаем диалог поверки...</p>
                      ) : null}
                      {verificationMessagesQuery.isError ? (
                        <p className="text-sm text-[#b04c43]">
                          {verificationMessagesQuery.error instanceof Error
                            ? verificationMessagesQuery.error.message
                            : "Не удалось загрузить сообщения поверки."}
                        </p>
                      ) : null}
                      {!verificationMessagesQuery.isLoading && !verificationMessages.length ? (
                        <p className="text-sm text-steel">
                          Диалог пока пуст. Первое сообщение можно было добавить при отправке в поверку или добавить сейчас.
                        </p>
                      ) : null}
                      {verificationActionError ? (
                        <p className="text-sm text-[#b04c43]">{verificationActionError}</p>
                      ) : null}
                      {verificationMessages.map((message) => (
                        <article
                          key={message.id}
                          className="tone-grandchild rounded-2xl border border-line px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-xs text-steel">
                                {formatVerificationMessageMeta(message)}
                              </div>
                              {message.isPrivate ? <PrivateNoteBadge /> : null}
                            </div>
                            {message.authorUserId === user?.id ? (
                              <div className="flex shrink-0 gap-2">
                                <IconActionButton
                                  className="icon-action-button--danger"
                                  icon={
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                    </svg>
                                  }
                                  label="Редактировать сообщение поверки"
                                  size="tiny"
                                  onClick={() => {
                                    setEditingVerificationMessageId(message.id);
                                    setVerificationMessageEditDraft(message.text ?? "");
                                  }}
                                />
                                <IconActionButton
                                  className="icon-action-button--accent"
                                  icon={
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.108 0 00-7.5 0" />
                                    </svg>
                                  }
                                  label="Удалить сообщение поверки"
                                  size="tiny"
                                  onClick={() => void deleteVerificationMessageMutation.mutateAsync(message.id)}
                                />
                              </div>
                            ) : canManage ? (
                              <IconActionButton
                                className="icon-action-button--danger"
                                icon={
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.108 0 00-7.5 0" />
                                  </svg>
                                }
                                label="Удалить сообщение поверки"
                                size="tiny"
                                onClick={() => void deleteVerificationMessageMutation.mutateAsync(message.id)}
                              />
                            ) : null}
                          </div>
                          {editingVerificationMessageId === message.id ? (
                            <form
                              className="mt-2 space-y-2"
                              onSubmit={(event) =>
                                void handleUpdateVerificationMessage(event, message.id)
                              }
                            >
                              <AutocompleteTextarea
                                ref={editVerificationMessageInputRef}
                                className="form-input min-h-[56px] resize-none overflow-hidden py-3"
                                maxLength={4000}
                                rows={2}
                                suggestions={textareaSuggestions}
                                value={verificationMessageEditDraft}
                                onChange={setVerificationMessageEditDraft}
                                onKeyDown={handleTextareaSubmitShortcut}
                                onInput={(event) => resizeCommentInput(event.currentTarget)}
                              />
                              {updateVerificationMessageMutation.isError ? (
                                <p className="text-sm text-[#b04c43]">
                                  {updateVerificationMessageMutation.error instanceof Error
                                    ? updateVerificationMessageMutation.error.message
                                    : "Не удалось сохранить сообщение поверки."}
                                </p>
                              ) : null}
                              <div className="flex justify-end gap-2">
                                <EmojiPickerButton
                                  disabled={updateVerificationMessageMutation.isPending}
                                  onPick={handleInsertEditVerificationMessageEmoji}
                                />
                                <IconActionButton
                                  className="icon-action-button--danger"
                                  icon={
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                    </svg>
                                  }
                                  label="Отменить редактирование сообщения поверки"
                                  size="tiny"
                                  onClick={() => {
                                    setEditingVerificationMessageId(null);
                                    setVerificationMessageEditDraft("");
                                  }}
                                />
                                <IconActionButton
                                  className="icon-action-button--success"
                                  disabled={
                                    updateVerificationMessageMutation.isPending
                                    || (!verificationMessageEditDraft.trim() && !message.attachments.length)
                                  }
                                  icon={
                                    updateVerificationMessageMutation.isPending ? (
                                      <span className="text-sm leading-none">…</span>
                                    ) : (
                                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    )
                                  }
                                  label="Сохранить сообщение поверки"
                                  size="tiny"
                                  type="submit"
                                />
                              </div>
                            </form>
                          ) : message.text ? (
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                              {message.text}
                            </p>
                          ) : null}
                          <AttachmentPreviewList
                            attachments={message.attachments}
                            className="mt-3"
                            downloadingId={downloadingVerificationAttachmentId}
                            getMeta={formatCompactAttachmentMeta}
                            loadPreview={(attachment) =>
                              loadVerificationAttachmentPreview(message.id, attachment)
                            }
                            onDownload={(attachment) =>
                              void handleVerificationAttachmentDownload(message, attachment)
                            }
                            previewVariant="compact"
                          />
                        </article>
                      ))}
                    </div>
                    ) : null}

                    {canManage && verificationDialogExpanded ? (
                      <form className="border-t border-line px-4 py-4" onSubmit={(event) => void handleCreateVerificationMessage(event)}>
                        <AutocompleteTextarea
                          ref={verificationMessageInputRef}
                          className="form-input min-h-[56px] resize-none overflow-hidden py-3"
                          maxLength={4000}
                          placeholder="Новое сообщение по поверке"
                          rows={2}
                          suggestions={textareaSuggestions}
                          value={verificationMessageDraft}
                          onChange={setVerificationMessageDraft}
                          onKeyDown={handleTextareaSubmitShortcut}
                          onInput={(event) => resizeCommentInput(event.currentTarget)}
                        />
                        <input
                          ref={verificationMessageFilesInputRef}
                          className="sr-only"
                          multiple
                          type="file"
                          onChange={handleVerificationMessageFilesPick}
                        />
                        <PendingAttachmentList
                          className="mt-3"
                          files={verificationMessageFiles}
                          onRemove={handleRemoveVerificationMessageFile}
                        />
                        <div className="mt-3 flex justify-end gap-2">
                          <PrivateNoteToggleButton
                            active={verificationMessageDraftIsPrivate}
                            disabled={createVerificationMessageMutation.isPending}
                            onClick={() =>
                              setVerificationMessageDraftIsPrivate((current) => !current)
                            }
                          />
                          <EmojiPickerButton
                            disabled={createVerificationMessageMutation.isPending}
                            onPick={handleInsertVerificationMessageEmoji}
                          />
                          <IconActionButton
                            className="icon-action-button--info h-10 w-10"
                            icon={
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.25 20.25a6 6 0 0 1-8.49-8.49l9.9-9.9a4.5 4.5 0 1 1 6.36 6.36l-9.2 9.19a3 3 0 0 1-4.24-4.24l8.49-8.49" />
                              </svg>
                            }
                            label="Прикрепить файлы к сообщению поверки"
                            onClick={() => openFilePicker(verificationMessageFilesInputRef.current)}
                          />
                          <IconActionButton
                            className="icon-action-button--accent h-10 w-10"
                            disabled={
                              createVerificationMessageMutation.isPending
                              || (!verificationMessageDraft.trim() && !verificationMessageFiles.length)
                            }
                            icon={
                              createVerificationMessageMutation.isPending ? (
                                <span className="text-sm leading-none">…</span>
                              ) : (
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3 21l18-9L3 3l3 9Zm0 0h7.5" />
                                </svg>
                              )
                            }
                            label="Отправить сообщение поверки"
                            type="submit"
                          />
                        </div>
                      </form>
                    ) : null}
                      </section>
                    </>
                  ) : null}
                </section>
              ) : null}

              {isArshinEquipmentType(equipment.equipmentType) ? (
                <section className="rounded-3xl border border-line bg-white p-5 shadow-panel">
                  <button
                    aria-expanded={siExpanded}
                    className="flex w-full items-start justify-between gap-3 text-left"
                    type="button"
                    onClick={() => setSiExpanded((current) => !current)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-base font-semibold text-ink">
                          {equipment.equipmentType === "ESI" ? "Состав ЭСИ" : "Сведения о СИ"}
                        </h3>
                        {equipment.createdManually ? (
                          <span className="rounded-full border border-line bg-[var(--accent-soft)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink">
                            Добавлено вручную
                          </span>
                        ) : null}
                        {equipment.excludeFromArshinRefresh ? (
                          <span className="tone-child rounded-full border border-line px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
                            Исключено из проверки
                          </span>
                        ) : null}
                        {equipment.siVerification?.arshinUrl ? (
                          <a
                            className="tone-child rounded-full border border-line px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel"
                            href={equipment.siVerification.arshinUrl}
                            rel="noreferrer"
                            target="_blank"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Аршин
                          </a>
                        ) : null}
                      </div>
                      <div className="mt-2 min-w-0">
                        {siDetail ? (
                          <>
                            <div className="truncate text-xs text-steel">
                              {[
                                equipment.equipmentType === "ESI"
                                  ? (
                                      siDetail.sourceCertificateNumber
                                        ? `свид. ${siDetail.sourceCertificateNumber}`
                                        : null
                                    )
                                  : (
                                      siDetail.certificateNumber
                                        ? `${getArshinDocumentShortLabel(equipment.equipmentType)} ${siDetail.certificateNumber}`
                                        : null
                                    ),
                                siDetail.validUntil ? `до ${siDetail.validUntil}` : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                            <p className="mt-1 line-clamp-2 break-words text-sm text-ink">
                              {[
                                siDetail.typeName,
                                siDetail.modification,
                                siDetail.serialNumber,
                              ]
                                .filter(Boolean)
                                .join(" · ") || "Профиль СИ заполнен."}
                            </p>
                          </>
                        ) : (
                          <p className="text-sm text-steel">
                            {equipment.equipmentType === "ESI"
                              ? "Состав ЭСИ пока не заполнен."
                              : "Профиль СИ пока не заполнен."}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="mt-1 shrink-0 text-steel">
                      <svg
                        className={["h-5 w-5 transition-transform", siExpanded ? "rotate-180" : ""].join(" ")}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
                      </svg>
                    </span>
                  </button>

                  {siExpanded ? (
                    <div className="mt-4 space-y-4">
                      {canManage && equipment.createdManually ? (
                        <div className="tone-child rounded-2xl border border-line px-4 py-3">
                          <label className="flex items-start gap-3 text-sm text-ink">
                            <input
                              checked={equipment.excludeFromArshinRefresh}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                              disabled={updateArshinRefreshExclusionMutation.isPending}
                              type="checkbox"
                              onChange={(event) =>
                                updateArshinRefreshExclusionMutation.mutate(event.target.checked)
                              }
                            />
                            <span>
                              <span className="block font-medium">Исключить из проверки свидетельств в Аршине</span>
                              <span className="mt-1 block text-xs text-steel">
                                Используй это для ручных записей, которые заведомо не должны попадать в отчёт папочного обновления.
                              </span>
                            </span>
                          </label>
                          {updateArshinRefreshExclusionMutation.isError ? (
                            <p className="mt-3 text-sm text-[#b04c43]">
                              {updateArshinRefreshExclusionMutation.error instanceof Error
                                ? updateArshinRefreshExclusionMutation.error.message
                                : "Не удалось сохранить настройку проверки Аршина."}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      {siDetail ? (
                        <>
                          {equipment.equipmentType === "ESI" ? (
                            <>
                              {canManage ? (
                                <div className="flex justify-end">
                                  <button
                                    className="btn-secondary"
                                    type="button"
                                    onClick={openEsiCompositionModal}
                                  >
                                    Добавить в состав
                                  </button>
                                </div>
                              ) : null}
                              <ESICompositionSection
                                rows={esiCompositionRows}
                                previewLoadingId={
                                  loadEsiCompositionPreviewMutation.isPending
                                    ? loadEsiCompositionPreviewMutation.variables?.registryNumber ?? null
                                    : null
                                }
                                onPreview={(row) => void loadEsiCompositionPreviewMutation.mutateAsync(row)}
                                onEdit={canManage ? openEditEsiModuleModal : undefined}
                                onDelete={
                                  canManage
                                    ? (row) => setEsiModuleToDelete(row)
                                    : undefined
                                }
                              />
                              {loadEsiCompositionPreviewMutation.isError ? (
                                <p className="text-sm text-[#b04c43]">
                                  {getArshinErrorMessage(
                                    loadEsiCompositionPreviewMutation.error,
                                    "Не удалось загрузить подробную запись ЭСИ.",
                                  )}
                                </p>
                              ) : null}
                            </>
                          ) : (
                            <>
                              <SISection
                                title="Сведения о результатах поверки СИ"
                                rows={[
                                  ...siIdentityRows,
                                  ["Регистрационный номер типа СИ", siDetail.regNumber],
                                  ["Обозначение типа СИ", siDetail.typeDesignation],
                                  ["Наименование типа СИ", siDetail.typeName],
                                  ["Заводской номер СИ", siDetail.serialNumber],
                                  [
                                    "Год выпуска СИ",
                                    siDetail.manufactureYear ? String(siDetail.manufactureYear) : null,
                                  ],
                                  ["Модификация СИ", siDetail.modification],
                                  [
                                    "Диапазон измерения",
                                    formatMeasurementRange(
                                      equipment.measurementRangeStart,
                                      equipment.measurementRangeEnd,
                                    ),
                                  ],
                                  ["Единица измерения", equipment.measurementUnit],
                                  ...siEtalonMetaRows,
                                ]}
                              />
                              <SISection
                                title="Сведения о поверке"
                                rows={[
                                  ["Наименование организации-поверителя", siDetail.organization],
                                  ["Условный шифр знака поверки", siDetail.verificationMarkCipher],
                                  ["Владелец СИ", siDetail.ownerName],
                                  ["Тип поверки", siDetail.verificationType],
                                  ["Дата поверки СИ", siDetail.verificationDate],
                                  ["Поверка действительна до", siDetail.validUntil],
                                  ["Документ поверки", siDetail.documentTitle],
                                  ["СИ пригодно", formatBooleanLabel(siDetail.isUsable)],
                                  ...siVerificationDocumentRows,
                                  ["Знак поверки в паспорте", formatBooleanLabel(siDetail.passportMark)],
                                  ["Знак поверки на СИ", formatBooleanLabel(siDetail.deviceMark)],
                                  ["Поверка в сокращенном объеме", formatBooleanLabel(siDetail.reducedScope)],
                                ]}
                              />
                            </>
                          )}
                          {equipment.equipmentType !== "ESI" && siDetail.etalonTableRows.length ? (
                            <SIReferenceTableSection
                              title="Средства измерений, применяемые в качестве эталона"
                              rows={siDetail.etalonTableRows}
                            />
                          ) : equipment.equipmentType !== "ESI" && siDetail.etalonLines.length ? (
                            <SIListSection
                              title="Средства измерений, применяемые в качестве эталона"
                              items={siDetail.etalonLines}
                            />
                          ) : null}
                          {equipment.equipmentType !== "ESI" && siDetail.meansTableRows.length ? (
                            <SIReferenceTableSection
                              title="Средства измерений, применяемые при поверке"
                              rows={siDetail.meansTableRows}
                              showSource
                            />
                          ) : equipment.equipmentType !== "ESI" && siDetail.meansLines.length ? (
                            <SIListSection
                              title="Средства измерений, применяемые при поверке"
                              items={siDetail.meansLines}
                            />
                          ) : null}
                        </>
                      ) : (
                        <div className="tone-parent rounded-3xl border border-line px-4 py-3 text-sm text-steel">
                          {equipment.equipmentType === "ESI"
                            ? "Детальный профиль ЭСИ пока не заполнен. Можно вручную подтянуть новую запись из Аршина по свидетельству поверки."
                            : "Детальный профиль СИ пока не заполнен. Можно вручную подтянуть новую запись из Аршина по номеру свидетельства."}
                        </div>
                      )}
                      {canManage ? (
                        <section className="tone-parent rounded-3xl border border-line p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-ink">
                                {equipment.equipmentType === "ESI"
                                  ? "Обновить по новому свидетельству"
                                  : "Обновить по новому свидетельству"}
                              </h4>
                              <p className="mt-1 max-w-[46ch] text-sm text-steel">
                                {equipment.equipmentType === "ESI"
                                  ? "Вставь новый номер свидетельства, выбери найденную запись Аршина и подтверди обновление карточки."
                                  : "Вставь новый номер свидетельства, выбери найденную запись Аршина и подтверди обновление карточки."}
                              </p>
                            </div>
                          </div>
                          <form className="mt-4 flex items-start gap-2" onSubmit={(event) => void handleSearchSiRefresh(event)}>
                            <input
                              className="form-input"
                              placeholder={
                                equipment.equipmentType === "ESI"
                                  ? "С-ВЯ/05-02-2026/503716225"
                                  : "С-АСГ/07-03-2026/509468383"
                              }
                              type="text"
                              value={siRefreshCertificate}
                              onChange={(event) => setSiRefreshCertificate(event.target.value)}
                            />
                            <IconActionButton
                              disabled={
                                searchSiRefreshMutation.isPending
                                || !siRefreshCertificate.trim()
                              }
                              icon={
                                searchSiRefreshMutation.isPending ? (
                                  <span className="text-sm leading-none">…</span>
                                ) : (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m0 0A7.5 7.5 0 1 0 6 17.25a7.5 7.5 0 0 0 10.65-.6Z" />
                                  </svg>
                                )
                              }
                              label={
                                equipment.equipmentType === "ESI"
                                  ? "Найти новое свидетельство"
                                  : "Найти новое свидетельство"
                              }
                              type="submit"
                            />
                          </form>
                          {searchSiRefreshMutation.isError ? (
                            <p className="mt-3 text-sm text-[#b04c43]">
                              {getArshinErrorMessage(
                                searchSiRefreshMutation.error,
                                "Не удалось выполнить поиск в Аршине.",
                              )}
                            </p>
                          ) : null}
                          {searchSiRefreshMutation.isSuccess && !siRefreshResults.length ? (
                            <p className="mt-3 text-sm text-steel">
                              {equipment.equipmentType === "ESI"
                                ? "По этому свидетельству записи не найдены."
                                : "По этому свидетельству записи не найдены."}
                            </p>
                          ) : null}
                          {siRefreshResults.length ? (
                            <div className="mt-4 space-y-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">
                                Найденные записи
                              </p>
                              {siRefreshResults.map((result) => {
                                const isSelected = selectedSiRefreshResult?.vriId === result.vriId;
                                const isLoading = loadSiRefreshDetailMutation.isPending
                                  && loadSiRefreshDetailMutation.variables?.vriId === result.vriId;
                                return (
                                  <button
                                    key={result.vriId}
                                    className={[
                                      "w-full rounded-2xl border px-4 py-3 text-left transition",
                                      isSelected
                                        ? "border-signal-info bg-[var(--bg-primary)]"
                                        : "border-line bg-white hover:border-signal-info",
                                    ].join(" ")}
                                    type="button"
                                    onClick={() => void loadSiRefreshDetailMutation.mutateAsync(result)}
                                  >
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <div className="break-words font-semibold text-ink">
                                          {result.mitTitle || "Без названия типа"}
                                        </div>
                                        <div className="mt-1 text-xs text-steel">
                                          {[
                                            result.resultDocnum,
                                            result.miNumber,
                                            result.mitNotation,
                                            result.miModification,
                                          ]
                                            .filter(Boolean)
                                            .join(" · ")}
                                        </div>
                                      </div>
                                      {isLoading ? (
                                        <span className="shrink-0 text-sm text-steel">…</span>
                                      ) : isSelected ? (
                                        <span className="shrink-0 text-signal-info">
                                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                          </svg>
                                        </span>
                                      ) : null}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                          {loadSiRefreshDetailMutation.isError ? (
                            <p className="mt-3 text-sm text-[#b04c43]">
                              {getArshinErrorMessage(
                                loadSiRefreshDetailMutation.error,
                                "Не удалось загрузить подробную запись Аршина.",
                              )}
                            </p>
                          ) : null}
                          {selectedSiRefreshResult && (equipment.equipmentType !== "SI" || selectedSiRefreshDetail) ? (
                            <div className="mt-4 space-y-3">
                              <SISection
                                title="Кандидат на обновление"
                                rows={[
                                  [
                                    equipment.equipmentType === "ESI"
                                      ? "Номер свидетельства"
                                      : getArshinDocumentLabel(equipment.equipmentType),
                                    equipment.equipmentType === "ESI"
                                      ? (selectedSiRefreshDetail?.certificateNumber ?? null)
                                      : (selectedSiRefreshDetail?.certificateNumber ?? selectedSiRefreshResult.resultDocnum ?? null),
                                  ],
                                  ["Регистрационный номер типа СИ", selectedSiRefreshDetail?.regNumber ?? selectedSiRefreshResult.mitNumber ?? siDetail?.regNumber ?? null],
                                  ["Обозначение типа СИ", selectedSiRefreshDetail?.typeDesignation ?? selectedSiRefreshResult.mitNotation ?? siDetail?.typeDesignation ?? null],
                                  ["Наименование типа СИ", selectedSiRefreshDetail?.typeName ?? selectedSiRefreshResult.mitTitle ?? siDetail?.typeName ?? null],
                                  ["Заводской номер СИ", selectedSiRefreshDetail?.serialNumber ?? selectedSiRefreshResult.miNumber ?? siDetail?.serialNumber ?? null],
                                  [
                                    "Год выпуска СИ",
                                    selectedSiRefreshDetail?.manufactureYear
                                      ? String(selectedSiRefreshDetail.manufactureYear)
                                      : typeof selectedSiRefreshResult.rawPayloadJson?.year === "number"
                                        ? String(selectedSiRefreshResult.rawPayloadJson.year)
                                        : null,
                                  ],
                                  ["Модификация СИ", selectedSiRefreshDetail?.modification ?? selectedSiRefreshResult.miModification],
                                  ["Поверка действительна до", selectedSiRefreshDetail?.validUntil ?? normalizeDisplayDate(selectedSiRefreshResult.validDate)],
                                ]}
                              />
                              {refreshSiMutation.isError ? (
                                <p className="text-sm text-[#b04c43]">
                                  {refreshSiMutation.error instanceof Error
                                    ? refreshSiMutation.error.message
                                    : equipment.equipmentType === "ESI"
                                      ? "Не удалось обновить карточку ЭСИ."
                                      : "Не удалось обновить карточку СИ."}
                                </p>
                              ) : null}
                              <div className="flex justify-end">
                                <button
                                  className="btn-primary disabled:opacity-60"
                                  disabled={refreshSiMutation.isPending}
                                  type="button"
                                  onClick={() => void refreshSiMutation.mutateAsync()}
                                >
                                  {refreshSiMutation.isPending
                                    ? "Обновляем..."
                                    : equipment.equipmentType === "ESI"
                                      ? "Обновить карточку ЭСИ"
                                      : "Обновить карточку СИ"}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </section>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}

              <section className="tone-parent rounded-3xl border border-line px-4 py-4 shadow-panel">
                <button
                  aria-expanded={commentsExpanded}
                  className="flex w-full items-start justify-between gap-3 text-left"
                  type="button"
                  onClick={() => setCommentsExpanded((current) => !current)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-semibold text-ink">Комментарии</h3>
                      <span className="tone-child rounded-full border border-line px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-steel">
                        {comments.length}
                      </span>
                    </div>
                    <div className="mt-2 min-w-0">
                      {latestComment ? (
                        <>
                          <div className="truncate text-xs text-steel">
                            {formatCommentMeta(latestComment)}
                          </div>
                          <p className="mt-1 line-clamp-2 break-words text-sm text-ink">
                            {formatCommentPreview(latestComment)}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-steel">Для этого прибора пока нет комментариев.</p>
                      )}
                    </div>
                  </div>
                  <span className="mt-1 shrink-0 text-steel">
                    <svg
                      className={["h-5 w-5 transition-transform", commentsExpanded ? "rotate-180" : ""].join(" ")}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </button>

                {commentsExpanded ? (
                  <>
                    <form className="mt-4 space-y-2 border-t border-line pt-4" onSubmit={(event) => void handleCreateComment(event)}>
                      <AutocompleteTextarea
                        ref={commentInputRef}
                        className="form-input min-h-[56px] overflow-hidden py-3 resize-none"
                        maxLength={4000}
                        placeholder="Новая заметка по прибору"
                        rows={2}
                        suggestions={textareaSuggestions}
                        value={commentDraft}
                        onChange={setCommentDraft}
                        onKeyDown={handleTextareaSubmitShortcut}
                        onInput={(event) =>
                          resizeCommentInput(event.currentTarget)
                        }
                      />
                      <input
                        ref={commentFilesInputRef}
                        className="sr-only"
                        multiple
                        type="file"
                        onChange={handleCommentFilesPick}
                      />
                      <PendingAttachmentList
                        busyFileKeys={uploadingCommentFileKeys}
                        disableRemove={isCommentComposerBusy}
                        files={commentFiles}
                        getStatusLabel={getCommentPendingFileStatus}
                        onRemove={handleRemoveCommentFile}
                      />
                      {commentActionError ? (
                        <p className="text-sm text-[#b04c43]">{commentActionError}</p>
                      ) : null}
                      <div className="flex justify-end gap-2">
                        {canManage ? (
                          <PrivateNoteToggleButton
                            active={commentDraftIsPrivate}
                            disabled={isCommentComposerBusy}
                            onClick={() => setCommentDraftIsPrivate((current) => !current)}
                          />
                        ) : null}
                        <EmojiPickerButton
                          disabled={isCommentComposerBusy}
                          onPick={handleInsertCommentEmoji}
                        />
                        <IconActionButton
                          className="icon-action-button--info h-10 w-10"
                          disabled={isCommentComposerBusy}
                          icon={
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.25 20.25a6 6 0 0 1-8.49-8.49l9.9-9.9a4.5 4.5 0 1 1 6.36 6.36l-9.2 9.19a3 3 0 0 1-4.24-4.24l8.49-8.49" />
                            </svg>
                          }
                          label="Прикрепить файлы к комментарию"
                          onClick={() => openFilePicker(commentFilesInputRef.current)}
                        />
                        <IconActionButton
                          className="icon-action-button--accent h-10 w-10"
                          disabled={isCommentComposerBusy || !canSubmitComment}
                          icon={
                            isCommentComposerBusy ? (
                              <span className="text-sm leading-none">…</span>
                            ) : (
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3 21l18-9L3 3l3 9Zm0 0h7.5" />
                              </svg>
                            )
                          }
                          label="Добавить комментарий"
                          type="submit"
                        />
                      </div>
                    </form>

                    <div className="mt-4 space-y-3 border-t border-line pt-4">
                      {comments.map((comment) => (
                        <article
                          id={`equipment-comment-${comment.id}`}
                          key={comment.id}
                          className={[
                            "tone-child rounded-2xl border border-line px-4 py-3",
                            flashingCommentId === comment.id ? "process-target-flash" : "",
                          ].join(" ")}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-xs text-steel">
                                {formatCommentMeta(comment)}
                              </div>
                              {comment.isPrivate ? <PrivateNoteBadge /> : null}
                            </div>
                            {comment.authorUserId === user?.id ? (
                              <div className="flex shrink-0 gap-2">
                                <IconActionButton
                                  icon={
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                    </svg>
                                  }
                                  label="Редактировать комментарий"
                                  size="tiny"
                                  onClick={() => {
                                    setEditingCommentId(comment.id);
                                    setCommentEditDraft(comment.text);
                                  }}
                                />
                                <IconActionButton
                                  icon={
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                    </svg>
                                  }
                                  label="Удалить комментарий"
                                  size="tiny"
                                  onClick={() => setCommentToDelete(comment)}
                                />
                              </div>
                            ) : null}
                          </div>
                          {editingCommentId === comment.id ? (
                            <form className="mt-2 space-y-2" onSubmit={(event) => void handleUpdateComment(event, comment.id)}>
                              <AutocompleteTextarea
                                ref={editCommentInputRef}
                                className="form-input min-h-[56px] overflow-hidden py-3 resize-none"
                                maxLength={4000}
                                rows={2}
                                suggestions={textareaSuggestions}
                                value={commentEditDraft}
                                onChange={setCommentEditDraft}
                                onKeyDown={handleTextareaSubmitShortcut}
                                onInput={(event) => resizeCommentInput(event.currentTarget)}
                              />
                              {updateCommentMutation.isError ? (
                                <p className="text-sm text-[#b04c43]">
                                  {updateCommentMutation.error instanceof Error
                                    ? updateCommentMutation.error.message
                                    : "Не удалось сохранить комментарий."}
                                </p>
                              ) : null}
                              <div className="flex justify-end gap-2">
                                <EmojiPickerButton
                                  disabled={updateCommentMutation.isPending}
                                  onPick={handleInsertEditCommentEmoji}
                                />
                                <IconActionButton
                                  icon={
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                    </svg>
                                  }
                                  label="Отменить редактирование"
                                  size="tiny"
                                  onClick={() => {
                                    setEditingCommentId(null);
                                    setCommentEditDraft("");
                                  }}
                                />
                                <IconActionButton
                                  className="icon-action-button--success"
                                  disabled={updateCommentMutation.isPending || !commentEditDraft.trim()}
                                  icon={
                                    updateCommentMutation.isPending ? (
                                      <span className="text-sm leading-none">…</span>
                                    ) : (
                                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                      </svg>
                                    )
                                  }
                                  label="Сохранить комментарий"
                                  size="tiny"
                                  type="submit"
                                />
                              </div>
                            </form>
                          ) : comment.text.trim() ? (
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                              {comment.text}
                            </p>
                          ) : null}
                          <AttachmentPreviewList
                            attachments={comment.attachments}
                            className="mt-3"
                            downloadingId={downloadingCommentAttachmentId}
                            getMeta={formatCompactAttachmentMeta}
                            loadPreview={(attachment) =>
                              loadCommentAttachmentPreview(comment.id, attachment)
                            }
                            onDownload={(attachment) =>
                              void handleCommentAttachmentDownload(comment, attachment)
                            }
                            previewVariant="compact"
                          />
                        </article>
                      ))}
                    </div>
                  </>
                ) : null}
              </section>
            </div>

            <aside className="space-y-4">
              <section className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-ink">Вложение</h3>
                  <IconActionButton
                    className="icon-action-button--accent shrink-0"
                    icon={
                      isAttachmentUploadPending ? (
                        <span className="text-sm leading-none">…</span>
                      ) : (
                        <Icon className="h-5 w-5" name="plus" />
                      )
                    }
                    label="Добавить вложение"
                    onClick={() => openFilePicker(attachmentInputRef.current)}
                  />
                </div>
                <input
                  ref={attachmentInputRef}
                  className="sr-only"
                  type="file"
                  multiple
                  onChange={(event) => void handleAttachmentPick(event)}
                />
                <div className="mt-4 space-y-2">
                  {pendingAttachmentFiles.length ? (
                    <p className="text-sm text-steel">
                      {uploadingAttachmentCount > 0
                        ? queuedAttachmentCount > 0
                          ? `Загружаем ${uploadingAttachmentCount} файл(ов), в очереди ещё ${queuedAttachmentCount}.`
                          : `Загружаем ${uploadingAttachmentCount} файл(ов).`
                        : `Подготовлено ${pendingAttachmentFiles.length} файл(ов) к загрузке.`}
                    </p>
                  ) : null}
                  <PendingAttachmentList
                    busyFileKeys={uploadingAttachmentFileKeys}
                    disableRemove
                    files={pendingAttachmentFiles}
                    onRemove={handleRemovePendingAttachment}
                    showRemove={false}
                  />
                  {attachmentActionError ? (
                    <p className="text-sm text-[#b04c43]">{attachmentActionError}</p>
                  ) : null}
                  {!attachments.length && !pendingAttachmentFiles.length ? (
                    <p className="text-sm text-steel">Пока пусто.</p>
                  ) : null}
                  <AttachmentPreviewList
                    attachments={attachments}
                    canDelete={(attachment) => canManage || attachment.uploadedByUserId === user?.id}
                    columns="single"
                    className="mt-2"
                    deletingId={
                      deleteAttachmentMutation.isPending ? attachmentToDelete?.id ?? null : null
                    }
                    downloadingId={downloadingAttachmentId}
                    getMeta={formatAttachmentMeta}
                    loadPreview={loadEquipmentAttachmentPreview}
                    onDelete={(attachment) => setAttachmentToDelete(attachment)}
                    onDownload={(attachment) => void handleAttachmentDownload(attachment)}
                    previewVariant="a4"
                  />
                </div>
              </section>

              <section className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
                <div>
                  <h3 className="text-lg font-semibold text-ink">История прибора</h3>
                  <p className="mt-1 text-sm text-steel">
                    Архивные записи по ремонту и поверке с быстрым переходом в соответствующий раздел.
                  </p>
                </div>

                <div className="mt-4 space-y-3">
                  {supportsVerification(equipment.equipmentType) ? (
                    <>
                      {latestArchivedVerification ? (
                        <Link
                          className="tone-child flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink transition hover:border-signal-info"
                          to={`/verification/si?tab=archived&equipmentId=${parsedEquipmentId}${
                            latestArchivedVerification.batchKey
                              ? `&batchKey=${encodeURIComponent(latestArchivedVerification.batchKey)}`
                              : `&verificationId=${latestArchivedVerification.verificationId}`
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-ink">Архив поверки</p>
                            <p className="mt-1 truncate text-xs text-steel">
                              {[
                                latestArchivedVerification.resultDocnum
                                  ? `${getArshinDocumentShortLabel(equipment.equipmentType)} ${latestArchivedVerification.resultDocnum}`
                                  : null,
                                latestArchivedVerification.closedAt
                                  ? `закрыта ${formatDateOnly(latestArchivedVerification.closedAt)}`
                                  : null,
                                verificationHistory.length > 1
                                  ? `всего записей: ${verificationHistory.length}`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          </div>
                          <svg className="h-4 w-4 shrink-0 text-steel" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                          </svg>
                        </Link>
                      ) : null}
                    </>
                  ) : null}

                  {latestArchivedRepair ? (
                    <Link
                      className="tone-child flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink transition hover:border-signal-info"
                      to={`/repairs?tab=archived&equipmentId=${parsedEquipmentId}${
                        latestArchivedRepair.batchKey
                          ? `&batchKey=${encodeURIComponent(latestArchivedRepair.batchKey)}`
                          : `&repairId=${latestArchivedRepair.repairId}`
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-ink">Архив ремонта</p>
                        <p className="mt-1 truncate text-xs text-steel">
                          {[
                            latestArchivedRepair.currentStageLabel,
                            latestArchivedRepair.closedAt
                              ? `закрыт ${formatDateOnly(latestArchivedRepair.closedAt)}`
                              : null,
                            repairHistory.length > 1
                              ? `всего записей: ${repairHistory.length}`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <svg className="h-4 w-4 shrink-0 text-steel" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m9 6 6 6-6 6" />
                      </svg>
                    </Link>
                  ) : null}

                  {!latestArchivedVerification && !latestArchivedRepair ? (
                    <p className="text-sm text-steel">Для этого прибора пока нет архивных записей.</p>
                  ) : null}
                </div>
              </section>

              <EquipmentTasksSection equipmentId={parsedEquipmentId} token={token ?? ""} />

            </aside>
          </div>
        </>
      ) : null}

      {repairModalOpen ? (
        <Modal
          description="Будет создан один активный ремонт для выбранного прибора."
          open={repairModalOpen}
          title="Отправить в ремонт"
          onClose={() => setRepairModalOpen(false)}
        >
          <form className="space-y-4" onSubmit={(event) => void handleCreateRepair(event)}>
            {repairPresetVariants.length ? (
              <ProcessVariantSelector
                selectedVariantId={repairForm.stageTemplateVariantId}
                variants={repairPresetVariants}
                onSelect={(variant) =>
                  setRepairForm((current) => ({
                    ...current,
                    stageTemplateVariantId: variant.id,
                    isOnSite: variant.routeKind === "on_site",
                  }))
                }
              />
            ) : hasRepairPresetVariantConfig ? (
              <ProcessVariantSelector
                emptyMessage="В выбранном пресете пока нет вариантов ремонта. Добавь вариант в настройках, чтобы выбирать готовый сценарий здесь."
                selectedVariantId=""
                variants={[]}
                onSelect={() => undefined}
              />
            ) : (
              <div className="space-y-2">
                <span className="block text-sm text-steel">Формат</span>
                <div className="inline-flex rounded-2xl border border-line p-1">
                  <button
                    className={getProcessFormatButtonClass(!repairForm.isOnSite)}
                    onClick={() =>
                      setRepairForm((current) => ({
                        ...current,
                        isOnSite: false,
                      }))
                    }
                    type="button"
                  >
                    Отправка
                  </button>
                  <button
                    className={getProcessFormatButtonClass(repairForm.isOnSite)}
                    onClick={() =>
                      setRepairForm((current) => ({
                        ...current,
                        isOnSite: true,
                      }))
                    }
                    type="button"
                  >
                    На месте
                  </button>
                </div>
              </div>
            )}
            {effectiveRepairIsOnSite ? (
              <div className="tone-parent rounded-2xl border border-line px-4 py-3 text-sm text-steel">
                Ремонт будет оформлен как работа на объекте, без маршрута отправки.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-sm text-steel">
                  Откуда
                  <AutocompleteInput
                    className="form-input"
                    suggestions={routeCitySuggestions}
                    value={repairForm.routeCity}
                    onChange={(value) => setRepairForm((current) => ({ ...current, routeCity: value }))}
                  />
                </label>
                <label className="block text-sm text-steel">
                  Куда
                  <AutocompleteInput
                    className="form-input"
                    suggestions={routeDestinationSuggestions}
                    value={repairForm.routeDestination}
                    onChange={(value) =>
                      setRepairForm((current) => ({
                        ...current,
                        routeDestination: value,
                      }))
                    }
                  />
                </label>
              </div>
            )}
            <label className="block text-sm text-steel">
              {selectedRepairPresetVariant?.stages[0]?.label || "Демонтаж / подготовка к ремонту"}
              <DateInput
                className="form-input form-input--compact"
                value={repairForm.sentToRepairAt}
                onChange={(value) =>
                  setRepairForm((current) => ({ ...current, sentToRepairAt: value }))
                }
              />
            </label>
            <label className="block text-sm text-steel">
              Первое сообщение
              <AutocompleteTextarea
                className="form-input min-h-[92px] resize-none py-3"
                placeholder="Прибор упакован и отправлен в ремонт"
                suggestions={textareaSuggestions}
                value={repairForm.initialMessageText}
                onChange={(value) =>
                  setRepairForm((current) => ({
                    ...current,
                    initialMessageText: value,
                  }))
                }
                onKeyDown={handleTextareaSubmitShortcut}
              />
            </label>
            <input
              ref={repairInitialFilesInputRef}
              className="sr-only"
              multiple
              type="file"
              onChange={handleRepairInitialFilesPick}
            />
            <PendingAttachmentList
              files={repairForm.files}
              onRemove={handleRemoveRepairInitialFile}
            />
            <div className="tone-parent rounded-2xl border border-line px-4 py-3 text-sm text-steel">
              В ремонт сейчас уйдет 1 прибор.
            </div>
            {createRepairMutation.isError ? (
              <p className="text-sm text-[#b04c43]">
                {createRepairMutation.error instanceof Error
                  ? createRepairMutation.error.message
                  : "Не удалось отправить прибор в ремонт."}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <PrivateNoteToggleButton
                active={repairForm.initialMessageIsPrivate}
                disabled={createRepairMutation.isPending}
                onClick={() =>
                  setRepairForm((current) => ({
                    ...current,
                    initialMessageIsPrivate: !current.initialMessageIsPrivate,
                  }))
                }
              />
              <EmojiPickerButton
                disabled={createRepairMutation.isPending}
                onPick={handleInsertRepairInitialEmoji}
              />
              <IconActionButton
                className="icon-action-button--info h-10 w-10"
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.25 20.25a6 6 0 0 1-8.49-8.49l9.9-9.9a4.5 4.5 0 1 1 6.36 6.36l-9.2 9.19a3 3 0 0 1-4.24-4.24l8.49-8.49" />
                  </svg>
                }
                label="Прикрепить файлы к первому сообщению ремонта"
                onClick={() => openFilePicker(repairInitialFilesInputRef.current)}
              />
              <button
                aria-label="Подтвердить отправку в ремонт"
                className="btn-primary disabled:opacity-60"
                disabled={
                  createRepairMutation.isPending
                  || (hasRepairPresetVariantConfig && !repairPresetVariants.length)
                  || (!effectiveRepairIsOnSite && !repairForm.routeCity.trim())
                  || (!effectiveRepairIsOnSite && !repairForm.routeDestination.trim())
                  || !repairForm.sentToRepairAt
                }
                type="submit"
              >
                {createRepairMutation.isPending ? (
                  "…"
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {verificationModalOpen ? (
        <Modal
          description="Будет создана одна активная поверка для выбранного СИ или ЭСИ."
          open={verificationModalOpen}
          title="Отправить в поверку"
          onClose={() => setVerificationModalOpen(false)}
        >
          <form className="space-y-4" onSubmit={(event) => void handleCreateVerification(event)}>
            {verificationPresetVariants.length ? (
              <ProcessVariantSelector
                selectedVariantId={verificationForm.stageTemplateVariantId}
                variants={verificationPresetVariants}
                onSelect={(variant) =>
                  setVerificationForm((current) => ({
                    ...current,
                    stageTemplateVariantId: variant.id,
                    flowMode: getVerificationFlowModeForVariant(variant) ?? current.flowMode,
                  }))
                }
              />
            ) : hasVerificationPresetVariantConfig ? (
              <ProcessVariantSelector
                emptyMessage="В выбранном пресете пока нет вариантов поверки. Добавь вариант в настройках, чтобы выбирать готовый сценарий здесь."
                selectedVariantId=""
                variants={[]}
                onSelect={() => undefined}
              />
            ) : (
              <div className="space-y-2">
                <span className="block text-sm text-steel">Формат</span>
                <div className="inline-flex rounded-2xl border border-line p-1">
                  <button
                    className={getProcessFormatButtonClass(
                      verificationForm.flowMode === "OFFSITE_WITH_DEMOLITION",
                    )}
                    onClick={() =>
                      setVerificationForm((current) => ({
                        ...current,
                        flowMode: "OFFSITE_WITH_DEMOLITION",
                      }))
                    }
                    type="button"
                  >
                    С отправкой
                  </button>
                  <button
                    className={getProcessFormatButtonClass(
                      verificationForm.flowMode === "ONSITE_WITH_DEMOLITION",
                    )}
                    onClick={() =>
                      setVerificationForm((current) => ({
                        ...current,
                        flowMode: "ONSITE_WITH_DEMOLITION",
                      }))
                    }
                    type="button"
                  >
                    На месте + демонтаж
                  </button>
                  <button
                    className={getProcessFormatButtonClass(
                      verificationForm.flowMode === "ONSITE_WITHOUT_DEMOLITION",
                    )}
                    onClick={() =>
                      setVerificationForm((current) => ({
                        ...current,
                        flowMode: "ONSITE_WITHOUT_DEMOLITION",
                      }))
                    }
                    type="button"
                  >
                    На месте без демонтажа
                  </button>
                </div>
              </div>
            )}
            {isVerificationFlowOnSite(effectiveVerificationFlowMode) ? (
              <div className="tone-parent rounded-2xl border border-line px-4 py-3 text-sm text-steel">
                {effectiveVerificationFlowMode === "ONSITE_WITHOUT_DEMOLITION"
                  ? "Поверка будет оформлена как работа на объекте без демонтажа и без маршрута отправки."
                  : "Поверка будет оформлена как работа на объекте, без маршрута отправки."}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-sm text-steel">
                  Откуда
                  <AutocompleteInput
                    className="form-input"
                    suggestions={routeCitySuggestions}
                    value={verificationForm.routeCity}
                    onChange={(value) =>
                      setVerificationForm((current) => ({ ...current, routeCity: value }))
                    }
                  />
                </label>
                <label className="block text-sm text-steel">
                  Куда
                  <AutocompleteInput
                    className="form-input"
                    suggestions={routeDestinationSuggestions}
                    value={verificationForm.routeDestination}
                    onChange={(value) =>
                      setVerificationForm((current) => ({
                        ...current,
                        routeDestination: value,
                      }))
                    }
                  />
                </label>
              </div>
            )}
            <label className="block text-sm text-steel">
              {selectedVerificationPresetVariant?.stages[0]?.label
                || getVerificationStartDateLabel(effectiveVerificationFlowMode)}
              <DateInput
                className="form-input form-input--compact"
                value={verificationForm.sentToVerificationAt}
                onChange={(value) =>
                  setVerificationForm((current) => ({
                    ...current,
                    sentToVerificationAt: value,
                  }))
                }
              />
            </label>
            <label className="block text-sm text-steel">
              Первое сообщение
              <AutocompleteTextarea
                className="form-input min-h-[92px] resize-none py-3"
                placeholder="Прибор упакован и отправлен в поверку"
                suggestions={textareaSuggestions}
                value={verificationForm.initialMessageText}
                onChange={(value) =>
                  setVerificationForm((current) => ({
                    ...current,
                    initialMessageText: value,
                  }))
                }
                onKeyDown={handleTextareaSubmitShortcut}
              />
            </label>
            <input
              ref={verificationInitialFilesInputRef}
              className="sr-only"
              multiple
              type="file"
              onChange={handleVerificationInitialFilesPick}
            />
            <PendingAttachmentList
              files={verificationForm.files}
              onRemove={handleRemoveVerificationInitialFile}
            />
            <div className="tone-parent rounded-2xl border border-line px-4 py-3 text-sm text-steel">
              В поверку сейчас уйдет 1 прибор.
            </div>
            {createVerificationMutation.isError ? (
              <p className="text-sm text-[#b04c43]">
                {createVerificationMutation.error instanceof Error
                  ? createVerificationMutation.error.message
                  : "Не удалось отправить прибор в поверку."}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <PrivateNoteToggleButton
                active={verificationForm.initialMessageIsPrivate}
                disabled={createVerificationMutation.isPending}
                onClick={() =>
                  setVerificationForm((current) => ({
                    ...current,
                    initialMessageIsPrivate: !current.initialMessageIsPrivate,
                  }))
                }
              />
              <EmojiPickerButton
                disabled={createVerificationMutation.isPending}
                onPick={handleInsertVerificationInitialEmoji}
              />
              <IconActionButton
                className="icon-action-button--info h-10 w-10"
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.25 20.25a6 6 0 0 1-8.49-8.49l9.9-9.9a4.5 4.5 0 1 1 6.36 6.36l-9.2 9.19a3 3 0 0 1-4.24-4.24l8.49-8.49" />
                  </svg>
                }
                label="Прикрепить файлы к первому сообщению поверки"
                onClick={() => openFilePicker(verificationInitialFilesInputRef.current)}
              />
              <button
                aria-label="Подтвердить отправку в поверку"
                className="btn-primary disabled:opacity-60"
                disabled={
                  createVerificationMutation.isPending
                  || (hasVerificationPresetVariantConfig && !verificationPresetVariants.length)
                  || (!isVerificationFlowOnSite(effectiveVerificationFlowMode)
                    && !verificationForm.routeCity.trim())
                  || (!isVerificationFlowOnSite(effectiveVerificationFlowMode)
                    && !verificationForm.routeDestination.trim())
                  || !verificationForm.sentToVerificationAt
                }
                type="submit"
              >
                {createVerificationMutation.isPending ? (
                  "…"
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      <Modal
        description={
          currentFolder
            ? `Выбери сотрудников с доступом к папке «${currentFolder.name}», которым нужно отправить ссылку на этот прибор.`
            : "Выбери получателей письма."
        }
        footer={
          <div className="flex items-center justify-end gap-3">
            <button className="btn-secondary" type="button" onClick={closeShareModal}>
              Закрыть
            </button>
            <button
              className="btn-primary disabled:opacity-60"
              disabled={shareEquipmentMutation.isPending || selectedShareUserIds.length === 0}
              form="equipment-share-form"
              type="submit"
            >
              {shareEquipmentMutation.isPending
                ? "Отправляем..."
                : `Отправить (${selectedShareUserIds.length})`}
            </button>
          </div>
        }
        open={shareModalOpen}
        size="sm"
        title="Поделиться прибором"
        onClose={closeShareModal}
      >
        <form
          id="equipment-share-form"
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void shareEquipmentMutation.mutateAsync();
          }}
        >
          {shareRecipientsQuery.isLoading ? (
            <p className="text-sm text-steel">Загружаем список получателей...</p>
          ) : shareRecipientsQuery.isError ? (
            <p className="text-sm text-[#b04c43]">
              {shareRecipientsQuery.error instanceof Error
                ? shareRecipientsQuery.error.message
                : "Не удалось загрузить список получателей."}
            </p>
          ) : shareRecipientsQuery.data?.users.length ? (
            <div className="space-y-3">
              <label className="block text-sm text-steel">
                Поиск получателя
                <input
                  className="form-input"
                  type="text"
                  placeholder={userSearchPlaceholder}
                  value={shareUserSearchQuery}
                  onChange={(event) => setShareUserSearchQuery(event.target.value)}
                />
              </label>
              {!filteredShareRecipients.length ? (
                <p className="text-sm text-steel">По этому запросу получатели не найдены.</p>
              ) : null}
              {filteredShareRecipients.map((userItem) => {
                const checked = selectedShareUserIds.includes(userItem.userId);
                const extraInfo = buildUserExtraInfo(userItem);
                return (
                  <label
                    key={userItem.userId}
                    className="tone-child flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm"
                  >
                    <input
                      checked={checked}
                      className="mt-1 h-4 w-4 accent-[var(--accent)]"
                      type="checkbox"
                      onChange={(event) =>
                        setSelectedShareUserIds((current) =>
                          event.target.checked
                            ? [...current, userItem.userId].filter(
                                (value, index, source) => source.indexOf(value) === index,
                              )
                            : current.filter((value) => value !== userItem.userId),
                        )
                      }
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{userItem.displayName}</span>
                      <span className="mt-1 block text-xs text-steel">
                        {roleLabels[userItem.role]} · {userItem.email}
                      </span>
                      {extraInfo ? (
                        <span className="mt-1 block text-xs text-steel">{extraInfo}</span>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-steel">Для этой папки нет доступных получателей.</p>
          )}
          {shareEquipmentMutation.isError ? (
            <p className="text-sm text-[#b04c43]">
              {shareEquipmentMutation.error instanceof Error
                ? shareEquipmentMutation.error.message
                : "Не удалось отправить ссылку на прибор."}
            </p>
          ) : null}
        </form>
      </Modal>

      {esiCompositionPreview ? (
        <Modal
          description={
            esiCompositionPreview.row.certificateNumber
              ? `Свидетельство ${esiCompositionPreview.row.certificateNumber}`
              : "Детальная запись ЭСИ."
          }
          open={Boolean(esiCompositionPreview)}
          title="Подробнее по ЭСИ"
          onClose={() => setEsiCompositionPreview(null)}
        >
          <ESICompositionDetailCard
            detail={esiCompositionPreview.detail}
            row={esiCompositionPreview.row}
          />
        </Modal>
      ) : null}

      {esiCompositionModalOpen ? (
        <Modal
          description="Найди модуль ЭСИ по номеру свидетельства и добавь его в состав текущего эталона."
          open={esiCompositionModalOpen}
          title="Добавить в состав ЭСИ"
          onClose={closeEsiCompositionModal}
        >
          <div className="space-y-4">
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                if (!esiCompositionForm.certificateNumber.trim()) {
                  return;
                }
                void searchEsiCompositionMutation.mutateAsync(
                  esiCompositionForm.certificateNumber.trim(),
                );
              }}
            >
              <label className="block flex-1 text-sm text-steel">
                Номер свидетельства
                <input
                  className="form-input"
                  placeholder="Например, С-ВЯ/05-02-2026/503716186"
                  value={esiCompositionForm.certificateNumber}
                  onChange={(event) =>
                    setEsiCompositionForm((current) => ({
                      ...current,
                      certificateNumber: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="flex items-end">
                <button
                  className="btn-primary"
                  disabled={
                    searchEsiCompositionMutation.isPending
                    || !esiCompositionForm.certificateNumber.trim()
                  }
                  type="submit"
                >
                  {searchEsiCompositionMutation.isPending ? "Поиск..." : "Найти"}
                </button>
              </div>
            </form>

            {searchEsiCompositionMutation.isError ? (
              <p className="text-sm text-[#b04c43]">
                {getArshinErrorMessage(
                  searchEsiCompositionMutation.error,
                  "Не удалось выполнить поиск по свидетельству.",
                )}
              </p>
            ) : null}

            {searchEsiCompositionMutation.isSuccess && !esiCompositionSearchResults.length ? (
              <p className="text-sm text-steel">По этому свидетельству записи ЭСИ не найдены.</p>
            ) : null}

            {esiCompositionSearchResults.length ? (
              <div className="space-y-3">
                {esiCompositionSearchResults.map((result) => {
                  const isSelected = selectedEsiCompositionResult?.vriId === result.vriId;
                  const isLoading =
                    loadEsiCompositionDetailMutation.isPending
                    && loadEsiCompositionDetailMutation.variables?.vriId === result.vriId;
                  return (
                    <button
                      key={`${result.vriId}-${result.resultDocnum ?? "unknown"}`}
                      className={[
                        "w-full rounded-2xl border px-4 py-3 text-left transition",
                        isSelected
                          ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]/35"
                          : "border-line bg-white hover:border-[color:var(--accent)]/45",
                      ].join(" ")}
                      type="button"
                      onClick={() => void loadEsiCompositionDetailMutation.mutateAsync(result)}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-ink">
                            {result.mitTitle ?? "ЭСИ из Аршина"}
                          </div>
                          <div className="mt-1 text-sm text-steel">
                            {[result.mitNotation, result.miModification, result.miNumber]
                              .filter(Boolean)
                              .join(" · ") || "Без уточняющих полей"}
                          </div>
                          <div className="mt-2 text-xs text-steel">
                            {[result.resultDocnum, result.verificationDate, result.validDate]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-steel">
                          {isLoading ? "Загрузка..." : isSelected ? "Выбрано" : "Открыть"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            {loadEsiCompositionDetailMutation.isError ? (
              <p className="text-sm text-[#b04c43]">
                {getArshinErrorMessage(
                  loadEsiCompositionDetailMutation.error,
                  "Не удалось загрузить запись ЭСИ.",
                )}
              </p>
            ) : null}

            {createEsiCompositionEntryMutation.isError ? (
              <p className="text-sm text-[#b04c43]">
                {createEsiCompositionEntryMutation.error instanceof Error
                  ? createEsiCompositionEntryMutation.error.message
                  : "Не удалось добавить запись в состав ЭСИ."}
              </p>
            ) : null}

            <label className="block text-sm text-steel">
              Предел измерения
              <input
                className="form-input"
                type="text"
                value={esiCompositionForm.measurementLimit}
                onChange={(event) =>
                  setEsiCompositionForm((current) => ({
                    ...current,
                    measurementLimit: event.target.value,
                  }))
                }
              />
            </label>

            <div className="flex justify-end gap-3">
              <button className="btn-secondary" type="button" onClick={closeEsiCompositionModal}>
                Отмена
              </button>
              <button
                className="btn-primary"
                disabled={
                  createEsiCompositionEntryMutation.isPending
                  || !selectedEsiCompositionResult
                  || !selectedEsiCompositionDetail
                  || !esiCompositionForm.measurementLimit.trim()
                }
                type="button"
                onClick={() => void createEsiCompositionEntryMutation.mutateAsync()}
              >
                {createEsiCompositionEntryMutation.isPending
                  ? "Добавление..."
                  : "Добавить в состав"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      {editingEsiModule ? (
        <Modal
          description="Измени предел измерения выбранного модуля ЭСИ."
          open={Boolean(editingEsiModule)}
          title="Редактировать модуль ЭСИ"
          onClose={() => {
            setEditingEsiModule(null);
            setEditingEsiMeasurementLimit("");
            updateEsiCompositionEntryMutation.reset();
          }}
        >
          <div className="space-y-4">
            {editingEsiModule ? (
              <div className="rounded-2xl border border-line px-4 py-3 text-sm text-steel">
                {[editingEsiModule.title, editingEsiModule.registryNumber, editingEsiModule.serialNumber]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            ) : null}
            <label className="block text-sm text-steel">
              Предел измерения
              <input
                className="form-input"
                type="text"
                value={editingEsiMeasurementLimit}
                onChange={(event) => setEditingEsiMeasurementLimit(event.target.value)}
              />
            </label>
            {updateEsiCompositionEntryMutation.isError ? (
              <p className="text-sm text-[#b04c43]">
                {updateEsiCompositionEntryMutation.error instanceof Error
                  ? updateEsiCompositionEntryMutation.error.message
                  : "Не удалось обновить модуль ЭСИ."}
              </p>
            ) : null}
            <div className="flex justify-end gap-3">
              <button
                className="btn-secondary"
                type="button"
                onClick={() => {
                  setEditingEsiModule(null);
                  setEditingEsiMeasurementLimit("");
                  updateEsiCompositionEntryMutation.reset();
                }}
              >
                Отмена
              </button>
              <button
                className="btn-primary"
                disabled={
                  updateEsiCompositionEntryMutation.isPending
                  || !editingEsiMeasurementLimit.trim()
                }
                type="button"
                onClick={() => void updateEsiCompositionEntryMutation.mutateAsync()}
              >
                {updateEsiCompositionEntryMutation.isPending ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}

      <DeleteConfirmModal
        confirmLabel={deleteEsiCompositionEntryMutation.isPending ? "Удаление..." : "Удалить"}
        description={
          esiModuleToDelete
            ? `Удалить модуль ${esiModuleToDelete.registryNumber ?? "ЭСИ"} из состава?`
            : ""
        }
        errorMessage={
          deleteEsiCompositionEntryMutation.isError
            ? (
                deleteEsiCompositionEntryMutation.error instanceof Error
                  ? deleteEsiCompositionEntryMutation.error.message
                  : "Не удалось удалить модуль ЭСИ."
              )
            : null
        }
        isPending={deleteEsiCompositionEntryMutation.isPending}
        isOpen={Boolean(esiModuleToDelete)}
        title="Удалить модуль из состава ЭСИ"
        onClose={() => {
          setEsiModuleToDelete(null);
          deleteEsiCompositionEntryMutation.reset();
        }}
        onConfirm={() => void deleteEsiCompositionEntryMutation.mutateAsync()}
      />

      {isEditing && form ? (
        <Modal
          description="Измени базовые данные прибора. SI-специфика будет редактироваться отдельным слоем."
          open={isEditing}
          title="Редактировать прибор"
          onClose={() => setIsEditing(false)}
        >
          <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm text-steel">
                Папка
                <select
                  className="form-input"
                  value={form.folderId}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, folderId: event.target.value } : current,
                    )
                  }
                >
                  <option value="">Выбери папку</option>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-steel">
                Категория
                <select
                  className="form-input"
                  disabled={!canEditEquipmentType}
                  value={form.equipmentType}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? {
                            ...current,
                            equipmentType: event.target.value as EquipmentType,
                            measurementRangeStart:
                              event.target.value === "SI" ? current.measurementRangeStart : "",
                            measurementRangeEnd:
                              event.target.value === "SI" ? current.measurementRangeEnd : "",
                            measurementUnit:
                              event.target.value === "SI" ? current.measurementUnit : "",
                            complianceDate:
                              event.target.value === "IO" || event.target.value === "VO"
                                ? current.complianceDate
                                : "",
                            complianceIntervalMonths:
                              event.target.value === "IO" || event.target.value === "VO"
                                ? current.complianceIntervalMonths || "12"
                                : "",
                            manualVerificationIntervalMonths:
                              event.target.value === "SI"
                                ? current.manualVerificationIntervalMonths
                                : "",
                          }
                        : current,
                    )
                  }
                >
                  {editableEquipmentTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {equipmentTypeSelectionLabels[type]}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-xs text-steel">
                  {canEditEquipmentType
                    ? "Для импортированных приборов можно менять категорию только из Др. в СИ, ИО или ВО."
                    : "Категорию этого прибора после создания менять нельзя."}
                </span>
              </label>
              <label className="block text-sm text-steel">
                Статус
                <select
                  className="form-input"
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, status: event.target.value as EquipmentStatus }
                        : current,
                    )
                  }
                >
                  {equipmentStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {equipmentStatusLabels[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-steel">
                Объект
                <AutocompleteInput
                  className="form-input"
                  suggestions={objectNameSuggestions}
                  value={form.objectName}
                  onChange={(value) =>
                    setForm((current) =>
                      current ? { ...current, objectName: value } : current,
                    )
                  }
                />
              </label>
              <label className="block text-sm text-steel">
                Наименование
                <input
                  className="form-input"
                  type="text"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, name: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label className="block text-sm text-steel">
                Модификация
                <input
                  className="form-input"
                  type="text"
                  value={form.modification}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, modification: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label className="block text-sm text-steel">
                Заводской номер
                <input
                  className="form-input"
                  type="text"
                  value={form.serialNumber}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, serialNumber: event.target.value } : current,
                    )
                  }
                />
              </label>
              <label className="block text-sm text-steel">
                Год выпуска
                <input
                  className="form-input"
                  type="number"
                  value={form.manufactureYear}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, manufactureYear: event.target.value } : current,
                    )
                }
              />
            </label>
          </div>
            {form.equipmentType === "SI" ? (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(180px,0.8fr)]">
                  <label className="block text-sm text-steel">
                    Диапазон измерения от
                    <input
                      className="form-input"
                      type="text"
                      value={form.measurementRangeStart}
                      onChange={(event) =>
                        setForm((current) =>
                          current ? { ...current, measurementRangeStart: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                  <label className="block text-sm text-steel">
                    Диапазон измерения до
                    <input
                      className="form-input"
                      type="text"
                      value={form.measurementRangeEnd}
                      onChange={(event) =>
                        setForm((current) =>
                          current ? { ...current, measurementRangeEnd: event.target.value } : current,
                        )
                      }
                    />
                  </label>
                  <label className="block text-sm text-steel">
                    Единица измерения
                    <AutocompleteInput
                      className="form-input"
                      suggestions={measurementUnitSuggestions}
                      value={form.measurementUnit}
                      onChange={(value) =>
                        setForm((current) =>
                          current ? { ...current, measurementUnit: value } : current,
                        )
                      }
                    />
                  </label>
                </div>
                <label className="flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink">
                  <input
                    checked={Boolean(form.manualVerificationIntervalMonths)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                    type="checkbox"
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? {
                              ...current,
                              manualVerificationIntervalMonths: event.target.checked
                                ? (current.manualVerificationIntervalMonths || "12")
                                : "",
                            }
                          : current,
                      )
                    }
                  />
                  <span>
                    <span className="block font-medium">Межповерочный интервал вручную</span>
                    <span className="mt-1 block text-xs text-steel">
                      Следующая поверка будет считаться от даты поверки как период минус 1 день.
                    </span>
                  </span>
                </label>
                {form.manualVerificationIntervalMonths ? (
                  <label className="block text-sm text-steel">
                    Межповерочный интервал
                    <select
                      className="form-input"
                      value={form.manualVerificationIntervalMonths}
                      onChange={(event) =>
                        setForm((current) =>
                          current
                            ? { ...current, manualVerificationIntervalMonths: event.target.value }
                            : current,
                        )
                      }
                    >
                      {complianceIntervalOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}
            {(form.equipmentType === "IO" || form.equipmentType === "VO") ? (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block text-sm text-steel">
                  {getEquipmentComplianceDateLabel(form.equipmentType)}
                  <DateInput
                    className="form-input form-input--compact"
                    value={form.complianceDate}
                    onChange={(value) =>
                      setForm((current) =>
                        current ? { ...current, complianceDate: value } : current,
                      )
                    }
                  />
                </label>
                <label className="block text-sm text-steel">
                  {getEquipmentCompliancePeriodLabel(form.equipmentType)}
                  <select
                    className="form-input"
                    value={form.complianceIntervalMonths}
                    onChange={(event) =>
                      setForm((current) =>
                        current
                          ? { ...current, complianceIntervalMonths: event.target.value }
                          : current,
                      )
                    }
                  >
                    <option value="">Не задан</option>
                    {complianceIntervalOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            <label className="block text-sm text-steel">
              Текущее местоположение
              <AutocompleteInput
                className="form-input"
                suggestions={currentLocationSuggestions}
                value={form.currentLocationManual}
                onChange={(value) =>
                  setForm((current) =>
                    current ? { ...current, currentLocationManual: value } : current,
                  )
                }
              />
            </label>
            {updateEquipmentMutation.isError ? (
              <p className="text-sm text-[#b04c43]">
                {updateEquipmentMutation.error instanceof Error
                  ? updateEquipmentMutation.error.message
                  : "Не удалось сохранить изменения."}
              </p>
            ) : null}
            <div className="flex justify-end">
              <button
                aria-label="Сохранить изменения"
                className="btn-primary disabled:opacity-60"
                disabled={updateEquipmentMutation.isPending}
                type="submit"
              >
                {updateEquipmentMutation.isPending ? (
                  "…"
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      <DeleteConfirmModal
        description="Удалить этот прибор из реестра? Действие потребует подтверждения."
        errorMessage={
          deleteEquipmentMutation.isError
            ? deleteEquipmentMutation.error instanceof Error
              ? deleteEquipmentMutation.error.message
              : "Не удалось удалить прибор."
            : null
        }
        isOpen={confirmDeleteOpen}
        isPending={deleteEquipmentMutation.isPending}
        title="Удалить прибор"
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={() => void deleteEquipmentMutation.mutateAsync()}
      />

      <DeleteConfirmModal
        description={
          attachmentToDelete
            ? `Файл ${attachmentToDelete.fileName} будет удален из карточки прибора.`
            : "Удалить вложение из карточки прибора?"
        }
        errorMessage={
          deleteAttachmentMutation.isError
            ? deleteAttachmentMutation.error instanceof Error
              ? deleteAttachmentMutation.error.message
              : "Не удалось удалить вложение."
            : null
        }
        isOpen={attachmentToDelete !== null}
        isPending={deleteAttachmentMutation.isPending || attachmentToDelete === null}
        title="Удалить вложение"
        onClose={() => setAttachmentToDelete(null)}
        onConfirm={() => {
          if (!attachmentToDelete) {
            return;
          }
          void deleteAttachmentMutation.mutateAsync(attachmentToDelete.id);
        }}
      />

      <DeleteConfirmModal
        description={
          commentToDelete
            ? "Комментарий будет удален из карточки прибора."
            : "Удалить комментарий?"
        }
        errorMessage={
          deleteCommentMutation.isError
            ? deleteCommentMutation.error instanceof Error
              ? deleteCommentMutation.error.message
              : "Не удалось удалить комментарий."
            : null
        }
        isOpen={commentToDelete !== null}
        isPending={deleteCommentMutation.isPending || commentToDelete === null}
        title="Удалить комментарий"
        onClose={() => setCommentToDelete(null)}
        onConfirm={() => {
          if (!commentToDelete) {
            return;
          }
          void deleteCommentMutation.mutateAsync(commentToDelete.id);
        }}
      />
    </section>
  );
}

function formatCompactAttachmentMeta(attachment: {
  fileSize: number;
  fileMimeType: string | null;
}): string {
  return formatAttachmentShortMeta(attachment.fileSize, attachment.fileMimeType);
}

function getCurrentProcessFolder(
  folders: EquipmentFolder[],
  equipment: EquipmentItem | null,
): EquipmentFolder | null {
  return folders.find((folder) => folder.id === equipment?.folderId) ?? null;
}

function formatAttachmentMeta(attachment: EquipmentAttachment): string {
  return [
    attachment.uploadedByDisplayName,
    formatDateTime(attachment.createdAt),
    formatAttachmentShortMeta(attachment.fileSize, attachment.fileMimeType),
  ]
    .filter(Boolean)
    .join(" · ");
}

function mergeEquipmentAttachments(
  current: EquipmentAttachment[],
  incoming: EquipmentAttachment[],
): EquipmentAttachment[] {
  const merged = [...current];
  const seenIds = new Set(current.map((attachment) => attachment.id));

  for (const attachment of incoming) {
    if (seenIds.has(attachment.id)) {
      continue;
    }
    seenIds.add(attachment.id);
    merged.push(attachment);
  }

  return merged.sort((left, right) => {
    if (left.createdAt === right.createdAt) {
      return right.id - left.id;
    }
    return right.createdAt.localeCompare(left.createdAt);
  });
}

function SISection({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string | null]>;
}) {
  const visibleRows = rows.filter((row): row is [string, string] => Boolean(row[1] && row[1].trim()));
  if (!visibleRows.length) {
    return null;
  }

  return (
    <section className="tone-parent overflow-hidden rounded-3xl border border-line">
      <div className="tone-child border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
        {title}
      </div>
      <dl>
        {visibleRows.map(([label, value], index) => (
          <div
            key={label}
            className={[
              "grid gap-2 px-4 py-3 text-sm sm:grid-cols-[240px_minmax(0,1fr)] sm:gap-4",
              index > 0 ? "border-t border-line" : "",
            ].join(" ")}
          >
            <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">{label}</dt>
            <dd className="min-w-0 break-words font-medium leading-6 text-ink">
              {renderTechnicalText(value, `${title}-${label}-${index}`)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SIListSection({
  title,
  items,
}: {
  title: string;
  items: string[];
}) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="tone-parent overflow-hidden rounded-3xl border border-line">
      <div className="tone-child border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
        {title}
      </div>
      <div className="space-y-2 px-4 py-3 text-sm text-ink">
        {items.map((item, index) => (
          <article key={`${title}-${index}`} className="tone-child rounded-2xl border border-line px-4 py-3">
            <FormattedSIListItem item={item} itemKey={`${title}-${index}`} />
          </article>
        ))}
      </div>
    </section>
  );
}

type SIReferenceTableRow = {
  source: string | null;
  registryNumber: string | null;
  typeNumber: string | null;
  title: string | null;
  notation: string | null;
  modification: string | null;
  serialNumber: string | null;
  manufactureYear: string | null;
  rank: string | null;
  documentTitle: string | null;
};

type ESIRelatedProfileRow = {
  entryId: number | null;
  moduleKind: ESIModuleKind;
  selected: boolean;
  vriId: string | null;
  rawPayloadJson: Record<string, unknown> | null;
  registryNumber: string | null;
  measurementLimit: string | null;
  rank: string | null;
  title: string | null;
  modification: string | null;
  serialNumber: string | null;
  manufactureYear: string | null;
  verificationDate: string | null;
  validUntil: string | null;
  certificateNumber: string | null;
  arshinUrl: string | null;
  canDelete: boolean;
};

type ESIRelatedVerificationRow = {
  selected: boolean;
  certificateNumber: string | null;
  registryNumber: string | null;
  modification: string | null;
  verificationDate: string | null;
  validUntil: string | null;
  documentTitle: string | null;
  applicability: string | null;
  arshinUrl: string | null;
};

function SIReferenceTableSection({
  title,
  rows,
  showSource,
}: {
  title: string;
  rows: SIReferenceTableRow[];
  showSource?: boolean;
}) {
  if (!rows.length) {
    return null;
  }

  const hasSource = Boolean(showSource && rows.some((row) => row.source));

  return (
    <section className="tone-parent overflow-hidden rounded-3xl border border-line">
      <div className="tone-child border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
        {title}
      </div>
      <div className="max-h-[440px] overflow-auto">
        <table className="min-w-[1120px] table-auto border-collapse text-left text-sm">
          <thead className="tone-child sticky top-0 z-10 text-[11px] uppercase tracking-[0.12em] text-steel">
            <tr>
              {hasSource ? <th className="border-b border-line px-3 py-2 font-semibold">Раздел</th> : null}
              <th className="border-b border-line px-3 py-2 font-semibold">Номер</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Рег. № типа</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Наименование</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Обозначение</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Модификация</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Заводской номер</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Год</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Разряд</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Схема / документ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${title}-${index}`} className="align-top">
                {hasSource ? (
                  <td className="border-b border-line px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-steel">
                    {row.source ?? "—"}
                  </td>
                ) : null}
                <td className="border-b border-line px-3 py-2 font-mono text-xs text-ink">
                  {renderTechnicalText(row.registryNumber ?? "—", `${title}-${index}-number`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">
                  {renderTechnicalText(row.typeNumber ?? "—", `${title}-${index}-type-number`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.title ?? "—", `${title}-${index}-title`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.notation ?? "—", `${title}-${index}-notation`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.modification ?? "—", `${title}-${index}-modification`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">
                  {renderTechnicalText(row.serialNumber ?? "—", `${title}-${index}-serial`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">{row.manufactureYear ?? "—"}</td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.rank ?? "—", `${title}-${index}-rank`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.documentTitle ?? "—", `${title}-${index}-document`)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ESICompositionSection({
  rows,
  previewLoadingId,
  onPreview,
  onEdit,
  onDelete,
}: {
  rows: ESIRelatedProfileRow[];
  previewLoadingId: string | null;
  onPreview: (row: ESIRelatedProfileRow) => void;
  onEdit?: (row: ESIRelatedProfileRow) => void;
  onDelete?: (row: ESIRelatedProfileRow) => void;
}) {
  if (!rows.length) {
    return null;
  }

  return (
    <section className="tone-parent overflow-hidden rounded-3xl border border-line">
      <div className="max-h-[420px] overflow-x-auto overflow-y-auto">
        <table className="min-w-[1120px] w-full table-auto border-collapse text-left text-sm">
          <thead className="tone-child sticky top-0 z-10 text-[11px] uppercase tracking-[0.12em] text-steel">
            <tr>
              <th className="border-b border-line px-3 py-2 font-semibold">Номер в перечне</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Предел измерения</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Разряд</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Наименование</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Модификация</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Заводской номер</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Год</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Дата поверки</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Действительно до</th>
              <th className="border-b border-line px-3 py-2 font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.vriId ?? row.registryNumber ?? `esi-profile-${index}`}
                className={["align-top", row.selected ? "bg-[color:var(--accent-soft)]/35" : ""].join(" ")}
              >
                <td className="border-b border-line px-3 py-2 font-mono text-xs text-ink">
                  {renderTechnicalText(row.registryNumber ?? "—", `esi-profile-${index}-number`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(
                    row.measurementLimit ?? "Не указан",
                    `esi-profile-${index}-measurement-limit`,
                  )}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.rank ?? "—", `esi-profile-${index}-rank`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.title ?? "—", `esi-profile-${index}-title`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                  {renderTechnicalText(row.modification ?? "—", `esi-profile-${index}-modification`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">
                  {renderTechnicalText(row.serialNumber ?? "—", `esi-profile-${index}-serial`)}
                </td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">{row.manufactureYear ?? "—"}</td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">{row.verificationDate ?? "—"}</td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">{row.validUntil ?? "—"}</td>
                <td className="border-b border-line px-3 py-2 text-xs text-ink">
                  <div className="icon-action-row">
                    <IconActionButton
                      disabled={!row.certificateNumber || previewLoadingId === row.registryNumber}
                      icon={
                        previewLoadingId === row.registryNumber ? (
                          <span className="text-sm leading-none">…</span>
                        ) : (
                          <Icon className="h-4 w-4" name="details" />
                        )
                      }
                      label="Подробнее"
                      size="tiny"
                      onClick={() => onPreview(row)}
                    />
                    {onEdit && row.entryId ? (
                      <IconActionButton
                        icon={<Icon className="h-4 w-4" name="edit" />}
                        label="Редактировать"
                        size="tiny"
                        onClick={() => onEdit(row)}
                      />
                    ) : null}
                    {onDelete && row.entryId && row.canDelete ? (
                      <IconActionButton
                        className="icon-action-button--danger"
                        icon={<Icon className="h-4 w-4" name="delete" />}
                        label="Удалить"
                        size="tiny"
                        onClick={() => onDelete(row)}
                      />
                    ) : null}
                    {row.arshinUrl ? (
                      <IconActionLink
                        href={row.arshinUrl}
                        icon={<Icon className="h-4 w-4" name="arshin" />}
                        label="Аршин"
                        rel="noreferrer"
                        size="tiny"
                        target="_blank"
                      />
                    ) : (
                      <span className="text-xs text-steel">—</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function sortEsiCompositionRows(rows: ESIRelatedProfileRow[]): ESIRelatedProfileRow[] {
  return [...rows].sort((left, right) => {
    if (left.moduleKind !== right.moduleKind) {
      return left.moduleKind === "INTERNAL" ? -1 : 1;
    }
    const leftDate = toSortableTime(left.verificationDate);
    const rightDate = toSortableTime(right.verificationDate);
    if (leftDate !== rightDate) {
      return rightDate - leftDate;
    }
    return (left.registryNumber ?? "").localeCompare(right.registryNumber ?? "", "ru");
  });
}

function toSortableTime(value: string | null): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const displayMatch = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (displayMatch) {
    return new Date(
      Number(displayMatch[3]),
      Number(displayMatch[2]) - 1,
      Number(displayMatch[1]),
    ).getTime();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? Number.NEGATIVE_INFINITY : parsed.getTime();
}

function ESICompositionDetailCard({
  row,
  detail,
}: {
  row: ESIRelatedProfileRow;
  detail: ArshinVriDetail;
}) {
  const raw = (detail.rawPayloadJson ?? {}) as Record<string, unknown>;
  const verificationRows = buildRelatedEsiVerificationRows(raw).filter(
    (item) => !row.registryNumber || item.registryNumber === row.registryNumber,
  );
  const summaryRows: Array<[string, string]> = [
    ["Номер в перечне", row.registryNumber ?? "—"],
    ["Номер свидетельства", row.certificateNumber ?? detail.certificateNumber ?? "—"],
    ["Регистрационный номер типа СИ", detail.regNumber ?? "—"],
    ["Наименование типа СИ", detail.typeName ?? row.title ?? "—"],
    ["Обозначение типа СИ", detail.typeDesignation ?? "—"],
    ["Модификация СИ", detail.modification ?? row.modification ?? "—"],
    ["Заводской номер СИ", detail.serialNumber ?? row.serialNumber ?? "—"],
    ["Год выпуска СИ", detail.manufactureYear ? String(detail.manufactureYear) : row.manufactureYear ?? "—"],
    [
      "Поверочная схема",
      [getFirstString(raw.schematype), getFirstString(raw.schematitle)].filter(Boolean).join(" · ") || "—",
    ],
    ["ГПЭ, к которому прослеживается СИ", getFirstString(raw.npenumber) ?? "—"],
    [
      "Разряд эталона",
      formatSIReferenceRank(getFirstString(raw.rankcode), getFirstString(raw.rankclass)) ?? "—",
    ],
    ["Пригодность", formatBooleanLabel(detail.isUsable) ?? "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {summaryRows.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-steel">{label}</div>
            <div className="mt-2 text-sm text-ink">{value}</div>
          </div>
        ))}
      </div>

      <section className="tone-parent overflow-hidden rounded-3xl border border-line">
        <div className="tone-child border-b border-line px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
          Сведения о поверках
        </div>
        {verificationRows.length ? (
          <div className="max-h-[320px] overflow-auto">
            <table className="min-w-[880px] table-auto border-collapse text-left text-sm">
              <thead className="tone-child sticky top-0 z-10 text-[11px] uppercase tracking-[0.12em] text-steel">
                <tr>
                  <th className="border-b border-line px-3 py-2 font-semibold">Организация-поверитель</th>
                  <th className="border-b border-line px-3 py-2 font-semibold">Дата поверки</th>
                  <th className="border-b border-line px-3 py-2 font-semibold">Действительна до</th>
                  <th className="border-b border-line px-3 py-2 font-semibold">Номер свидетельства</th>
                  <th className="border-b border-line px-3 py-2 font-semibold">Пригодность</th>
                </tr>
              </thead>
              <tbody>
                {verificationRows.map((verificationRow, index) => (
                  <tr
                    key={`esi-verification-${verificationRow.certificateNumber ?? index}`}
                    className={verificationRow.selected ? "bg-[color:var(--accent-soft)]/35" : ""}
                  >
                    <td className="border-b border-line px-3 py-2 text-xs leading-5 text-ink">
                      {detail.organization ?? "—"}
                    </td>
                    <td className="border-b border-line px-3 py-2 text-xs text-ink">
                      {verificationRow.verificationDate ?? detail.verificationDate ?? "—"}
                    </td>
                    <td className="border-b border-line px-3 py-2 text-xs text-ink">
                      {verificationRow.validUntil ?? detail.validUntil ?? "—"}
                    </td>
                    <td className="border-b border-line px-3 py-2 font-mono text-xs text-ink">
                      {renderTechnicalText(
                        verificationRow.certificateNumber ?? detail.certificateNumber ?? "—",
                        `esi-verification-certificate-${index}`,
                      )}
                    </td>
                    <td className="border-b border-line px-3 py-2 text-xs text-ink">
                      {verificationRow.applicability ?? formatBooleanLabel(detail.isUsable) ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-4 text-sm text-steel">
            Сведения о поверках для этого профиля пока не загружены.
          </div>
        )}
      </section>
    </div>
  );
}

function FormattedSIListItem({
  item,
  itemKey,
}: {
  item: string;
  itemKey: string;
}) {
  const formattedItem = formatSIListItem(item);

  return (
    <div className="space-y-2">
      {formattedItem.code ? (
        <div className="inline-flex max-w-full rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-steel">
          <span className="min-w-0 break-all font-mono normal-case tracking-normal">
            {renderTechnicalText(formattedItem.code, `${itemKey}-code`)}
          </span>
        </div>
      ) : null}
      <div className="space-y-1.5">
        {formattedItem.lines.map((line, lineIndex) => (
          <p
            key={`${itemKey}-line-${lineIndex}`}
            className={[
              "break-words leading-6 text-ink",
              !formattedItem.code && lineIndex === 0 ? "font-medium" : "",
            ].join(" ")}
          >
            {renderTechnicalText(line, `${itemKey}-line-${lineIndex}`)}
          </p>
        ))}
      </div>
    </div>
  );
}

function formatSIListItem(item: string): { code: string | null; lines: string[] } {
  const parts = item
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    return { code: null, lines: [] };
  }

  const [firstPart, ...restParts] = parts;
  if (restParts.length && looksLikeTechnicalCode(firstPart)) {
    return {
      code: firstPart,
      lines: restParts,
    };
  }

  return {
    code: null,
    lines: parts,
  };
}

function looksLikeTechnicalCode(value: string): boolean {
  const normalized = value.trim();
  if (!normalized || normalized.length > 48) {
    return false;
  }

  const whitespaceCount = normalized.split(/\s+/).length - 1;
  if (whitespaceCount > 2) {
    return false;
  }

  return (
    (/[0-9]/.test(normalized) && /[./-]/.test(normalized) && whitespaceCount === 0)
    || (/[0-9]/.test(normalized) && /[A-Za-zА-Яа-яЁё]/.test(normalized) && /[./-]/.test(normalized))
  );
}

function renderTechnicalText(value: string, keyPrefix: string): ReactNode {
  const matches = Array.from(value.matchAll(/\[\^([^\]]+)\]/g));
  if (!matches.length) {
    return value;
  }

  const parts: ReactNode[] = [];
  let lastIndex = 0;
  for (const [matchIndex, match] of matches.entries()) {
    const startIndex = match.index ?? 0;
    if (startIndex > lastIndex) {
      parts.push(value.slice(lastIndex, startIndex));
    }
    parts.push(
      <sup key={`${keyPrefix}-sup-${matchIndex}`} className="text-[0.7em] leading-none">
        {match[1]}
      </sup>,
    );
    lastIndex = startIndex + match[0].length;
  }
  if (lastIndex < value.length) {
    parts.push(value.slice(lastIndex));
  }
  return parts;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDateOnly(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatCommentPreview(comment: EquipmentComment): string {
  const text = comment.text.trim();
  if (text) {
    return text;
  }
  return comment.attachments.length > 0 ? `${comment.attachments.length} влож.` : "Без текста";
}

function formatCommentMeta(comment: EquipmentComment): string {
  const attachmentLabel =
    comment.attachments.length > 0
      ? `${comment.attachments.length} влож.`
      : null;
  return [
    formatShortDisplayName(comment.authorDisplayName),
    formatDateTime(comment.createdAt),
    attachmentLabel,
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatRepairMessageMeta(message: RepairMessage): string {
  const attachmentLabel =
    message.attachments.length > 0
      ? `${message.attachments.length} влож.`
      : null;
  return [formatShortDisplayName(message.authorDisplayName), formatDateTime(message.createdAt), attachmentLabel]
    .filter(Boolean)
    .join(" · ");
}

function formatVerificationMessageMeta(message: VerificationMessage): string {
  const attachmentLabel =
    message.attachments.length > 0
      ? `${message.attachments.length} влож.`
      : null;
  return [formatShortDisplayName(message.authorDisplayName), formatDateTime(message.createdAt), attachmentLabel]
    .filter(Boolean)
    .join(" · ");
}

function formatShortDisplayName(value: string): string {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return value;
  }

  const [lastName, ...rest] = parts;
  const initials = rest
    .map((part) => `${part[0]?.toUpperCase() ?? ""}.`)
    .join("");

  return `${lastName} ${initials}`.trim();
}

function getTodayDateInputValue(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatBooleanLabel(value: boolean | null): string | null {
  if (value === null) {
    return null;
  }
  return value ? "Да" : "Нет";
}

function formatMeasurementRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const normalizedStart = start?.trim() ?? "";
  const normalizedEnd = end?.trim() ?? "";
  if (normalizedStart && normalizedEnd) {
    return `${normalizedStart} - ${normalizedEnd}`;
  }
  if (normalizedStart) {
    return `от ${normalizedStart}`;
  }
  if (normalizedEnd) {
    return `до ${normalizedEnd}`;
  }
  return "Не указан";
}

function extractSiCardDetail(
  equipmentType: EquipmentType,
  si: EquipmentSIVerification,
) {
  const raw = (si.detailPayloadJson ?? si.rawPayloadJson ?? {}) as Record<string, unknown>;
  const miInfo = getNestedObject(raw, ["miInfo"]);
  const miSingle =
    getNestedObject(miInfo, ["singleMI"]) ??
    getNestedObject(miInfo, ["mi"]) ??
    getNestedObject(miInfo, ["etaMI"]) ??
    {};
  const vriInfo = getNestedObject(raw, ["vriInfo"]) ?? {};
  const info = getNestedObject(raw, ["info"]) ?? {};

  return {
    certificateNumber:
      equipmentType === "ESI"
        ? (
            getFirstString(raw.number, si.resultDocnum)
            ?? null
          )
        : (
            getNestedString(vriInfo, ["applicable", "certNum"])
            ?? si.certificateNumber
            ?? si.resultDocnum
            ?? null
          ),
    sourceCertificateNumber:
      equipmentType === "ESI"
        ? (getNestedString(vriInfo, ["applicable", "certNum"]) ?? si.certificateNumber ?? null)
        : null,
    organization: getFirstString(
      vriInfo.organization,
      vriInfo.orgTitle,
      raw.organization,
      si.orgTitle,
    ),
    regNumber: getFirstString(miSingle.mitypeNumber, raw.mitype_num, si.mitNumber),
    typeDesignation: getFirstString(miSingle.mitypeType, normalizeNotation(raw.minotation), si.mitNotation),
    typeName: getFirstString(miSingle.mitypeTitle, raw.mitype, si.mitTitle),
    serialNumber: getFirstString(miSingle.manufactureNum, raw.factory_num, si.miNumber),
    manufactureYear: getNumber(miSingle.manufactureYear) ?? getNumber(raw.year),
    modification: getFirstString(miSingle.modification, raw.modification),
    schemeType: getFirstString(raw.schematype),
    schemeTitle: getFirstString(raw.schematitle, miSingle.schemaTitle),
    npeNumber: getFirstString(raw.npenumber),
    rankCode: getFirstString(raw.rankcode, miSingle.rankCode),
    rankClass: getFirstString(raw.rankclass, miSingle.rankTitle),
    ownerName: getFirstString(vriInfo.miOwner, vriInfo.owner, vriInfo.ownerName),
    verificationMarkCipher: getFirstString(vriInfo.signCipher, vriInfo.markCipher),
    verificationType: getFirstString(vriInfo.verificationType, vriInfo.typeTitle, vriInfo.verificationTitle),
    verificationDate: getFirstString(
      vriInfo.vrfDate,
      typeof raw.verification_date === "string" ? normalizeDisplayDate(raw.verification_date) : null,
      normalizeDisplayDate(si.verificationDate),
    ),
    validUntil: getFirstString(
      vriInfo.validDate,
      typeof raw.valid_date === "string" ? normalizeDisplayDate(raw.valid_date) : null,
      normalizeDisplayDate(si.validDate),
    ),
    documentTitle: getFirstString(vriInfo.docTitle, info.docTitle, info.doc_title),
    isUsable: getBool(vriInfo.applicable ?? raw.applicability),
    passportMark: getBool(vriInfo.signPass ?? vriInfo.signInPassport ?? info.signPass ?? info.signInPassport),
    deviceMark: getBool(vriInfo.signMi ?? vriInfo.signOnMi ?? info.signMi ?? info.signOnMi),
    reducedScope: getBool(vriInfo.shortScope ?? vriInfo.reducedScope ?? info.shortScope ?? info.reducedScope),
    etalonLines: buildEtalonLines(raw),
    meansLines: buildVerificationMeansLines(raw),
    etalonTableRows: buildEtalonTableRows(raw),
    meansTableRows: buildVerificationMeansTableRows(raw),
    relatedEsiProfiles: buildRelatedEsiProfileRows(raw),
    relatedEsiVerificationRecords: buildRelatedEsiVerificationRows(raw),
  };
}

function normalizeNotation(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    try {
      const parsed = JSON.parse(normalized);
      if (Array.isArray(parsed)) {
        const items = parsed.filter(
          (item): item is string => typeof item === "string" && item.trim().length > 0,
        );
        if (items.length) {
          return items.join(", ");
        }
      }
    } catch {
      return normalized;
    }
  }
  return normalized;
}

function getNestedObject(
  value: unknown,
  path: string[],
): Record<string, unknown> | null {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return null;
  }
  return current as Record<string, unknown>;
}

function getNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return getFirstString(current);
}

function getFirstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function getNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getBool(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const certificate = getFirstString(
      (value as Record<string, unknown>).certNum,
      (value as Record<string, unknown>).certificateNumber,
    );
    if (certificate) {
      return true;
    }
    if (typeof (value as Record<string, unknown>).applicable === "boolean") {
      return (value as Record<string, unknown>).applicable as boolean;
    }
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["да", "yes", "true", "1"].includes(normalized)) {
      return true;
    }
    if (["нет", "no", "false", "0"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function buildEtalonLines(raw: Record<string, unknown>): string[] {
  const means = getNestedObject(raw, ["means"]);
  if (!means) {
    return [];
  }
  const items = Array.isArray(means.mieta) ? means.mieta : [];
  return items
    .map((item) => buildSemicolonLine(item, [
      "regNumber",
      "mitypeNumber",
      "mitypeTitle",
      "notation",
      "modification",
      "manufactureNum",
      "manufactureYear",
      "rankCode",
      "rankTitle",
      "schemaTitle",
    ]))
    .filter((item): item is string => Boolean(item));
}

function buildEtalonTableRows(raw: Record<string, unknown>): SIReferenceTableRow[] {
  const means = getNestedObject(raw, ["means"]);
  if (!means) {
    return [];
  }

  const items = Array.isArray(means.mieta) ? means.mieta : [];
  return items
    .map((item) => buildSIReferenceTableRow(item, null))
    .filter((item): item is SIReferenceTableRow => item !== null);
}

function buildVerificationMeansLines(raw: Record<string, unknown>): string[] {
  const means = getNestedObject(raw, ["means"]);
  if (!means) {
    return [];
  }

  const lines: string[] = [];
  for (const [key, value] of Object.entries(means)) {
    if (key === "mieta" || !Array.isArray(value)) {
      continue;
    }
    for (const item of value) {
      const line =
        buildSemicolonLine(item, [
          "mitypeNumber",
          "mitypeTitle",
          "notation",
          "modification",
          "manufactureNum",
          "manufactureYear",
          "number",
          "title",
          "name",
        ]) ?? buildFallbackLine(item);
      if (line) {
        lines.push(line);
      }
    }
  }

  return lines;
}

function buildVerificationMeansTableRows(raw: Record<string, unknown>): SIReferenceTableRow[] {
  const means = getNestedObject(raw, ["means"]);
  if (!means) {
    return [];
  }

  const rows: SIReferenceTableRow[] = [];
  for (const [key, value] of Object.entries(means)) {
    if (key === "mieta" || !Array.isArray(value)) {
      continue;
    }
    for (const item of value) {
      const row = buildSIReferenceTableRow(item, getMeansSourceLabel(key));
      if (row) {
        rows.push(row);
      }
    }
  }

  return rows;
}

function buildRelatedEsiProfileRows(raw: Record<string, unknown>): ESIRelatedProfileRow[] {
  const items = Array.isArray(raw.metrolog_related_esi_profiles)
    ? raw.metrolog_related_esi_profiles
    : [];
  const verificationYear = resolveCurrentEsiVerificationYear(raw);
  const verificationRows = buildRelatedEsiVerificationRows(raw);
  const verificationByRegistryNumber = new Map(
    verificationRows
      .filter((item) => item.registryNumber)
      .map((item) => [item.registryNumber as string, item] as const),
  );

  return items
    .map<ESIRelatedProfileRow | null>((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      const registryNumber = getFirstString(record.number);
      const relatedVerification =
        registryNumber ? verificationByRegistryNumber.get(registryNumber) ?? null : null;
      return {
        entryId: null,
        moduleKind: "INTERNAL",
        selected: Boolean(record.selected),
        vriId: getFirstString(record.vri_id),
        rawPayloadJson: {
          ...record,
          metrolog_related_esi_verification_records:
            Array.isArray(raw.metrolog_related_esi_verification_records)
              ? raw.metrolog_related_esi_verification_records
              : [],
        },
        registryNumber,
        measurementLimit: null,
        rank: formatSIReferenceRank(
          getFirstString(record.rankcode),
          getFirstString(record.rankclass),
        ),
        title: getFirstString(record.mitype, record.minotation),
        modification: getFirstString(record.modification),
        serialNumber: getFirstString(record.factory_num),
        manufactureYear: getFirstString(record.year),
        verificationDate: normalizeDisplayDate(getFirstString(record.verification_date)),
        validUntil: relatedVerification?.validUntil ?? normalizeDisplayDate(getFirstString(record.valid_date)),
        certificateNumber: relatedVerification?.certificateNumber ?? getFirstString(record.certificate_number),
        arshinUrl: getFirstString(record.arshin_url),
        canDelete: false,
      };
    })
    .filter((item): item is ESIRelatedProfileRow => item !== null)
    .filter(
      (item) =>
        item.selected
        || verificationYear === null
        || extractYearFromDateValue(item.verificationDate) === verificationYear,
    );
}

function buildRelatedEsiVerificationRows(raw: Record<string, unknown>): ESIRelatedVerificationRow[] {
  const items = Array.isArray(raw.metrolog_related_esi_verification_records)
    ? raw.metrolog_related_esi_verification_records
    : [];
  const verificationYear = resolveCurrentEsiVerificationYear(raw);

  return items
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }

      const record = item as Record<string, unknown>;
      return {
        selected: Boolean(record.selected),
        certificateNumber: getFirstString(record.certificate_number),
        registryNumber: getFirstString(record.eta_number),
        modification: getFirstString(record.mi_modification),
        verificationDate: normalizeDisplayDate(getFirstString(record.verification_date)),
        validUntil: normalizeDisplayDate(getFirstString(record.valid_date)),
        documentTitle: getFirstString(record.document_title),
        applicability: formatBooleanLabel(getBool(record.applicability)),
        arshinUrl: getFirstString(record.arshin_url),
      } satisfies ESIRelatedVerificationRow;
    })
    .filter((item): item is ESIRelatedVerificationRow => item !== null)
    .filter((item) => item.selected || verificationYear === null || extractYearFromDateValue(item.verificationDate) === verificationYear);
}

function buildStoredEsiCompositionRank(entry: EquipmentESICompositionEntry): string | null {
  const raw = (entry.detailPayloadJson ?? entry.rawPayloadJson ?? {}) as Record<string, unknown>;
  const miInfo = getNestedObject(raw, ["miInfo"]);
  const miSingle =
    getNestedObject(miInfo, ["singleMI"])
    ?? getNestedObject(miInfo, ["mi"])
    ?? getNestedObject(miInfo, ["etaMI"])
    ?? {};
  return formatSIReferenceRank(
    getFirstString(raw.rankcode, miSingle.rankCode),
    getFirstString(raw.rankclass, miSingle.rankTitle),
  );
}

function buildStoredEsiCompositionModification(
  entry: EquipmentESICompositionEntry,
): string | null {
  const raw = (entry.detailPayloadJson ?? entry.rawPayloadJson ?? {}) as Record<string, unknown>;
  const miInfo = getNestedObject(raw, ["miInfo"]);
  const miSingle =
    getNestedObject(miInfo, ["singleMI"])
    ?? getNestedObject(miInfo, ["mi"])
    ?? getNestedObject(miInfo, ["etaMI"])
    ?? {};
  return getFirstString(miSingle.modification, raw.modification);
}

function buildStoredEsiCompositionYear(entry: EquipmentESICompositionEntry): string | null {
  const raw = (entry.detailPayloadJson ?? entry.rawPayloadJson ?? {}) as Record<string, unknown>;
  const miInfo = getNestedObject(raw, ["miInfo"]);
  const miSingle =
    getNestedObject(miInfo, ["singleMI"])
    ?? getNestedObject(miInfo, ["mi"])
    ?? getNestedObject(miInfo, ["etaMI"])
    ?? {};
  return getFirstString(
    typeof miSingle.manufactureYear === "number" ? String(miSingle.manufactureYear) : null,
    typeof raw.year === "number" ? String(raw.year) : null,
  );
}

function buildStoredEsiCompositionCertificate(
  entry: EquipmentESICompositionEntry,
): string | null {
  const raw = (entry.detailPayloadJson ?? entry.rawPayloadJson ?? {}) as Record<string, unknown>;
  const vriInfo = getNestedObject(raw, ["vriInfo"]) ?? {};
  return getFirstString(
    getNestedString(vriInfo, ["applicable", "certNum"]),
    getFirstString(raw.certificate_number),
  );
}

function resolveCurrentEsiVerificationYear(raw: Record<string, unknown>): number | null {
  const vriInfo = getNestedObject(raw, ["vriInfo"]);
  return extractYearFromDateValue(
    getFirstString(
      vriInfo?.vrfDate,
      typeof raw.verification_date === "string" ? raw.verification_date : null,
    ),
  );
}

function extractYearFromDateValue(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const displayMatch = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (displayMatch) {
    const parsedYear = Number(displayMatch[3]);
    return Number.isFinite(parsedYear) ? parsedYear : null;
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoMatch) {
    const parsedYear = Number(isoMatch[1]);
    return Number.isFinite(parsedYear) ? parsedYear : null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.getFullYear();
}

function buildSIReferenceTableRow(
  value: unknown,
  source: string | null,
): SIReferenceTableRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const rank = formatSIReferenceRank(
    getFirstString(record.rankCode, record.rankcode),
    getFirstString(record.rankTitle, record.rankclass),
  );

  const row: SIReferenceTableRow = {
    source,
    registryNumber: getFirstString(record.regNumber, record.number),
    typeNumber: getFirstString(record.mitypeNumber),
    title: getFirstString(record.mitypeTitle, record.title, record.name),
    notation: getFirstString(record.notation, record.mitypeType, record.type),
    modification: getFirstString(record.modification),
    serialNumber: getFirstString(record.manufactureNum),
    manufactureYear: getFirstString(record.manufactureYear),
    rank,
    documentTitle: getFirstString(record.schemaTitle, record.metroChars),
  };

  const hasData = Object.values(row).some((item) => Boolean(item));
  return hasData ? row : null;
}

function formatSIReferenceRank(code: string | null, title: string | null): string | null {
  if (code && title) {
    return `${code} · ${title}`;
  }
  return code ?? title ?? null;
}

function getMeansSourceLabel(key: string): string {
  const labels: Record<string, string> = {
    npe: "ГПЭ",
    uve: "Эталон",
    ses: "СО",
    mis: "СИ",
    reagent: "Реагент",
  };
  return labels[key] ?? key.toUpperCase();
}

function buildSemicolonLine(value: unknown, keys: string[]): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const parts = keys
    .map((key) => getFirstString(record[key]))
    .filter((part): part is string => Boolean(part));
  return parts.length ? parts.join("; ") : null;
}

function buildFallbackLine(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const parts = Object.values(record)
    .filter((item) => item !== null && item !== undefined && typeof item !== "object")
    .map((item) => String(item).trim())
    .filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}

function normalizeDisplayDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const displayMatch = normalized.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (displayMatch) {
    const day = displayMatch[1].padStart(2, "0");
    const month = displayMatch[2].padStart(2, "0");
    return `${day}.${month}.${displayMatch[3]}`;
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoMatch) {
    return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function getOnSiteProcessRouteValue(): string {
  return "На месте";
}

function isVerificationFlowOnSite(flowMode: VerificationFlowMode): boolean {
  return flowMode !== "OFFSITE_WITH_DEMOLITION";
}

function getVerificationStartDateLabel(flowMode: VerificationFlowMode): string {
  if (flowMode === "ONSITE_WITHOUT_DEMOLITION") {
    return "Подготовка к поверке";
  }
  return "Демонтаж / подготовка к поверке";
}

function formatVerificationFlowModeLabel(flowMode: VerificationFlowMode): string {
  if (flowMode === "ONSITE_WITH_DEMOLITION") {
    return "На месте с демонтажом";
  }
  if (flowMode === "ONSITE_WITHOUT_DEMOLITION") {
    return "На месте без демонтажа";
  }
  return "С отправкой";
}

function formatProcessRouteSummary({
  isOnSite,
  routeCity,
  routeDestination,
}: {
  isOnSite: boolean;
  routeCity: string;
  routeDestination: string;
}): string {
  if (isOnSite) {
    return "На месте";
  }
  return [routeCity, routeDestination].filter(Boolean).join(" · ");
}

function handleExpandableToggleKeyDown(
  event: KeyboardEvent<HTMLElement>,
  onToggle: () => void,
): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  event.preventDefault();
  onToggle();
}
