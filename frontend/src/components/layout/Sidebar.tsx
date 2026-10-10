import { NavLink } from "react-router-dom";

import { Icon, type IconName } from "@/components/Icon";
import { getNavigationItems } from "@/lib/nav";
import { useAuthStore } from "@/store/auth";

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggleCollapsed: () => void;
};

export function Sidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggleCollapsed,
}: SidebarProps) {
  const userRole = useAuthStore((state) => state.user?.role);
  const navigationItems = getNavigationItems(userRole);

  return (
    <>
      <aside
        className={[
          "sidebar-shell hidden lg:sticky lg:top-0 lg:block lg:self-start lg:h-screen lg:overflow-y-auto lg:py-5 lg:backdrop-blur-sm lg:transition-[padding] lg:duration-300",
          collapsed ? "lg:px-1.5" : "lg:px-4",
        ].join(" ")}
      >
        <SidebarContent
          collapsed={collapsed}
          navigationItems={navigationItems}
          onToggleCollapsed={onToggleCollapsed}
        />
      </aside>

      {mobileOpen ? (
        <div className="sidebar-drawer lg:hidden" onClick={onCloseMobile}>
          <aside
            className="sidebar-drawer__panel"
            onClick={(event) => event.stopPropagation()}
          >
            <SidebarContent
              collapsed={false}
              isMobile
              navigationItems={navigationItems}
              onCloseMobile={onCloseMobile}
              onToggleCollapsed={onToggleCollapsed}
            />
          </aside>
        </div>
      ) : null}
    </>
  );
}

function SidebarContent({
  collapsed,
  isMobile = false,
  navigationItems,
  onCloseMobile,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  isMobile?: boolean;
  navigationItems: Array<{ icon: string; label: string; description: string; to: string }>;
  onCloseMobile?: () => void;
  onToggleCollapsed: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {isMobile ? (
        <div className="sidebar-drawer__header">
          <div>
            <p className="sidebar-drawer__eyebrow">Навигация</p>
            <div className="sidebar-drawer__title">metroLog</div>
          </div>
          <button
            aria-label="Закрыть меню"
            className="sidebar-toggle"
            type="button"
            onClick={onCloseMobile}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : (
        <div className={["mb-6 flex", collapsed ? "justify-center" : "justify-end"].join(" ")}>
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
      )}

      <nav className="space-y-2">
        {navigationItems.map((item) => (
          <NavItem
            key={item.to}
            collapsed={collapsed}
            item={item}
            onClick={onCloseMobile}
          />
        ))}
      </nav>

      <div className="mt-auto pt-6">
        <div className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-steel/70">
          <span className={collapsed && !isMobile ? "lg:hidden" : ""}>Справка</span>
        </div>
        <NavItem
          collapsed={collapsed}
          item={{
            icon: "help",
            label: "Документация",
            description: "Сценарии работы и подсказки",
            to: "/help",
          }}
          onClick={onCloseMobile}
        />
      </div>
    </div>
  );
}

function NavItem({
  collapsed,
  item,
  onClick,
}: {
  collapsed: boolean;
  item: { icon: string; label: string; description: string; to: string };
  onClick?: () => void;
}) {
  return (
    <NavLink
      title={`${item.label} — ${item.description}`}
      to={item.to}
      className={({ isActive }) =>
        [
          "sidebar-nav-item block rounded-2xl transition",
          // Collapsed, the row *is* the icon, so the highlight has to be a square around it: a
          // row-shaped pill came out taller than it was wide and read as a stretched rectangle.
          collapsed
            ? "px-2.5 py-3 lg:mx-auto lg:flex lg:h-11 lg:w-11 lg:items-center lg:justify-center lg:rounded-xl lg:p-0"
            : "px-4 py-3",
          isActive ? "sidebar-nav-item--active text-ink" : "bg-transparent text-steel",
        ].join(" ")
      }
      onClick={onClick}
    >
      <div className={["flex items-center gap-3", collapsed ? "lg:justify-center" : ""].join(" ")}>
        <div className="nav-icon-badge">
          <Icon
            className={item.icon === "arshin" ? "h-9 w-9" : undefined}
            name={item.icon as IconName}
          />
        </div>
        <div className={collapsed ? "block lg:hidden" : "block"}>
          <div className="text-sm font-semibold">{item.label}</div>
          <div className="mt-1 text-xs">{item.description}</div>
        </div>
      </div>
    </NavLink>
  );
}
