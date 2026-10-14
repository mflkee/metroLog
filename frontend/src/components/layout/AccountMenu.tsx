import { updateProfile } from "@/api/auth";
import { AccountMenu as FleetAccountMenu } from "@/components/account-menu";
import { roleLabels } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";
import { getVisibleThemes, useThemeStore, type ThemeName } from "@/store/theme";

/**
 * metroLog's account block — the fleet's menu (from `@metro/account-menu`) with this app's
 * identity, pages and theme persistence.
 *
 * A theme chosen in the top bar is written to the profile (`PATCH /auth/me`), so it survives a
 * reload and follows the user to another browser. The fleet store applies the theme locally first,
 * so a failed save never leaves the user without their choice.
 */
export function AccountMenu() {
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const setUser = useAuthStore((state) => state.setUser);
  const clearSession = useAuthStore((state) => state.clearSession);
  const theme = useThemeStore((state) => state.theme);

  const visibleThemes = getVisibleThemes(user?.enabledThemes, theme);

  async function handleThemeChange(nextTheme: ThemeName) {
    if (!token || !user || user.themePreference === nextTheme) {
      return;
    }

    try {
      setUser(await updateProfile(token, { themePreference: nextTheme }));
    } catch {
      // The fleet store already applied the theme locally; the next profile fetch resyncs state.
    }
  }

  return (
    <FleetAccountMenu
      identity={user ? `${user.fullName} · ${roleLabels[user.role] ?? user.role}` : undefined}
      loginTo={user ? undefined : "/login"}
      onLogout={clearSession}
      onThemeChange={(nextTheme) => void handleThemeChange(nextTheme)}
      profileTo={user ? "/profile" : undefined}
      themes={visibleThemes}
    />
  );
}
