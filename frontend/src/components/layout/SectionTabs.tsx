import { NavLink } from "react-router-dom";

import { getNavigationItems } from "@/lib/nav";
import { useAuthStore } from "@/store/auth";

export function SectionTabs() {
  const userRole = useAuthStore((state) => state.user?.role);
  const navigationItems = getNavigationItems(userRole);

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {navigationItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            [
              "rounded-full border px-3 py-1.5 text-sm transition",
              isActive
                ? "border-signal-info bg-[#eaf4f8] text-ink"
                : "border-line bg-white text-steel hover:border-signal-info hover:text-ink",
            ].join(" ")
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}
