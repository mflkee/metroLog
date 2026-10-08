import { setUnauthorizedHandler } from "@/api/client";
import { useAuthStore } from "@/store/auth";

/**
 * Drop an expired session when the API answers `401`.
 *
 * The store flips to `anonymous`, and `RequireAuth` / `RequireRoles` render the redirect to
 * `/login` with the reason, so no imperative navigation is needed here.
 */
export function registerSessionExpiryHandler(): void {
  setUnauthorizedHandler(() => {
    const { status, clearSession } = useAuthStore.getState();
    if (status === "anonymous") {
      return;
    }
    clearSession();
  });
}
