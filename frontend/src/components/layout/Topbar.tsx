import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";

import { fetchArshinStatus } from "@/api/arshin";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { useAuthStore } from "@/store/auth";

const routeLabels: Array<{ match: RegExp; label: string }> = [
  { match: /^\/dashboard$/, label: "Главная" },
  { match: /^\/equipment$/, label: "Оборудование" },
  { match: /^\/equipment\/\d+$/, label: "Карточка прибора" },
  { match: /^\/arshin$/, label: "Сервис Аршин" },
  { match: /^\/verification\/si$/, label: "Поверка СИ" },
  { match: /^\/repairs$/, label: "Ремонты" },
  { match: /^\/events$/, label: "Журнал событий" },
  { match: /^\/settings$/, label: "Настройки" },
  { match: /^\/profile$/, label: "Профиль" },
  { match: /^\/help$/, label: "Документация" },
  { match: /^\/developer$/, label: "Мониторинг" },
  { match: /^\/admin\/users$/, label: "Пользователи" },
  { match: /^\/admin\/users\/\d+$/, label: "Карточка пользователя" },
];

type TopbarProps = {
  mobileNavigationOpen: boolean;
  onToggleMobileNavigation: () => void;
};

export function Topbar({ mobileNavigationOpen, onToggleMobileNavigation }: TopbarProps) {
  const location = useLocation();
  const token = useAuthStore((state) => state.token);
  const mustChangePassword = useAuthStore((state) => state.user?.mustChangePassword);
  const currentSection = routeLabels.find((item) => item.match.test(location.pathname))?.label ?? "Рабочая область";
  const [isArshinProbeSlow, setIsArshinProbeSlow] = useState(false);
  const arshinStatusQuery = useQuery({
    queryKey: ["arshin-status"],
    queryFn: () => fetchArshinStatus(token ?? ""),
    enabled: Boolean(token),
    staleTime: 4 * 1000,
    refetchInterval: 5 * 1000,
  });

  useEffect(() => {
    if (arshinStatusQuery.fetchStatus !== "fetching") {
      setIsArshinProbeSlow(false);
      return undefined;
    }

    setIsArshinProbeSlow(false);
    const timeoutId = window.setTimeout(() => {
      setIsArshinProbeSlow(true);
    }, 2_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [arshinStatusQuery.fetchStatus]);

  const arshinStatusIndicator = isArshinProbeSlow
    ? {
        title: "Аршин не отвечает",
        dotClassName: "bg-[var(--danger)]",
        toneClassName: "text-[var(--danger)]",
      }
    : arshinStatusQuery.isLoading
    ? {
        title: "Проверяем Аршин",
        dotClassName: "bg-steel/45",
        toneClassName: "text-steel",
      }
    : arshinStatusQuery.isError || arshinStatusQuery.data?.available === false
      ? {
          title: "Аршин недоступен",
          dotClassName: "bg-[var(--danger)]",
          toneClassName: "text-[var(--danger)]",
        }
      : {
          title: "Аршин доступен",
          dotClassName: "bg-[var(--success)]",
          toneClassName: "text-[var(--success)]",
        };

  return (
    <header className="shell-topbar z-20 border-b border-line px-3 py-2 backdrop-blur sm:px-4 sm:py-2.5 lg:sticky lg:top-0 lg:px-8 lg:py-3">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 sm:gap-x-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button
            aria-expanded={mobileNavigationOpen}
            aria-label={mobileNavigationOpen ? "Закрыть навигацию" : "Открыть навигацию"}
            className="mobile-nav-toggle lg:hidden"
            type="button"
            onClick={onToggleMobileNavigation}
          >
            {mobileNavigationOpen ? (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
          <div className="hidden min-w-0 truncate text-[11px] uppercase tracking-[0.18em] text-steel sm:block sm:text-xs sm:tracking-[0.22em]">
            {currentSection}
          </div>
          <Link className="shrink-0 text-sm font-semibold text-ink sm:text-base" to="/dashboard">
            metroLog
          </Link>
          <div
            aria-label={arshinStatusIndicator.title}
            className={[
              "hidden shrink-0 items-center gap-2 text-xs font-medium sm:inline-flex",
              arshinStatusIndicator.toneClassName,
            ].join(" ")}
            title={arshinStatusIndicator.title}
          >
            <span
              aria-hidden="true"
              className={[
                "h-2.5 w-2.5 rounded-full",
                arshinStatusIndicator.dotClassName,
              ].join(" ")}
            />
            <span className="whitespace-nowrap">Аршин</span>
          </div>
        </div>
        <div className="justify-self-end">
          <AccountMenu />
        </div>
      </div>
      {mustChangePassword ? (
        <div className="shell-status-banner mt-2 rounded-2xl border border-signal-info px-4 py-2.5 text-sm text-ink">
          Временный пароль еще активен. Продолжение работы доступно только после смены пароля в профиле.
        </div>
      ) : null}
    </header>
  );
}
