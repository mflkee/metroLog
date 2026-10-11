import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { getOidcStatus, loginUser, oidcLoginUrl } from "@/api/auth";
import { PasswordInput } from "@/components/PasswordInput";
import { getLoginStateMessage, resolvePostLoginRedirect } from "@/lib/authRedirect";
import { oidcErrorMessage, parseOidcFragment } from "@/lib/oidc";
import { useAuthStore } from "@/store/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setSession = useAuthStore((state) => state.setSession);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(false);
  const stateMessage = getLoginStateMessage(location.state);
  const ssoError = oidcErrorMessage(parseOidcFragment(location.hash).error);
  const postLoginRedirect = resolvePostLoginRedirect(location.state, "/dashboard");

  useEffect(() => {
    let cancelled = false;
    getOidcStatus()
      .then((status) => {
        if (!cancelled) {
          setSsoEnabled(status.enabled);
        }
      })
      .catch(() => {
        // Single sign-on is optional: a failure just hides the button.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSsoLogin() {
    window.location.href = oidcLoginUrl(postLoginRedirect);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const session = await loginUser({ email, password });
      setSession({ token: session.accessToken, user: session.user });
      navigate(session.user.mustChangePassword ? "/profile" : postLoginRedirect, { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось выполнить вход.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-ink">Вход</h2>
        <p className="mt-2 text-sm text-steel">
          Войди под учетной записью, которую создал администратор.
        </p>
      </div>
      {ssoError ? <p className="text-sm text-[#b04c43]">{ssoError}</p> : null}
      {ssoEnabled ? (
        <div className="space-y-3">
          <button className="btn-primary w-full" type="button" onClick={handleSsoLogin}>
            Войти через МКАИР
          </button>
          <p className="text-sm text-steel">или войдите по email и паролю</p>
        </div>
      ) : null}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm text-steel">
          Email
          <input
            className="form-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <PasswordInput
          autoComplete="current-password"
          label="Пароль"
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
