import { Outlet } from "react-router-dom";

export function AuthLayout() {
  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-signal-info">
            metroLog
          </p>
          <h1 className="text-3xl font-semibold text-ink">Вход в систему</h1>
          <p className="max-w-md text-sm text-steel">
            Авторизация во внутренней рабочей среде. После входа откроется основное приложение.
          </p>
        </div>
        <Outlet />
      </section>
    </main>
  );
}
