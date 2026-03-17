import { useEffect, useRef, useState } from "react";

import { updateProfile } from "@/api/auth";
import { getVisibleThemes, themeOptions, useThemeStore } from "@/store/theme";
import { useAuthStore } from "@/store/auth";

export function ThemeSwitcher() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const visibleThemes = getVisibleThemes(user?.enabledThemes, theme);
  const visibleOptions = themeOptions.filter((option) => visibleThemes.includes(option.value));

  async function handleSelect(value: string) {
    const nextTheme = value as typeof theme;
    setTheme(nextTheme);

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

  return (
    <div className="theme-switcher">
      <Picker
        activeLabel={(themeOptions.find((option) => option.value === theme) ?? themeOptions[0]).label}
        label="Тема"
        options={visibleOptions.map((option) => ({
          value: option.value,
          label: option.label,
          preview: option.source,
        }))}
        selectedValue={theme}
        onSelect={(value) => void handleSelect(value)}
      />
    </div>
  );
}

type PickerProps = {
  label: string;
  activeLabel: string;
  selectedValue: string;
  options: Array<{
    value: string;
    label: string;
    preview?: string;
  }>;
  onSelect: (value: string) => void;
};

function Picker({ label, activeLabel, selectedValue, options, onSelect }: PickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div ref={pickerRef} className="theme-picker">
      <span className="theme-switcher__label">{label}</span>
      <div className="theme-menu">
        <button
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className="theme-menu__trigger"
          type="button"
          onClick={() => setIsOpen((open) => !open)}
        >
          <span>{activeLabel}</span>
          <span
            aria-hidden="true"
            className={["theme-menu__caret", isOpen ? "theme-menu__caret--open" : ""].join(" ")}
          >
            ▾
          </span>
        </button>
        {isOpen ? (
          <div aria-label={`Выбор: ${label}`} className="theme-menu__panel" role="listbox">
            {options.map((option) => (
              <button
                key={option.value}
                aria-selected={selectedValue === option.value}
                className={[
                  "theme-menu__option",
                  selectedValue === option.value ? "theme-menu__option--active" : "",
                ].join(" ")}
                role="option"
                type="button"
                onClick={() => {
                  onSelect(option.value);
                  setIsOpen(false);
                }}
              >
                <span className="theme-menu__option-main">
                  <span>{option.label}</span>
                  {option.preview ? (
                    <span className="theme-menu__preview">{option.preview}</span>
                  ) : null}
                </span>
                {selectedValue === option.value ? (
                  <span className="theme-menu__status">Текущий</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
