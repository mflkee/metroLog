import { type CSSProperties, useEffect, useRef, useState } from "react";

import { fontOptions, themeOptions, useThemeStore, type FontName } from "@/store/theme";

const fontPreviewFamily: Record<FontName, string> = {
  "ibm-plex": '"IBM Plex Sans", "Segoe UI", sans-serif',
  lilex: '"Lilex NF", "IBM Plex Sans", "Segoe UI", sans-serif',
  hack: '"Hack NF", "IBM Plex Sans", "Segoe UI", monospace',
  "adwaita-mono": '"Adwaita Mono NF", "IBM Plex Sans", "Segoe UI", monospace',
  "ibm-3270": '"3270 NF", "IBM Plex Sans", "Segoe UI", monospace',
};

export function ThemeSwitcher() {
  const theme = useThemeStore((state) => state.theme);
  const font = useThemeStore((state) => state.font);
  const setTheme = useThemeStore((state) => state.setTheme);
  const setFont = useThemeStore((state) => state.setFont);

  return (
    <div className="theme-switcher">
      <Picker
        activeLabel={(themeOptions.find((option) => option.value === theme) ?? themeOptions[0]).label}
        label="Тема"
        options={themeOptions.map((option) => ({
          value: option.value,
          label: option.label,
          preview: "Интерфейс",
        }))}
        selectedValue={theme}
        onSelect={(value) => setTheme(value as typeof theme)}
      />
      <Picker
        activeLabel={(fontOptions.find((option) => option.value === font) ?? fontOptions[0]).label}
        label="Шрифт"
        options={fontOptions.map((option) => ({
          value: option.value,
          label: option.label,
          preview: "Абв 123",
          previewStyle: { fontFamily: fontPreviewFamily[option.value] },
        }))}
        selectedValue={font}
        onSelect={(value) => setFont(value as typeof font)}
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
    previewStyle?: CSSProperties;
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
                    <span className="theme-menu__preview" style={option.previewStyle}>
                      {option.preview}
                    </span>
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
