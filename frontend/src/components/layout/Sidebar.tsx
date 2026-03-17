import { NavLink } from "react-router-dom";

import { getNavigationItems } from "@/lib/nav";
import { useAuthStore } from "@/store/auth";

export function Sidebar() {
  const userRole = useAuthStore((state) => state.user?.role);
  const navigationItems = getNavigationItems(userRole);

  return (
    <aside className="border-b border-line bg-white/85 px-4 py-6 shadow-panel backdrop-blur lg:border-b-0 lg:border-r">
      <div className="mb-8 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-signal-info">
          metroLog
        </p>
        <h1 className="text-2xl font-semibold text-ink">Operational shell</h1>
        <p className="text-sm text-steel">
          Постоянная навигация между разделами, как листы Excel, но в нормальном приложении.
        </p>
      </div>

      <nav className="space-y-2">
        {navigationItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                "block rounded-2xl border px-4 py-3 transition",
                isActive
                  ? "border-signal-info bg-[#eaf4f8] text-ink"
                  : "border-transparent bg-transparent text-steel hover:border-line hover:bg-white",
              ].join(" ")
            }
          >
            <div className="text-sm font-semibold">{item.label}</div>
            <div className="mt-1 text-xs">{item.description}</div>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
