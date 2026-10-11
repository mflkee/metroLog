import { updateProfile } from "@/api/auth";
import { ThemeSwitcher as FleetThemeSwitcher } from "@/components/theme-switcher";
import { useAuthStore } from "@/store/auth";
import { getVisibleThemes, useThemeStore, type ThemeName } from "@/store/theme";

/**
 * The app's theme switcher: the fleet picker (from `@metro/theme-switcher`) plus metroLog's own
 * behaviour — the list is narrowed by the themes the user enabled in their profile, and a choice is
 * remembered on the profile so it follows the user to another browser.
 *
 * The theme itself is applied by the fleet store (`@/lib/theme-store`) before the request goes out,
 * so a failed save never leaves the user without their choice.
 */
export function ThemeSwitcher() {
  const theme = useThemeStore((state) => state.theme);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const visibleThemes = getVisibleThemes(user?.enabledThemes, theme);

  async function handleSelect(nextTheme: ThemeName) {
    if (!token || !user || user.themePreference === nextTheme) {
      return;
    }

    try {
      const updatedUser = await updateProfile(token, {
        themePreference: nextTheme,
      });
      setUser(updatedUser);
    } catch {
      // local theme is already applied; next successful profile fetch will resync state
    }
  }

  return <FleetThemeSwitcher onChange={(nextTheme) => void handleSelect(nextTheme)} themes={visibleThemes} />;
}
