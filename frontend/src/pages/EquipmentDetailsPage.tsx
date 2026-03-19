import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchArshinVriDetail,
  searchArshinByCertificate,
  type ArshinSearchResult,
  type ArshinVriDetail,
} from "@/api/arshin";
import {
  buildSIVerificationPayloadFromArshin,
  createEquipmentRepair,
  createEquipmentVerification,
  createEquipmentRepairMessage,
  createEquipmentVerificationMessage,
  createEquipmentComment,
  deleteEquipmentComment,
  deleteEquipmentAttachment,
  deleteEquipment,
  downloadRepairMessageAttachment,
  downloadVerificationMessageAttachment,
  downloadEquipmentAttachment,
  getEquipmentStatusLabel,
  equipmentStatusLabels,
  equipmentTypeLabels,
  fetchEquipmentAttachments,
  fetchEquipmentById,
  fetchEquipmentComments,
  fetchEquipmentFolderSuggestions,
  fetchEquipmentFolders,
  fetchEquipmentGroups,
  fetchEquipmentRepairMessages,
  fetchEquipmentVerificationMessages,
  type EquipmentAttachment,
  type EquipmentComment,
  type RepairMessage,
  type RepairMessageAttachment,
  type EquipmentSIVerification,
  type EquipmentStatus,
  type EquipmentType,
  type VerificationMessage,
  type VerificationMessageAttachment,
  refreshEquipmentSi,
  updateEquipmentComment,
  uploadEquipmentAttachment,
  updateEquipment,
} from "@/api/equipment";
import { DeleteConfirmModal } from "@/components/DeleteConfirmModal";
import { EmojiPickerButton } from "@/components/EmojiPickerButton";
import { IconActionButton } from "@/components/IconActionButton";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/store/auth";

type EquipmentFormState = {
  folderId: string;
  groupId: string;
  objectName: string;
  equipmentType: EquipmentType;
  name: string;
  modification: string;
  serialNumber: string;
  manufactureYear: string;
  status: EquipmentStatus;
  currentLocationManual: string;
};

type RepairFormState = {
  routeCity: string;
  routeDestination: string;
  sentToRepairAt: string;
  initialMessageText: string;
  files: File[];
};

type VerificationFormState = {
  routeCity: string;
  routeDestination: string;
  sentToVerificationAt: string;
  initialMessageText: string;
  files: File[];
};

const equipmentTypeOptions: EquipmentType[] = ["SI", "IO", "VO", "OTHER"];
const equipmentStatusOptions: EquipmentStatus[] = ["IN_WORK", "IN_VERIFICATION", "IN_REPAIR", "ARCHIVED"];

