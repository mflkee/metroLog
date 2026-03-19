import { create } from "zustand";

export type ThemeName =
  | "light"
  | "dark"
  | "gray"
  | "tokyonight"
  | "catppuccin"
  | "kanagawa"
  | "flexoki"
  | "gruvbox"
  | "moonfly";

type ThemeOption = {
  value: ThemeName;
  label: string;
  source?: string;
};

type ThemeState = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const THEME_STORAGE_KEY = "metrolog.theme";
const DEFAULT_THEME: ThemeName = "light";
export const defaultVisibleThemes: ThemeName[] = ["light", "gray", "dark"];

export const themeOptions: ThemeOption[] = [
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Темная" },
  { value: "gray", label: "Серая" },
  { value: "tokyonight", label: "Tokyo Night", source: "folke/tokyonight.nvim" },
  { value: "catppuccin", label: "Catppuccin", source: "catppuccin/catppuccin" },
  { value: "kanagawa", label: "Kanagawa", source: "rebelot/kanagawa.nvim" },
  { value: "flexoki", label: "Flexoki", source: "kepano/flexoki" },
  { value: "gruvbox", label: "Gruvbox", source: "ellisonleao/gruvbox.nvim" },
  { value: "moonfly", label: "Moonfly", source: "bluz71/vim-moonfly-colors" },
];

function persistTheme(theme: ThemeName): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function coerceThemePreference(value: string | null | undefined): ThemeName | null {
  if (
    value === "light"
    || value === "dark"
    || value === "gray"
    || value === "tokyonight"
    || value === "catppuccin"
    || value === "kanagawa"
    || value === "flexoki"
    || value === "gruvbox"
    || value === "moonfly"
  ) {
    return value;
  }

  if (value === "tokyo-night") {
    return "dark";
  }

  if (value === "gruvbox") {
    return "gray";
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
  document.documentElement.style.colorScheme = isDarkTheme(theme) ? "dark" : "light";
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

export function isDarkTheme(theme: ThemeName): boolean {
  return ["dark", "tokyonight", "catppuccin", "kanagawa", "gruvbox", "moonfly"].includes(theme);
}
