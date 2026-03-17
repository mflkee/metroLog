import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";

import { requestPasswordReset } from "@/api/auth";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const response = await requestPasswordReset({ email });
      setMessage(response.message);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Не удалось отправить письмо для сброса.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-5 rounded-3xl border border-line bg-white p-6 shadow-panel">
      <div>
        <h2 className="text-xl font-semibold text-ink">Восстановление пароля</h2>
        <p className="mt-2 text-sm text-steel">
          Введи email, и система отправит код для сброса пароля.
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm text-steel">
          Email
          <input
            className="form-input"
            type="email"
            placeholder="user@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        {error ? <p className="text-sm text-[#b04c43]">{error}</p> : null}
        {message ? <p className="text-sm text-signal-ok">{message}</p> : null}

        <button className="btn-primary disabled:opacity-60" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Отправляем..." : "Отправить код"}
        </button>
      </form>

      <p className="text-sm text-steel">
        Уже вспомнил пароль?{" "}
        <Link className="font-semibold text-signal-info" to="/login">
          Вернуться ко входу
        </Link>
      </p>
    </section>
  );
}
