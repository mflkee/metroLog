import { useEffect, useMemo, useRef, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sendTestMentionEmail, updateProfile, type AuthUser } from "@/api/auth";
import {
  createDeadlinePreset,
  deleteDeadlinePreset,
  fetchDeadlinePresets,
  fetchEquipmentFolders,
  updateDeadlinePreset,
  type CreateDeadlinePresetPayload,
  type DeadlinePreset,
  type ProcessStageTemplateRouteKind,
  type ProcessStageTemplateVariant,
  type ProcessVariantStageTemplateItem,
  type RepairStageTemplates,
  type VerificationFlowMode,
  type VerificationStageTemplates,
} from "@/api/equipment";
import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  dashboardWidgetOptions,
  defaultDashboardWidgets,
  normalizeDashboardWidgets,
  type DashboardWidgetKey,
} from "@/lib/dashboard";
import { hasAdminAccess } from "@/lib/roles";
import { Switch } from "@/components/ui/switch";
import { useAuthStore } from "@/store/auth";
import {
  defaultVisibleThemes,
  getVisibleThemes,
  themeOptions,
  type ThemeName,
  useThemeStore,
} from "@/store/theme";
import { useQueuedAutoSave } from "@/lib/useQueuedAutoSave";

type SettingsSnapshot = {
  dashboardFolderIds: number[];
  hiddenEquipmentFolderIds: number[];
  dashboardWidgets: DashboardWidgetKey[];
  mentionEmailNotificationsEnabled: boolean;
  enabledThemes: ThemeName[];
};

type SettingsSectionKey = "folders" | "dashboard" | "presets" | "themes" | "notifications";
type DashboardCardKey = "analysisFolders" | "hiddenEquipmentFolders";
type PresetStageGroupKey = "repair" | "verification";
type PresetModalState =
  | null
  | { mode: "create" }
  | { mode: "edit"; presetId: number };
const deadlinePresetFormId = "deadline-preset-form";
type DeadlinePresetFormState = {
  name: string;
  description: string;
  isActive: boolean;
  repairTotalDays: string;
  registrationAfterArrivalDays: string;
  incomingControlAfterReceiptDays: string;
  paymentAfterControlDays: string;
  repairStageTemplates: RepairStageTemplates;
  verificationStageTemplates: VerificationStageTemplates;
};

const emptyRepairStageTemplates = (): RepairStageTemplates => ({
  variants: [],
});

const emptyVerificationStageTemplates = (): VerificationStageTemplates => ({
  variants: [],
});

function createEmptyDeadlinePresetFormState(): DeadlinePresetFormState {
  return {
    name: "",
    description: "",
    isActive: true,
    repairTotalDays: "100",
    registrationAfterArrivalDays: "5",
    incomingControlAfterReceiptDays: "40",
    paymentAfterControlDays: "70",
    repairStageTemplates: emptyRepairStageTemplates(),
    verificationStageTemplates: emptyVerificationStageTemplates(),
  };
}