export function EquipmentDetailsPage() {
  const { equipmentId } = useParams();
  const parsedEquipmentId = Number(equipmentId);
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EquipmentFormState | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [verificationModalOpen, setVerificationModalOpen] = useState(false);
  const [repairForm, setRepairForm] = useState<RepairFormState>({
    routeCity: "",
    routeDestination: "",
    sentToRepairAt: getTodayDateInputValue(),
    initialMessageText: "",
    files: [],
  });
  const [verificationForm, setVerificationForm] = useState<VerificationFormState>({
    routeCity: "",
    routeDestination: "",
    sentToVerificationAt: getTodayDateInputValue(),
    initialMessageText: "",
    files: [],
  });
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<number | null>(null);
  const [downloadingRepairAttachmentId, setDownloadingRepairAttachmentId] = useState<number | null>(null);
  const [downloadingVerificationAttachmentId, setDownloadingVerificationAttachmentId] = useState<number | null>(null);
  const [attachmentActionError, setAttachmentActionError] = useState<string | null>(null);
  const [repairActionError, setRepairActionError] = useState<string | null>(null);
  const [verificationActionError, setVerificationActionError] = useState<string | null>(null);
  const [attachmentToDelete, setAttachmentToDelete] = useState<EquipmentAttachment | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [repairMessageDraft, setRepairMessageDraft] = useState("");
  const [verificationMessageDraft, setVerificationMessageDraft] = useState("");
  const [repairMessageFiles, setRepairMessageFiles] = useState<File[]>([]);
  const [verificationMessageFiles, setVerificationMessageFiles] = useState<File[]>([]);
  const [repairExpanded, setRepairExpanded] = useState(true);
  const [verificationExpanded, setVerificationExpanded] = useState(true);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [siExpanded, setSiExpanded] = useState(false);
  const [siRefreshCertificate, setSiRefreshCertificate] = useState("");
  const [siRefreshResults, setSiRefreshResults] = useState<ArshinSearchResult[]>([]);
  const [selectedSiRefreshResult, setSelectedSiRefreshResult] = useState<ArshinSearchResult | null>(null);
  const [selectedSiRefreshDetail, setSelectedSiRefreshDetail] = useState<ArshinVriDetail | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [commentEditDraft, setCommentEditDraft] = useState("");
  const [commentToDelete, setCommentToDelete] = useState<EquipmentComment | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const repairInitialFilesInputRef = useRef<HTMLInputElement | null>(null);
  const verificationInitialFilesInputRef = useRef<HTMLInputElement | null>(null);
  const repairMessageFilesInputRef = useRef<HTMLInputElement | null>(null);
  const verificationMessageFilesInputRef = useRef<HTMLInputElement | null>(null);
  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const repairMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const verificationMessageInputRef = useRef<HTMLTextAreaElement | null>(null);
  const editCommentInputRef = useRef<HTMLTextAreaElement | null>(null);
  const canManage = user?.role === "ADMINISTRATOR" || user?.role === "MKAIR";

  const equipmentQuery = useQuery({
    queryKey: ["equipment-item", parsedEquipmentId],
    queryFn: () => fetchEquipmentById(token ?? "", parsedEquipmentId),
    enabled: Boolean(token) && Number.isInteger(parsedEquipmentId) && parsedEquipmentId > 0,
  });

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders"],
    queryFn: () => fetchEquipmentFolders(token ?? ""),
    enabled: Boolean(token),
  });

  const groupsQuery = useQuery({
    queryKey: ["equipment-groups", "all"],
    queryFn: () => fetchEquipmentGroups(token ?? ""),
    enabled: Boolean(token),
  });

  const suggestionsFolderId = Number(
    form?.folderId ?? equipmentQuery.data?.folderId ?? 0,
  );
  const folderSuggestionsQuery = useQuery({
    queryKey: ["equipment-folder-suggestions", suggestionsFolderId || "none"],
    queryFn: () => fetchEquipmentFolderSuggestions(token ?? "", suggestionsFolderId),
    enabled: Boolean(token) && suggestionsFolderId > 0,
  });

  const attachmentsQuery = useQuery({
    queryKey: ["equipment-attachments", parsedEquipmentId],
    queryFn: () => fetchEquipmentAttachments(token ?? "", parsedEquipmentId),
    enabled: Boolean(token) && Number.isInteger(parsedEquipmentId) && parsedEquipmentId > 0,
  });

  const commentsQuery = useQuery({
    queryKey: ["equipment-comments", parsedEquipmentId],
    queryFn: () => fetchEquipmentComments(token ?? "", parsedEquipmentId),
    enabled: Boolean(token) && Number.isInteger(parsedEquipmentId) && parsedEquipmentId > 0,
  });

  const repairMessagesQuery = useQuery({
    queryKey: ["equipment-repair-messages", parsedEquipmentId],
    queryFn: () => fetchEquipmentRepairMessages(token ?? "", parsedEquipmentId),
    enabled:
      Boolean(token)
      && Number.isInteger(parsedEquipmentId)
      && parsedEquipmentId > 0
      && Boolean(equipmentQuery.data?.activeRepair),
  });

  const verificationMessagesQuery = useQuery({
    queryKey: ["equipment-verification-messages", parsedEquipmentId],
    queryFn: () => fetchEquipmentVerificationMessages(token ?? "", parsedEquipmentId),
    enabled:
      Boolean(token)
      && Number.isInteger(parsedEquipmentId)
      && parsedEquipmentId > 0
      && Boolean(equipmentQuery.data?.activeVerification),
  });

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
        groupId: form.groupId ? Number(form.groupId) : null,
        objectName: form.objectName,
        equipmentType: form.equipmentType,
        name: form.name,
        modification: form.modification,
        serialNumber: form.serialNumber,
        manufactureYear: form.manufactureYear ? Number(form.manufactureYear) : null,
        status: form.status,
        currentLocationManual: form.currentLocationManual,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", parsedEquipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
    },
  });

  const createRepairMutation = useMutation({
    mutationFn: () =>
      createEquipmentRepair(token ?? "", parsedEquipmentId, {
        routeCity: repairForm.routeCity,
        routeDestination: repairForm.routeDestination,
        sentToRepairAt: repairForm.sentToRepairAt,
        initialMessageText: repairForm.initialMessageText,
        files: repairForm.files,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", parsedEquipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-repair-messages", parsedEquipmentId] });
      setRepairModalOpen(false);
      setRepairActionError(null);
      setRepairForm({
        routeCity: "",
        routeDestination: "",
        sentToRepairAt: getTodayDateInputValue(),
        initialMessageText: "",
        files: [],
      });
      if (repairInitialFilesInputRef.current) {
        repairInitialFilesInputRef.current.value = "";
      }
    },
  });

  const createVerificationMutation = useMutation({
    mutationFn: () =>
      createEquipmentVerification(token ?? "", parsedEquipmentId, {
        routeCity: verificationForm.routeCity,
        routeDestination: verificationForm.routeDestination,
        sentToVerificationAt: verificationForm.sentToVerificationAt,
        initialMessageText: verificationForm.initialMessageText,
        files: verificationForm.files,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", parsedEquipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
      await queryClient.invalidateQueries({
        queryKey: ["equipment-verification-messages", parsedEquipmentId],
      });
      setVerificationModalOpen(false);
      setVerificationActionError(null);
      setVerificationForm({
        routeCity: "",
        routeDestination: "",
        sentToVerificationAt: getTodayDateInputValue(),
        initialMessageText: "",
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
        files: repairMessageFiles,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-repair-messages", parsedEquipmentId] });
      setRepairActionError(null);
      setRepairMessageDraft("");
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
        files: verificationMessageFiles,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["equipment-verification-messages", parsedEquipmentId],
      });
      setVerificationActionError(null);
      setVerificationMessageDraft("");
      setVerificationMessageFiles([]);
      if (verificationMessageFilesInputRef.current) {
        verificationMessageFilesInputRef.current.value = "";
      }
    },
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: () => deleteEquipment(token ?? "", parsedEquipmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", parsedEquipmentId] });
      navigate("/equipment");
    },
  });

  const uploadAttachmentMutation = useMutation({
    mutationFn: (file: File) => uploadEquipmentAttachment(token ?? "", parsedEquipmentId, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-attachments", parsedEquipmentId] });
      if (attachmentInputRef.current) {
        attachmentInputRef.current.value = "";
      }
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: (attachmentId: number) =>
      deleteEquipmentAttachment(token ?? "", parsedEquipmentId, attachmentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-attachments", parsedEquipmentId] });
      setAttachmentToDelete(null);
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: (text: string) => createEquipmentComment(token ?? "", parsedEquipmentId, { text }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-comments", parsedEquipmentId] });
      setCommentDraft("");
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
      await queryClient.invalidateQueries({ queryKey: ["equipment-comments", parsedEquipmentId] });
      setEditingCommentId(null);
      setCommentEditDraft("");
    },
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId: number) => deleteEquipmentComment(token ?? "", parsedEquipmentId, commentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-comments", parsedEquipmentId] });
      setCommentToDelete(null);
    },
  });

  const searchSiRefreshMutation = useMutation({
    mutationFn: (certificateNumber: string) =>
      searchArshinByCertificate(token ?? "", {
        certificateNumber,
      }),
    onSuccess: (results) => {
      setSiRefreshResults(results);
      setSelectedSiRefreshResult(null);
      setSelectedSiRefreshDetail(null);
    },
  });

  const loadSiRefreshDetailMutation = useMutation({
    mutationFn: async (result: ArshinSearchResult) => {
      const detail = await fetchArshinVriDetail(token ?? "", result.vriId);
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
      if (!selectedSiRefreshResult || !selectedSiRefreshDetail) {
        throw new Error("Сначала выбери новую запись Аршина.");
      }
      return refreshEquipmentSi(
        token ?? "",
        parsedEquipmentId,
        buildSIVerificationPayloadFromArshin(selectedSiRefreshResult, selectedSiRefreshDetail),
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["equipment-item", parsedEquipmentId] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
      setSiRefreshCertificate("");
      setSiRefreshResults([]);
      setSelectedSiRefreshResult(null);
      setSelectedSiRefreshDetail(null);
    },
  });

  useEffect(() => {
    if (!equipmentQuery.data) {
      return;
    }

    setForm({
      folderId: equipmentQuery.data.folderId ? String(equipmentQuery.data.folderId) : "",
      groupId: equipmentQuery.data.groupId ? String(equipmentQuery.data.groupId) : "",
      objectName: equipmentQuery.data.objectName,
      equipmentType: equipmentQuery.data.equipmentType,
      name: equipmentQuery.data.name,
      modification: equipmentQuery.data.modification ?? "",
      serialNumber: equipmentQuery.data.serialNumber ?? "",
      manufactureYear: equipmentQuery.data.manufactureYear ? String(equipmentQuery.data.manufactureYear) : "",
      status: equipmentQuery.data.status,
      currentLocationManual: equipmentQuery.data.currentLocationManual ?? "",
    });
  }, [equipmentQuery.data]);

  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const groups = useMemo(() => groupsQuery.data ?? [], [groupsQuery.data]);
  const folderSuggestions = folderSuggestionsQuery.data;
  const selectedFolderGroups = useMemo(
    () => groups.filter((group) => group.folderId === Number(form?.folderId ?? equipmentQuery.data?.folderId ?? 0)),
    [equipmentQuery.data?.folderId, form?.folderId, groups],
  );
  const currentGroup = groups.find((group) => group.id === equipmentQuery.data?.groupId) ?? null;
  const currentFolder = folders.find((folder) => folder.id === equipmentQuery.data?.folderId) ?? null;
  const attachments = useMemo(
    () => attachmentsQuery.data ?? [],
    [attachmentsQuery.data],
  );
  const comments = useMemo(
    () => commentsQuery.data ?? [],
    [commentsQuery.data],
  );
  const activeRepair = equipmentQuery.data?.activeRepair ?? null;
  const activeVerification = equipmentQuery.data?.activeVerification ?? null;
  const repairMessages = useMemo(
    () => repairMessagesQuery.data ?? [],
    [repairMessagesQuery.data],
  );
  const verificationMessages = useMemo(
    () => verificationMessagesQuery.data ?? [],
    [verificationMessagesQuery.data],
  );
  const siDetail = useMemo(
    () =>
      equipmentQuery.data?.siVerification
        ? extractSiCardDetail(equipmentQuery.data.siVerification)
        : null,
    [equipmentQuery.data?.siVerification],
  );
  const latestComment = comments.length > 0 ? comments[comments.length - 1] : null;

  useEffect(() => {
    if (!form?.groupId) {
      return;
    }

    if (!selectedFolderGroups.some((group) => group.id === Number(form.groupId))) {
      setForm((current) => (current ? { ...current, groupId: "" } : current));
    }
  }, [form?.groupId, selectedFolderGroups]);

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
    setSiExpanded(false);
    setSiRefreshCertificate("");
    setSiRefreshResults([]);
    setSelectedSiRefreshResult(null);
    setSelectedSiRefreshDetail(null);
    setRepairActionError(null);
    setVerificationActionError(null);
    setRepairExpanded(true);
    setVerificationExpanded(true);
  }, [parsedEquipmentId]);

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
    setRepairForm((current) => ({ ...current, files }));
  }

  function handleVerificationInitialFilesPick(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setVerificationForm((current) => ({ ...current, files }));
  }

  function handleRepairMessageFilesPick(event: ChangeEvent<HTMLInputElement>) {
    setRepairMessageFiles(Array.from(event.target.files ?? []));
  }

  function handleVerificationMessageFilesPick(event: ChangeEvent<HTMLInputElement>) {
    setVerificationMessageFiles(Array.from(event.target.files ?? []));
  }

  async function handleAttachmentPick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setAttachmentActionError(null);
    try {
      await uploadAttachmentMutation.mutateAsync(file);
    } catch (error) {
      setAttachmentActionError(
        error instanceof Error ? error.message : "Не удалось загрузить вложение.",
      );
    }
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

  async function handleCreateComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createCommentMutation.mutateAsync(commentDraft);
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

  async function handleSearchSiRefresh(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await searchSiRefreshMutation.mutateAsync(siRefreshCertificate);
  }

  return (
    <section>
      <PageHeader
        title={equipmentQuery.data ? equipmentQuery.data.name : `Карточка прибора ${equipmentId ?? ""}`.trim()}
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

      {equipmentQuery.data && form ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                className="rounded-full border border-line px-4 py-2 text-sm text-ink transition hover:border-signal-info"
                to={`/equipment?folderId=${equipmentQuery.data.folderId}`}
              >
                Назад к оборудованию
              </Link>
              {currentFolder ? (
                <span className="inline-block rounded-full bg-[#edf2f5] px-4 py-2 text-sm text-steel">
                  Папка: {currentFolder.name}
                </span>
              ) : null}
              {currentGroup ? (
                <span className="inline-block rounded-full bg-[#edf2f5] px-4 py-2 text-sm text-steel">
                  Группа: {currentGroup.name}
                </span>
              ) : null}
            </div>
            {canManage ? (
              <div className="flex gap-3">
                {!activeRepair ? (
                  <IconActionButton
                    icon={
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 1 1 3 3L14 13l-3-3 4.75-4.75ZM11 13l-6.75 6.75m0 0H8.5m-4.25 0V15.5" />
                      </svg>
                    }
                    label="Отправить в ремонт"
                    onClick={() => setRepairModalOpen(true)}
                  />
                ) : null}
                {equipmentQuery.data.equipmentType === "SI" && !activeVerification ? (
                  <IconActionButton
                    icon={
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                    }
                    label="Отправить в поверку"
                    onClick={() => setVerificationModalOpen(true)}
                  />
                ) : null}
                <IconActionButton
                  icon={
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                    </svg>
                  }
                  label="Редактировать прибор"
                  onClick={() => setIsEditing(true)}
                />
                <IconActionButton
                  icon={
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                  }
                  label="Удалить прибор"
                  onClick={() => setConfirmDeleteOpen(true)}
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_380px]">
            <div className="space-y-4">
              <dl className="overflow-hidden rounded-3xl border border-line bg-white shadow-panel">
                {[
                  ["Категория", equipmentTypeLabels[equipmentQuery.data.equipmentType]],
                  ["Статус", getEquipmentStatusLabel(equipmentQuery.data)],
                  ["Объект", equipmentQuery.data.objectName],
                  ["Модификация", equipmentQuery.data.modification || "Не указана"],
                  ["Серийный номер", equipmentQuery.data.serialNumber || "Не указан"],
                  [
                    "Год выпуска",
                    equipmentQuery.data.manufactureYear ? String(equipmentQuery.data.manufactureYear) : "Не указан",
                  ],
                  ["Текущее местоположение", equipmentQuery.data.currentLocationManual || "Не указано"],
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

              {activeRepair ? (
                <section className="rounded-3xl border border-line bg-[var(--bg-secondary)] p-5 shadow-panel">
                  <button
                    aria-expanded={repairExpanded}
                    className="flex w-full items-start justify-between gap-3 text-left"
                    type="button"
                    onClick={() => setRepairExpanded((current) => !current)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-base font-semibold text-ink">Прибор находится в ремонте</h3>
                        <span className="rounded-full bg-[var(--bg-primary)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-signal-info">
                          Активный
                        </span>
                      </div>
                      <div className="mt-2 min-w-0">
                        <div className="truncate text-xs text-steel">
                          {[activeRepair.routeCity, activeRepair.routeDestination].filter(Boolean).join(" · ")}
                        </div>
                        <p className="mt-1 line-clamp-2 break-words text-sm text-ink">
                          {[
                            `отправлен ${formatDateOnly(activeRepair.sentToRepairAt)}`,
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
                  </button>

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
                          ["Город", activeRepair.routeCity],
                          ["Куда", activeRepair.routeDestination],
                          ["Отправлен в ремонт", formatDateOnly(activeRepair.sentToRepairAt)],
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

                      <section className="mt-4 overflow-hidden rounded-3xl border border-line bg-white">
                    <div className="border-b border-line bg-[var(--bg-secondary)] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-ink">Диалог ремонта</h4>
                          <p className="mt-1 text-xs text-steel">
                            Фото, документы, чеки и рабочие сообщения по текущему ремонту.
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
                          {repairMessages.length}
                        </span>
                      </div>
                    </div>

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
                          className="rounded-2xl border border-line bg-white/85 px-4 py-3"
                        >
                          <div className="text-xs text-steel">
                            {formatRepairMessageMeta(message)}
                          </div>
                          {message.text ? (
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                              {message.text}
                            </p>
                          ) : null}
                          {message.attachments.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {message.attachments.map((attachment) => (
                                <button
                                  key={attachment.id}
                                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-[var(--bg-secondary)] px-3 py-2 text-xs text-ink transition hover:border-signal-info"
                                  type="button"
                                  onClick={() => void handleRepairAttachmentDownload(message, attachment)}
                                >
                                  {downloadingRepairAttachmentId === attachment.id ? (
                                    <span className="text-sm leading-none">…</span>
                                  ) : (
                                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4m-5 7.5h18" />
                                    </svg>
                                  )}
                                  <span className="truncate">{attachment.fileName}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>

                    {canManage ? (
                      <form className="border-t border-line px-4 py-4" onSubmit={(event) => void handleCreateRepairMessage(event)}>
                        <textarea
                          ref={repairMessageInputRef}
                          className="form-input min-h-[56px] resize-none overflow-hidden py-3"
                          maxLength={4000}
                          placeholder="Новое сообщение по ремонту"
                          rows={2}
                          value={repairMessageDraft}
                          onChange={(event) => setRepairMessageDraft(event.target.value)}
                          onInput={(event) => resizeCommentInput(event.currentTarget)}
                        />
                        <input
                          ref={repairMessageFilesInputRef}
                          className="sr-only"
                          multiple
                          type="file"
                          onChange={handleRepairMessageFilesPick}
                        />
                        {repairMessageFiles.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {repairMessageFiles.map((file) => (
                              <span
                                key={`${file.name}-${file.size}-${file.lastModified}`}
                                className="rounded-full border border-line bg-[var(--bg-secondary)] px-3 py-2 text-xs text-ink"
                              >
                                {file.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-3 flex justify-end gap-2">
                          <EmojiPickerButton
                            disabled={createRepairMessageMutation.isPending}
                            onPick={handleInsertRepairMessageEmoji}
                          />
                          <IconActionButton
                            className="h-10 w-10"
                            icon={
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.25 20.25a6 6 0 0 1-8.49-8.49l9.9-9.9a4.5 4.5 0 1 1 6.36 6.36l-9.2 9.19a3 3 0 0 1-4.24-4.24l8.49-8.49" />
                              </svg>
                            }
                            label="Прикрепить файлы к сообщению ремонта"
                            onClick={() => repairMessageFilesInputRef.current?.click()}
                          />
                          <IconActionButton
                            className="h-10 w-10"
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
                <section className="rounded-3xl border border-line bg-[var(--bg-secondary)] p-5 shadow-panel">
                  <button
                    aria-expanded={verificationExpanded}
                    className="flex w-full items-start justify-between gap-3 text-left"
                    type="button"
                    onClick={() => setVerificationExpanded((current) => !current)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-base font-semibold text-ink">Прибор находится в поверке</h3>
                        <span className="rounded-full bg-[var(--bg-primary)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-signal-info">
                          Активная
                        </span>
                      </div>
                      <div className="mt-2 min-w-0">
                        <div className="truncate text-xs text-steel">
                          {[activeVerification.routeCity, activeVerification.routeDestination].filter(Boolean).join(" · ")}
                        </div>
                        <p className="mt-1 line-clamp-2 break-words text-sm text-ink">
                          {`отправлен ${formatDateOnly(activeVerification.sentToVerificationAt)}`}
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
                  </button>

                  {verificationExpanded ? (
                    <>
                      <dl className="mt-4 overflow-hidden rounded-3xl border border-line bg-white">
                        {[
                          ["Город", activeVerification.routeCity],
                          ["Куда", activeVerification.routeDestination],
                          ["Отправлен в поверку", formatDateOnly(activeVerification.sentToVerificationAt)],
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

                      <section className="mt-4 overflow-hidden rounded-3xl border border-line bg-white">
                    <div className="border-b border-line bg-[var(--bg-secondary)] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-ink">Диалог поверки</h4>
                          <p className="mt-1 text-xs text-steel">
                            Сообщения, фото и документы по текущей поверке.
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel">
                          {verificationMessages.length}
                        </span>
                      </div>
                    </div>

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
                          className="rounded-2xl border border-line bg-white/85 px-4 py-3"
                        >
                          <div className="text-xs text-steel">
                            {formatVerificationMessageMeta(message)}
                          </div>
                          {message.text ? (
                            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                              {message.text}
                            </p>
                          ) : null}
                          {message.attachments.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {message.attachments.map((attachment) => (
                                <button
                                  key={attachment.id}
                                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-[var(--bg-secondary)] px-3 py-2 text-xs text-ink transition hover:border-signal-info"
                                  type="button"
                                  onClick={() => void handleVerificationAttachmentDownload(message, attachment)}
                                >
                                  {downloadingVerificationAttachmentId === attachment.id ? (
                                    <span className="text-sm leading-none">…</span>
                                  ) : (
                                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4m-5 7.5h18" />
                                    </svg>
                                  )}
                                  <span className="truncate">{attachment.fileName}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </article>
                      ))}
                    </div>

                    {canManage ? (
                      <form className="border-t border-line px-4 py-4" onSubmit={(event) => void handleCreateVerificationMessage(event)}>
                        <textarea
                          ref={verificationMessageInputRef}
                          className="form-input min-h-[56px] resize-none overflow-hidden py-3"
                          maxLength={4000}
                          placeholder="Новое сообщение по поверке"
                          rows={2}
                          value={verificationMessageDraft}
                          onChange={(event) => setVerificationMessageDraft(event.target.value)}
                          onInput={(event) => resizeCommentInput(event.currentTarget)}
                        />
                        <input
                          ref={verificationMessageFilesInputRef}
                          className="sr-only"
                          multiple
                          type="file"
                          onChange={handleVerificationMessageFilesPick}
                        />
                        {verificationMessageFiles.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {verificationMessageFiles.map((file) => (
                              <span
                                key={`${file.name}-${file.size}-${file.lastModified}`}
                                className="rounded-full border border-line bg-[var(--bg-secondary)] px-3 py-2 text-xs text-ink"
                              >
                                {file.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-3 flex justify-end gap-2">
                          <EmojiPickerButton
                            disabled={createVerificationMessageMutation.isPending}
                            onPick={handleInsertVerificationMessageEmoji}
                          />
                          <IconActionButton
                            className="h-10 w-10"
                            icon={
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.25 20.25a6 6 0 0 1-8.49-8.49l9.9-9.9a4.5 4.5 0 1 1 6.36 6.36l-9.2 9.19a3 3 0 0 1-4.24-4.24l8.49-8.49" />
                              </svg>
                            }
                            label="Прикрепить файлы к сообщению поверки"
                            onClick={() => verificationMessageFilesInputRef.current?.click()}
                          />
                          <IconActionButton
                            className="h-10 w-10"
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

              {equipmentQuery.data.equipmentType === "SI" ? (
                <section className="rounded-3xl border border-line bg-white p-5 shadow-panel">
                  <button
                    aria-expanded={siExpanded}
                    className="flex w-full items-start justify-between gap-3 text-left"
                    type="button"
                    onClick={() => setSiExpanded((current) => !current)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-base font-semibold text-ink">Сведения о СИ</h3>
                        {equipmentQuery.data.siVerification?.arshinUrl ? (
                          <a
                            className="rounded-full bg-[#edf2f5] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-steel"
                            href={equipmentQuery.data.siVerification.arshinUrl}
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
                                siDetail.certificateNumber,
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
                          <p className="text-sm text-steel">Профиль СИ пока не заполнен.</p>
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
                      {siDetail ? (
                        <>
                          <SISection
                            title="Сведения о результатах поверки СИ"
                            rows={[
                              ["Регистрационный номер типа СИ", siDetail.regNumber],
                              ["Обозначение типа СИ", siDetail.typeDesignation],
                              ["Наименование типа СИ", siDetail.typeName],
                              ["Заводской номер СИ", siDetail.serialNumber],
                              [
                                "Год выпуска СИ",
                                siDetail.manufactureYear ? String(siDetail.manufactureYear) : null,
                              ],
                              ["Модификация СИ", siDetail.modification],
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
                              ["Номер свидетельства", siDetail.certificateNumber],
                              ["Знак поверки в паспорте", formatBooleanLabel(siDetail.passportMark)],
                              ["Знак поверки на СИ", formatBooleanLabel(siDetail.deviceMark)],
                              ["Поверка в сокращенном объеме", formatBooleanLabel(siDetail.reducedScope)],
                            ]}
                          />
                          {siDetail.etalonLines.length ? (
                            <SIListSection
                              title="Средства измерений, применяемые в качестве эталона"
                              items={siDetail.etalonLines}
                            />
                          ) : null}
                          {siDetail.meansLines.length ? (
                            <SIListSection
                              title="Средства измерений, применяемые при поверке"
                              items={siDetail.meansLines}
                            />
                          ) : null}
                        </>
                      ) : (
                        <div className="rounded-3xl border border-line bg-[var(--bg-secondary)] px-4 py-3 text-sm text-steel">
                          Детальный профиль СИ пока не заполнен. Можно вручную подтянуть новую запись из Аршина по номеру свидетельства.
                        </div>
                      )}
                      {canManage ? (
                        <section className="rounded-3xl border border-line bg-[var(--bg-secondary)] p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h4 className="text-sm font-semibold text-ink">Обновить по новому свидетельству</h4>
                              <p className="mt-1 max-w-[46ch] text-sm text-steel">
                                Вставь новый номер свидетельства, выбери найденную запись Аршина и подтверди обновление карточки.
                              </p>
                            </div>
                          </div>
                          <form className="mt-4 flex items-start gap-2" onSubmit={(event) => void handleSearchSiRefresh(event)}>
                            <input
                              className="form-input"
                              placeholder="С-АСГ/07-03-2026/509468383"
                              type="text"
                              value={siRefreshCertificate}
                              onChange={(event) => setSiRefreshCertificate(event.target.value)}
                            />
                            <IconActionButton
                              disabled={searchSiRefreshMutation.isPending || !siRefreshCertificate.trim()}
                              icon={
                                searchSiRefreshMutation.isPending ? (
                                  <span className="text-sm leading-none">…</span>
                                ) : (
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m0 0A7.5 7.5 0 1 0 6 17.25a7.5 7.5 0 0 0 10.65-.6Z" />
                                  </svg>
                                )
                              }
                              label="Найти новое свидетельство"
                              type="submit"
                            />
                          </form>
                          {searchSiRefreshMutation.isError ? (
                            <p className="mt-3 text-sm text-[#b04c43]">
                              {searchSiRefreshMutation.error instanceof Error
                                ? searchSiRefreshMutation.error.message
                                : "Не удалось выполнить поиск в Аршине."}
                            </p>
                          ) : null}
                          {searchSiRefreshMutation.isSuccess && !siRefreshResults.length ? (
                            <p className="mt-3 text-sm text-steel">По этому свидетельству записи не найдены.</p>
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
                              {loadSiRefreshDetailMutation.error instanceof Error
                                ? loadSiRefreshDetailMutation.error.message
                                : "Не удалось загрузить подробную запись Аршина."}
                            </p>
                          ) : null}
                          {selectedSiRefreshResult && selectedSiRefreshDetail ? (
                            <div className="mt-4 space-y-3">
                              <SISection
                                title="Кандидат на обновление"
                                rows={[
                                  ["Номер свидетельства", selectedSiRefreshDetail.certificateNumber ?? selectedSiRefreshResult.resultDocnum],
                                  ["Регистрационный номер типа СИ", selectedSiRefreshDetail.regNumber],
                                  ["Обозначение типа СИ", selectedSiRefreshDetail.typeDesignation],
                                  ["Наименование типа СИ", selectedSiRefreshDetail.typeName],
                                  ["Заводской номер СИ", selectedSiRefreshDetail.serialNumber],
                                  [
                                    "Год выпуска СИ",
                                    selectedSiRefreshDetail.manufactureYear
                                      ? String(selectedSiRefreshDetail.manufactureYear)
                                      : null,
                                  ],
                                  ["Модификация СИ", selectedSiRefreshDetail.modification],
                                  ["Поверка действительна до", selectedSiRefreshDetail.validUntil],
                                ]}
                              />
                              {refreshSiMutation.isError ? (
                                <p className="text-sm text-[#b04c43]">
                                  {refreshSiMutation.error instanceof Error
                                    ? refreshSiMutation.error.message
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
                                  {refreshSiMutation.isPending ? "Обновляем..." : "Обновить карточку СИ"}
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

              <section className="rounded-3xl border border-line bg-white p-5 shadow-panel">
                <button
                  aria-expanded={commentsExpanded}
                  className="flex w-full items-start justify-between gap-3 text-left"
                  type="button"
                  onClick={() => setCommentsExpanded((current) => !current)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-base font-semibold text-ink">Комментарии</h3>
                      <span className="rounded-full bg-[#edf2f5] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-steel">
                        {comments.length}
                      </span>
                    </div>
                    <div className="mt-2 min-w-0">
                      {commentsQuery.isLoading ? (
                        <p className="text-sm text-steel">Загружаем комментарии...</p>
                      ) : commentsQuery.isError ? (
                        <p className="text-sm text-[#b04c43]">
                          {commentsQuery.error instanceof Error
                            ? commentsQuery.error.message
                            : "Не удалось загрузить комментарии."}
                        </p>
                      ) : latestComment ? (
                        <>
                          <div className="truncate text-xs text-steel">
                            {formatCommentMeta(latestComment)}
                          </div>
                          <p className="mt-1 line-clamp-2 break-words text-sm text-ink">
                            {latestComment.text}
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
                      <textarea
                        ref={commentInputRef}
                        className="form-input min-h-[56px] overflow-hidden py-3 resize-none"
                        maxLength={4000}
                        placeholder="Новая заметка по прибору"
                        rows={2}
                        value={commentDraft}
                        onChange={(event) => setCommentDraft(event.target.value)}
                        onInput={(event) =>
                          resizeCommentInput(event.currentTarget)
                        }
                      />
                      {createCommentMutation.isError ? (
                        <p className="text-sm text-[#b04c43]">
                          {createCommentMutation.error instanceof Error
                            ? createCommentMutation.error.message
                            : "Не удалось добавить комментарий."}
                        </p>
                      ) : null}
                      <div className="flex justify-end gap-2">
                        <EmojiPickerButton
                          disabled={createCommentMutation.isPending}
                          onPick={handleInsertCommentEmoji}
                        />
                        <IconActionButton
                          className="h-10 w-10"
                          disabled={createCommentMutation.isPending || !commentDraft.trim()}
                          icon={
                            createCommentMutation.isPending ? (
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
                          key={comment.id}
                          className="rounded-2xl border border-line bg-white/85 px-4 py-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-xs text-steel">
                              {formatCommentMeta(comment)}
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
                              <textarea
                                ref={editCommentInputRef}
                                className="form-input min-h-[56px] overflow-hidden py-3 resize-none"
                                maxLength={4000}
                                rows={2}
                                value={commentEditDraft}
                                onChange={(event) => setCommentEditDraft(event.target.value)}
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
                          ) : (
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink">
                              {comment.text}
                            </p>
                          )}
                        </article>
                      ))}
                    </div>
                  </>
                ) : null}
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-3xl border border-line bg-white p-5 shadow-panel">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-ink">Вложения</h3>
                    <p className="mt-1 text-sm text-steel">
                      Файлы карточки прибора: фото, PDF и сопроводительные документы.
                    </p>
                  </div>
                  <IconActionButton
                    className="shrink-0"
                    icon={
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                      </svg>
                    }
                    label="Добавить вложение"
                    onClick={() => attachmentInputRef.current?.click()}
                  />
                </div>
                <input
                  ref={attachmentInputRef}
                  className="sr-only"
                  type="file"
                  onChange={(event) => void handleAttachmentPick(event)}
                />
                <p className="mt-1 text-sm text-steel">
                  {uploadAttachmentMutation.isPending
                    ? "Загружаем файл..."
                    : "Нажми на плюс, чтобы добавить новое вложение."}
                </p>
                <div className="mt-4 space-y-2">
                  {attachmentsQuery.isLoading ? (
                    <p className="text-sm text-steel">Загружаем вложения...</p>
                  ) : null}
                  {uploadAttachmentMutation.isError ? (
                    <p className="text-sm text-[#b04c43]">
                      {uploadAttachmentMutation.error instanceof Error
                        ? uploadAttachmentMutation.error.message
                        : "Не удалось загрузить вложение."}
                    </p>
                  ) : null}
                  {attachmentActionError ? (
                    <p className="text-sm text-[#b04c43]">{attachmentActionError}</p>
                  ) : null}
                  {attachmentsQuery.isError ? (
                    <p className="text-sm text-[#b04c43]">
                      {attachmentsQuery.error instanceof Error
                        ? attachmentsQuery.error.message
                        : "Не удалось загрузить список вложений."}
                    </p>
                  ) : null}
                  {!attachmentsQuery.isLoading && !attachments.length ? (
                    <p className="text-sm text-steel">Для этого прибора пока нет вложений.</p>
                  ) : null}
                  {attachments.map((attachment) => (
                    <div
                      key={attachment.id}
                      className="rounded-2xl border border-line bg-white/85 px-4 py-3 text-sm text-ink"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{attachment.fileName}</div>
                          <div className="mt-1 text-xs text-steel">
                            {formatAttachmentMeta(attachment)}
                          </div>
                        </div>
                        <IconActionButton
                          className="shrink-0"
                          icon={
                            downloadingAttachmentId === attachment.id ? (
                              <span className="text-sm leading-none">…</span>
                            ) : (
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l4-4m-4 4l-4-4m-5 7.5h18" />
                              </svg>
                            )
                          }
                          label={`Скачать ${attachment.fileName}`}
                          onClick={() => void handleAttachmentDownload(attachment)}
                        />
                        {canManage || attachment.uploadedByUserId === user?.id ? (
                          <IconActionButton
                            className="shrink-0"
                            icon={
                              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            }
                            label={`Удалить ${attachment.fileName}`}
                            onClick={() => setAttachmentToDelete(attachment)}
                          />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </aside>
          </div>
        </>
      ) : null}

      {repairModalOpen ? (
        <Modal
          description="Укажи маршрут отправки и, если нужно, добавь первое сообщение с файлами. Это сообщение сразу попадет в диалог ремонта."
          open={repairModalOpen}
          title="Отправить в ремонт"
          onClose={() => setRepairModalOpen(false)}
        >
          <form className="space-y-4" onSubmit={(event) => void handleCreateRepair(event)}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm text-steel">
                Город
                <input
                  className="form-input"
                  list={`repair-route-cities-${parsedEquipmentId}`}
                  type="text"
                  value={repairForm.routeCity}
                  onChange={(event) =>
                    setRepairForm((current) => ({ ...current, routeCity: event.target.value }))
                  }
                />
                <datalist id={`repair-route-cities-${parsedEquipmentId}`}>
                  {(folderSuggestions?.repairRouteCities ?? []).map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </label>
              <label className="block text-sm text-steel">
                Куда
                <input
                  className="form-input"
                  list={`repair-route-destinations-${parsedEquipmentId}`}
                  type="text"
                  value={repairForm.routeDestination}
                  onChange={(event) =>
                    setRepairForm((current) => ({
                      ...current,
                      routeDestination: event.target.value,
                    }))
                  }
                />
                <datalist id={`repair-route-destinations-${parsedEquipmentId}`}>
                  {(folderSuggestions?.repairRouteDestinations ?? []).map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </label>
            </div>
            <label className="block text-sm text-steel">
              Дата отправки
              <input
                className="form-input"
                type="date"
                value={repairForm.sentToRepairAt}
                onChange={(event) =>
                  setRepairForm((current) => ({ ...current, sentToRepairAt: event.target.value }))
                }
              />
            </label>
            <label className="block text-sm text-steel">
              Первое сообщение
              <textarea
                className="form-input min-h-[92px] resize-none py-3"
                placeholder="Прибор упакован и отправлен в ремонт"
                value={repairForm.initialMessageText}
                onChange={(event) =>
                  setRepairForm((current) => ({
                    ...current,
                    initialMessageText: event.target.value,
                  }))
                }
              />
            </label>
            <input
              ref={repairInitialFilesInputRef}
              className="sr-only"
              multiple
              type="file"
              onChange={handleRepairInitialFilesPick}
            />
            {repairForm.files.length ? (
              <div className="flex flex-wrap gap-2">
                {repairForm.files.map((file) => (
                  <span
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className="rounded-full border border-line bg-[var(--bg-secondary)] px-3 py-2 text-xs text-ink"
                  >
                    {file.name}
                  </span>
                ))}
              </div>
            ) : null}
            {createRepairMutation.isError ? (
              <p className="text-sm text-[#b04c43]">
                {createRepairMutation.error instanceof Error
                  ? createRepairMutation.error.message
                  : "Не удалось отправить прибор в ремонт."}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <EmojiPickerButton
                disabled={createRepairMutation.isPending}
                onPick={handleInsertRepairInitialEmoji}
              />
              <IconActionButton
                className="h-10 w-10"
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.25 20.25a6 6 0 0 1-8.49-8.49l9.9-9.9a4.5 4.5 0 1 1 6.36 6.36l-9.2 9.19a3 3 0 0 1-4.24-4.24l8.49-8.49" />
                  </svg>
                }
                label="Прикрепить файлы к первому сообщению ремонта"
                onClick={() => repairInitialFilesInputRef.current?.click()}
              />
              <button
                aria-label="Подтвердить отправку в ремонт"
                className="btn-primary disabled:opacity-60"
                disabled={
                  createRepairMutation.isPending
                  || !repairForm.routeCity.trim()
                  || !repairForm.routeDestination.trim()
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
          description="Укажи маршрут отправки в поверку и, если нужно, добавь первое сообщение с файлами. Это сообщение сразу попадет в диалог поверки."
          open={verificationModalOpen}
          title="Отправить в поверку"
          onClose={() => setVerificationModalOpen(false)}
        >
          <form className="space-y-4" onSubmit={(event) => void handleCreateVerification(event)}>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm text-steel">
                Город
                <input
                  className="form-input"
                  list={`verification-route-cities-${parsedEquipmentId}`}
                  type="text"
                  value={verificationForm.routeCity}
                  onChange={(event) =>
                    setVerificationForm((current) => ({ ...current, routeCity: event.target.value }))
                  }
                />
                <datalist id={`verification-route-cities-${parsedEquipmentId}`}>
                  {(folderSuggestions?.repairRouteCities ?? []).map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </label>
              <label className="block text-sm text-steel">
                Куда
                <input
                  className="form-input"
                  list={`verification-route-destinations-${parsedEquipmentId}`}
                  type="text"
                  value={verificationForm.routeDestination}
                  onChange={(event) =>
                    setVerificationForm((current) => ({
                      ...current,
                      routeDestination: event.target.value,
                    }))
                  }
                />
                <datalist id={`verification-route-destinations-${parsedEquipmentId}`}>
                  {(folderSuggestions?.repairRouteDestinations ?? []).map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              </label>
            </div>
            <label className="block text-sm text-steel">
              Дата отправки
              <input
                className="form-input"
                type="date"
                value={verificationForm.sentToVerificationAt}
                onChange={(event) =>
                  setVerificationForm((current) => ({
                    ...current,
                    sentToVerificationAt: event.target.value,
                  }))
                }
              />
            </label>
            <label className="block text-sm text-steel">
              Первое сообщение
              <textarea
                className="form-input min-h-[92px] resize-none py-3"
                placeholder="Прибор упакован и отправлен в поверку"
                value={verificationForm.initialMessageText}
                onChange={(event) =>
                  setVerificationForm((current) => ({
                    ...current,
                    initialMessageText: event.target.value,
                  }))
                }
              />
            </label>
            <input
              ref={verificationInitialFilesInputRef}
              className="sr-only"
              multiple
              type="file"
              onChange={handleVerificationInitialFilesPick}
            />
            {verificationForm.files.length ? (
              <div className="flex flex-wrap gap-2">
                {verificationForm.files.map((file) => (
                  <span
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className="rounded-full border border-line bg-[var(--bg-secondary)] px-3 py-2 text-xs text-ink"
                  >
                    {file.name}
                  </span>
                ))}
              </div>
            ) : null}
            {createVerificationMutation.isError ? (
              <p className="text-sm text-[#b04c43]">
                {createVerificationMutation.error instanceof Error
                  ? createVerificationMutation.error.message
                  : "Не удалось отправить прибор в поверку."}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              <EmojiPickerButton
                disabled={createVerificationMutation.isPending}
                onPick={handleInsertVerificationInitialEmoji}
              />
              <IconActionButton
                className="h-10 w-10"
                icon={
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.9">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.25 20.25a6 6 0 0 1-8.49-8.49l9.9-9.9a4.5 4.5 0 1 1 6.36 6.36l-9.2 9.19a3 3 0 0 1-4.24-4.24l8.49-8.49" />
                  </svg>
                }
                label="Прикрепить файлы к первому сообщению поверки"
                onClick={() => verificationInitialFilesInputRef.current?.click()}
              />
              <button
                aria-label="Подтвердить отправку в поверку"
                className="btn-primary disabled:opacity-60"
                disabled={
                  createVerificationMutation.isPending
                  || !verificationForm.routeCity.trim()
                  || !verificationForm.routeDestination.trim()
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
                      current ? { ...current, folderId: event.target.value, groupId: "" } : current,
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
                Группа
                <select
                  className="form-input"
                  value={form.groupId}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, groupId: event.target.value } : current,
                    )
                  }
                >
                  <option value="">Без группы</option>
                  {selectedFolderGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-steel">
                Категория
                <select
                  className="form-input"
                  value={form.equipmentType}
                  onChange={(event) =>
                    setForm((current) =>
                      current
                        ? { ...current, equipmentType: event.target.value as EquipmentType }
                        : current,
                    )
                  }
                >
                  {equipmentTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {equipmentTypeLabels[type]}
                    </option>
                  ))}
                </select>
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
                <input
                  className="form-input"
                  list={`object-names-${parsedEquipmentId}`}
                  type="text"
                  value={form.objectName}
                  onChange={(event) =>
                    setForm((current) =>
                      current ? { ...current, objectName: event.target.value } : current,
                    )
                  }
                />
                <datalist id={`object-names-${parsedEquipmentId}`}>
                  {(folderSuggestions?.objectNames ?? []).map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
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
                Серийный номер
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
            <label className="block text-sm text-steel">
              Текущее местоположение
              <input
                className="form-input"
                list={`current-locations-${parsedEquipmentId}`}
                type="text"
                value={form.currentLocationManual}
                onChange={(event) =>
                  setForm((current) =>
                    current ? { ...current, currentLocationManual: event.target.value } : current,
                  )
                }
              />
              <datalist id={`current-locations-${parsedEquipmentId}`}>
                {(folderSuggestions?.currentLocations ?? []).map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
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

function formatAttachmentMeta(attachment: EquipmentAttachment): string {
  return [
    attachment.uploadedByDisplayName,
    formatDateTime(attachment.createdAt),
    formatFileSize(attachment.fileSize),
  ].join(" · ");
}

function SISection({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string | null]>;
}) {
  const visibleRows = rows.filter(([, value]) => value && value.trim());
  if (!visibleRows.length) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-line">
      <div className="border-b border-line bg-[var(--bg-secondary)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
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
            <dd className="min-w-0 break-words font-medium text-ink">{value}</dd>
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
    <section className="overflow-hidden rounded-3xl border border-line">
      <div className="border-b border-line bg-[var(--bg-secondary)] px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-steel">
        {title}
      </div>
      <div className="space-y-2 px-4 py-3 text-sm text-ink">
        {items.map((item, index) => (
          <p key={`${title}-${index}`} className="break-words">
            {item}
          </p>
        ))}
      </div>
    </section>
  );
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatCommentMeta(comment: { authorDisplayName: string; createdAt: string }): string {
  return `${formatShortDisplayName(comment.authorDisplayName)} · ${formatDateTime(comment.createdAt)}`;
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

function extractSiCardDetail(si: EquipmentSIVerification) {
  const raw = (si.detailPayloadJson ?? {}) as Record<string, unknown>;
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
      getNestedString(vriInfo, ["applicable", "certNum"]) ?? si.resultDocnum ?? null,
    organization: getFirstString(vriInfo.organization, vriInfo.orgTitle, si.orgTitle),
    regNumber: getFirstString(miSingle.mitypeNumber, si.mitNumber),
    typeDesignation: getFirstString(miSingle.mitypeType, si.mitNotation),
    typeName: getFirstString(miSingle.mitypeTitle, si.mitTitle),
    serialNumber: getFirstString(miSingle.manufactureNum, si.miNumber),
    manufactureYear: getNumber(miSingle.manufactureYear),
    modification: getFirstString(miSingle.modification),
    ownerName: getFirstString(vriInfo.miOwner, vriInfo.owner, vriInfo.ownerName),
    verificationMarkCipher: getFirstString(vriInfo.signCipher, vriInfo.stickerNum, vriInfo.markCipher),
    verificationType: getFirstString(vriInfo.verificationType, vriInfo.typeTitle, vriInfo.verificationTitle),
    verificationDate: getFirstString(vriInfo.vrfDate, normalizeDisplayDate(si.verificationDate)),
    validUntil: getFirstString(vriInfo.validDate, normalizeDisplayDate(si.validDate)),
    documentTitle: getFirstString(vriInfo.docTitle, info.docTitle, info.doc_title),
    isUsable: getBool(vriInfo.applicable),
    passportMark: getBool(vriInfo.signPass ?? vriInfo.signInPassport ?? info.signPass ?? info.signInPassport),
    deviceMark: getBool(vriInfo.signMi ?? vriInfo.signOnMi ?? info.signMi ?? info.signOnMi),
    reducedScope: getBool(vriInfo.shortScope ?? vriInfo.reducedScope ?? info.shortScope ?? info.reducedScope),
    etalonLines: buildEtalonLines(raw),
    meansLines: buildVerificationMeansLines(raw),
  };
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
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function resizeCommentInput(textarea: HTMLTextAreaElement): void {
  textarea.style.height = "0px";
  textarea.style.height = `${Math.max(textarea.scrollHeight, 64)}px`;
}

function insertEmojiAtCursor(
  textarea: HTMLTextAreaElement | null,
  value: string,
  emoji: string,
): string {
  if (!textarea) {
    return `${value}${emoji}`;
  }

  const selectionStart = textarea.selectionStart ?? value.length;
  const selectionEnd = textarea.selectionEnd ?? value.length;
  const nextValue = `${value.slice(0, selectionStart)}${emoji}${value.slice(selectionEnd)}`;

  requestAnimationFrame(() => {
    const caretPosition = selectionStart + emoji.length;
    textarea.focus();
    textarea.setSelectionRange(caretPosition, caretPosition);
  });

  return nextValue;
}
