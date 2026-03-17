import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { registerUser } from "@/api/auth";
import {
  blockPasswordClipboard,
  isPasswordPolicyValid,
  passwordPolicyMessage,
} from "@/lib/password";

const REGISTER_DRAFT_STORAGE_KEY = "metroLog.registerDraft";

export function RegisterPage() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const storedDraft = window.sessionStorage.getItem(REGISTER_DRAFT_STORAGE_KEY);
    if (!storedDraft) {
      return;
    }

    try {
      const parsedDraft = JSON.parse(storedDraft) as {
        displayName?: string;
        email?: string;
      };
      setDisplayName(parsedDraft.displayName ?? "");
      setEmail(parsedDraft.email ?? "");
    } catch {
      window.sessionStorage.removeItem(REGISTER_DRAFT_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.sessionStorage.setItem(
      REGISTER_DRAFT_STORAGE_KEY,
      JSON.stringify({
        displayName,
        email,
      }),
    );
  }, [displayName, email]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }

    if (!isPasswordPolicyValid(password)) {
      setError(passwordPolicyMessage);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await registerUser({
        displayName,
        email,
        password,
        confirmPassword,
      });
      window.sessionStorage.removeItem(REGISTER_DRAFT_STORAGE_KEY);
      navigate(`/verify-email?email=${encodeURIComponent(email)}`, {
        replace: true,
        state: { message: response.message },
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Не удалось создать пользователя.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-5 rounded-3xl border border-line bg-white p-6 shadow-panel">
      <div>
        <h2 className="text-xl font-semibold text-ink">Регистрация</h2>
        <p className="mt-2 text-sm text-steel">Минимальная форма создания пользователя для будущего auth-flow.</p>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm text-steel">
          Имя
          <input
            className="form-input"
            type="text"
            placeholder="Иван Иванов"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </label>
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
          Пароль
          <input
            className="form-input"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onCopy={blockPasswordClipboard}
            onCut={blockPasswordClipboard}
            onPaste={blockPasswordClipboard}
          />
        </label>
        <p className="text-xs text-steel">{passwordPolicyMessage}</p>
        <label className="block text-sm text-steel">
          Подтверждение пароля
          <input
            className="form-input"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={6}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            onCopy={blockPasswordClipboard}
            onCut={blockPasswordClipboard}
            onPaste={blockPasswordClipboard}
          />
        </label>
        {error ? <p className="text-sm text-[#b04c43]">{error}</p> : null}
        <button className="btn-primary disabled:opacity-60" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Создаем..." : "Создать аккаунт"}
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
