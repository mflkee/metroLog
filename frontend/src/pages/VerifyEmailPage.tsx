import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { resendVerification, verifyEmail } from "@/api/auth";
import { useAuthStore } from "@/store/auth";

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((state) => state.setSession);
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    typeof location.state === "object" &&
      location.state !== null &&
      "message" in location.state &&
      typeof location.state.message === "string"
      ? location.state.message
      : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    setEmail(searchParams.get("email") ?? "");
    setCode(searchParams.get("code") ?? "");
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const session = await verifyEmail({ email, code });
      setSession({ token: session.accessToken, user: session.user });
      navigate("/dashboard", { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось подтвердить email.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    setError(null);
    setMessage(null);
    setIsResending(true);

    try {
      const response = await resendVerification(email);
      setMessage(response.message);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось отправить письмо повторно.");
    } finally {
      setIsResending(false);
    }
  }

  return (
    <section className="space-y-5 rounded-3xl border border-line bg-white p-6 shadow-panel">
      <div>
        <h2 className="text-xl font-semibold text-ink">Подтверждение email</h2>
        <p className="mt-2 text-sm text-steel">
          Введи код из письма. При необходимости можно запросить повторную отправку.
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

        <label className="block text-sm text-steel">
          Код подтверждения
          <input
            className="form-input"
            type="text"
            inputMode="numeric"
            placeholder="123456"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>

        {error ? <p className="text-sm text-[#b04c43]">{error}</p> : null}
        {message ? <p className="text-sm text-signal-ok">{message}</p> : null}

        <div className="flex flex-wrap gap-3">
          <button className="btn-primary disabled:opacity-60" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Подтверждаем..." : "Подтвердить email"}
          </button>
          <button
            className="rounded-full border border-line px-4 py-2 text-sm text-steel transition hover:border-signal-info hover:text-ink disabled:opacity-60"
            type="button"
            disabled={!email || isResending}
            onClick={handleResend}
          >
            {isResending ? "Отправляем..." : "Отправить код повторно"}
          </button>
        </div>
      </form>

      <p className="text-sm text-steel">
        Уже подтверждено?{" "}
        <Link className="font-semibold text-signal-info" to="/login">
          Войти
        </Link>
      </p>
    </section>
  );
}
