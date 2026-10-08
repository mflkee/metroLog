import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest, setUnauthorizedHandler } from "@/api/client";
import { registerSessionExpiryHandler } from "@/lib/sessionExpiry";
import { useAuthStore } from "@/store/auth";

afterEach(() => {
  setUnauthorizedHandler(null);
  vi.unstubAllGlobals();
  useAuthStore.setState({ token: null, user: null, status: "anonymous" });
});

describe("session expiry", () => {
  it("drops the session when an authenticated request answers 401", async () => {
    useAuthStore.setState({ token: "stale-token", status: "authenticated" });
    registerSessionExpiryHandler();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Authentication token is invalid." }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(apiRequest("/equipment/1", { token: "stale-token" })).rejects.toBeTruthy();

    expect(useAuthStore.getState().status).toBe("anonymous");
    expect(useAuthStore.getState().token).toBeNull();
  });

  it("keeps the session when the login request itself answers 401", async () => {
    useAuthStore.setState({ token: null, user: null, status: "anonymous" });
    registerSessionExpiryHandler();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ detail: "Invalid credentials." }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    await expect(
      apiRequest("/auth/login", { method: "POST", silentUnauthorized: true, body: {} }),
    ).rejects.toBeTruthy();

    expect(useAuthStore.getState().status).toBe("anonymous");
  });
});
