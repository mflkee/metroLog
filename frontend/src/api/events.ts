import { ApiError, apiBaseUrl, apiRequest } from "@/api/client";

export type EventCategory = "EQUIPMENT" | "REPAIR" | "VERIFICATION";

type RawEventLog = {
  id: number;
  category: EventCategory;
  action: string;
  title: string;
  description: string | null;
  user_id: number | null;
  user_display_name: string;
  equipment_id: number | null;
  equipment_name: string | null;
  equipment_modification: string | null;
  equipment_serial_number: string | null;
  folder_id: number | null;
  folder_name: string | null;
  batch_key: string | null;
  event_date: string;
  created_at: string;
};

export type EventLogItem = {
  id: number;
  category: EventCategory;
  action: string;
  title: string;
  description: string | null;
  userId: number | null;
  userDisplayName: string;
  equipmentId: number | null;
  equipmentName: string | null;
  equipmentModification: string | null;
  equipmentSerialNumber: string | null;
  folderId: number | null;
  folderName: string | null;
  batchKey: string | null;
  eventDate: string;
  createdAt: string;
};

type FetchEventsParams = {
  query?: string;
  category?: EventCategory | null;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
};

export async function fetchEvents(
  token: string,
  params: FetchEventsParams = {},
): Promise<EventLogItem[]> {
  const searchParams = new URLSearchParams();
  if (params.query?.trim()) {
    searchParams.set("query", params.query.trim());
  }
  if (params.category) {
    searchParams.set("category", params.category);
  }

  const normalizedDateFrom = normalizeDateForApi(params.dateFrom);
  if (normalizedDateFrom) {
    searchParams.set("date_from", normalizedDateFrom);
  }

  const normalizedDateTo = normalizeDateForApi(params.dateTo);
  if (normalizedDateTo) {
    searchParams.set("date_to", normalizedDateTo);
  }

  if (params.limit) {
    searchParams.set("limit", String(params.limit));
  }

  const suffix = searchParams.toString() ? `?${searchParams.toString()}` : "";
  const payload = await apiRequest<RawEventLog[]>(`/events${suffix}`, { token });
  return payload.map(mapEventLogItem);
}

export async function exportEventsXlsx(
  token: string,
  params: FetchEventsParams = {},
): Promise<{ blob: Blob; fileName: string }> {
  const searchParams = new URLSearchParams();
  if (params.query?.trim()) {
    searchParams.set("query", params.query.trim());
  }
  if (params.category) {
    searchParams.set("category", params.category);
  }

  const normalizedDateFrom = normalizeDateForApi(params.dateFrom);
  if (normalizedDateFrom) {
    searchParams.set("date_from", normalizedDateFrom);
  }

  const normalizedDateTo = normalizeDateForApi(params.dateTo);
  if (normalizedDateTo) {
    searchParams.set("date_to", normalizedDateTo);
  }

  if (params.limit) {
    searchParams.set("limit", String(params.limit));
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/events/export/xlsx?${searchParams.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch {
    throw new ApiError(
      0,
      "Не удалось связаться с сервером. Проверь доступность приложения и настройки API.",
    );
  }

  if (!response.ok) {
    throw new ApiError(response.status, "Не удалось выгрузить Excel-файл журнала.");
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") ?? "";
  const fileName = parseContentDispositionFileName(contentDisposition) ?? "events.xlsx";
  return { blob, fileName };
}

function mapEventLogItem(raw: RawEventLog): EventLogItem {
  return {
    id: raw.id,
    category: raw.category,
    action: raw.action,
    title: raw.title,
    description: raw.description,
    userId: raw.user_id,
    userDisplayName: raw.user_display_name,
    equipmentId: raw.equipment_id,
    equipmentName: raw.equipment_name,
    equipmentModification: raw.equipment_modification,
    equipmentSerialNumber: raw.equipment_serial_number,
    folderId: raw.folder_id,
    folderName: raw.folder_name,
    batchKey: raw.batch_key,
    eventDate: raw.event_date,
    createdAt: raw.created_at,
  };
}

function parseContentDispositionFileName(contentDisposition: string): string | null {
  const utfMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }
  const plainMatch = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plainMatch?.[1] ?? null;
}

function normalizeDateForApi(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  return parseDateInputToIso(normalized) ?? normalized;
}

function parseDateInputToIso(value: string): string | null {
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return isValidDateParts(isoMatch[1], isoMatch[2], isoMatch[3])
      ? `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
      : null;
  }

  const displayMatch = value.match(/^(\d{1,2})[.\-/ ](\d{1,2})[.\-/ ](\d{4})$/);
  if (displayMatch) {
    const day = displayMatch[1].padStart(2, "0");
    const month = displayMatch[2].padStart(2, "0");
    const year = displayMatch[3];
    return isValidDateParts(year, month, day) ? `${year}-${month}-${day}` : null;
  }

  return null;
}

function isValidDateParts(year: string, month: string, day: string): boolean {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  const numericDay = Number(day);

  if (
    !Number.isInteger(numericYear)
    || !Number.isInteger(numericMonth)
    || !Number.isInteger(numericDay)
  ) {
    return false;
  }

  if (numericMonth < 1 || numericMonth > 12 || numericDay < 1 || numericDay > 31) {
    return false;
  }

  const candidate = new Date(`${year}-${month}-${day}T00:00:00`);
  return (
    candidate.getFullYear() === numericYear
    && candidate.getMonth() + 1 === numericMonth
    && candidate.getDate() === numericDay
  );
}
