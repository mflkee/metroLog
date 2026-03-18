import { create } from "zustand";

export type ThemeName = "light" | "dark" | "gray" | "tokyo-night" | "gruvbox";

type ThemeOption = {
  value: ThemeName;
  label: string;
};

type ThemeState = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const THEME_STORAGE_KEY = "metrolog.theme";
const DEFAULT_THEME: ThemeName = "light";

export const themeOptions: ThemeOption[] = [
  { value: "light", label: "Светлая" },
  { value: "dark", label: "Темная" },
  { value: "gray", label: "Серая" },
  { value: "tokyo-night", label: "Tokyo Night" },
  { value: "gruvbox", label: "Gruvbox" },
];

function getStoredTheme(): ThemeName {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (
    storedTheme === "light" ||
    storedTheme === "dark" ||
    storedTheme === "gray" ||
    storedTheme === "tokyo-night" ||
    storedTheme === "gruvbox"
  ) {
    return storedTheme;
  }

  return DEFAULT_THEME;
}

export function applyTheme(theme: ThemeName): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getStoredTheme(),
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    applyTheme(theme);
    set({ theme });
  },
}));

export function initializeTheme(): void {
  applyTheme(getStoredTheme());
}
