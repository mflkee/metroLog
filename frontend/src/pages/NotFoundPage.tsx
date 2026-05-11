import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <main className="auth-layout">
      <section className="auth-panel space-y-4">
        <h1 className="text-3xl font-semibold text-ink">Страница не найдена</h1>
        <p className="text-sm text-steel">
          Возвращайся в рабочую область и продолжай навигацию через общий shell.
        </p>
        <Link className="btn-primary inline-flex w-fit items-center justify-center" to="/dashboard">
          На главную
        </Link>
      </section>
    </main>
  );
}

