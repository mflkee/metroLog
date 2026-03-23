import { FormEvent, useEffect, useMemo, useState } from "react";

import { useQuery } from "@tanstack/react-query";

import { sendTestMentionEmail, updateProfile } from "@/api/auth";
import { fetchEquipmentFolders } from "@/api/equipment";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  dashboardWidgetOptions,
  defaultDashboardWidgets,
  normalizeDashboardWidgets,
  type DashboardWidgetKey,
} from "@/lib/dashboard";
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
  const [dashboardFolderId, setDashboardFolderId] = useState<string>(
    user?.dashboardFolderId ? String(user.dashboardFolderId) : "",
  );
  const [dashboardWidgets, setDashboardWidgets] = useState<DashboardWidgetKey[]>(
    normalizeDashboardWidgets(user?.dashboardWidgets ?? defaultDashboardWidgets),
  );
  const [mentionEmailNotificationsEnabled, setMentionEmailNotificationsEnabled] = useState(
    user?.mentionEmailNotificationsEnabled ?? true,
  );
  const [enabledThemes, setEnabledThemes] = useState<ThemeName[]>(
    getVisibleThemes(user?.enabledThemes ?? defaultVisibleThemes),
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [testEmailError, setTestEmailError] = useState<string | null>(null);
  const [testEmailMessage, setTestEmailMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);

  const foldersQuery = useQuery({
    queryKey: ["equipment-folders", "settings"],
    queryFn: () => fetchEquipmentFolders(token ?? ""),
    enabled: Boolean(token),
  });

  useEffect(() => {
    setEnabledThemes(getVisibleThemes(user?.enabledThemes ?? defaultVisibleThemes, currentTheme));
    setDashboardFolderId(user?.dashboardFolderId ? String(user.dashboardFolderId) : "");
    setDashboardWidgets(normalizeDashboardWidgets(user?.dashboardWidgets ?? defaultDashboardWidgets));
    setMentionEmailNotificationsEnabled(user?.mentionEmailNotificationsEnabled ?? true);
  }, [
    currentTheme,
    user?.dashboardFolderId,
    user?.dashboardWidgets,
    user?.enabledThemes,
    user?.mentionEmailNotificationsEnabled,
  ]);

  const sortedThemeOptions = useMemo(
    () =>
      themeOptions.map((option) => ({
        ...option,
        checked: enabledThemes.includes(option.value),
      })),
    [enabledThemes],
  );

  const sortedDashboardWidgetOptions = useMemo(
    () =>
      dashboardWidgetOptions.map((option) => ({
        ...option,
        checked: dashboardWidgets.includes(option.value),
      })),
    [dashboardWidgets],
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

  function toggleDashboardWidget(widget: DashboardWidgetKey) {
    setDashboardWidgets((current) => {
      if (current.includes(widget)) {
        if (current.length === 1) {
          return current;
        }
        return current.filter((value) => value !== widget);
      }
      return [...current, widget];
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
        dashboardFolderId: dashboardFolderId ? Number(dashboardFolderId) : null,
        dashboardWidgets,
        mentionEmailNotificationsEnabled,
        enabledThemes,
        themePreference: nextTheme,
      });
      setUser(updatedUser);
      setMessage("Настройки сохранены.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось сохранить настройки.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendTestEmail() {
    setTestEmailError(null);
    setTestEmailMessage(null);

    if (!token) {
      setTestEmailError("Сессия неактивна. Войди заново.");
      return;
    }

    setIsSendingTestEmail(true);

    try {
      const response = await sendTestMentionEmail(token);
      setTestEmailMessage(response.message);
    } catch (submitError) {
      setTestEmailError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось отправить тестовое письмо.",
      );
    } finally {
      setIsSendingTestEmail(false);
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
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-ink">Главная страница</h3>
              <p className="mt-1 max-w-[64ch] text-sm text-steel">
                Выбери папку, по которой нужно строить аналитику на главной, и отметь виджеты, которые
                должны там отображаться.
              </p>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-ink">Папка для анализа</span>
              <select
                className="form-input"
                disabled={foldersQuery.isLoading || foldersQuery.isError}
                value={dashboardFolderId}
                onChange={(event) => setDashboardFolderId(event.target.value)}
              >
                <option value="">Не выбрана</option>
                {(foldersQuery.data ?? []).map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sortedDashboardWidgetOptions.map((option) => (
                <label
                  key={option.value}
                  className="tone-child flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink"
                >
                  <input
                    checked={option.checked}
                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                    type="checkbox"
                    onChange={() => toggleDashboardWidget(option.value)}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold">{option.label}</span>
                    <span className="mt-1 block text-xs text-steel">
                      Отображать этот блок на главной странице.
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

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

          <div>
            <h3 className="text-base font-semibold text-ink">Уведомления</h3>
            <p className="mt-1 max-w-[64ch] text-sm text-steel">
              Управляй тем, как приложение будет уведомлять тебя об упоминаниях в комментариях, ремонтах и поверках.
            </p>
          </div>

          <label className="tone-child flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-sm text-ink">
            <input
              checked={mentionEmailNotificationsEnabled}
              className="mt-1 h-4 w-4 accent-[var(--accent)]"
              type="checkbox"
              onChange={(event) => setMentionEmailNotificationsEnabled(event.target.checked)}
            />
            <span className="min-w-0">
              <span className="block font-semibold">Письма при упоминании</span>
              <span className="mt-1 block text-xs text-steel">
                Если тебя отметят через `@`, приложение отправит письмо со ссылкой на нужный прибор, ремонт или поверку.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className="btn-secondary"
              disabled={isSendingTestEmail}
              type="button"
              onClick={() => void handleSendTestEmail()}
            >
              {isSendingTestEmail ? "Отправляем..." : "Тестовое письмо"}
            </button>
            <span className="text-xs text-steel">
              Отправить проверочное письмо на адрес текущего пользователя:{" "}
              <span className="font-semibold text-ink">{user?.email ?? "—"}</span>
            </span>
          </div>

          {testEmailError ? <p className="text-sm text-[#b04c43]">{testEmailError}</p> : null}
          {testEmailMessage ? <p className="text-sm text-signal-ok">{testEmailMessage}</p> : null}

          {error ? <p className="text-sm text-[#b04c43]">{error}</p> : null}
          {message ? <p className="text-sm text-signal-ok">{message}</p> : null}

          <button className="btn-primary disabled:opacity-60" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Сохраняем..." : "Сохранить"}
          </button>
        </form>
      </div>
    </section>
  );
}
