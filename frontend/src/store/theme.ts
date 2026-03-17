import { create } from "zustand";

export type ThemeName = "white" | "dark" | "gray" | "blueberry" | "old-book";

type ThemeOption = {
  value: ThemeName;
  label: string;
};

type ThemeState = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const STORAGE_KEY = "metrolog.theme";
const DEFAULT_THEME: ThemeName = "white";

export const themeOptions: ThemeOption[] = [
  { value: "white", label: "Белая" },
  { value: "dark", label: "Темная" },
  { value: "gray", label: "Серая" },
  { value: "blueberry", label: "Голубика" },
  { value: "old-book", label: "Старая книга" },
];

function getStoredTheme(): ThemeName {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  const storedTheme = window.localStorage.getItem(STORAGE_KEY);
  if (
    storedTheme === "white" ||
    storedTheme === "dark" ||
    storedTheme === "gray" ||
    storedTheme === "blueberry" ||
    storedTheme === "old-book"
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
      window.localStorage.setItem(STORAGE_KEY, theme);
    }
    applyTheme(theme);
    set({ theme });
  },
}));

export function initializeTheme(): void {
  applyTheme(getStoredTheme());
}
