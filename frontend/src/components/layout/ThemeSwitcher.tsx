import { useEffect, useRef, useState } from "react";

import { themeOptions, useThemeStore } from "@/store/theme";

export function ThemeSwitcher() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const [isOpen, setIsOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const activeTheme = themeOptions.find((option) => option.value === theme) ?? themeOptions[0];

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!switcherRef.current?.contains(event.target as Node)) {
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
    <div ref={switcherRef} className="theme-switcher">
      <span className="theme-switcher__label">Тема</span>
      <div className="theme-menu">
        <button
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className="theme-menu__trigger"
          type="button"
          onClick={() => setIsOpen((open) => !open)}
        >
          <span>{activeTheme.label}</span>
          <span
            aria-hidden="true"
            className={[
              "theme-menu__caret",
              isOpen ? "theme-menu__caret--open" : "",
            ].join(" ")}
          >
            ▾
          </span>
        </button>
        {isOpen ? (
          <div aria-label="Выбор темы" className="theme-menu__panel" role="listbox">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                aria-selected={theme === option.value}
                className={[
                  "theme-menu__option",
                  theme === option.value ? "theme-menu__option--active" : "",
                ].join(" ")}
                role="option"
                type="button"
                onClick={() => {
                  setTheme(option.value);
                  setIsOpen(false);
                }}
              >
                <span>{option.label}</span>
                {theme === option.value ? (
                  <span className="theme-menu__status">Текущая</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
