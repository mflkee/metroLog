import { Navigate, Outlet, useLocation } from "react-router-dom";

import { AppShell } from "@/components/layout/AppShell";
import { useAuthStore } from "@/store/auth";

export function ShellLayout() {
  const location = useLocation();
  const mustChangePassword = useAuthStore((state) => state.user?.mustChangePassword);

  if (mustChangePassword && location.pathname !== "/profile") {
    return <Navigate to="/profile" replace />;
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
