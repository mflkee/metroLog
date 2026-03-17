import { NavLink } from "react-router-dom";

import { getNavigationItems } from "@/lib/nav";
import { useAuthStore } from "@/store/auth";

type SidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

export function Sidebar({ collapsed, onToggleCollapsed }: SidebarProps) {
  const userRole = useAuthStore((state) => state.user?.role);
  const navigationItems = getNavigationItems(userRole);

  return (
    <aside
      className={[
        "border-b border-line bg-white/85 py-5 shadow-panel backdrop-blur transition-[padding] duration-300 lg:border-b-0 lg:border-r",
        collapsed ? "px-3 lg:px-2.5" : "px-4 lg:px-4",
      ].join(" ")}
    >
      <div className={["mb-6 flex", collapsed ? "lg:justify-center" : "justify-start"].join(" ")}>
        <button
          aria-label={collapsed ? "Развернуть левое меню" : "Свернуть левое меню"}
          className="sidebar-toggle"
          type="button"
          onClick={onToggleCollapsed}
        >
          <span className="sidebar-toggle__line" />
          <span className="sidebar-toggle__line" />
          <span className="sidebar-toggle__line" />
        </button>
      </div>

      <nav className="space-y-2">
        {navigationItems.map((item) => (
          <NavLink
            key={item.to}
            title={`${item.label} — ${item.description}`}
            to={item.to}
            className={({ isActive }) =>
              [
                "block rounded-2xl border transition",
                collapsed ? "px-3 py-3 lg:px-2.5" : "px-4 py-3",
                isActive
                  ? "border-signal-info bg-[#eaf4f8] text-ink"
                  : "border-transparent bg-transparent text-steel hover:border-line hover:bg-white",
              ].join(" ")
            }
          >
            <div className={["flex items-center gap-3", collapsed ? "lg:justify-center" : ""].join(" ")}>
              <div className="nav-icon-badge">
                <span className="nf-icon text-lg leading-none">{item.icon}</span>
              </div>
              <div className={collapsed ? "block lg:hidden" : "block"}>
                <div className="text-sm font-semibold">{item.label}</div>
                <div className="mt-1 text-xs">{item.description}</div>
              </div>
            </div>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
