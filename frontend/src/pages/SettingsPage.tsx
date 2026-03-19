import { FormEvent, useEffect, useMemo, useState } from "react";

import { updateProfile } from "@/api/auth";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/store/auth";
import {
  defaultVisibleThemes,
  getVisibleThemes,
  themeOptions,
  type ThemeName,
  useThemeStore,
} from "@/store/theme";

export function SettingsPage() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const currentTheme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const [enabledThemes, setEnabledThemes] = useState<ThemeName[]>(
    getVisibleThemes(user?.enabledThemes ?? defaultVisibleThemes),
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setEnabledThemes(getVisibleThemes(user?.enabledThemes ?? defaultVisibleThemes, currentTheme));
  }, [currentTheme, user?.enabledThemes]);

  const sortedThemeOptions = useMemo(
    () =>
      themeOptions.map((option) => ({
        ...option,
        checked: enabledThemes.includes(option.value),
      })),
    [enabledThemes],
  );

  function toggleTheme(theme: ThemeName) {
    setEnabledThemes((current) => {
      if (current.includes(theme)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((value) => value !== theme);
      }
      return [...current, theme];
    });
  }

  async function handleSaveThemes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (!token || !user) {
      setError("Сессия неактивна. Войди заново.");
      return;
    }

    if (!enabledThemes.length) {
      setError("Хотя бы одна тема должна оставаться доступной.");
      return;
    }

    const nextTheme = enabledThemes.includes(currentTheme) ? currentTheme : enabledThemes[0];
    setIsSubmitting(true);

    try {
      if (nextTheme !== currentTheme) {
        setTheme(nextTheme);
      }
      const updatedUser = await updateProfile(token, {
        enabledThemes,
        themePreference: nextTheme,
      });
      setUser(updatedUser);
      setMessage("Список тем обновлен.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось сохранить настройки тем.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section>
      <PageHeader
        title="Настройки"
        description="Персональные параметры оболочки и состав тем, доступных в верхнем переключателе."
      />

      <div className="tone-parent space-y-4 rounded-3xl border border-line p-5 shadow-panel">
        <form className="space-y-4" onSubmit={handleSaveThemes}>
          <div>
            <h3 className="text-base font-semibold text-ink">Темы интерфейса</h3>
            <p className="mt-1 max-w-[64ch] text-sm text-steel">
              Отметь темы, которые должны отображаться в верхнем переключателе. По умолчанию доступны
              светлая, серая и темная.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sortedThemeOptions.map((option) => (
              <label
                key={option.value}
                className="tone-child flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink"
              >
                <input
                  checked={option.checked}
                  className="mt-1 h-4 w-4 accent-[var(--accent)]"
                  type="checkbox"
                  onChange={() => toggleTheme(option.value)}
                />
                <span className="min-w-0">
                  <span className="block font-semibold">{option.label}</span>
                  <span className="mt-1 block text-xs text-steel">
                    {option.source ?? "Базовая тема приложения"}
                  </span>
                </span>
              </label>
            ))}
          </div>

          <div className="tone-child rounded-2xl border border-line px-4 py-3 text-sm text-steel">
            Сейчас активна:{" "}
            <span className="font-semibold text-ink">
              {themeOptions.find((option) => option.value === currentTheme)?.label ?? currentTheme}
            </span>
          </div>

          {error ? <p className="text-sm text-[#b04c43]">{error}</p> : null}
          {message ? <p className="text-sm text-signal-ok">{message}</p> : null}

          <button className="btn-primary disabled:opacity-60" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Сохраняем..." : "Сохранить темы"}
          </button>
        </form>
      </div>
    </section>
  );
}
