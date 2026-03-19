import { NavLink } from "react-router-dom";

import { Icon, type IconName } from "@/components/Icon";
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
        collapsed ? "px-2.5 lg:px-2" : "px-4 lg:px-4",
      ].join(" ")}
    >
      <div className={["mb-6 flex", collapsed ? "lg:justify-center" : "justify-end"].join(" ")}>
        <button
          aria-label={collapsed ? "Развернуть левое меню" : "Свернуть левое меню"}
          className="sidebar-toggle"
          type="button"
          onClick={onToggleCollapsed}
        >
          <svg className="h-6 w-6" viewBox="0 0 1024 1024" fill="currentColor">
            <path d="M768 102.4c54.186667 0 100.437333 19.2 138.752 57.514667C945.109333 198.229333 964.266667 244.48 964.266667 298.666667v426.666666c0 54.186667-19.2 100.437333-57.514667 138.794667C868.437333 902.4 822.186667 921.6 768 921.6H256c-54.186667 0-100.437333-19.2-138.752-57.514667C78.890667 825.813333 59.733333 779.52 59.733333 725.333333V298.666667c0-54.186667 19.2-100.437333 57.514667-138.752C155.562667 121.6 201.770667 102.4 256 102.4h512z m-512 85.333333c-73.941333 0-110.933333 36.992-110.933333 110.933334v426.666666c0 73.941333 36.949333 110.933333 110.933333 110.933334h85.333333V187.733333H256z m170.666667 648.533334h341.333333c73.941333 0 110.933333-36.992 110.933333-110.933334V298.666667c0-73.941333-36.992-110.933333-110.933333-110.933334h-341.333333v648.533334z" />
          </svg>
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
                collapsed ? "px-2.5 py-3 lg:px-2" : "px-4 py-3",
                isActive
                  ? "border-signal-info bg-[#eaf4f8] text-ink"
                  : "border-transparent bg-transparent text-steel hover:border-line hover:bg-white",
              ].join(" ")
            }
          >
            <div className={["flex items-center gap-3", collapsed ? "lg:justify-center" : ""].join(" ")}>
              <div className="nav-icon-badge">
                <Icon name={item.icon as IconName} />
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
