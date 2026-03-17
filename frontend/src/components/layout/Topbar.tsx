import { Link, useLocation } from "react-router-dom";

import { AccountMenu } from "@/components/layout/AccountMenu";
import { SectionTabs } from "@/components/layout/SectionTabs";

export function Topbar() {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-white/85 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.24em] text-steel">
            <span>{location.pathname}</span>
            <span className="rounded-full bg-[#edf2f5] px-2 py-1 text-[10px] font-semibold text-signal-ok">
              foundation
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link className="text-lg font-semibold text-ink" to="/dashboard">
              metroLog Workspace
            </Link>
            <p className="hidden text-sm text-steel md:block">
              Общий навигационный каркас доступен на каждой внутренней странице.
            </p>
          </div>
        </div>
        <AccountMenu />
      </div>
      <SectionTabs />
    </header>
  );
}

