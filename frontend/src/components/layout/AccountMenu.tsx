import { Link } from "react-router-dom";

import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";

export function AccountMenu() {
  return (
    <div className="flex flex-col items-start gap-3 lg:items-end">
      <ThemeSwitcher />
      <div className="flex items-center gap-3">
        <Link
          className="rounded-full border border-line px-3 py-1.5 text-sm text-steel transition hover:border-signal-info hover:text-ink"
          to="/profile"
        >
          Профиль
        </Link>
        <Link className="rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-white" to="/login">
          Войти
        </Link>
      </div>
    </div>
  );
}
