import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { fetchArshinStatus } from "@/api/arshin";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { AppVersionBadge } from "@/components/layout/AppVersionBadge";
import { WhatsNewModal } from "@/components/WhatsNewModal";
import { useAuthStore } from "@/store/auth";

type TopbarProps = {
  mobileNavigationOpen: boolean;
  onToggleMobileNavigation: () => void;
};

export function Topbar({ mobileNavigationOpen, onToggleMobileNavigation }: TopbarProps) {
  const token = useAuthStore((state) => state.token);
  const mustChangePassword = useAuthStore((state) => state.user?.mustChangePassword);
  const [isArshinProbeSlow, setIsArshinProbeSlow] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
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
    <header className="shell-topbar z-20 border-b border-line px-3 py-2 backdrop-blur-sm sm:px-4 sm:py-2.5 lg:sticky lg:top-0 lg:px-8 lg:py-3">
      <div className="flex min-w-0 items-center justify-between gap-2 sm:gap-4">
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
          <Link className="shrink-0 text-sm font-semibold text-ink sm:text-base" to="/dashboard">
            metroLog
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <AppVersionBadge onClick={() => setWhatsNewOpen(true)} />
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
                className={["h-2 w-2 rounded-full", arshinStatusIndicator.dotClassName].join(" ")}
              />
              <span className="whitespace-nowrap">Аршин</span>
            </div>
          </div>
        </div>
        <AccountMenu />
      </div>
      {mustChangePassword ? (
        <div className="shell-status-banner mt-2 rounded-2xl border border-signal-info px-4 py-2.5 text-sm text-ink">
          Временный пароль еще активен. Продолжение работы доступно только после смены пароля в профиле.
        </div>
      ) : null}
      <WhatsNewModal open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />
    </header>
  );
}
