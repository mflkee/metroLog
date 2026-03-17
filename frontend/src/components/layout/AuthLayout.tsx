import { Outlet } from "react-router-dom";

export function AuthLayout() {
  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-signal-info">
            metroLog
          </p>
          <h1 className="text-3xl font-semibold text-ink">Вход в рабочую среду</h1>
          <p className="max-w-md text-sm text-steel">
            Минималистичный вход в систему без лендинга. После аутентификации пользователь
            попадает сразу в рабочий shell приложения.
          </p>
        </div>
        <Outlet />
      </section>
    </main>
  );
}

