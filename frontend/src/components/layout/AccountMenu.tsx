import { Link } from "react-router-dom";

export function AccountMenu() {
  return (
    <div className="flex items-center gap-3">
      <Link className="rounded-full border border-line px-3 py-1.5 text-sm text-steel" to="/profile">
        Профиль
      </Link>
      <Link className="rounded-full bg-ink px-3 py-1.5 text-sm font-medium text-white" to="/login">
        Войти
      </Link>
    </div>
  );
}

