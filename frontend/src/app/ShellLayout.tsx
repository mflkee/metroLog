import { useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { AppShell, type NavItem, type NavSection } from "@/components/app-shell";
import { FolderRefreshDock } from "@/components/FolderRefreshDock";
import { Icon, type IconName } from "@/components/Icon";
import { WhatsNewModal } from "@/components/WhatsNewModal";
import { AccountMenu } from "@/components/layout/AccountMenu";
import { AppVersionBadge } from "@/components/layout/AppVersionBadge";
import { ArshinStatusIndicator } from "@/components/layout/ArshinStatusIndicator";
import { getNavigationItems, type NavigationItem } from "@/lib/nav";
import { useAuthStore } from "@/store/auth";

/**
 * The navigation is data: the shell (from `@metro/app-shell`) renders whatever it is handed, so the
 * app keeps only its own list and its own icons.
 */
function toShellNavItem(item: NavigationItem): NavItem {
  return {
    to: item.to,
    label: item.label,
    description: item.description,
    icon: <Icon className={item.icon === "arshin" ? "h-9 w-9" : undefined} name={item.icon as IconName} />,
  };
}

const HELP_SECTION: NavSection = {
  label: "Справка",
  items: [
    {
      to: "/help",
      label: "Документация",
      description: "Сценарии работы и подсказки",
      icon: <Icon name="help" />,
    },
  ],
};

const TEMPORARY_PASSWORD_BANNER =
  "Временный пароль еще активен. Продолжение работы доступно только после смены пароля в профиле.";

export function ShellLayout() {
  const location = useLocation();
  const user = useAuthStore((state) => state.user);
  const mustChangePassword = user?.mustChangePassword;
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);

  if (mustChangePassword && location.pathname !== "/profile") {
    return <Navigate to="/profile" replace />;
  }

  const nav: NavSection[] = [{ items: getNavigationItems(user?.role).map(toShellNavItem) }];

  return (
    <>
      <AppShell
        banner={mustChangePassword ? TEMPORARY_PASSWORD_BANNER : undefined}
        brand="metroLog"
        brandTo="/dashboard"
        help={HELP_SECTION}
        mobileNavTitle="metroLog"
        nav={nav}
        statusIndicator={<ArshinStatusIndicator />}
        topbarActions={<AccountMenu />}
        versionBadge={<AppVersionBadge onClick={() => setWhatsNewOpen(true)} />}
      >
        <Outlet />
      </AppShell>
      {/* Outside the shell's content on purpose: the rescan panel must survive page navigation. */}
      <FolderRefreshDock />
      <WhatsNewModal open={whatsNewOpen} onClose={() => setWhatsNewOpen(false)} />
    </>
  );
}
