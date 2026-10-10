import { create } from "zustand";

export type ThemeName =
  | "dark"
  | "tokyonight"
  | "catppuccin"
  | "kanagawa"
  | "nord"
  | "dracula"
  | "gruvbox";

type ThemeOption = {
  value: ThemeName;
  label: string;
};

type ThemeState = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const THEME_STORAGE_KEY = "metrolog.theme";
export const DEFAULT_THEME: ThemeName = "dark";

/**
 * The catalogue is dark-only and curated: the light theme and moonfly were both removed on the
 * owner's decision — the light theme never fitted the product, and moonfly read as a second neutral
 * dark next to `dark`. The picker shows the name alone, so an option carries nothing else.
 */
export const themeOptions: ThemeOption[] = [
  { value: "dark", label: "Темная" },
  { value: "tokyonight", label: "Tokyo Night" },
  { value: "catppuccin", label: "Catppuccin" },
  { value: "kanagawa", label: "Kanagawa" },
  { value: "nord", label: "Nord" },
  { value: "dracula", label: "Dracula" },
  { value: "gruvbox", label: "Gruvbox" },
];

/**
 * Every theme is offered out of the box: the catalogue *is* the default, so a user who has never
 * trimmed the list sees a new theme as soon as it is added, and `null` (the stored value of
 * "I never chose") keeps meaning "the default". `DEFAULT_THEME` stays the one that is applied
 * before the user picks.
 */
export const defaultVisibleThemes: ThemeName[] = themeOptions.map((option) => option.value);

function persistTheme(theme: ThemeName): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function coerceThemePreference(value: string | null | undefined): ThemeName | null {
  if (themeOptions.some((option) => option.value === value)) {
    return value as ThemeName;
  }

  if (value === "tokyo-night") {
    return DEFAULT_THEME;
  }

  // Themes this build no longer ships: a stored preference falls back to the neutral dark theme
  // rather than leaving the user without one.
  if (
    value === "light"
    || value === "gray"
    || value === "flexoki"
    || value === "moonfly"
  ) {
    return DEFAULT_THEME;
  }

  return null;
}

function getStoredTheme(): ThemeName {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  const coercedTheme = coerceThemePreference(storedTheme);
  if (coercedTheme) {
    return coercedTheme;
  }

  return DEFAULT_THEME;
}

export function applyTheme(theme: ThemeName): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
  // Every theme in the catalogue is dark, so the form controls are always the dark set.
  document.documentElement.style.colorScheme = "dark";
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getStoredTheme(),
  setTheme: (theme) => {
    persistTheme(theme);
    applyTheme(theme);
    set({ theme });
  },
}));

export function initializeTheme(): void {
  applyTheme(getStoredTheme());
}

export function syncThemeFromUser(themePreference: string | null | undefined): void {
  const theme = coerceThemePreference(themePreference) ?? getStoredTheme();
  persistTheme(theme);
  applyTheme(theme);
  useThemeStore.setState({ theme });
}

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
