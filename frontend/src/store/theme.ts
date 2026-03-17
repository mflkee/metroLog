import { create } from "zustand";

export type ThemeName = "white" | "dark" | "gray" | "blueberry" | "old-book";
export type FontName = "ibm-plex" | "lilex" | "hack" | "adwaita-mono" | "ibm-3270";

type ThemeOption = {
  value: ThemeName;
  label: string;
};

type FontOption = {
  value: FontName;
  label: string;
};

type ThemeState = {
  theme: ThemeName;
  font: FontName;
  setTheme: (theme: ThemeName) => void;
  setFont: (font: FontName) => void;
};

const THEME_STORAGE_KEY = "metrolog.theme";
const FONT_STORAGE_KEY = "metrolog.font";
const DEFAULT_THEME: ThemeName = "white";
const DEFAULT_FONT: FontName = "ibm-plex";

export const themeOptions: ThemeOption[] = [
  { value: "white", label: "Белая" },
  { value: "dark", label: "Темная" },
  { value: "gray", label: "Серая" },
  { value: "blueberry", label: "Голубика" },
  { value: "old-book", label: "Старая книга" },
];

export const fontOptions: FontOption[] = [
  { value: "ibm-plex", label: "IBM Plex Sans" },
  { value: "lilex", label: "Lilex" },
  { value: "hack", label: "Hack" },
  { value: "adwaita-mono", label: "Adwaita Mono" },
  { value: "ibm-3270", label: "3270" },
];

function getStoredTheme(): ThemeName {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
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

function getStoredFont(): FontName {
  if (typeof window === "undefined") {
    return DEFAULT_FONT;
  }

  const storedFont = window.localStorage.getItem(FONT_STORAGE_KEY);
  if (
    storedFont === "ibm-plex" ||
    storedFont === "lilex" ||
    storedFont === "hack" ||
    storedFont === "adwaita-mono" ||
    storedFont === "ibm-3270"
  ) {
    return storedFont;
  }

  return DEFAULT_FONT;
}

export function applyTheme(theme: ThemeName): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
}

export function applyFont(font: FontName): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.font = font;
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: getStoredTheme(),
  font: getStoredFont(),
  setTheme: (theme) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
    applyTheme(theme);
    set({ theme });
  },
  setFont: (font) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FONT_STORAGE_KEY, font);
    }
    applyFont(font);
    set({ font });
  },
}));

export function initializeTheme(): void {
  applyTheme(getStoredTheme());
  applyFont(getStoredFont());
}
