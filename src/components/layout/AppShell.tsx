import { useCallback, useEffect, type ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/layout/NotificationBell";

interface AppShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  statusBar?: ReactNode;
  contentClassName?: string;
  showHomeLink?: boolean;
  onSearchOpen?: () => void;
}

export function AppShell({
  title,
  subtitle,
  children,
  actions,
  statusBar,
  contentClassName,
  onSearchOpen,
}: AppShellProps) {
  useEffect(() => {
    if (!onSearchOpen) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onSearchOpen();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onSearchOpen]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar onSearchOpen={onSearchOpen} />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Top header bar */}
          <header className="sticky top-0 z-40 border-b border-border bg-card/80 backdrop-blur-sm px-3 md:px-4 h-12 flex items-center gap-3 shrink-0">
            <SidebarTrigger className="-ml-1" />
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h1 className="text-sm font-semibold text-foreground truncate">{title}</h1>
              {subtitle && (
                <>
                  <span className="text-muted-foreground/40 hidden sm:inline">/</span>
                  <span className="text-xs text-muted-foreground truncate hidden sm:inline">{subtitle}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <NotificationBell />
              {actions}
            </div>
          </header>

          {statusBar}

          <main className={cn("flex-1 min-h-0", contentClassName)}>
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
