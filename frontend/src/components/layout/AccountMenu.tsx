import { AccountMenu as FleetAccountMenu } from "@/components/account-menu";
import { roleLabels } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";

/**
 * metroLog's account block — the fleet's menu (from `@metro/account-menu`) with this app's
 * identity and pages: the profile link and the owner of the current session.
 */
export function AccountMenu() {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  return (
    <FleetAccountMenu
      identity={user ? `${user.fullName} · ${roleLabels[user.role] ?? user.role}` : undefined}
      loginTo={user ? undefined : "/login"}
      profileTo={user ? "/profile" : undefined}
      onLogout={clearSession}
    />
  );
}
