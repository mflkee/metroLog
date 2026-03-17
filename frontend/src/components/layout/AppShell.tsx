import type { ReactNode } from "react";

import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen min-w-full bg-mist text-ink">
      <div className="grid min-h-screen min-w-full grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Sidebar />
        <div className="flex min-h-screen min-w-0 flex-col">
          <Topbar />
          <main className="flex-1 px-4 pb-8 pt-4 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
