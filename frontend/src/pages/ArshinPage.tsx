import { memo, type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchArshinEsiDetail,
  fetchArshinVriDetail,
  getArshinErrorMessage,
  searchArshin,
  type ArshinSearchFilters,
  type ArshinRegistryKind,
  type ArshinSearchResult,
  type ArshinVriDetail,
} from "@/api/arshin";
import {
  buildSIVerificationPayloadFromArshin,
  createEquipment,
  getArshinDocumentLabel,
  equipmentStatusLabels,
  fetchEquipment,
  fetchEquipmentFolderSuggestions,
  fetchEquipmentFolders,
  type CreateEquipmentPayload,
  type EquipmentFolder,
  type EquipmentItem,
  type EquipmentStatus,
} from "@/api/equipment";
import { AutocompleteInput } from "@/components/AutocompleteInput";
import { DateInput } from "@/components/DateInput";
import { Icon } from "@/components/Icon";
import { IconActionButton } from "@/components/IconActionButton";
import { IconActionLink } from "@/components/IconActionLink";
import { Modal } from "@/components/Modal";
import { PaginationControls } from "@/components/PaginationControls";
import { PageHeader } from "@/components/layout/PageHeader";
import { sortAutocompleteSuggestions } from "@/lib/autocomplete";
import { extractEsiInternalModuleCandidates, type ESIInternalModuleCandidate } from "@/lib/esiModules";
import { hasOperatorAccess } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";

type SearchFormState = {
  search: string;
  orgTitle: string;
  mitNumber: string;
  mitTitle: string;
  mitNotation: string;
  miModification: string;
  miNumber: string;
  npeNumber: string;
  rank: string;
  certificateNumber: string;
  resultDocnum: string;
  applicability: "ANY" | "TRUE" | "FALSE";
  verificationDate: string;
  validDate: string;
  year: string;
};

type AddToFolderFormState = {
  folderId: string;
  objectName: string;
  status: EquipmentStatus;
  measurementRangeStart: string;
  measurementRangeEnd: string;
  measurementUnit: string;
  currentLocationManual: string;
};

type AddToFolderESIModuleState = ESIInternalModuleCandidate & {
  measurementLimit: string;
};

type AddedItem = {
  equipmentId: number;
  equipmentName: string;
  vriId: string;
};

type AddToFolderResult = {
  created: AddedItem[];
  errors: Array<{ vriId: string; message: string }>;
};

type ArshinAutocompleteSuggestions = {
  search: string[];
  certificateNumber: string[];
  resultDocnum: string[];
  miNumber: string[];
  orgTitle: string[];
  mitNumber: string[];
  mitTitle: string[];
  mitNotation: string[];
  miModification: string[];
};

type ArshinAddFormSuggestions = {
  objectNames: string[];
  currentLocations: string[];
  measurementUnits: string[];
};

const ARSHIN_DEFAULT_YEAR = String(new Date().getFullYear());
const ARSHIN_YEAR_FILTER_MIN = 2021;
const ARSHIN_YEAR_OPTIONS = buildArshinYearOptions(Number(ARSHIN_DEFAULT_YEAR), ARSHIN_YEAR_FILTER_MIN);

const defaultSearchForm: SearchFormState = {
  search: "",
  orgTitle: "",
  mitNumber: "",
  mitTitle: "",
  mitNotation: "",
  miModification: "",
  miNumber: "",
  npeNumber: "",
  rank: "",
  certificateNumber: "",
  resultDocnum: "",
  applicability: "ANY",
  verificationDate: "",
  validDate: "",
  year: ARSHIN_DEFAULT_YEAR,
};

const defaultAddToFolderForm: AddToFolderFormState = {
  folderId: "",
  objectName: "",
  status: "IN_WORK",
  measurementRangeStart: "",
  measurementRangeEnd: "",
  measurementUnit: "",
  currentLocationManual: "",
};

const arshinPlaceholderExample = {
  search: "Преобразователи измерительные, Rosemount 3144P, 56381-14",
  certificateNumber: "С-ВЯ/05-02-2026/503716225",
  resultDocnum: "С-ЕЖБ/11-03-2026/510821535",
  miNumber: "09950292",
  orgTitle:
    'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "МНОГОЦЕЛЕВАЯ КОМПАНИЯ. АВТОМАТИЗАЦИЯ. ИССЛЕДОВАНИЯ. РАЗРАБОТКИ"(ООО "МКАИР")',
  mitNumber: "56381-14",
  mitTitle: "Преобразователи измерительные",
  mitNotation: "Rosemount 644, Rosemount 3144P",
  miModification: "Rosemount 3144P",
  verificationDate: "03.11.2026",
  validDate: "03.10.2031",
  year: "2016",
};

const DEFAULT_ARSHIN_PAGE_SIZE = 100;
const ESI_ARSHIN_PAGE_SIZE = 20;

