import { Navigate, Outlet, useLocation } from "react-router-dom";

import type { UserRole } from "@/api/auth";
import { buildLoginRedirectState, resolvePostLoginRedirect } from "@/lib/authRedirect";
import { useAuthStore } from "@/store/auth";

function RouteStatePage({ title, description }: { title: string; description: string }) {
  return (
    <main className="auth-layout">
      <section className="auth-panel space-y-3">
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        <p className="max-w-md text-sm text-steel">{description}</p>
      </section>
    </main>
  );
}

export function RequireGuest() {
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const mustChangePassword = useAuthStore((state) => state.user?.mustChangePassword);

  if (status === "loading") {
    return (
      <RouteStatePage
        title="Проверка сессии"
        description="Подтягиваем текущего пользователя перед показом auth-экрана."
      />
    );
  }

  if (status === "authenticated") {
    return (
      <Navigate
        replace
        to={
          mustChangePassword
            ? "/profile"
            : resolvePostLoginRedirect(location.state, "/dashboard")
        }
      />
    );
  }

  return <Outlet />;
}

export function RequireAuth() {
  const location = useLocation();
  const status = useAuthStore((state) => state.status);

  if (status === "loading") {
    return (
      <RouteStatePage
        title="Загрузка рабочей среды"
        description="Проверяем сохраненную сессию и права доступа."
      />
    );
  }

  if (status === "anonymous") {
    return (
      <Navigate
        replace
        state={buildLoginRedirectState(
          location,
          "Войдите в аккаунт, чтобы открыть нужную запись.",
        )}
        to="/login"
      />
    );
  }

  return <Outlet />;
}

export function RequireRoles({ allowedRoles }: { allowedRoles: UserRole[] }) {
  const location = useLocation();
  const status = useAuthStore((state) => state.status);
  const userRole = useAuthStore((state) => state.user?.role);

  if (status === "loading") {
    return (
      <RouteStatePage
        title="Проверка доступа"
        description="Уточняем роль пользователя перед открытием раздела."
      />
    );
  }

  if (status === "anonymous") {
    return (
      <Navigate
        replace
        state={buildLoginRedirectState(
          location,
          "Войдите в аккаунт, чтобы открыть нужную запись.",
        )}
        to="/login"
      />
    );
  }

  if (!userRole || !allowedRoles.includes(userRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
