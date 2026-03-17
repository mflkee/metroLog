import { Link } from "react-router-dom";

import { ThemeSwitcher } from "@/components/layout/ThemeSwitcher";
import { roleLabels } from "@/lib/roles";
import { useAuthStore } from "@/store/auth";

export function AccountMenu() {
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);

  return (
    <div className="flex flex-col items-start gap-3 lg:items-end">
      <ThemeSwitcher />
      <div className="flex items-center gap-3">
        {user ? (
          <div className="hidden text-right md:block">
            <p className="text-sm font-semibold text-ink">{user.displayName}</p>
            <p className="text-xs uppercase tracking-[0.18em] text-steel">
              {roleLabels[user.role]}
              {user.mustChangePassword ? " · смена пароля" : ""}
            </p>
          </div>
        ) : null}
        <Link
          className="rounded-full border border-line px-3 py-1.5 text-sm text-steel transition hover:border-signal-info hover:text-ink"
          to="/profile"
        >
          Профиль
        </Link>
        {user ? (
          <button
            className="rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-white"
            type="button"
            onClick={clearSession}
          >
            Выйти
          </button>
        ) : (
          <Link className="rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-white" to="/login">
            Войти
          </Link>
        )}
      </div>
    </div>
  );
}
