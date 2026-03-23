import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { loginUser } from "@/api/auth";
import { PasswordInput } from "@/components/PasswordInput";
import { useAuthStore } from "@/store/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((state) => state.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const stateMessage =
    typeof location.state === "object" &&
    location.state !== null &&
    "message" in location.state &&
    typeof location.state.message === "string"
      ? location.state.message
      : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const session = await loginUser({ email, password });
      setSession({ token: session.accessToken, user: session.user });
      navigate(session.user.mustChangePassword ? "/profile" : "/dashboard", { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось выполнить вход.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-5 rounded-3xl border border-line bg-white p-6 shadow-panel">
      <div>
        <h2 className="text-xl font-semibold text-ink">Вход</h2>
        <p className="mt-2 text-sm text-steel">
          Войди под учетной записью, которую создал администратор.
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
        <PasswordInput
          autoComplete="current-password"
          label="Пароль"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {stateMessage ? <p className="text-sm text-signal-ok">{stateMessage}</p> : null}
        {error ? <p className="text-sm text-[#b04c43]">{error}</p> : null}
        <button className="btn-primary disabled:opacity-60" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Входим..." : "Войти"}
        </button>
      </form>
      <p className="text-sm text-steel">
        Нет доступа? Администратор должен создать учетную запись и передать временный пароль.
      </p>
    </section>
  );
}
