import { Link } from "react-router-dom";

export function RegisterPage() {
  return (
    <section className="space-y-5 rounded-3xl border border-line bg-white p-6 shadow-panel">
      <div>
        <h2 className="text-xl font-semibold text-ink">Регистрация</h2>
        <p className="mt-2 text-sm text-steel">Минимальная форма создания пользователя для будущего auth-flow.</p>
      </div>
      <form className="space-y-4">
        <label className="block text-sm text-steel">
          Имя
          <input className="form-input" type="text" placeholder="Иван Иванов" />
        </label>
        <label className="block text-sm text-steel">
          Email
          <input className="form-input" type="email" placeholder="user@example.com" />
        </label>
        <label className="block text-sm text-steel">
          Пароль
          <input className="form-input" type="password" placeholder="••••••••" />
        </label>
        <button className="btn-primary" type="button">
          Создать аккаунт
        </button>
      </form>
      <p className="text-sm text-steel">
        Уже есть аккаунт?{" "}
        <Link className="font-semibold text-signal-info" to="/login">
          Войти
        </Link>
      </p>
    </section>
  );
}

