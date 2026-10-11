import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getCurrentUser } from "@/api/auth";
import { oidcErrorMessage, parseOidcFragment } from "@/lib/oidc";
import { useAuthStore } from "@/store/auth";

export function OidcCallbackPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((state) => state.setSession);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { token, redirect, error: errorCode } = parseOidcFragment(window.location.hash);

    if (errorCode) {
      setError(oidcErrorMessage(errorCode));
      return;
    }
    if (!token) {
      setError("Не удалось получить токен входа.");
      return;
    }

    let cancelled = false;
    getCurrentUser(token)
      .then((user) => {
        if (cancelled) {
          return;
        }
        setSession({ token, user });
        navigate(user.mustChangePassword ? "/profile" : (redirect ?? "/dashboard"), {
          replace: true,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError("Не удалось завершить вход.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [navigate, setSession]);

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-ink">Единый вход</h2>
      {error ? (
        <>
          <p className="text-sm text-[#b04c43]">{error}</p>
          <Link className="text-sm text-signal-info" to="/login">
            Вернуться ко входу
          </Link>
        </>
      ) : (
        <p className="text-sm text-steel">Завершаем вход, подождите…</p>
      )}
    </section>
  );
}
