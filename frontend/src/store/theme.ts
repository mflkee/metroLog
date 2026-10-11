import {
  coerceThemePreference,
  getStoredTheme,
  setTheme as persistAndApplyTheme,
  themeOptions,
  useTheme as useFleetTheme,
  type ThemeName,
} from "@/lib/theme-store";

/*
 * metroLog's view of the fleet theme store (`@/lib/theme-store`, vendored from `metro-ui`).
 *
 * The store itself — the key, `data-theme`, the dark default, the migration of retired names — is
 * the fleet's; this module keeps the app-facing API the screens already use (the theme catalogue,
 * the profile-driven narrowing and the zustand-shaped hook) on top of it.
 */
export {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyTheme,
  coerceThemePreference,
  getStoredTheme,
  initializeTheme,
  isThemeName,
  themeNames,
  themeOptions,
} from "@/lib/theme-store";
export type { ThemeName, ThemeOption } from "@/lib/theme-store";

/**
 * Every theme is offered out of the box: the catalogue *is* the default, so a user who has never
 * trimmed the list sees a new theme as soon as it is added, and `null` (the stored value of
 * "I never chose") keeps meaning "the default".
 */
export const defaultVisibleThemes: ThemeName[] = themeOptions.map((option) => option.value);

/**
 * The themes the switcher may offer: what the profile enabled, or the whole catalogue, always with
 * the theme in use kept in the list (so a user never loses the option they are looking at).
 */
export function getVisibleThemes(
  enabledThemes: Array<string | null | undefined> | null | undefined,
  currentTheme?: ThemeName,
): ThemeName[] {
  const normalized = (enabledThemes ?? [])
    .map((value) => coerceThemePreference(value ?? null))
    .filter((value): value is ThemeName => value !== null);

  const base = normalized.length ? normalized : defaultVisibleThemes;
  const deduped: ThemeName[] = [];
  for (const theme of base) {
    if (!deduped.includes(theme)) {
      deduped.push(theme);
    }
  }

  if (currentTheme && !deduped.includes(currentTheme)) {
    deduped.unshift(currentTheme);
  }

  return deduped;
}

/**
 * Applies the theme the profile carries, falling back to the local choice when the profile has
 * nothing usable (or a retired name).
 */
export function syncThemeFromUser(themePreference: string | null | undefined): void {
  persistAndApplyTheme(coerceThemePreference(themePreference) ?? getStoredTheme());
}

type ThemeState = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

/**
 * The hook the screens use. It reads the fleet store, so every tab, every service and the switcher
 * share one value; `setTheme` persists and applies it at once.
 */
export function useThemeStore<T>(selector: (state: ThemeState) => T): T {
  const { theme, setTheme } = useFleetTheme();
  return selector({ theme, setTheme });
}
