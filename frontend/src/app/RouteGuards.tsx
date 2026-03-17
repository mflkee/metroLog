import { Navigate, Outlet } from "react-router-dom";

import type { UserRole } from "@/api/auth";
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
  const status = useAuthStore((state) => state.status);

  if (status === "loading") {
    return (
      <RouteStatePage
        title="Проверка сессии"
        description="Подтягиваем текущего пользователя перед показом auth-экрана."
      />
    );
  }

  if (status === "authenticated") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export function RequireAuth() {
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
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function RequireRoles({ allowedRoles }: { allowedRoles: UserRole[] }) {
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
    return <Navigate to="/login" replace />;
  }

  if (!userRole || !allowedRoles.includes(userRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