export function ArshinPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const dashboardFolderId = user?.dashboardFolderId ?? null;
  const canAddFromArshin = hasOperatorAccess(user?.role);

  const [registryKind, setRegistryKind] = useState<ArshinRegistryKind>("SI");
  const [searchForm, setSearchForm] = useState<SearchFormState>(defaultSearchForm);
  const [searchResults, setSearchResults] = useState<ArshinSearchResult[]>([]);
  const [selectedResultIds, setSelectedResultIds] = useState<string[]>([]);
  const [previewVriId, setPreviewVriId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState<AddToFolderFormState>(defaultAddToFolderForm);
  const [addSummary, setAddSummary] = useState<AddToFolderResult | null>(null);
  const [esiAddModulesByResultId, setEsiAddModulesByResultId] = useState<
    Record<string, AddToFolderESIModuleState[]>
  >({});

  const activeFilters = useMemo(
    () => buildSearchFilters(searchForm, registryKind),
    [registryKind, searchForm],
  );
  const activeFilterCount = useMemo(() => countActiveFilters(activeFilters), [activeFilters]);
  const previewResult = useMemo(
    () => searchResults.find((item) => item.vriId === previewVriId) ?? null,
    [previewVriId, searchResults],
  );
  const pageSize = registryKind === "ESI" ? ESI_ARSHIN_PAGE_SIZE : DEFAULT_ARSHIN_PAGE_SIZE;

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders"],
    queryFn: () => fetchEquipmentFolders(token ?? ""),
    enabled: Boolean(token),
  });

  const autocompleteFolderSuggestionsQuery = useQuery({
    queryKey: ["arshin-autocomplete-folder-suggestions", dashboardFolderId ?? "none"],
    queryFn: () => fetchEquipmentFolderSuggestions(token ?? "", dashboardFolderId ?? 0),
    enabled: Boolean(token) && dashboardFolderId !== null,
    staleTime: 5 * 60 * 1000,
  });

  const autocompleteEquipmentQuery = useQuery({
    queryKey: ["arshin-autocomplete-equipment", dashboardFolderId ?? "none"],
    queryFn: () => fetchEquipment(token ?? "", { folderId: dashboardFolderId }),
    enabled: Boolean(token) && dashboardFolderId !== null,
    staleTime: 5 * 60 * 1000,
  });

  const previewQuery = useQuery({
    queryKey: ["arshin-vri-detail", registryKind, previewVriId, previewResult?.resultDocnum ?? null],
    queryFn: async () => {
      if (!previewResult) {
        throw new Error("Выбери запись Аршина.");
      }
      return registryKind === "ESI"
        ? fetchArshinEsiDetail(token ?? "", previewResult)
        : fetchArshinVriDetail(token ?? "", previewVriId ?? "");
    },
    enabled: Boolean(token && previewVriId && previewResult),
  });

  const searchMutation = useMutation({
    mutationFn: (filters: ArshinSearchFilters) => searchArshin(token ?? "", filters),
    onSuccess: (results) => {
      setSearchResults(results);
      setCurrentPage(1);
      if (results.length === 1) {
        setSelectedResultIds([results[0].vriId]);
        setPreviewVriId(results[0].vriId);
        return;
      }
      setSelectedResultIds((current) => current.filter((id) => results.some((item) => item.vriId === id)));
      setPreviewVriId((current) => (current && results.some((item) => item.vriId === current) ? current : null));
    },
  });

  const prepareEsiAddMutation = useMutation({
    mutationFn: async (items: ArshinSearchResult[]) => {
      const entries = await Promise.all(
        items.map(async (item) => {
          const detail = await fetchArshinEsiDetail(token ?? "", item);
          return [
            item.vriId,
            extractEsiInternalModuleCandidates(detail).map((module) => ({
              ...module,
              measurementLimit: "",
            })),
          ] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
    onSuccess: (result) => {
      setEsiAddModulesByResultId(result);
    },
  });

  const addToFolderMutation = useMutation<AddToFolderResult, Error, void>({
    mutationFn: async () => {
      const selectedFolderId = Number(addForm.folderId);
      const selectedItems = searchResults.filter((item) => selectedResultIds.includes(item.vriId));
      const created: AddedItem[] = [];
      const errors: Array<{ vriId: string; message: string }> = [];

      for (const result of selectedItems) {
        try {
          const detail =
            registryKind === "ESI"
              ? await fetchArshinEsiDetail(token ?? "", result)
              : await fetchArshinVriDetail(token ?? "", result.vriId);
          const payload: CreateEquipmentPayload = {
            folderId: selectedFolderId,
            groupId: null,
            objectName: addForm.objectName.trim(),
            equipmentType: registryKind,
            name:
              detail?.typeName
              ?? result.mitTitle
              ?? (registryKind === "ESI" ? "ЭСИ из Аршина" : "СИ из Аршина"),
            modification: detail?.modification ?? result.miModification ?? "",
            serialNumber: detail?.serialNumber ?? result.miNumber ?? "",
            manufactureYear:
              detail?.manufactureYear
              ?? (typeof result.rawPayloadJson?.year === "number" ? result.rawPayloadJson.year : null),
            measurementRangeStart: addForm.measurementRangeStart.trim(),
            measurementRangeEnd: addForm.measurementRangeEnd.trim(),
            measurementUnit: addForm.measurementUnit.trim(),
            status: addForm.status,
            createdManually: false,
            excludeFromArshinRefresh: false,
            currentLocationManual: addForm.currentLocationManual.trim(),
            complianceDate: null,
            complianceIntervalMonths: null,
            manualVerificationIntervalMonths: null,
            siVerification: buildSIVerificationPayloadFromArshin(result, detail),
            esiInternalModules:
              registryKind === "ESI"
                ? (esiAddModulesByResultId[result.vriId] ?? []).map((module) => ({
                    registryNumber: module.registryNumber,
                    measurementLimit: module.measurementLimit,
                  }))
                : [],
          };
          const equipmentItem = await createEquipment(token ?? "", payload);
          created.push({
            equipmentId: equipmentItem.id,
            equipmentName: equipmentItem.name,
            vriId: result.vriId,
          });
        } catch (error) {
          errors.push({
            vriId: result.vriId,
            message: error instanceof Error ? error.message : "Не удалось добавить запись в папку.",
          });
        }
      }

      await queryClient.invalidateQueries({ queryKey: ["equipment-items"] });
      return { created, errors };
    },
    onSuccess: (result) => {
      setAddSummary(result);
      setSelectedResultIds([]);
      setEsiAddModulesByResultId({});
      if (result.created.length > 0) {
        setAddModalOpen(false);
      }
    },
  });

  const selectableFolderOptions = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const autocompleteEquipmentItems = useMemo(
    () => autocompleteEquipmentQuery.data ?? [],
    [autocompleteEquipmentQuery.data],
  );
  const autocompleteSuggestions = useMemo(
    () =>
      buildArshinAutocompleteSuggestions(
        autocompleteEquipmentItems,
        autocompleteFolderSuggestionsQuery.data?.objectNames ?? [],
      ),
    [autocompleteEquipmentItems, autocompleteFolderSuggestionsQuery.data?.objectNames],
  );
  const dashboardFolder = useMemo(
    () =>
      selectableFolderOptions.find((folder) => folder.id === dashboardFolderId) ?? null,
    [dashboardFolderId, selectableFolderOptions],
  );
  const preferredAddFolder = useMemo(
    () => dashboardFolder ?? selectableFolderOptions[0] ?? null,
    [dashboardFolder, selectableFolderOptions],
  );
  const resolvedAddFolderId = useMemo(() => {
    if (addForm.folderId) {
      const parsedFolderId = Number(addForm.folderId);
      return Number.isInteger(parsedFolderId) && parsedFolderId > 0 ? parsedFolderId : null;
    }
    return preferredAddFolder?.id ?? null;
  }, [addForm.folderId, preferredAddFolder]);

  const addFormFolderSuggestionsQuery = useQuery({
    queryKey: ["arshin-add-form-folder-suggestions", resolvedAddFolderId ?? "none"],
    queryFn: () => fetchEquipmentFolderSuggestions(token ?? "", resolvedAddFolderId ?? 0),
    enabled: Boolean(token) && resolvedAddFolderId !== null,
    staleTime: 5 * 60 * 1000,
  });

  const addFormEquipmentQuery = useQuery({
    queryKey: ["arshin-add-form-equipment", resolvedAddFolderId ?? "none"],
    queryFn: () => fetchEquipment(token ?? "", { folderId: resolvedAddFolderId }),
    enabled: Boolean(token) && resolvedAddFolderId !== null,
    staleTime: 5 * 60 * 1000,
  });
  const addFormEquipmentItems = useMemo(
    () => addFormEquipmentQuery.data ?? [],
    [addFormEquipmentQuery.data],
  );
  const addFormSuggestions = useMemo(
    () =>
      buildArshinAddFormSuggestions(
        addFormEquipmentItems,
        addFormFolderSuggestionsQuery.data?.objectNames ?? [],
        addFormFolderSuggestionsQuery.data?.currentLocations ?? [],
        addFormFolderSuggestionsQuery.data?.measurementUnits ?? [],
      ),
    [
      addFormEquipmentItems,
      addFormFolderSuggestionsQuery.data?.currentLocations,
      addFormFolderSuggestionsQuery.data?.measurementUnits,
      addFormFolderSuggestionsQuery.data?.objectNames,
    ],
  );

  const selectedFolder = useMemo(
    () => foldersQuery.data?.find((folder) => String(folder.id) === addForm.folderId) ?? null,
    [addForm.folderId, foldersQuery.data],
  );
  const recommendedAddObjectName = useMemo(() => {
    return (
      getMostCommonObjectName(addFormEquipmentItems)
      ?? selectedFolder?.name
      ?? preferredAddFolder?.name
      ?? ""
    );
  }, [addFormEquipmentItems, preferredAddFolder?.name, selectedFolder?.name]);

  const selectedResults = useMemo(
    () => searchResults.filter((item) => selectedResultIds.includes(item.vriId)),
    [searchResults, selectedResultIds],
  );
  const esiAddModulesReady =
    registryKind !== "ESI"
    || selectedResults.every((item) => {
      const modules = esiAddModulesByResultId[item.vriId] ?? [];
      return modules.length > 0 && modules.every((module) => module.measurementLimit.trim().length > 0);
    });
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(searchResults.length / pageSize)),
    [pageSize, searchResults.length],
  );
  const pagedSearchResults = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return searchResults.slice(start, start + pageSize);
  }, [currentPage, pageSize, searchResults]);
  const visibleSelectedResultIds = useMemo(
    () =>
      pagedSearchResults
        .filter((item) => selectedResultIds.includes(item.vriId))
        .map((item) => item.vriId),
    [pagedSearchResults, selectedResultIds],
  );
  const areAllVisibleResultsSelected =
    pagedSearchResults.length > 0 && visibleSelectedResultIds.length === pagedSearchResults.length;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  function handleRegistryKindChange(nextKind: ArshinRegistryKind) {
    if (nextKind === registryKind) {
      return;
    }

    setRegistryKind(nextKind);
    setSearchForm(defaultSearchForm);
    setSearchResults([]);
    setSelectedResultIds([]);
    setPreviewVriId(null);
    setCurrentPage(1);
    setAddSummary(null);
    setAddModalOpen(false);
    setEsiAddModulesByResultId({});
    searchMutation.reset();
    prepareEsiAddMutation.reset();
    addToFolderMutation.reset();
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAddSummary(null);

    if (!activeFilterCount) {
      setSearchResults([]);
      setSelectedResultIds([]);
      setPreviewVriId(null);
      setCurrentPage(1);
      searchMutation.reset();
      return;
    }

    void searchMutation.mutateAsync(activeFilters);
  }

  function handleSearchReset() {
    setSearchForm(defaultSearchForm);
    setSearchResults([]);
    setSelectedResultIds([]);
    setPreviewVriId(null);
    setCurrentPage(1);
    setAddSummary(null);
    setEsiAddModulesByResultId({});
    searchMutation.reset();
  }

  function openAddModal() {
    if (!selectedResults.length) {
      return;
    }

    setAddForm({
      folderId: preferredAddFolder ? String(preferredAddFolder.id) : "",
      objectName: recommendedAddObjectName,
      status: "IN_WORK",
      measurementRangeStart: "",
      measurementRangeEnd: "",
      measurementUnit: "",
      currentLocationManual: "",
    });
    setAddModalOpen(true);
    setEsiAddModulesByResultId({});
    prepareEsiAddMutation.reset();
    if (registryKind === "ESI") {
      void prepareEsiAddMutation.mutateAsync(selectedResults);
    }
  }

  function closeAddModal() {
    setAddModalOpen(false);
    setEsiAddModulesByResultId({});
    prepareEsiAddMutation.reset();
    addToFolderMutation.reset();
  }

  const closePreviewModal = useCallback(() => {
    setPreviewVriId(null);
  }, []);

  const handlePreviewChange = useCallback((vriId: string) => {
    setPreviewVriId(vriId);
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const toggleResultSelection = useCallback((vriId: string) => {
    setSelectedResultIds((current) =>
      current.includes(vriId) ? current.filter((item) => item !== vriId) : [...current, vriId],
    );
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (!pagedSearchResults.length) {
      return;
    }

    setSelectedResultIds((current) =>
      areAllVisibleResultsSelected
        ? current.filter((id) => !pagedSearchResults.some((item) => item.vriId === id))
        : Array.from(new Set([...current, ...pagedSearchResults.map((item) => item.vriId)])),
    );
  }, [areAllVisibleResultsSelected, pagedSearchResults]);

  function handleFolderChange(folderId: string) {
    setAddForm((current) => ({
      ...current,
      folderId,
      objectName: "",
    }));
  }

  useEffect(() => {
    if (!addModalOpen || !recommendedAddObjectName) {
      return;
    }

    setAddForm((current) => {
      const previousObjectName = current.objectName.trim();
      const previousFallbackNames = new Set(
        [selectedFolder?.name, preferredAddFolder?.name, ""].filter(
          (value): value is string => Boolean(value),
        ),
      );
      if (previousObjectName && !previousFallbackNames.has(previousObjectName)) {
        return current;
      }
      if (previousObjectName === recommendedAddObjectName) {
        return current;
      }
      return {
        ...current,
        objectName: recommendedAddObjectName,
      };
    });
  }, [addModalOpen, preferredAddFolder?.name, recommendedAddObjectName, selectedFolder?.name]);

  async function handleAddToFolderSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await addToFolderMutation.mutateAsync();
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Аршин"
        description="Отдельный сервис поиска СИ и ЭСИ по API Аршина. Здесь можно комбинировать фильтры, просматривать найденные записи и, если действие доступно, переносить их в папки metroLog."
      />

      <section className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
        <form className="space-y-4" onSubmit={handleSearchSubmit}>
          <div className="flex flex-wrap gap-2">
            {(["SI", "ESI"] as ArshinRegistryKind[]).map((kind) => {
              const active = registryKind === kind;
              return (
                <button
                  key={kind}
                  className={[
                    "rounded-full border px-4 py-2 text-sm font-medium transition",
                    active
                      ? "border-signal-info bg-[var(--accent-soft)] text-ink"
                      : "border-line text-steel hover:border-signal-info/60 hover:text-ink",
                  ].join(" ")}
                  type="button"
                  onClick={() => handleRegistryKindChange(kind)}
                >
                  {kind === "SI" ? "СИ" : "ЭСИ"}
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <section className="tone-child rounded-2xl border border-line p-4">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Быстрый поиск</p>
                <p className="mt-1 text-sm text-steel">
                  {registryKind === "ESI"
                    ? "Поиск ЭСИ собран по структуре оригинального Аршина: общий поиск, свидетельство, номер в перечне, дата поверки и год выпуска."
                    : "Основные поля для быстрого поиска по записи, свидетельству, серийному номеру, датам и году."}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm text-steel md:col-span-2">
                  Общий поиск
                  <AutocompleteInput
                    className="form-input"
                    maxSuggestions={6}
                    placeholder={arshinPlaceholderExample.search}
                    suggestions={autocompleteSuggestions.search}
                    value={searchForm.search}
                    onChange={(value) => setSearchForm((current) => ({ ...current, search: value }))}
                  />
                </label>
                <label className="block text-sm text-steel">
                  {registryKind === "ESI" ? "Номер свидетельства" : getArshinDocumentLabel(registryKind)}
                  <AutocompleteInput
                    className="form-input"
                    maxSuggestions={6}
                    placeholder={
                      registryKind === "ESI"
                        ? arshinPlaceholderExample.certificateNumber
                        : arshinPlaceholderExample.resultDocnum
                    }
                    suggestions={
                      registryKind === "ESI"
                        ? autocompleteSuggestions.certificateNumber
                        : autocompleteSuggestions.resultDocnum
                    }
                    value={registryKind === "ESI" ? searchForm.certificateNumber : searchForm.resultDocnum}
                    onChange={(value) => setSearchForm((current) => (
                      registryKind === "ESI"
                        ? { ...current, certificateNumber: value }
                        : { ...current, resultDocnum: value }
                    ))}
                  />
                </label>
                <label className="block text-sm text-steel">
                  {registryKind === "ESI" ? "Номер в перечне" : "Заводской номер"}
                  <AutocompleteInput
                    className="form-input"
                    maxSuggestions={6}
                    placeholder={
                      registryKind === "ESI"
                        ? "73828.19.3Р.01021102"
                        : arshinPlaceholderExample.miNumber
                    }
                    suggestions={
                      registryKind === "ESI"
                        ? autocompleteSuggestions.resultDocnum
                        : autocompleteSuggestions.miNumber
                    }
                    value={registryKind === "ESI" ? searchForm.resultDocnum : searchForm.miNumber}
                    onChange={(value) => setSearchForm((current) => (
                      registryKind === "ESI"
                        ? { ...current, resultDocnum: value }
                        : { ...current, miNumber: value }
                    ))}
                  />
                </label>
                <label className="block text-sm text-steel">
                  Дата поверки
                  <DateInput
                    className="form-input"
                    placeholder={arshinPlaceholderExample.verificationDate}
                    showTodayButton={false}
                    value={searchForm.verificationDate || null}
                    onChange={(value) =>
                      setSearchForm((current) => ({
                        ...current,
                        verificationDate: value,
                      }))
                    }
                  />
                </label>
                {registryKind === "SI" ? (
                  <label className="block text-sm text-steel">
                    Действительна до
                    <DateInput
                      className="form-input"
                      placeholder={arshinPlaceholderExample.validDate}
                      showTodayButton={false}
                      value={searchForm.validDate || null}
                      onChange={(value) =>
                        setSearchForm((current) => ({
                          ...current,
                          validDate: value,
                        }))
                      }
                    />
                  </label>
                ) : null}
                <label className="block text-sm text-steel">
                  {registryKind === "ESI" ? "Год выпуска СИ" : "Год"}
                  <select
                    className="form-input"
                    value={searchForm.year}
                    onChange={(event) => setSearchForm((current) => ({ ...current, year: event.target.value }))}
                  >
                    {ARSHIN_YEAR_OPTIONS.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className="tone-child rounded-2xl border border-line p-4">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-steel">Тип и организация</p>
                <p className="mt-1 text-sm text-steel">
                  {registryKind === "ESI"
                    ? "Фильтры реестра эталонов: поверитель, тип, обозначение, заводской номер, ГПЭ и разряд."
                    : "Уточняющие поля по поверителю, типу СИ, модификации и состоянию записи."}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm text-steel">
                  Организация-поверитель
                  <AutocompleteInput
                    className="form-input"
                    maxSuggestions={6}
                    placeholder={arshinPlaceholderExample.orgTitle}
                    suggestions={autocompleteSuggestions.orgTitle}
                    value={searchForm.orgTitle}
                    onChange={(value) => setSearchForm((current) => ({ ...current, orgTitle: value }))}
                  />
                </label>
                <label className="block text-sm text-steel">
                  Регистрационный номер типа СИ
                  <AutocompleteInput
                    className="form-input"
                    maxSuggestions={6}
                    placeholder={arshinPlaceholderExample.mitNumber}
                    suggestions={autocompleteSuggestions.mitNumber}
                    value={searchForm.mitNumber}
                    onChange={(value) => setSearchForm((current) => ({ ...current, mitNumber: value }))}
                  />
                </label>
                <label className="block text-sm text-steel">
                  Наименование типа СИ
                  <AutocompleteInput
                    className="form-input"
                    maxSuggestions={6}
                    placeholder={arshinPlaceholderExample.mitTitle}
                    suggestions={autocompleteSuggestions.mitTitle}
                    value={searchForm.mitTitle}
                    onChange={(value) => setSearchForm((current) => ({ ...current, mitTitle: value }))}
                  />
                </label>
                <label className="block text-sm text-steel">
                  Обозначение типа СИ
                  <AutocompleteInput
                    className="form-input"
                    maxSuggestions={6}
                    placeholder={arshinPlaceholderExample.mitNotation}
                    suggestions={autocompleteSuggestions.mitNotation}
                    value={searchForm.mitNotation}
                    onChange={(value) => setSearchForm((current) => ({ ...current, mitNotation: value }))}
                  />
                </label>
                <label className="block text-sm text-steel">
                  Модификация СИ
                  <AutocompleteInput
                    className="form-input"
                    maxSuggestions={6}
                    placeholder={arshinPlaceholderExample.miModification}
                    suggestions={autocompleteSuggestions.miModification}
                    value={searchForm.miModification}
                    onChange={(value) => setSearchForm((current) => ({ ...current, miModification: value }))}
                  />
                </label>
                <label className="block text-sm text-steel">
                  Заводской номер
                  <AutocompleteInput
                    className="form-input"
                    maxSuggestions={6}
                    placeholder={arshinPlaceholderExample.miNumber}
                    suggestions={autocompleteSuggestions.miNumber}
                    value={searchForm.miNumber}
                    onChange={(value) => setSearchForm((current) => ({ ...current, miNumber: value }))}
                  />
                </label>
                {registryKind === "ESI" ? (
                  <>
                    <label className="block text-sm text-steel">
                      ГПЭ, к которому прослеживается СИ
                      <input
                        className="form-input"
                        placeholder="Например гэт4-91"
                        type="text"
                        value={searchForm.npeNumber}
                        onChange={(event) =>
                          setSearchForm((current) => ({ ...current, npeNumber: event.target.value }))
                        }
                      />
                    </label>
                    <label className="block text-sm text-steel">
                      Разряд эталона
                      <input
                        className="form-input"
                        placeholder="Например 4Р"
                        type="text"
                        value={searchForm.rank}
                        onChange={(event) =>
                          setSearchForm((current) => ({ ...current, rank: event.target.value }))
                        }
                      />
                    </label>
                  </>
                ) : null}
                <label className="block text-sm text-steel">
                  Пригодность
                  <select
                    className="form-input"
                    value={searchForm.applicability}
                    onChange={(event) =>
                      setSearchForm((current) => ({
                        ...current,
                        applicability: event.target.value as SearchFormState["applicability"],
                      }))
                    }
                  >
                    <option value="ANY">Любая</option>
                    <option value="TRUE">Только пригодные</option>
                    <option value="FALSE">Только непригодные</option>
                  </select>
                </label>
              </div>
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="btn-primary btn-primary--compact disabled:opacity-60"
                disabled={!activeFilterCount || searchMutation.isPending}
                type="submit"
              >
                {searchMutation.isPending ? "Ищем..." : registryKind === "ESI" ? "Найти ЭСИ" : "Найти в Аршине"}
              </button>
              <button className="btn-secondary btn-primary--compact disabled:opacity-60" type="button" onClick={handleSearchReset}>
                Очистить фильтры
              </button>
              {canAddFromArshin ? (
                <button
                  className="btn-accent btn-primary--compact disabled:opacity-60"
                  disabled={
                    selectedResults.length === 0
                    || foldersQuery.isLoading
                    || !foldersQuery.data?.length
                  }
                  type="button"
                  onClick={openAddModal}
                >
                  Добавить в папку
                </button>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-steel">
              <span className="toolbar-badge">
                {dashboardFolder
                  ? `Подсказки: ${dashboardFolder.name}`
                  : "Подсказки отключены: папка не указана"}
              </span>
              <span className="toolbar-badge">Активных фильтров: {activeFilterCount}</span>
              <span className="toolbar-badge">Найдено: {searchResults.length}</span>
              {canAddFromArshin ? (
                <span className="toolbar-badge">Отмечено: {selectedResults.length}</span>
              ) : null}
            </div>
          </div>
        </form>

        {searchResults.length >= 200 ? (
          <div className="mt-4">
            <span className="toolbar-badge text-[#8c6a2b]">
              Показана первая часть выдачи. Уточни фильтры для более точного списка.
            </span>
          </div>
        ) : null}

        {searchMutation.isError ? (
          <p className="mt-4 text-sm text-[#b04c43]">
            {getArshinErrorMessage(searchMutation.error, "Не удалось выполнить поиск в Аршине.")}
          </p>
        ) : null}

        {searchMutation.isSuccess && searchResults.length === 0 ? (
          <p className="mt-4 text-sm text-steel">
            {registryKind === "ESI"
              ? "По заданным фильтрам записи ЭСИ не найдены."
              : "По заданным фильтрам записи не найдены."}
          </p>
        ) : null}
      </section>

      {addSummary ? (
        <section className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-ink">Результат добавления</h2>
            <div className="flex gap-2 text-xs text-steel">
              <span className="rounded-full border border-line px-3 py-1">Создано: {addSummary.created.length}</span>
              <span className="rounded-full border border-line px-3 py-1">Ошибок: {addSummary.errors.length}</span>
            </div>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="space-y-2">
              {addSummary.created.length ? (
                addSummary.created.map((item) => (
                  <Link
                    key={item.vriId}
                    className="block rounded-2xl border border-line px-4 py-3 text-sm text-ink transition hover:border-signal-info"
                    to={`/equipment/${item.equipmentId}`}
                  >
                    <div className="font-semibold">{item.equipmentName}</div>
                    <div className="mt-1 text-xs text-steel">vri_id: {item.vriId}</div>
                  </Link>
                ))
              ) : (
                <div className="rounded-2xl border border-line px-4 py-3 text-sm text-steel">
                  Новые приборы не были созданы.
                </div>
              )}
            </div>
            <div className="space-y-2">
              {addSummary.errors.length ? (
                addSummary.errors.map((item) => (
                  <div
                    key={`${item.vriId}-${item.message}`}
                    className="rounded-2xl border border-[#ead2cf] bg-[#fff7f6] px-4 py-3 text-sm text-[#8f443d]"
                  >
                    <div className="font-semibold">vri_id: {item.vriId}</div>
                    <div className="mt-1">{item.message}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-line px-4 py-3 text-sm text-steel">
                  Ошибок при добавлении не было.
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      <ArshinResultsTable
        areAllVisibleResultsSelected={areAllVisibleResultsSelected}
        canSelectRows={canAddFromArshin}
        currentPage={currentPage}
        pageSize={pageSize}
        pagedSearchResults={pagedSearchResults}
        previewVriId={previewVriId}
        registryKind={registryKind}
        searchResultsLength={searchResults.length}
        selectedResultIds={selectedResultIds}
        onPageChange={handlePageChange}
        onPreviewChange={handlePreviewChange}
        onToggleResultSelection={toggleResultSelection}
        onToggleSelectAll={toggleSelectAll}
      />

      <Modal
        description={
          previewResult
            ? (
                registryKind === "ESI"
                  ? `${previewResult.resultDocnum ?? "ЭСИ"}`
                  : `${previewResult.mitTitle ?? "СИ без наименования"} · id: ${previewResult.vriId}`
              )
            : registryKind === "ESI"
              ? "Сведения об эталоне."
              : "Подробная информация по выбранной записи Аршина."
        }
        open={Boolean(previewVriId)}
        title={registryKind === "ESI" ? "Сведения об эталоне" : "Детальная информация"}
        onClose={closePreviewModal}
      >
        {previewQuery.isFetching ? (
          <div className="rounded-2xl border border-line px-4 py-3 text-sm text-steel">
            {registryKind === "ESI" ? "Загружаем сведения об эталоне..." : "Загружаем детали записи..."}
          </div>
        ) : null}

        {previewQuery.isError ? (
          <p className="text-sm text-[#b04c43]">
            {getArshinErrorMessage(
              previewQuery.error,
              registryKind === "ESI"
                ? "Не удалось загрузить сведения об эталоне."
                : "Не удалось загрузить детальную запись Аршина.",
            )}
          </p>
        ) : null}

        {previewResult ? (
          <ArshinDetailCard
            detail={registryKind === "SI" ? (previewQuery.data ?? null) : null}
            registryKind={registryKind}
            result={previewResult}
          />
        ) : null}
      </Modal>

      <Modal
        description={
          selectedResults.length
            ? `Выбрано ${selectedResults.length} ${getRecordsLabel(selectedResults.length)}. После подтверждения записи будут созданы в выбранной папке как ${registryKind}.`
            : "Сначала отметь записи из таблицы."
        }
        open={addModalOpen}
        title={registryKind === "ESI" ? "Добавить ЭСИ в папку" : "Добавить СИ в папку"}
        onClose={closeAddModal}
      >
        <form className="space-y-4" onSubmit={(event) => void handleAddToFolderSubmit(event)}>
          <label className="block text-sm text-steel">
            Папка
            <select
              className="form-input"
              value={addForm.folderId}
              onChange={(event) => handleFolderChange(event.target.value)}
            >
              <option value="">Выбери папку</option>
              {selectableFolderOptions.map((folder: EquipmentFolder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm text-steel">
              Объект
              <AutocompleteInput
                className="form-input"
                maxSuggestions={6}
                suggestions={addFormSuggestions.objectNames}
                value={addForm.objectName}
                onChange={(value) => setAddForm((current) => ({ ...current, objectName: value }))}
              />
            </label>
            <label className="block text-sm text-steel">
              Статус
              <select
                className="form-input"
                value={addForm.status}
                onChange={(event) =>
                  setAddForm((current) => ({
                    ...current,
                    status: event.target.value as EquipmentStatus,
                  }))
                }
              >
                {(Object.keys(equipmentStatusLabels) as EquipmentStatus[]).map((status) => (
                  <option key={status} value={status}>
                    {equipmentStatusLabels[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {registryKind === "SI" ? (
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(180px,0.8fr)]">
              <label className="block text-sm text-steel">
                Диапазон измерения от
                <input
                  className="form-input"
                  type="text"
                  value={addForm.measurementRangeStart}
                  onChange={(event) =>
                    setAddForm((current) => ({
                      ...current,
                      measurementRangeStart: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-sm text-steel">
                Диапазон измерения до
                <input
                  className="form-input"
                  type="text"
                  value={addForm.measurementRangeEnd}
                  onChange={(event) =>
                    setAddForm((current) => ({
                      ...current,
                      measurementRangeEnd: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="block text-sm text-steel">
                Единица измерения
                <AutocompleteInput
                  className="form-input"
                  maxSuggestions={6}
                  suggestions={addFormSuggestions.measurementUnits}
                  value={addForm.measurementUnit}
                  onChange={(value) =>
                    setAddForm((current) => ({
                      ...current,
                      measurementUnit: value,
                    }))
                  }
                />
              </label>
            </div>
          ) : null}

          {registryKind === "ESI" ? (
            <section className="tone-parent space-y-3 rounded-3xl border border-line p-4">
              <div>
                <h3 className="text-sm font-semibold text-ink">Внутренние модули выбранных ЭСИ</h3>
                <p className="mt-1 text-xs text-steel">
                  Для каждого найденного модуля укажи предел измерения одной строкой.
                </p>
              </div>
              {prepareEsiAddMutation.isPending ? (
                <p className="text-sm text-steel">Загружаем состав выбранных ЭСИ...</p>
              ) : null}
              {prepareEsiAddMutation.isError ? (
                <p className="text-sm text-[#b04c43]">
                  {prepareEsiAddMutation.error instanceof Error
                    ? prepareEsiAddMutation.error.message
                    : "Не удалось загрузить состав выбранных ЭСИ."}
                </p>
              ) : null}
              {selectedResults.map((result) => {
                const modules = esiAddModulesByResultId[result.vriId] ?? [];
                return (
                  <article key={`esi-add-${result.vriId}`} className="rounded-2xl border border-line px-4 py-3">
                    <div className="font-semibold text-ink">
                      {result.mitTitle ?? "ЭСИ"}
                    </div>
                    <div className="mt-1 text-xs text-steel">
                      {[result.miModification, result.miNumber, result.resultDocnum]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {modules.length ? (
                      <div className="mt-3 space-y-3">
                        {modules.map((module, moduleIndex) => (
                          <div
                            key={`${result.vriId}-${module.registryNumber}-${moduleIndex}`}
                            className="rounded-2xl border border-line px-4 py-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-ink">
                                  {module.title ?? "Модуль ЭСИ"}
                                  {module.selected ? " · основной" : ""}
                                </div>
                                <div className="mt-1 text-xs text-steel">
                                  {[module.registryNumber, module.rank, module.modification, module.serialNumber]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </div>
                                <div className="mt-1 text-xs text-steel">
                                  {[module.verificationDate, module.validUntil, module.certificateNumber]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </div>
                              </div>
                              <label className="block min-w-[280px] text-sm text-steel">
                                Предел измерения
                                <input
                                  className="form-input"
                                  type="text"
                                  value={module.measurementLimit}
                                  onChange={(event) =>
                                    setEsiAddModulesByResultId((current) => ({
                                      ...current,
                                      [result.vriId]: (current[result.vriId] ?? []).map((item, itemIndex) =>
                                        itemIndex === moduleIndex
                                          ? { ...item, measurementLimit: event.target.value }
                                          : item,
                                      ),
                                    }))
                                  }
                                />
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : prepareEsiAddMutation.isPending ? null : (
                      <p className="mt-3 text-sm text-steel">
                        Для этой записи не удалось определить внутренние модули.
                      </p>
                    )}
                  </article>
                );
              })}
            </section>
          ) : null}

          <label className="block text-sm text-steel">
            Текущее местоположение
            <AutocompleteInput
              className="form-input"
              maxSuggestions={6}
              suggestions={addFormSuggestions.currentLocations}
              value={addForm.currentLocationManual}
              onChange={(value) =>
                setAddForm((current) => ({
                  ...current,
                  currentLocationManual: value,
                }))
              }
            />
          </label>

          {selectedFolder ? (
            <div className="rounded-2xl border border-line px-4 py-3 text-sm text-steel">
              Записи будут добавлены в папку <span className="font-semibold text-ink">{selectedFolder.name}</span>.
            </div>
          ) : null}

          {addToFolderMutation.isError ? (
            <p className="text-sm text-[#b04c43]">{addToFolderMutation.error.message}</p>
          ) : null}

          {registryKind === "ESI" && !prepareEsiAddMutation.isPending && !esiAddModulesReady ? (
            <p className="text-sm text-steel">
              Для добавления ЭСИ заполни предел измерения у каждого найденного внутреннего модуля.
            </p>
          ) : null}

          <div className="flex justify-end">
            <button
              className="btn-primary disabled:opacity-60"
              disabled={
                addToFolderMutation.isPending
                || prepareEsiAddMutation.isPending
                || !addForm.folderId
                || !addForm.objectName.trim()
                || selectedResults.length === 0
                || !esiAddModulesReady
              }
              type="submit"
            >
              {addToFolderMutation.isPending ? "Добавляем..." : "Подтвердить"}
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}

const ArshinResultsTable = memo(function ArshinResultsTable({
  areAllVisibleResultsSelected,
  canSelectRows,
  currentPage,
  pageSize,
  pagedSearchResults,
  previewVriId,
  registryKind,
  searchResultsLength,
  selectedResultIds,
  onPageChange,
  onPreviewChange,
  onToggleResultSelection,
  onToggleSelectAll,
}: {
  areAllVisibleResultsSelected: boolean;
  canSelectRows: boolean;
  currentPage: number;
  pageSize: number;
  pagedSearchResults: ArshinSearchResult[];
  previewVriId: string | null;
  registryKind: ArshinRegistryKind;
  searchResultsLength: number;
  selectedResultIds: string[];
  onPageChange: (page: number) => void;
  onPreviewChange: (vriId: string) => void;
  onToggleResultSelection: (vriId: string) => void;
  onToggleSelectAll: () => void;
}) {
  const colSpan = canSelectRows
    ? registryKind === "ESI" ? 14 : 9
    : registryKind === "ESI" ? 13 : 8;
  const hasPagination = searchResultsLength > pageSize;

  return (
    <section className="tone-parent overflow-hidden rounded-3xl border border-line shadow-panel">
      {hasPagination ? (
        <div className="border-b border-line px-4 py-3">
          <PaginationControls
            currentPage={currentPage}
            pageSize={pageSize}
            totalItems={searchResultsLength}
            onPageChange={onPageChange}
          />
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className={registryKind === "ESI" ? "min-w-[1680px] w-full table-auto" : "min-w-[1320px] w-full table-auto"}>
          <thead>
            <tr className="tone-child text-left text-xs uppercase tracking-[0.16em] text-steel">
              {canSelectRows ? (
                <th className="w-10 px-3 py-2 font-medium">
                  <input
                    aria-label="Выбрать все записи Аршина"
                    checked={areAllVisibleResultsSelected}
                    disabled={!pagedSearchResults.length}
                    className="h-4 w-4 accent-[var(--accent)]"
                    type="checkbox"
                    onChange={onToggleSelectAll}
                  />
                </th>
              ) : null}
              {registryKind === "ESI" ? (
                <>
                  <th className="w-[180px] px-3 py-2 font-medium">Номер в перечне</th>
                  <th className="w-[260px] px-3 py-2 font-medium">Организация-поверитель</th>
                  <th className="w-[160px] px-3 py-2 font-medium">Рег. номер типа СИ</th>
                  <th className="w-[240px] px-3 py-2 font-medium">Наименование типа СИ</th>
                  <th className="w-[200px] px-3 py-2 font-medium">Обозначение типа СИ</th>
                  <th className="w-[200px] px-3 py-2 font-medium">Модификация СИ</th>
                  <th className="w-[150px] px-3 py-2 font-medium">Заводской номер</th>
                  <th className="w-[130px] px-3 py-2 font-medium">Год выпуска СИ</th>
                  <th className="w-[180px] px-3 py-2 font-medium">ГПЭ, к которому прослеживается СИ</th>
                  <th className="w-[140px] px-3 py-2 font-medium">Разряд эталона</th>
                  <th className="w-[142px] px-3 py-2 font-medium">Дата поверки</th>
                  <th className="w-[120px] px-3 py-2 font-medium">Пригодность</th>
                </>
              ) : (
                <>
                  <th className="w-[250px] px-3 py-2 font-medium">Запись</th>
                  <th className="w-[230px] px-3 py-2 font-medium">Тип</th>
                  <th className="w-[150px] px-3 py-2 font-medium">Заводской номер</th>
                  <th className="w-[210px] px-3 py-2 font-medium">{getArshinDocumentLabel(registryKind)}</th>
                  <th className="w-[280px] px-3 py-2 font-medium">Организация</th>
                  <th className="w-[142px] px-3 py-2 font-medium">Дата поверки</th>
                  <th className="w-[142px] px-3 py-2 font-medium">Действительна до</th>
                </>
              )}
              <th className="w-[160px] px-3 py-2 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {pagedSearchResults.length ? (
              pagedSearchResults.map((item, index) => {
                const isSelected = selectedResultIds.includes(item.vriId);
                const isPreviewed = previewVriId === item.vriId;
                const rowClassName = [
                  index % 2 === 0 ? "tone-parent" : "tone-child",
                  "text-sm text-ink",
                  isSelected && isPreviewed
                    ? "bg-[color:var(--accent-soft)]/70"
                    : isSelected || isPreviewed
                      ? "bg-[color:var(--accent-soft)]/45"
                      : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <tr key={item.vriId} className={rowClassName}>
                    {canSelectRows ? (
                      <td className="w-10 px-3 py-3 align-top">
                        <input
                          aria-label={`Выбрать ${item.mitTitle ?? item.vriId}`}
                          checked={isSelected}
                          className="mt-1 h-4 w-4 accent-[var(--accent)]"
                          type="checkbox"
                          onChange={() => onToggleResultSelection(item.vriId)}
                        />
                      </td>
                    ) : null}
                    {registryKind === "ESI" ? (
                      <>
                        <td className="px-3 py-3 align-top font-mono text-xs text-ink">
                          {item.resultDocnum ?? "—"}
                        </td>
                        <td className="px-3 py-3 align-top text-steel">{item.orgTitle ?? "—"}</td>
                        <td className="px-3 py-3 align-top text-steel">{item.mitNumber ?? "—"}</td>
                        <td className="px-3 py-3 align-top text-steel">{item.mitTitle ?? "—"}</td>
                        <td className="px-3 py-3 align-top text-steel">{item.mitNotation ?? "—"}</td>
                        <td className="px-3 py-3 align-top text-steel">{item.miModification ?? "—"}</td>
                        <td className="px-3 py-3 align-top text-steel">{item.miNumber ?? "—"}</td>
                        <td className="px-3 py-3 align-top text-steel">{getArshinRawYear(item) ?? "—"}</td>
                        <td className="px-3 py-3 align-top text-steel">{getArshinRawString(item, "npenumber") ?? "—"}</td>
                        <td className="px-3 py-3 align-top text-steel">{formatEsiRank(item) ?? "—"}</td>
                        <td className="px-3 py-3 align-top text-steel">{formatDate(item.verificationDate)}</td>
                        <td className="px-3 py-3 align-top text-steel">{formatApplicability(item.applicability)}</td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-3 align-top">
                          <div className="font-medium text-ink">
                            {item.mitTitle ?? "СИ без наименования"}
                          </div>
                          <div className="mt-1 text-xs text-steel">id записи: {item.vriId}</div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="text-steel">{item.mitNumber ?? "—"}</div>
                          <div className="mt-1 text-xs text-steel">
                            {joinValues(item.mitNotation, item.miModification) ?? "—"}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top text-steel">{item.miNumber ?? "—"}</td>
                        <td className="px-3 py-3 align-top text-steel">{item.resultDocnum ?? "—"}</td>
                        <td className="px-3 py-3 align-top text-steel">{item.orgTitle ?? "—"}</td>
                        <td className="px-3 py-3 align-top text-steel">{formatDate(item.verificationDate)}</td>
                        <td className="px-3 py-3 align-top text-steel">{formatDate(item.validDate)}</td>
                      </>
                    )}
                    <td className="px-3 py-3 align-top">
                      <div className="icon-action-row">
                        <IconActionButton
                          icon={<Icon className="h-4 w-4" name="details" />}
                          label="Подробнее"
                          size="tiny"
                          onClick={() => onPreviewChange(item.vriId)}
                        />
                        {item.arshinUrl ? (
                          <IconActionLink
                            href={item.arshinUrl}
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
                );
              })
            ) : (
              <tr>
                <td className="px-4 py-10 text-center text-sm text-steel" colSpan={colSpan}>
                  Заполни хотя бы один фильтр, чтобы получить список записей Аршина.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {hasPagination ? (
        <div className="border-t border-line px-4 py-3">
          <PaginationControls
            currentPage={currentPage}
            pageSize={pageSize}
            totalItems={searchResultsLength}
            onPageChange={onPageChange}
          />
        </div>
      ) : null}
    </section>
  );
});

function ArshinDetailCard({
  detail,
  registryKind,
  result,
}: {
  detail: ArshinVriDetail | null;
  registryKind: ArshinRegistryKind;
  result: ArshinSearchResult | null;
}) {
  if (registryKind === "ESI") {
    return <ArshinESIDetailCard detail={detail} result={result} />;
  }

  const raw = ((detail?.rawPayloadJson ?? result?.rawPayloadJson) ?? {}) as Record<string, unknown>;
  const detailDocumentValue =
    detail?.certificateNumber ?? result?.resultDocnum ?? "—";
  const summaryFields: Array<[string, string]> =
    detail
      ? [
          [getArshinDocumentLabel(registryKind), detailDocumentValue],
          ["Организация", detail.organization ?? result?.orgTitle ?? "—"],
          ["Номер типа", detail.regNumber ?? result?.mitNumber ?? "—"],
          ["Тип СИ", detail.typeName ?? result?.mitTitle ?? "—"],
          ["Обозначение", detail.typeDesignation ?? result?.mitNotation ?? "—"],
          ["Модификация", detail.modification ?? result?.miModification ?? "—"],
          ["Заводской номер", detail.serialNumber ?? result?.miNumber ?? "—"],
          ["Год выпуска", detail.manufactureYear ? String(detail.manufactureYear) : "—"],
          ["Владелец", detail.ownerName ?? "—"],
          ["Тип поверки", detail.verificationType ?? "—"],
          ["Дата поверки", formatDate(detail.verificationDate)],
          ["Действительна до", formatDate(detail.validUntil)],
          ["Документ", detail.documentTitle ?? "—"],
          ["Пригодность", formatApplicability(detail.isUsable)],
        ]
      : [
          [getArshinDocumentLabel(registryKind), result?.resultDocnum ?? "—"],
          ["Организация", result?.orgTitle ?? "—"],
          ["Номер типа", result?.mitNumber ?? "—"],
          ["Тип СИ", result?.mitTitle ?? "—"],
          ["Обозначение", result?.mitNotation ?? "—"],
          ["Модификация", result?.miModification ?? "—"],
          ["Заводской номер", result?.miNumber ?? "—"],
          ["Год выпуска", typeof raw.year === "number" ? String(raw.year) : "—"],
          ["Дата поверки", formatDate(result?.verificationDate ?? null)],
          ["Действительна до", formatDate(result?.validDate ?? null)],
          ["Пригодность", formatApplicability(result?.applicability ?? null)],
        ];

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        {summaryFields.map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-line px-4 py-3">
            <div className="text-xs uppercase tracking-[0.18em] text-steel">{label}</div>
            <div className="mt-2 text-sm text-ink">{value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-2xl border border-line px-4 py-3">
          <div className="text-sm font-semibold text-ink">Отметки и признаки</div>
          <dl className="mt-3 space-y-2 text-sm text-steel">
            <div className="flex items-center justify-between gap-4">
              <dt>Шифр знака</dt>
              <dd className="text-ink">{detail?.verificationMarkCipher ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Знак в паспорте</dt>
              <dd className="text-ink">{formatApplicability(detail?.passportMark ?? null)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Знак на СИ</dt>
              <dd className="text-ink">{formatApplicability(detail?.deviceMark ?? null)}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt>Сокращенная область</dt>
              <dd className="text-ink">{formatApplicability(detail?.reducedScope ?? null)}</dd>
            </div>
          </dl>
        </article>

        <article className="rounded-2xl border border-line px-4 py-3">
          <div className="text-sm font-semibold text-ink">Ссылки и действия</div>
          <div className="mt-3 flex flex-wrap gap-3">
            {(detail?.arshinUrl ?? result?.arshinUrl) ? (
              <a
                className="text-sm font-semibold text-signal-info hover:underline"
                href={detail?.arshinUrl ?? result?.arshinUrl ?? undefined}
                rel="noreferrer"
                target="_blank"
              >
                Открыть запись в Аршине
              </a>
            ) : (
              <span className="text-sm text-steel">Прямая ссылка на запись не предоставлена API.</span>
            )}
          </div>
        </article>
      </div>

      {detail?.etalonLines.length ? (
        <article className="rounded-2xl border border-line px-4 py-3">
          <div className="text-sm font-semibold text-ink">Эталоны</div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-steel">
            {detail.etalonLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </article>
      ) : null}

      {detail?.meansLines.length ? (
        <article className="rounded-2xl border border-line px-4 py-3">
          <div className="text-sm font-semibold text-ink">Средства поверки</div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-steel">
            {detail.meansLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </article>
      ) : null}
    </div>
  );
}

function ArshinESIDetailCard({
  detail,
  result,
}: {
  detail: ArshinVriDetail | null;
  result: ArshinSearchResult | null;
}) {
  const raw = ((detail?.rawPayloadJson ?? result?.rawPayloadJson) ?? {}) as Record<string, unknown>;
  const verificationRows = buildArshinEsiVerificationRows(raw);
  const summaryFields: Array<[string, string]> = [
    ["Номер в перечне", result?.resultDocnum ?? getArshinRawString(result, "number") ?? "—"],
    ["Регистрационный номер типа СИ", detail?.regNumber ?? result?.mitNumber ?? "—"],
    ["Наименование типа СИ", detail?.typeName ?? result?.mitTitle ?? "—"],
    ["Обозначение типа СИ", detail?.typeDesignation ?? result?.mitNotation ?? "—"],
    ["Модификация СИ", detail?.modification ?? result?.miModification ?? "—"],
    ["Заводской номер", detail?.serialNumber ?? result?.miNumber ?? "—"],
    ["Год выпуска СИ", detail?.manufactureYear ? String(detail.manufactureYear) : getArshinRawYear(result) ?? "—"],
    ["Поверочная схема", getArshinRawString(result, "schematype") ?? "—"],
    ["Наименование", getArshinRawString(result, "schematitle") ?? "—"],
    ["ГПЭ, к которому прослеживается СИ", getArshinRawString(result, "npenumber") ?? "—"],
    ["Разряд эталона", formatEsiRank(result) ?? "—"],
    ["Пригодность", formatApplicability(detail?.isUsable ?? result?.applicability ?? null)],
  ];

  return (
    <div className="mt-4 space-y-4">
      <article className="rounded-2xl border border-line px-4 py-3">
        <div className="text-sm font-semibold text-ink">СИ, применяемые в качестве эталонов</div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {summaryFields.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-line px-4 py-3">
              <div className="text-xs uppercase tracking-[0.18em] text-steel">{label}</div>
              <div className="mt-2 text-sm text-ink">{value}</div>
            </div>
          ))}
        </div>
      </article>

      <section className="rounded-2xl border border-line px-4 py-3">
        <div className="text-sm font-semibold text-ink">Сведения о поверках</div>
        {verificationRows.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-[980px] table-auto border-collapse text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-steel">
                <tr>
                  <th className="border-b border-line px-3 py-2 font-medium">Организация-поверитель</th>
                  <th className="border-b border-line px-3 py-2 font-medium">Дата поверки</th>
                  <th className="border-b border-line px-3 py-2 font-medium">Действительна до</th>
                  <th className="border-b border-line px-3 py-2 font-medium">Номер свидетельства</th>
                  <th className="border-b border-line px-3 py-2 font-medium">Пригодность</th>
                </tr>
              </thead>
              <tbody>
                {verificationRows.map((row, index) => (
                  <tr key={`${row.certificateNumber ?? "certificate"}-${index}`}>
                    <td className="border-b border-line px-3 py-2 text-xs text-ink">
                      {row.organization ?? detail?.organization ?? result?.orgTitle ?? "—"}
                    </td>
                    <td className="border-b border-line px-3 py-2 text-xs text-ink">{row.verificationDate ?? "—"}</td>
                    <td className="border-b border-line px-3 py-2 text-xs text-ink">{row.validUntil ?? "—"}</td>
                    <td className="border-b border-line px-3 py-2 font-mono text-xs text-ink">
                      {row.certificateNumber ?? "—"}
                    </td>
                    <td className="border-b border-line px-3 py-2 text-xs text-ink">{row.applicability ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-3 text-sm text-steel">
            Детальные сведения о поверках для этого эталона пока не загружены.
          </div>
        )}
      </section>
    </div>
  );
}

function buildSearchFilters(
  form: SearchFormState,
  registryKind: ArshinRegistryKind,
): ArshinSearchFilters {
  return {
    registryKind,
    search: form.search,
    orgTitle: form.orgTitle,
    mitNumber: form.mitNumber,
    mitTitle: form.mitTitle,
    mitNotation: form.mitNotation,
    miModification: form.miModification,
    miNumber: form.miNumber,
    npeNumber: form.npeNumber,
    rank: form.rank,
    certificateNumber: form.certificateNumber,
    resultDocnum: form.resultDocnum,
    applicability:
      form.applicability === "TRUE" ? true : form.applicability === "FALSE" ? false : null,
    verificationDate: form.verificationDate,
    validDate: form.validDate,
    year: form.year.trim() ? Number(form.year) : null,
  };
}

function buildArshinYearOptions(currentYear: number, minYear: number): string[] {
  if (!Number.isFinite(currentYear) || currentYear <= minYear) {
    return [String(minYear)];
  }

  return Array.from({ length: currentYear - minYear + 1 }, (_, index) => String(currentYear - index));
}

function buildArshinAutocompleteSuggestions(
  equipmentItems: EquipmentItem[],
  objectNames: string[],
): ArshinAutocompleteSuggestions {
  return {
    search: sortAutocompleteSuggestions([
      ...objectNames,
      ...equipmentItems.flatMap((item) => [
        item.objectName,
        item.name,
        item.modification,
        item.serialNumber,
        item.siVerification?.orgTitle ?? null,
        item.siVerification?.mitNumber ?? null,
        item.siVerification?.mitTitle ?? null,
        item.siVerification?.mitNotation ?? null,
        item.siVerification?.miNumber ?? null,
        item.siVerification?.resultDocnum ?? null,
        extractEquipmentCertificateNumber(item),
      ]),
    ]),
    certificateNumber: sortAutocompleteSuggestions(
      equipmentItems.map((item) => extractEquipmentCertificateNumber(item)),
    ),
    resultDocnum: sortAutocompleteSuggestions(
      equipmentItems.map((item) => item.siVerification?.resultDocnum ?? null),
    ),
    miNumber: sortAutocompleteSuggestions(
      equipmentItems.flatMap((item) => [item.serialNumber, item.siVerification?.miNumber ?? null]),
    ),
    orgTitle: sortAutocompleteSuggestions(
      equipmentItems.map((item) => item.siVerification?.orgTitle ?? null),
    ),
    mitNumber: sortAutocompleteSuggestions(
      equipmentItems.map((item) => item.siVerification?.mitNumber ?? null),
    ),
    mitTitle: sortAutocompleteSuggestions(
      equipmentItems.flatMap((item) => [item.name, item.siVerification?.mitTitle ?? null]),
    ),
    mitNotation: sortAutocompleteSuggestions(
      equipmentItems.map((item) => item.siVerification?.mitNotation ?? null),
    ),
    miModification: sortAutocompleteSuggestions(
      equipmentItems.map((item) => item.modification),
    ),
  };
}

function buildArshinAddFormSuggestions(
  equipmentItems: EquipmentItem[],
  objectNames: string[],
  currentLocations: string[],
  measurementUnits: string[],
): ArshinAddFormSuggestions {
  return {
    objectNames: sortAutocompleteSuggestions([
      ...objectNames,
      ...equipmentItems.map((item) => item.objectName),
    ]),
    currentLocations: sortAutocompleteSuggestions([
      ...currentLocations,
      ...equipmentItems.map((item) => item.currentLocationManual),
    ]),
    measurementUnits: sortAutocompleteSuggestions([
      ...measurementUnits,
      ...equipmentItems.map((item) => item.measurementUnit),
    ]),
  };
}

function getMostCommonObjectName(equipmentItems: EquipmentItem[]): string | null {
  const counts = new Map<string, number>();
  for (const item of equipmentItems) {
    const normalizedName = item.objectName.trim();
    if (!normalizedName) {
      continue;
    }
    counts.set(normalizedName, (counts.get(normalizedName) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => {
      if (left[1] !== right[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0], "ru-RU", { sensitivity: "base" });
    })[0]?.[0] ?? null;
}

function countActiveFilters(filters: ArshinSearchFilters): number {
  const values = [
    filters.search,
    filters.orgTitle,
    filters.mitNumber,
    filters.mitTitle,
    filters.mitNotation,
    filters.miModification,
    filters.miNumber,
    filters.npeNumber,
    filters.rank,
    filters.certificateNumber,
    filters.resultDocnum,
    filters.verificationDate,
    filters.validDate,
  ];

  let count = values.filter((value) => Boolean(value?.trim())).length;
  if (typeof filters.applicability === "boolean") {
    count += 1;
  }
  if (typeof filters.year === "number" && Number.isFinite(filters.year)) {
    count += 1;
  }
  return count;
}

function getArshinRawString(
  result: ArshinSearchResult | null,
  key: string,
): string | null {
  const value = result?.rawPayloadJson?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getArshinRawYear(result: ArshinSearchResult | null): string | null {
  const year = result?.rawPayloadJson?.year;
  return typeof year === "number" && Number.isFinite(year) ? String(year) : null;
}

function formatEsiRank(result: ArshinSearchResult | null): string | null {
  const code = getArshinRawString(result, "rankcode");
  const title = getArshinRawString(result, "rankclass");
  if (code && title) {
    return `${code}${title.startsWith(code) ? "" : ` · ${title}`}`;
  }
  return code ?? title;
}

function buildArshinEsiVerificationRows(
  raw: Record<string, unknown>,
): Array<{
  certificateNumber: string | null;
  organization: string | null;
  verificationDate: string;
  validUntil: string;
  applicability: string;
}> {
  const items = Array.isArray(raw.metrolog_related_esi_verification_records)
    ? raw.metrolog_related_esi_verification_records
    : [];

  return items
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const record = item as Record<string, unknown>;
      return {
        certificateNumber: getStringValue(record.certificate_number),
        organization: getStringValue(record.organization),
        verificationDate: formatDate(getStringValue(record.verification_date)),
        validUntil: formatDate(getStringValue(record.valid_date)),
        applicability: formatApplicability(getBooleanValue(record.applicability)),
      };
    })
    .filter((item): item is {
      certificateNumber: string | null;
      organization: string | null;
      verificationDate: string;
      validUntil: string;
      applicability: string;
    } => item !== null);
}

function getStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getBooleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  return normalizeRuDate(value) ?? value;
}

function extractEquipmentCertificateNumber(item: EquipmentItem): string | null {
  const detail = item.siVerification?.detailPayloadJson;
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
    return null;
  }
  const vriInfo = (detail as Record<string, unknown>).vriInfo;
  if (!vriInfo || typeof vriInfo !== "object" || Array.isArray(vriInfo)) {
    return null;
  }
  const applicable = (vriInfo as Record<string, unknown>).applicable;
  if (applicable && typeof applicable === "object" && !Array.isArray(applicable)) {
    const certificate = (applicable as Record<string, unknown>).certNum;
    return typeof certificate === "string" && certificate.trim() ? certificate.trim() : null;
  }
  return null;
}

function normalizeRuDate(value: string): string | null {
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

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("ru-RU").format(date);
}

function formatApplicability(value: boolean | null): string {
  if (value === true) {
    return "Пригодно";
  }
  if (value === false) {
    return "Непригодно";
  }
  return "—";
}

function joinValues(...values: Array<string | null>): string | null {
  const normalized = values.filter((value): value is string => Boolean(value?.trim()));
  return normalized.length ? normalized.join(" / ") : null;
}

function getRecordsLabel(count: number): string {
  const remainder100 = count % 100;
  const remainder10 = count % 10;

  if (remainder100 >= 11 && remainder100 <= 14) {
    return "записей";
  }

  if (remainder10 === 1) {
    return "запись";
  }

  if (remainder10 >= 2 && remainder10 <= 4) {
    return "записи";
  }

  return "записей";
}
