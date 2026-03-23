import { Link, useLocation } from "react-router-dom";

import { AccountMenu } from "@/components/layout/AccountMenu";
import { useAuthStore } from "@/store/auth";

const routeLabels: Array<{ match: RegExp; label: string }> = [
  { match: /^\/dashboard$/, label: "Главная" },
  { match: /^\/equipment$/, label: "Оборудование" },
  { match: /^\/equipment\/\d+$/, label: "Карточка прибора" },
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

export function Topbar() {
  const location = useLocation();
  const mustChangePassword = useAuthStore((state) => state.user?.mustChangePassword);
  const currentSection = routeLabels.find((item) => item.match.test(location.pathname))?.label ?? "Рабочая область";

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-white/85 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-[0.24em] text-steel">{currentSection}</div>
          <Link className="text-lg font-semibold text-ink" to="/dashboard">
            metroLog
          </Link>
        </div>
        <AccountMenu />
      </div>
      {mustChangePassword ? (
        <div className="mt-4 rounded-2xl border border-signal-info bg-[#eaf4f8] px-4 py-3 text-sm text-ink">
          Временный пароль еще активен. Продолжение работы доступно только после смены пароля в профиле.
        </div>
      ) : null}
    </header>
  );
}
