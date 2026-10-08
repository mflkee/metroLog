import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest, setUnauthorizedHandler } from "@/api/client";

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiRequest", () => {
  it("reports the backend detail message on a failed request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(403, { detail: "Нет доступа." })));

    await expect(apiRequest("/equipment/1")).rejects.toThrowError("Нет доступа.");
  });

  it("calls the unauthorized handler on a 401 response", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { detail: "Token is invalid." })));

    await expect(apiRequest("/equipment/1", { token: "expired" })).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("skips the unauthorized handler when silentUnauthorized is set", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { detail: "Bad credentials." })));

    await expect(
      apiRequest("/auth/login", { method: "POST", silentUnauthorized: true, body: {} }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not call the unauthorized handler for other error statuses", async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(404, { detail: "Not found." })));

    await expect(apiRequest("/equipment/404")).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns an empty object for a 204 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(apiRequest("/equipment/1", { method: "DELETE" })).resolves.toEqual({});
  });
});
