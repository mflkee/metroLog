import { useMemo } from "react";
import { Link } from "react-router-dom";

import { useQuery } from "@tanstack/react-query";

import type { AuthUser, UserRole } from "@/api/auth";
import { fetchUsers } from "@/api/users";
import { PageHeader } from "@/components/layout/PageHeader";
import { roleLabels } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";

const ONLINE_WINDOW_MINUTES = 10;
const RECENT_LOGIN_DAYS = 7;

type SummaryCard = {
  label: string;
  value: string;
  hint: string;
};

export function DeveloperDashboardPage() {
  const token = useAuthStore((state) => state.token);

  const usersQuery = useQuery({
    queryKey: ["developer-dashboard", "users"],
    queryFn: () => fetchUsers(token ?? ""),
    enabled: Boolean(token),
    refetchInterval: 60_000,
  });

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const summaryCards = useMemo(() => buildSummaryCards(users), [users]);
  const onlineUsers = useMemo(() => users.filter((user) => isOnline(user.lastSeenAt)), [users]);
  const recentUsers = useMemo(
    () => [...users].sort((left, right) => compareDates(right.lastSeenAt, left.lastSeenAt)).slice(0, 8),
    [users],
  );
  const roleDistribution = useMemo(() => buildRoleDistribution(users), [users]);
  const usersByLastLogin = useMemo(
    () => [...users].sort((left, right) => compareDates(right.lastLoginAt, left.lastLoginAt)),
    [users],
  );

  return (
    <section className="space-y-6">
      <PageHeader
        title="Dev Dashboard"
        description="Служебная панель администратора для быстрого контроля активности пользователей, последних входов и текущего онлайн-статуса."
      />

      {usersQuery.isLoading ? <p className="text-sm text-steel">Собираем служебную статистику...</p> : null}
      {usersQuery.error ? (
        <p className="text-sm text-[#b04c43]">
          {usersQuery.error instanceof Error
            ? usersQuery.error.message
            : "Не удалось загрузить статистику разработчика."}
        </p>
      ) : null}

      {!usersQuery.isLoading && !usersQuery.error ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {summaryCards.map((item) => (
              <article key={item.label} className="tone-parent rounded-3xl border border-line px-5 py-4 shadow-panel">
                <p className="text-sm font-medium text-steel">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold text-ink">{item.value}</p>
                <p className="mt-2 text-xs text-steel">{item.hint}</p>
              </article>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-ink">Кто сейчас онлайн</h2>
                  <p className="mt-1 text-sm text-steel">
                    Пользователь считается онлайн, если был активен в системе за последние {ONLINE_WINDOW_MINUTES} минут.
                  </p>
                </div>
                <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink">
                  {onlineUsers.length} online
                </span>
              </div>

              <div className="mt-4 space-y-3">
                {onlineUsers.length ? (
                  onlineUsers.map((user) => (
                    <article key={user.id} className="tone-child rounded-2xl border border-line px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-ink">{user.fullName || user.email}</p>
                          <p className="text-sm text-steel">{user.email}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[#e8f7ee] px-3 py-1 text-xs font-semibold text-[#1d7f47]">
                            Онлайн
                          </span>
                          <span className="rounded-full border border-line px-3 py-1 text-xs text-steel">
                            {roleLabels[user.role]}
                          </span>
                          <Link className="btn-secondary btn-sm" to={`/admin/users/${user.id}`}>
                            Открыть
                          </Link>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-steel md:grid-cols-2">
                        <p>Последняя активность: <span className="font-medium text-ink">{formatDateTime(user.lastSeenAt)}</span></p>
                        <p>Последний вход: <span className="font-medium text-ink">{formatDateTime(user.lastLoginAt)}</span></p>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-sm text-steel">
                    Сейчас никто не отмечен как онлайн.
                  </div>
                )}
              </div>
            </section>

            <section className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
              <h2 className="text-lg font-semibold text-ink">Роли и покрытие доступа</h2>
              <div className="mt-4 space-y-3">
                {roleDistribution.map((entry) => (
                  <div key={entry.label} className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-ink">{entry.label}</span>
                      <span className="text-steel">{entry.value}</span>
                    </div>
                    <div className="h-2 rounded-full bg-black/5">
                      <div className="h-2 rounded-full bg-[var(--accent)]" style={{ width: `${entry.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-line p-4 text-sm text-steel">
                <p className="font-semibold text-ink">Что здесь смотреть:</p>
                <ul className="mt-2 space-y-2">
                  <li>• всплеск онлайна по администраторам и операторам;</li>
                  <li>• пользователей без недавних входов;</li>
                  <li>• учетные записи, у которых давно не было активности.</li>
                </ul>
              </div>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <section className="tone-parent rounded-3xl border border-line p-5 shadow-panel">
              <h2 className="text-lg font-semibold text-ink">Последняя активность</h2>
              <div className="mt-4 space-y-3">
                {recentUsers.map((user) => (
                  <div key={user.id} className="tone-child rounded-2xl border border-line px-4 py-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-ink">{user.fullName || user.email}</span>
                      <span className={isOnline(user.lastSeenAt) ? "text-[#1d7f47]" : "text-steel"}>
                        {isOnline(user.lastSeenAt) ? "онлайн" : "не в сети"}
                      </span>
                    </div>
                    <p className="mt-2 text-steel">{formatDateTime(user.lastSeenAt)}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="tone-parent overflow-hidden rounded-3xl border border-line shadow-panel">
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-lg font-semibold text-ink">Пользователи и входы</h2>
                <p className="mt-1 text-sm text-steel">
                  Таблица показывает, кто давно не заходил, кто еще не входил и кто активен прямо сейчас.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-black/5 text-xs uppercase tracking-[0.12em] text-steel">
                    <tr>
                      <th className="px-5 py-3">Пользователь</th>
                      <th className="px-5 py-3">Роль</th>
                      <th className="px-5 py-3">Статус</th>
                      <th className="px-5 py-3">Последний вход</th>
                      <th className="px-5 py-3">Последняя активность</th>
                      <th className="px-5 py-3">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usersByLastLogin.map((user) => (
                      <tr key={user.id} className="border-t border-line align-top text-ink">
                        <td className="px-5 py-4">
                          <div>
                            <p className="font-semibold">{user.fullName || user.email}</p>
                            <p className="text-steel">{user.email}</p>
                          </div>
                        </td>
                        <td className="px-5 py-4">{roleLabels[user.role]}</td>
                        <td className="px-5 py-4">
                          <span
                            className={[
                              "rounded-full px-3 py-1 text-xs font-semibold",
                              isOnline(user.lastSeenAt)
                                ? "bg-[#e8f7ee] text-[#1d7f47]"
                                : "bg-black/5 text-steel",
                            ].join(" ")}
                          >
                            {isOnline(user.lastSeenAt) ? "Онлайн" : user.isActive ? "Оффлайн" : "Отключен"}
                          </span>
                        </td>
                        <td className="px-5 py-4">{formatDateTime(user.lastLoginAt)}</td>
                        <td className="px-5 py-4">{formatDateTime(user.lastSeenAt)}</td>
                        <td className="px-5 py-4">
                          <Link className="btn-secondary btn-sm" to={`/admin/users/${user.id}`}>
                            Открыть
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}

function buildSummaryCards(users: AuthUser[]): SummaryCard[] {
  const total = users.length;
  const active = users.filter((user) => user.isActive).length;
  const online = users.filter((user) => isOnline(user.lastSeenAt)).length;
  const neverLoggedIn = users.filter((user) => !user.lastLoginAt).length;
  const recentLogins = users.filter((user) => isWithinDays(user.lastLoginAt, RECENT_LOGIN_DAYS)).length;

  return [
    { label: "Всего пользователей", value: String(total), hint: "Все учетные записи в системе." },
    { label: "Активные", value: String(active), hint: "Учетные записи, которым разрешен вход." },
    { label: "Онлайн сейчас", value: String(online), hint: `Активность за последние ${ONLINE_WINDOW_MINUTES} минут.` },
    { label: "Ни разу не входили", value: String(neverLoggedIn), hint: "Полезно для контроля новых учетных записей." },
    { label: "Заходили за 7 дней", value: String(recentLogins), hint: "Показывает живую вовлеченность команды." },
  ];
}

function buildRoleDistribution(users: AuthUser[]) {
  const total = users.length || 1;
  const roles: UserRole[] = ["ADMINISTRATOR", "MKAIR", "CUSTOMER"];
  return roles.map((role) => {
    const value = users.filter((user) => user.role === role).length;
    return {
      label: roleLabels[role],
      value,
      percentage: Math.round((value / total) * 100),
    };
  });
}

function isWithinDays(value: string | null, days: number) {
  if (!value) {
    return false;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return Date.now() - parsed <= days * 24 * 60 * 60 * 1000;
}

function isOnline(lastSeenAt: string | null) {
  if (!lastSeenAt) {
    return false;
  }
  const parsed = Date.parse(lastSeenAt);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return Date.now() - parsed <= ONLINE_WINDOW_MINUTES * 60 * 1000;
}

function compareDates(left: string | null, right: string | null) {
  const leftValue = left ? Date.parse(left) : 0;
  const rightValue = right ? Date.parse(right) : 0;
  return leftValue - rightValue;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Еще не было";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
