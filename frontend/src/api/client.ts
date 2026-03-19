const fallbackBaseUrl = "/api/v1";

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? fallbackBaseUrl;

type ApiRequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  token?: string | null;
};

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, headers, token, ...init } = options;
  const requestHeaders = new Headers(headers);
  requestHeaders.set("Accept", "application/json");
  const isFormDataBody = body instanceof FormData;

  if (body !== undefined && !isFormDataBody) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: requestHeaders,
      body:
        body === undefined
          ? undefined
          : isFormDataBody
            ? body
            : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      "Не удалось связаться с сервером. Проверь доступность приложения и настройки API.",
    );
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (response.status === 204 || !contentType.includes("application/json")) {
    if (!response.ok) {
      throw new ApiError(response.status, "Request failed.");
    }
    return {} as T;
  }

  const payload = await response.json();

  if (!response.ok) {
    throw new ApiError(response.status, getErrorMessage(payload));
  }

  return payload as T;
}

function getErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  if (
    typeof payload === "object" &&
    payload !== null &&
    "detail" in payload &&
    typeof payload.detail === "string"
  ) {
    return payload.detail;
  }

  return "Request failed.";
}