export function SettingsPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const currentTheme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const [dashboardFolderIds, setDashboardFolderIds] = useState<number[]>(
    user?.dashboardFolderIds?.length
      ? user.dashboardFolderIds
      : user?.dashboardFolderId
        ? [user.dashboardFolderId]
        : [],
  );
  const [hiddenEquipmentFolderIds, setHiddenEquipmentFolderIds] = useState<number[]>(
    user?.hiddenEquipmentFolderIds ?? [],
  );
  const [dashboardWidgets, setDashboardWidgets] = useState<DashboardWidgetKey[]>(
    normalizeDashboardWidgets(user?.dashboardWidgets ?? defaultDashboardWidgets),
  );
  const [mentionEmailNotificationsEnabled, setMentionEmailNotificationsEnabled] = useState(
    user?.mentionEmailNotificationsEnabled ?? true,
  );
  const [enabledThemes, setEnabledThemes] = useState<ThemeName[]>(
    getVisibleThemes(user?.enabledThemes ?? defaultVisibleThemes),
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testEmailError, setTestEmailError] = useState<string | null>(null);
  const [testEmailMessage, setTestEmailMessage] = useState<string | null>(null);
  const [presetFeedback, setPresetFeedback] = useState<string | null>(null);
  const [presetError, setPresetError] = useState<string | null>(null);
  const [presetModal, setPresetModal] = useState<PresetModalState>(null);
  const [presetForm, setPresetForm] = useState<DeadlinePresetFormState>(() =>
    createEmptyDeadlinePresetFormState(),
  );
  const [expandedPresetStageGroups, setExpandedPresetStageGroups] = useState<
    Record<PresetStageGroupKey, boolean>
  >({
    repair: true,
    verification: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<SettingsSectionKey, boolean>>({
    folders: false,
    dashboard: false,
    presets: false,
    themes: false,
    notifications: false,
  });
  const [expandedDashboardCards, setExpandedDashboardCards] = useState<Record<DashboardCardKey, boolean>>({
    analysisFolders: false,
    hiddenEquipmentFolders: false,
  });
  const hydratedUserIdRef = useRef<number | null>(null);
  const canManagePresets = hasAdminAccess(user?.role);

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders", "settings"],
    queryFn: () => fetchEquipmentFolders(token ?? ""),
    enabled: Boolean(token),
  });
  const deadlinePresetsQuery = useQuery({
    queryKey: ["deadline-presets", "settings"],
    queryFn: () => fetchDeadlinePresets(token ?? "", { includeInactive: true }),
    enabled: Boolean(token) && canManagePresets,
  });

  const createPresetMutation = useMutation({
    mutationFn: (payload: CreateDeadlinePresetPayload) => createDeadlinePreset(token ?? "", payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["deadline-presets"] });
    },
  });

  const updatePresetMutation = useMutation({
    mutationFn: ({ presetId, payload }: { presetId: number; payload: CreateDeadlinePresetPayload }) =>
      updateDeadlinePreset(token ?? "", presetId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["deadline-presets"] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-folders"] });
    },
  });

  const deletePresetMutation = useMutation({
    mutationFn: (presetId: number) => deleteDeadlinePreset(token ?? "", presetId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["deadline-presets"] });
      await queryClient.invalidateQueries({ queryKey: ["equipment-folders"] });
    },
  });

  useEffect(() => {
    if (!user) {
      hydratedUserIdRef.current = null;
      return;
    }
    if (hydratedUserIdRef.current === user.id) {
      return;
    }
    hydratedUserIdRef.current = user.id;
    setEnabledThemes(getVisibleThemes(user.enabledThemes ?? defaultVisibleThemes, currentTheme));
    setDashboardFolderIds(getDashboardFolderIdsFromUser(user));
    setHiddenEquipmentFolderIds(user.hiddenEquipmentFolderIds ?? []);
    setDashboardWidgets(normalizeDashboardWidgets(user.dashboardWidgets ?? defaultDashboardWidgets));
    setMentionEmailNotificationsEnabled(user.mentionEmailNotificationsEnabled ?? true);
  }, [currentTheme, user]);

  useEffect(() => {
    setEnabledThemes((current) => getVisibleThemes(current, currentTheme));
  }, [currentTheme]);

  const sortedThemeOptions = useMemo(
    () =>
      themeOptions.map((option) => ({
        ...option,
        checked: enabledThemes.includes(option.value),
      })),
    [enabledThemes],
  );

  const sortedDashboardWidgetOptions = useMemo(
    () =>
      dashboardWidgetOptions.map((option) => ({
        ...option,
        checked: dashboardWidgets.includes(option.value),
      })),
    [dashboardWidgets],
  );

  const baselineSettings = useMemo<SettingsSnapshot>(
    () => ({
      dashboardFolderIds:
        user?.dashboardFolderIds?.length
          ? user.dashboardFolderIds
          : user?.dashboardFolderId
            ? [user.dashboardFolderId]
            : [],
      hiddenEquipmentFolderIds: user?.hiddenEquipmentFolderIds ?? [],
      dashboardWidgets: normalizeDashboardWidgets(user?.dashboardWidgets ?? defaultDashboardWidgets),
      mentionEmailNotificationsEnabled: user?.mentionEmailNotificationsEnabled ?? true,
      enabledThemes: getVisibleThemes(user?.enabledThemes ?? defaultVisibleThemes, currentTheme),
    }),
    [
      currentTheme,
      user?.dashboardFolderId,
      user?.dashboardFolderIds,
      user?.hiddenEquipmentFolderIds,
      user?.dashboardWidgets,
      user?.enabledThemes,
      user?.mentionEmailNotificationsEnabled,
    ],
  );

  const currentSettings = useMemo<SettingsSnapshot>(
    () => ({
      dashboardFolderIds,
      hiddenEquipmentFolderIds,
      dashboardWidgets,
      mentionEmailNotificationsEnabled,
      enabledThemes,
    }),
    [
      dashboardFolderIds,
      dashboardWidgets,
      enabledThemes,
      hiddenEquipmentFolderIds,
      mentionEmailNotificationsEnabled,
    ],
  );

  function toggleTheme(theme: ThemeName) {
    setEnabledThemes((current) => {
      if (current.includes(theme)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((value) => value !== theme);
      }
      return [...current, theme];
    });
  }

  function toggleDashboardWidget(widget: DashboardWidgetKey) {
    setDashboardWidgets((current) => {
      if (current.includes(widget)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((value) => value !== widget);
      }
      return [...current, widget];
    });
  }

  function toggleDashboardFolder(folderId: number) {
    setDashboardFolderIds((current) =>
      current.includes(folderId)
        ? current.filter((value) => value !== folderId)
        : [...current, folderId].sort((left, right) => left - right),
    );
  }

  function toggleHiddenEquipmentFolder(folderId: number) {
    setHiddenEquipmentFolderIds((current) =>
      current.includes(folderId)
        ? current.filter((value) => value !== folderId)
        : [...current, folderId].sort((left, right) => left - right),
    );
  }

  async function saveSettings(snapshot: SettingsSnapshot) {
    if (!token || !user) {
      throw new Error("Сессия неактивна. Войди заново.");
    }

    const nextTheme = snapshot.enabledThemes.includes(currentTheme)
      ? currentTheme
      : snapshot.enabledThemes[0];
    setIsSubmitting(true);

    try {
      if (nextTheme !== currentTheme) {
        setTheme(nextTheme);
      }
      const updatedUser = await updateProfile(token, {
        dashboardFolderId: snapshot.dashboardFolderIds[0] ?? null,
        dashboardFolderIds: snapshot.dashboardFolderIds,
        hiddenEquipmentFolderIds: snapshot.hiddenEquipmentFolderIds,
        dashboardWidgets: snapshot.dashboardWidgets,
        mentionEmailNotificationsEnabled: snapshot.mentionEmailNotificationsEnabled,
        enabledThemes: snapshot.enabledThemes,
        themePreference: nextTheme,
      });
      setUser(updatedUser);
      setError(null);
      setMessage("Настройки сохранены.");
    } finally {
      setIsSubmitting(false);
    }
  }

  useQueuedAutoSave({
    value: currentSettings,
    baseline: baselineSettings,
    enabled: Boolean(token && user),
    isEqual: areSettingsEqual,
    validate: (snapshot) =>
      snapshot.enabledThemes.length ? null : "Хотя бы одна тема должна оставаться доступной.",
    onValidationError: (validationError) => {
      setError(validationError);
      if (validationError) {
        setMessage(null);
      }
    },
    onError: (submitError) => {
      setError(
        submitError instanceof Error ? submitError.message : "Не удалось сохранить настройки.",
      );
      setMessage(null);
      setIsSubmitting(false);
    },
    save: saveSettings,
  });

  async function handleSendTestEmail() {
    setTestEmailError(null);
    setTestEmailMessage(null);

    if (!token) {
      setTestEmailError("Сессия неактивна. Войди заново.");
      return;
    }

    setIsSendingTestEmail(true);

    try {
      const response = await sendTestMentionEmail(token);
      setTestEmailMessage(response.message);
    } catch (submitError) {
      setTestEmailError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось отправить тестовое письмо.",
      );
    } finally {
      setIsSendingTestEmail(false);
    }
  }

  function toggleSection(section: SettingsSectionKey) {
    setExpandedSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function toggleDashboardCard(card: DashboardCardKey) {
    setExpandedDashboardCards((current) => ({
      ...current,
      [card]: !current[card],
    }));
  }

  function openCreatePresetModal() {
    setPresetError(null);
    setPresetFeedback(null);
    setPresetForm(createEmptyDeadlinePresetFormState());
    setExpandedPresetStageGroups({ repair: true, verification: true });
    setPresetModal({ mode: "create" });
  }

  function openEditPresetModal(preset: DeadlinePreset) {
    setPresetError(null);
    setPresetFeedback(null);
    setPresetForm(buildDeadlinePresetFormState(preset));
    setExpandedPresetStageGroups({ repair: true, verification: true });
    setPresetModal({ mode: "edit", presetId: preset.id });
  }

  function closePresetModal() {
    setPresetModal(null);
    setPresetForm(createEmptyDeadlinePresetFormState());
    setPresetError(null);
  }

  function togglePresetStageGroup(group: PresetStageGroupKey) {
    setExpandedPresetStageGroups((current) => ({
      ...current,
      [group]: !current[group],
    }));
  }

  function addPresetVariant(group: PresetStageGroupKey) {
    const field = getPresetStageGroupField(group);
    setPresetForm((current) => ({
      ...current,
      [field]: {
        variants: [
          ...current[field].variants,
          createPresetVariant(group, current[field].variants.length),
        ],
      },
    }));
  }

  function updatePresetVariant(
    group: PresetStageGroupKey,
    variantIndex: number,
    patch: Partial<ProcessStageTemplateVariant>,
  ) {
    const field = getPresetStageGroupField(group);
    setPresetForm((current) => ({
      ...current,
      [field]: {
        variants: current[field].variants.map((variant, index) =>
          index === variantIndex ? { ...variant, ...patch } : variant,
        ),
      },
    }));
  }

  function removePresetVariant(group: PresetStageGroupKey, variantIndex: number) {
    const field = getPresetStageGroupField(group);
    setPresetForm((current) => ({
      ...current,
      [field]: {
        variants: current[field].variants.filter((_, index) => index !== variantIndex),
      },
    }));
  }

  function addPresetVariantStage(group: PresetStageGroupKey, variantIndex: number) {
    const field = getPresetStageGroupField(group);
    setPresetForm((current) => ({
      ...current,
      [field]: {
        variants: current[field].variants.map((variant, index) =>
          index === variantIndex
            ? {
                ...variant,
                stages: [
                  ...variant.stages,
                  createPresetVariantStage(variant.stages.length),
                ],
              }
            : variant,
        ),
      },
    }));
  }

  function updatePresetVariantStage(
    group: PresetStageGroupKey,
    variantIndex: number,
    stageIndex: number,
    patch: Partial<ProcessVariantStageTemplateItem>,
  ) {
    const field = getPresetStageGroupField(group);
    setPresetForm((current) => ({
      ...current,
      [field]: {
        variants: current[field].variants.map((variant, index) =>
          index === variantIndex
            ? {
                ...variant,
                stages: variant.stages.map((stage, itemIndex) =>
                  itemIndex === stageIndex ? { ...stage, ...patch } : stage,
                ),
              }
            : variant,
        ),
      },
    }));
  }

  function movePresetVariantStage(
    group: PresetStageGroupKey,
    variantIndex: number,
    stageIndex: number,
    direction: -1 | 1,
  ) {
    const field = getPresetStageGroupField(group);
    setPresetForm((current) => ({
      ...current,
      [field]: {
        variants: current[field].variants.map((variant, index) =>
          index === variantIndex
            ? {
                ...variant,
                stages: moveArrayItem(variant.stages, stageIndex, stageIndex + direction),
              }
            : variant,
        ),
      },
    }));
  }

  function removePresetVariantStage(
    group: PresetStageGroupKey,
    variantIndex: number,
    stageIndex: number,
  ) {
    const field = getPresetStageGroupField(group);
    setPresetForm((current) => ({
      ...current,
      [field]: {
        variants: current[field].variants.map((variant, index) =>
          index === variantIndex
            ? {
                ...variant,
                stages: variant.stages.filter((_, itemIndex) => itemIndex !== stageIndex),
              }
            : variant,
        ),
      },
    }));
  }

  async function handlePresetSubmit() {
    if (!token) {
      setPresetError("Сессия неактивна. Войди заново.");
      return;
    }
    const parsedPayload = parseDeadlinePresetFormState(presetForm);
    if (parsedPayload instanceof Error) {
      setPresetError(parsedPayload.message);
      return;
    }

    setPresetError(null);
    try {
      if (presetModal?.mode === "edit") {
        await updatePresetMutation.mutateAsync({
          presetId: presetModal.presetId,
          payload: parsedPayload,
        });
        setPresetFeedback("Пресет обновлён.");
      } else {
        await createPresetMutation.mutateAsync(parsedPayload);
        setPresetFeedback("Пресет создан.");
      }
      closePresetModal();
    } catch (submitError) {
      setPresetError(
        submitError instanceof Error ? submitError.message : "Не удалось сохранить пресет.",
      );
    }
  }

  async function handleDeletePreset(preset: DeadlinePreset) {
    if (!token) {
      setPresetError("Сессия неактивна. Войди заново.");
      return;
    }
    const confirmed = window.confirm(`Удалить пресет «${preset.name}»?`);
    if (!confirmed) {
      return;
    }
    setPresetError(null);
    setPresetFeedback(null);
    try {
      await deletePresetMutation.mutateAsync(preset.id);
      setPresetFeedback(`Пресет «${preset.name}» удалён.`);
    } catch (submitError) {
      setPresetError(
        submitError instanceof Error ? submitError.message : "Не удалось удалить пресет.",
      );
    }
  }

  const selectedDashboardFolderNames = useMemo(
    () =>
      (foldersQuery.data ?? [])
        .filter((folder) => dashboardFolderIds.includes(folder.id))
        .map((folder) => folder.name),
    [dashboardFolderIds, foldersQuery.data],
  );

  return (
    <section>
      <PageHeader
        title="Настройки"
        description="Персональные параметры оболочки и состав тем, доступных в верхнем переключателе."
      />

      <div className="tone-parent space-y-4 rounded-3xl border border-line p-5 shadow-panel">
        <SettingsSectionCard
          description="Папки для аналитики на главной странице и персонально скрытые папки в оборудовании."
          expanded={expandedSections.folders}
          title="Папки"
          onToggle={() => toggleSection("folders")}
        >
          <div className="space-y-4">
            <SettingsSubsectionCard
              description="Выбери одну или несколько папок, если хочешь анализировать их как один объект на информационной панели."
              expanded={expandedDashboardCards.analysisFolders}
              summary={buildDashboardFoldersSummary(selectedDashboardFolderNames)}
              title="Папки для информационной панели"
              onToggle={() => toggleDashboardCard("analysisFolders")}
            >
              {foldersQuery.isLoading ? (
                <p className="text-sm text-steel">Загружаем список папок...</p>
              ) : foldersQuery.isError ? (
                <p className="text-sm text-[#b04c43]">
                  {foldersQuery.error instanceof Error
                    ? foldersQuery.error.message
                    : "Не удалось загрузить список папок."}
                </p>
              ) : !(foldersQuery.data ?? []).length ? (
                <div className="tone-child rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-steel">
                  Доступных папок пока нет.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(foldersQuery.data ?? []).map((folder) => {
                    const isSelected = dashboardFolderIds.includes(folder.id);
                    return (
                      <label
                        key={folder.id}
                        className="tone-child flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink"
                        htmlFor={`dashboard-folder-${folder.id}`}
                      >
                        <Switch
                          checked={isSelected}
                          className="mt-1"
                          id={`dashboard-folder-${folder.id}`}
                          onCheckedChange={() => toggleDashboardFolder(folder.id)}
                        />
                        <span className="min-w-0">
                          <span className="block font-semibold">{folder.name}</span>
                          <span className="mt-1 block text-xs text-steel">
                            {folder.description || "Папка без описания."}
                          </span>
                          <span className="mt-1 block text-xs text-steel">
                            {isSelected ? "Участвует в аналитике" : "Не участвует в аналитике"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </SettingsSubsectionCard>

            <SettingsSubsectionCard
              description="Эти папки останутся доступными, но не будут показываться в общем списке папок на странице оборудования именно для твоего аккаунта."
              expanded={expandedDashboardCards.hiddenEquipmentFolders}
              summary={
                hiddenEquipmentFolderIds.length
                  ? `Скрыто папок: ${hiddenEquipmentFolderIds.length}`
                  : "Скрытых папок нет"
              }
              title="Скрытые папки в разделе «Оборудование»"
              onToggle={() => toggleDashboardCard("hiddenEquipmentFolders")}
            >
              {foldersQuery.isLoading ? (
                <p className="text-sm text-steel">Загружаем список папок...</p>
              ) : foldersQuery.isError ? (
                <p className="text-sm text-[#b04c43]">
                  {foldersQuery.error instanceof Error
                    ? foldersQuery.error.message
                    : "Не удалось загрузить список папок."}
                </p>
              ) : !(foldersQuery.data ?? []).length ? (
                <div className="tone-child rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-steel">
                  Доступных папок пока нет.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {(foldersQuery.data ?? []).map((folder) => {
                    const isHidden = hiddenEquipmentFolderIds.includes(folder.id);
                    return (
                      <label
                        key={folder.id}
                        className="tone-child flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink"
                        htmlFor={`hidden-folder-${folder.id}`}
                      >
                        <Switch
                          checked={isHidden}
                          className="mt-1"
                          id={`hidden-folder-${folder.id}`}
                          onCheckedChange={() => toggleHiddenEquipmentFolder(folder.id)}
                        />
                        <span className="min-w-0">
                          <span className="block font-semibold">{folder.name}</span>
                          <span className="mt-1 block text-xs text-steel">
                            {folder.description || "Папка без описания."}
                          </span>
                          <span className="mt-1 block text-xs text-steel">
                            {isHidden ? "Скрыта в оборудовании" : "Показывается в оборудовании"}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </SettingsSubsectionCard>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard
          description="Состав виджетов на главной странице."
          expanded={expandedSections.dashboard}
          title="Информационная панель"
          onToggle={() => toggleSection("dashboard")}
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sortedDashboardWidgetOptions.map((option) => (
                <label
                  key={option.value}
                  className="tone-child flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink"
                  htmlFor={`dashboard-widget-${option.value}`}
                >
                  <Switch
                    checked={option.checked}
                    className="mt-1"
                    id={`dashboard-widget-${option.value}`}
                    onCheckedChange={() => toggleDashboardWidget(option.value)}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">{option.label}</span>
                  </span>
                </label>
              ))}
            </div>

          </div>
        </SettingsSectionCard>

        {canManagePresets ? (
          <SettingsSectionCard
            description="Конфигуратор пресетов дедлайнов для новых папок и будущих ремонтов."
            expanded={expandedSections.presets}
            title="Пресеты"
            onToggle={() => toggleSection("presets")}
          >
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-steel">
                  Пресет задаёт срок ремонта, регистрацию после прибытия, входной контроль и оплату.
                </p>
                <button className="btn-primary" type="button" onClick={openCreatePresetModal}>
                  Новый пресет
                </button>
              </div>

              {deadlinePresetsQuery.isLoading ? (
                <p className="text-sm text-steel">Загружаем пресеты...</p>
              ) : deadlinePresetsQuery.isError ? (
                <p className="text-sm text-[#b04c43]">
                  {deadlinePresetsQuery.error instanceof Error
                    ? deadlinePresetsQuery.error.message
                    : "Не удалось загрузить пресеты дедлайнов."}
                </p>
              ) : !(deadlinePresetsQuery.data ?? []).length ? (
                <div className="tone-child rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-steel">
                  Пресетов пока нет.
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {(deadlinePresetsQuery.data ?? []).map((preset) => (
                    <div
                      key={preset.id}
                      className="tone-child rounded-2xl border border-line px-4 py-4 text-sm text-ink"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-semibold">{preset.name}</h4>
                            {preset.isSystem ? (
                              <span className="rounded-full bg-[var(--accent-muted)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
                                Системный
                              </span>
                            ) : null}
                            {!preset.isActive ? (
                              <span className="rounded-full bg-[#f3efe5] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8c6a2b]">
                                Неактивен
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-steel">
                            {preset.description || "Без описания."}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="btn-secondary"
                            type="button"
                            onClick={() => openEditPresetModal(preset)}
                          >
                            Редактировать
                          </button>
                          {!preset.isSystem ? (
                            <button
                              className="btn-secondary"
                              disabled={deletePresetMutation.isPending}
                              type="button"
                              onClick={() => void handleDeletePreset(preset)}
                            >
                              Удалить
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 text-xs text-steel md:grid-cols-2">
                        <div className="tone-parent rounded-2xl border border-line px-3 py-3">
                          <span className="block font-semibold text-ink">Ремонт</span>
                          <span className="mt-1 block">
                            {formatPresetVariantSummary(preset.repairStageTemplates)}
                          </span>
                        </div>
                        <div className="tone-parent rounded-2xl border border-line px-3 py-3">
                          <span className="block font-semibold text-ink">Поверка</span>
                          <span className="mt-1 block">
                            {formatPresetVariantSummary(preset.verificationStageTemplates)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {presetError ? <p className="text-sm text-[#b04c43]">{presetError}</p> : null}
              {presetFeedback ? <p className="text-sm text-signal-ok">{presetFeedback}</p> : null}
            </div>
          </SettingsSectionCard>
        ) : null}

        <SettingsSectionCard
          description="Список тем, которые будут доступны тебе в верхнем переключателе."
          expanded={expandedSections.themes}
          title="Темы интерфейса"
          onToggle={() => toggleSection("themes")}
        >
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sortedThemeOptions.map((option) => (
                <label
                  key={option.value}
                  className="tone-child flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink"
                  htmlFor={`theme-option-${option.value}`}
                >
                  <Switch
                    checked={option.checked}
                    className="mt-1"
                    id={`theme-option-${option.value}`}
                    onCheckedChange={() => toggleTheme(option.value)}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">{option.label}</span>
                    <span className="mt-1 block text-xs text-steel">
                      {option.source ?? "Базовая тема приложения"}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className="tone-child rounded-2xl border border-line px-4 py-3 text-sm text-steel">
              Сейчас активна:{" "}
              <span className="font-semibold text-ink">
                {themeOptions.find((option) => option.value === currentTheme)?.label ?? currentTheme}
              </span>
            </div>
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard
          description="Письма при упоминаниях и тестовая проверка почтовых уведомлений."
          expanded={expandedSections.notifications}
          title="Уведомления"
          onToggle={() => toggleSection("notifications")}
        >
          <div className="space-y-4">
            <label
              className="tone-child flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink"
              htmlFor="mention-email-notifications"
            >
              <Switch
                checked={mentionEmailNotificationsEnabled}
                className="mt-1"
                id="mention-email-notifications"
                onCheckedChange={setMentionEmailNotificationsEnabled}
              />
              <span className="min-w-0">
                <span className="block font-semibold">Письма при упоминании</span>
                <span className="mt-1 block text-xs text-steel">
                  Если тебя отметят через `@`, приложение отправит письмо со ссылкой на нужный прибор, ремонт или поверку.
                </span>
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button
                className="btn-secondary"
                disabled={isSendingTestEmail}
                type="button"
                onClick={() => void handleSendTestEmail()}
              >
                {isSendingTestEmail ? "Отправляем..." : "Тестовое письмо"}
              </button>
              <span className="text-xs text-steel">
                Отправить проверочное письмо на адрес текущего пользователя:{" "}
                <span className="font-semibold text-ink">{user?.email ?? "—"}</span>
              </span>
            </div>

            {testEmailError ? <p className="text-sm text-[#b04c43]">{testEmailError}</p> : null}
            {testEmailMessage ? <p className="text-sm text-signal-ok">{testEmailMessage}</p> : null}
          </div>
        </SettingsSectionCard>

        {error ? <p className="text-sm text-[#b04c43]">{error}</p> : null}
        {isSubmitting ? (
          <p className="text-sm text-steel">Сохраняем настройки...</p>
        ) : message ? (
          <p className="text-sm text-signal-ok">{message}</p>
        ) : null}
      </div>

      <Modal
        description="Собери набор дедлайнов и потом выбирай его при создании или редактировании папки."
        footer={
          <div className="flex justify-end gap-3">
            <button className="btn-secondary" type="button" onClick={closePresetModal}>
              Отмена
            </button>
            <button
              className="btn-primary"
              disabled={createPresetMutation.isPending || updatePresetMutation.isPending}
              form={deadlinePresetFormId}
              type="submit"
            >
              {createPresetMutation.isPending || updatePresetMutation.isPending
                ? "Сохраняем..."
                : "Сохранить"}
            </button>
          </div>
        }
        open={presetModal !== null}
        size="xl"
        title={presetModal?.mode === "edit" ? "Редактировать пресет" : "Новый пресет"}
        onClose={closePresetModal}
      >
        <form
          className="space-y-4"
          id={deadlinePresetFormId}
          onSubmit={(event) => {
            event.preventDefault();
            void handlePresetSubmit();
          }}
        >
          <label className="block text-sm text-steel">
            Название
            <input
              className="form-input"
              type="text"
              value={presetForm.name}
              onChange={(event) =>
                setPresetForm((current) => ({ ...current, name: event.target.value }))
              }
            />
          </label>
          <label className="block text-sm text-steel">
            Описание
            <input
              className="form-input"
              type="text"
              value={presetForm.description}
              onChange={(event) =>
                setPresetForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label
              className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink"
              htmlFor="preset-is-active"
            >
              <Switch
                checked={presetForm.isActive}
                id="preset-is-active"
                onCheckedChange={(checked) =>
                  setPresetForm((current) => ({ ...current, isActive: checked }))
                }
              />
              <span className="font-semibold">Активный пресет</span>
            </label>
          </div>
          <div className="space-y-3">
            <PresetStageGroup
              description="Добавь варианты ремонта. Каждый вариант сам задает маршрут и список пунктов."
              expanded={expandedPresetStageGroups.repair}
              title="Ремонт"
              onToggle={() => togglePresetStageGroup("repair")}
            >
              <PresetVariantGrid
                emptyText="Варианты ремонта не добавлены."
                group="repair"
                variants={presetForm.repairStageTemplates.variants}
                onAddStage={addPresetVariantStage}
                onAddVariant={addPresetVariant}
                onMoveStage={movePresetVariantStage}
                onRemoveStage={removePresetVariantStage}
                onRemoveVariant={removePresetVariant}
                onUpdateStage={updatePresetVariantStage}
                onUpdateVariant={updatePresetVariant}
              />
            </PresetStageGroup>

            <PresetStageGroup
              description="Добавь варианты поверки. Демонтаж, отправка и монтаж теперь обычные пункты."
              expanded={expandedPresetStageGroups.verification}
              title="Поверка"
              onToggle={() => togglePresetStageGroup("verification")}
            >
              <PresetVariantGrid
                emptyText="Варианты поверки не добавлены."
                group="verification"
                variants={presetForm.verificationStageTemplates.variants}
                onAddStage={addPresetVariantStage}
                onAddVariant={addPresetVariant}
                onMoveStage={movePresetVariantStage}
                onRemoveStage={removePresetVariantStage}
                onRemoveVariant={removePresetVariant}
                onUpdateStage={updatePresetVariantStage}
                onUpdateVariant={updatePresetVariant}
              />
            </PresetStageGroup>
          </div>
          {presetError ? <p className="text-sm text-[#b04c43]">{presetError}</p> : null}
        </form>
      </Modal>
    </section>
  );
}

function SettingsSectionCard({
  title,
  description,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="tone-child overflow-hidden rounded-3xl border border-line shadow-panel">
      <button
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-black/5"
        type="button"
        onClick={onToggle}
      >
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <p className="mt-1 max-w-[64ch] text-sm text-steel">{description}</p>
        </div>
        <svg
          className={["h-5 w-5 shrink-0 text-steel transition-transform", expanded ? "rotate-180" : ""].join(" ")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.9"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 9-7.5 7.5L4.5 9" />
        </svg>
      </button>
      {expanded ? <div className="space-y-4 border-t border-line px-5 py-4">{children}</div> : null}
    </section>
  );
}

function SettingsSubsectionCard({
  title,
  description,
  summary,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  summary?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="tone-parent overflow-hidden rounded-3xl border border-line shadow-panel">
      <button
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-black/5"
        type="button"
        onClick={onToggle}
      >
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-ink">{title}</h4>
          <p className="mt-1 max-w-[64ch] text-sm text-steel">{description}</p>
          {summary ? <p className="mt-2 text-xs font-medium text-steel">{summary}</p> : null}
        </div>
        <svg
          className={["h-5 w-5 shrink-0 text-steel transition-transform", expanded ? "rotate-180" : ""].join(" ")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.9"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 9-7.5 7.5L4.5 9" />
        </svg>
      </button>
      {expanded ? <div className="space-y-4 border-t border-line px-5 py-4">{children}</div> : null}
    </section>
  );
}

function PresetStageGroup({
  title,
  description,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="tone-child overflow-hidden rounded-2xl border border-line">
      <button
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-black/5"
        type="button"
        onClick={onToggle}
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="mt-1 text-xs text-steel">{description}</p>
        </div>
        <svg
          className={["h-4 w-4 shrink-0 text-steel transition-transform", expanded ? "rotate-180" : ""].join(" ")}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.9"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 9-7.5 7.5L4.5 9" />
        </svg>
      </button>
      {expanded ? <div className="space-y-3 border-t border-line px-4 py-4">{children}</div> : null}
    </section>
  );
}

function areSettingsEqual(left: SettingsSnapshot, right: SettingsSnapshot): boolean {
  return areNumberArraysEqual(left.dashboardFolderIds, right.dashboardFolderIds)
    && left.mentionEmailNotificationsEnabled === right.mentionEmailNotificationsEnabled
    && areNumberArraysEqual(left.hiddenEquipmentFolderIds, right.hiddenEquipmentFolderIds)
    && areStringArraysEqual(left.dashboardWidgets, right.dashboardWidgets)
    && areStringArraysEqual(left.enabledThemes, right.enabledThemes);
}

function areNumberArraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function areStringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function getDashboardFolderIdsFromUser(user: AuthUser | null | undefined): number[] {
  if (!user) {
    return [];
  }
  if (user.dashboardFolderIds?.length) {
    return user.dashboardFolderIds;
  }
  return user.dashboardFolderId ? [user.dashboardFolderId] : [];
}

function buildDashboardFoldersSummary(folderNames: string[]): string {
  if (!folderNames.length) {
    return "Папки для анализа не выбраны";
  }
  if (folderNames.length <= 2) {
    return folderNames.join(", ");
  }
  return `${folderNames[0]}, ${folderNames[1]} и ещё ${folderNames.length - 2}`;
}

function formatPresetVariantSummary(
  templates: { variants: ProcessStageTemplateVariant[] } | null,
): string {
  const variants = templates?.variants ?? [];
  if (!variants.length) {
    return "варианты не заданы";
  }
  const stageCount = variants.reduce((sum, variant) => sum + variant.stages.length, 0);
  return `${variants.length} вар. · ${stageCount} пункт.`;
}

function buildDeadlinePresetFormState(preset: DeadlinePreset): DeadlinePresetFormState {
  return {
    name: preset.name,
    description: preset.description ?? "",
    isActive: preset.isActive,
    repairTotalDays: String(preset.repairTotalDays),
    registrationAfterArrivalDays: String(preset.registrationAfterArrivalDays),
    incomingControlAfterReceiptDays: String(preset.incomingControlAfterReceiptDays),
    paymentAfterControlDays: String(preset.paymentAfterControlDays),
    repairStageTemplates: cloneVisibleRepairStageTemplates(
      preset.repairStageTemplates ?? emptyRepairStageTemplates(),
    ),
    verificationStageTemplates: cloneVisibleVerificationStageTemplates(
      preset.verificationStageTemplates ?? emptyVerificationStageTemplates(),
    ),
  };
}

function parseDeadlinePresetFormState(
  form: DeadlinePresetFormState,
): CreateDeadlinePresetPayload | Error {
  const name = form.name.trim();
  if (!name) {
    return new Error("Название пресета обязательно.");
  }

  const parsedValues = {
    repairTotalDays: Number.parseInt(form.repairTotalDays, 10),
    registrationAfterArrivalDays: Number.parseInt(form.registrationAfterArrivalDays, 10),
    incomingControlAfterReceiptDays: Number.parseInt(form.incomingControlAfterReceiptDays, 10),
    paymentAfterControlDays: Number.parseInt(form.paymentAfterControlDays, 10),
  };

  if (
    Object.entries(parsedValues)
      .some(([, value]) => Number.isNaN(value) || value < 0)
  ) {
    return new Error("Все дедлайны должны быть целыми неотрицательными числами.");
  }

  const allVariants = [
    ...form.repairStageTemplates.variants,
    ...form.verificationStageTemplates.variants,
  ];
  if (allVariants.some((variant) => !variant.name.trim())) {
    return new Error("У каждого варианта должно быть название.");
  }
  if (allVariants.some((variant) => variant.stages.length === 0)) {
    return new Error("В каждом варианте должен быть хотя бы один пункт.");
  }
  if (allVariants.some((variant) => variant.stages.some((stage) => !stage.label.trim()))) {
    return new Error("У каждого пункта должно быть название.");
  }

  return {
    name,
    description: form.description.trim(),
    sortOrder: 0,
    isActive: form.isActive,
    repairTotalDays: parsedValues.repairTotalDays,
    registrationAfterArrivalDays: parsedValues.registrationAfterArrivalDays,
    incomingControlAfterReceiptDays: parsedValues.incomingControlAfterReceiptDays,
    paymentAfterControlDays: parsedValues.paymentAfterControlDays,
    repairStageTemplates: cloneRepairStageTemplates(form.repairStageTemplates),
    verificationStageTemplates: cloneVerificationStageTemplates(form.verificationStageTemplates),
  };
}

function cloneRepairStageTemplates(templates: RepairStageTemplates): RepairStageTemplates {
  return cloneProcessStageTemplateVariants(templates);
}

function cloneVisibleRepairStageTemplates(templates: RepairStageTemplates): RepairStageTemplates {
  return cloneProcessStageTemplateVariants(templates);
}

function cloneVerificationStageTemplates(
  templates: VerificationStageTemplates,
): VerificationStageTemplates {
  return cloneProcessStageTemplateVariants(templates);
}

function cloneVisibleVerificationStageTemplates(
  templates: VerificationStageTemplates,
): VerificationStageTemplates {
  return cloneProcessStageTemplateVariants(templates);
}

function cloneProcessStageTemplateVariants<T extends { variants: ProcessStageTemplateVariant[] }>(
  templates: T,
): T {
  return {
    ...templates,
    variants: templates.variants.map((variant, variantIndex) => ({
      ...variant,
      sortOrder: variantIndex,
      stages: variant.stages.map((stage, stageIndex) => ({
        ...stage,
        sortOrder: stageIndex,
      })),
    })),
  };
}

type PresetTemplateGroupField = "repairStageTemplates" | "verificationStageTemplates";

function getPresetStageGroupField(group: PresetStageGroupKey): PresetTemplateGroupField {
  return group === "repair" ? "repairStageTemplates" : "verificationStageTemplates";
}

function getVerificationFlowModeForRoute(
  routeKind: ProcessStageTemplateRouteKind,
): VerificationFlowMode {
  return routeKind === "on_site"
    ? "ONSITE_WITH_DEMOLITION"
    : "OFFSITE_WITH_DEMOLITION";
}

function createPresetVariant(
  group: PresetStageGroupKey,
  index: number,
): ProcessStageTemplateVariant {
  return {
    id: `variant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    routeKind: "offsite",
    flowMode: group === "verification" ? "OFFSITE_WITH_DEMOLITION" : null,
    stages: [createPresetVariantStage(0)],
    sortOrder: index,
  };
}

function createPresetVariantStage(index: number): ProcessVariantStageTemplateItem {
  return {
    id: `stage-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label: "",
    deadlineDays: null,
    sortOrder: index,
  };
}

function moveArrayItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (toIndex < 0 || toIndex >= items.length || fromIndex === toIndex) {
    return items;
  }
  const next = items.slice();
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

type PresetVariantGridProps = {
  group: PresetStageGroupKey;
  variants: ProcessStageTemplateVariant[];
  emptyText: string;
  onAddVariant: (group: PresetStageGroupKey) => void;
  onUpdateVariant: (
    group: PresetStageGroupKey,
    variantIndex: number,
    patch: Partial<ProcessStageTemplateVariant>,
  ) => void;
  onRemoveVariant: (group: PresetStageGroupKey, variantIndex: number) => void;
  onAddStage: (group: PresetStageGroupKey, variantIndex: number) => void;
  onUpdateStage: (
    group: PresetStageGroupKey,
    variantIndex: number,
    stageIndex: number,
    patch: Partial<ProcessVariantStageTemplateItem>,
  ) => void;
  onMoveStage: (
    group: PresetStageGroupKey,
    variantIndex: number,
    stageIndex: number,
    direction: -1 | 1,
  ) => void;
  onRemoveStage: (
    group: PresetStageGroupKey,
    variantIndex: number,
    stageIndex: number,
  ) => void;
};

function PresetVariantGrid({
  group,
  variants,
  emptyText,
  onAddVariant,
  onUpdateVariant,
  onRemoveVariant,
  onAddStage,
  onUpdateStage,
  onMoveStage,
  onRemoveStage,
}: PresetVariantGridProps) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          className="btn-secondary inline-flex items-center gap-2"
          type="button"
          onClick={() => onAddVariant(group)}
        >
          <Icon className="h-4 w-4" name="plus" />
          <span>Вариант</span>
        </button>
      </div>
      {variants.length ? (
        <div className="grid gap-3 xl:grid-cols-3">
          {variants.map((variant, variantIndex) => (
            <PresetVariantCard
              key={variant.id}
              group={group}
              variant={variant}
              variantIndex={variantIndex}
              onAddStage={onAddStage}
              onMoveStage={onMoveStage}
              onRemoveStage={onRemoveStage}
              onRemoveVariant={onRemoveVariant}
              onUpdateStage={onUpdateStage}
              onUpdateVariant={onUpdateVariant}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-line px-3 py-3 text-sm text-steel">
          {emptyText}
        </p>
      )}
    </div>
  );
}

type PresetVariantCardProps = {
  group: PresetStageGroupKey;
  variant: ProcessStageTemplateVariant;
  variantIndex: number;
  onUpdateVariant: (
    group: PresetStageGroupKey,
    variantIndex: number,
    patch: Partial<ProcessStageTemplateVariant>,
  ) => void;
  onRemoveVariant: (group: PresetStageGroupKey, variantIndex: number) => void;
  onAddStage: (group: PresetStageGroupKey, variantIndex: number) => void;
  onUpdateStage: (
    group: PresetStageGroupKey,
    variantIndex: number,
    stageIndex: number,
    patch: Partial<ProcessVariantStageTemplateItem>,
  ) => void;
  onMoveStage: (
    group: PresetStageGroupKey,
    variantIndex: number,
    stageIndex: number,
    direction: -1 | 1,
  ) => void;
  onRemoveStage: (
    group: PresetStageGroupKey,
    variantIndex: number,
    stageIndex: number,
  ) => void;
};

function PresetVariantCard({
  group,
  variant,
  variantIndex,
  onUpdateVariant,
  onRemoveVariant,
  onAddStage,
  onUpdateStage,
  onMoveStage,
  onRemoveStage,
}: PresetVariantCardProps) {
  return (
    <section className="tone-grandchild rounded-2xl border border-line p-4">
      <div className="flex items-start gap-2">
        <label className="min-w-0 flex-1 space-y-1 text-sm text-steel">
          <span className="text-[11px] uppercase tracking-[0.14em] text-steel">
            Название варианта
          </span>
          <input
            className="form-input form-input--compact"
            maxLength={120}
            placeholder="Например: С отправкой"
            type="text"
            value={variant.name}
            onChange={(event) =>
              onUpdateVariant(group, variantIndex, { name: event.target.value })
            }
          />
        </label>
        <IconActionButton
          className="icon-action-button--danger mt-6"
          icon={<Icon className="h-4 w-4" name="delete" />}
          label={`Удалить вариант «${variant.name || "без названия"}»`}
          onClick={() => onRemoveVariant(group, variantIndex)}
        />
      </div>
      {group === "verification" ? (
        <label className="mt-3 block text-sm text-steel">
          Формат поверки
          <select
            className="form-input form-input--compact"
            value={variant.flowMode ?? getVerificationFlowModeForRoute(variant.routeKind)}
            onChange={(event) => {
              const flowMode = event.target.value as VerificationFlowMode;
              onUpdateVariant(group, variantIndex, {
                routeKind: flowMode === "OFFSITE_WITH_DEMOLITION" ? "offsite" : "on_site",
                flowMode,
              });
            }}
          >
            <option value="OFFSITE_WITH_DEMOLITION">С отправкой / демонтаж</option>
            <option value="ONSITE_WITH_DEMOLITION">По месту + демонтаж</option>
            <option value="ONSITE_WITHOUT_DEMOLITION">По месту без демонтажа</option>
          </select>
        </label>
      ) : (
        <label className="mt-3 block text-sm text-steel">
          Маршрут
          <select
            className="form-input form-input--compact"
            value={variant.routeKind}
            onChange={(event) => {
              const routeKind = event.target.value as ProcessStageTemplateRouteKind;
              onUpdateVariant(group, variantIndex, {
                routeKind,
                flowMode: null,
              });
            }}
          >
            <option value="offsite">С отправкой</option>
            <option value="on_site">По месту</option>
          </select>
        </label>
      )}
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-steel">
            Пункты
          </p>
          <button
            className="btn-secondary inline-flex items-center gap-2"
            type="button"
            onClick={() => onAddStage(group, variantIndex)}
          >
            <Icon className="h-4 w-4" name="plus" />
            <span>Пункт</span>
          </button>
        </div>
        {variant.stages.length ? (
          variant.stages.map((stage, stageIndex) => (
            <div
              key={stage.id}
              className="grid items-end gap-2 rounded-2xl border border-line/70 px-3 py-3 md:grid-cols-[minmax(0,1fr)_96px_auto]"
            >
              <label className="min-w-0 space-y-1 text-sm text-steel">
                <span className="text-[11px] uppercase tracking-[0.14em] text-steel">
                  Название
                </span>
                <input
                  className="form-input form-input--compact"
                  maxLength={120}
                  placeholder={stageIndex === 0 ? "Стартовый пункт" : "Следующий пункт"}
                  type="text"
                  value={stage.label}
                  onChange={(event) =>
                    onUpdateStage(group, variantIndex, stageIndex, {
                      label: event.target.value,
                    })
                  }
                />
              </label>
              <label className="space-y-1 text-sm text-steel">
                <span className="text-[11px] uppercase tracking-[0.14em] text-steel">
                  Дедлайн
                </span>
                <input
                  className="form-input form-input--compact"
                  inputMode="numeric"
                  min="0"
                  placeholder="нет"
                  type="number"
                  value={stage.deadlineDays ?? ""}
                  onChange={(event) =>
                    onUpdateStage(group, variantIndex, stageIndex, {
                      deadlineDays: event.target.value
                        ? Number.parseInt(event.target.value, 10)
                        : null,
                    })
                  }
                />
              </label>
              <div className="flex gap-1">
                <IconActionButton
                  disabled={stageIndex === 0}
                  icon={<ArrowIcon direction="up" />}
                  label={`Поднять пункт «${stage.label || "без названия"}»`}
                  onClick={() => onMoveStage(group, variantIndex, stageIndex, -1)}
                />
                <IconActionButton
                  disabled={stageIndex >= variant.stages.length - 1}
                  icon={<ArrowIcon direction="down" />}
                  label={`Опустить пункт «${stage.label || "без названия"}»`}
                  onClick={() => onMoveStage(group, variantIndex, stageIndex, 1)}
                />
                <IconActionButton
                  className="icon-action-button--danger"
                  icon={<Icon className="h-4 w-4" name="delete" />}
                  label={`Удалить пункт «${stage.label || "без названия"}»`}
                  onClick={() => onRemoveStage(group, variantIndex, stageIndex)}
                />
              </div>
            </div>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-line px-3 py-3 text-sm text-steel">
            Пункты не добавлены.
          </p>
        )}
      </div>
    </section>
  );
}

function ArrowIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      {direction === "up" ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="m6 15 6-6 6 6" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
      )}
    </svg>
  );
}
