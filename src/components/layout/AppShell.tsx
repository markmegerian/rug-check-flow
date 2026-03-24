import { useEffect, type ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { cn } from "@/lib/utils";

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
      <div className="min-h-screen w-full bg-transparent">
        <div className="flex min-h-screen w-full bg-transparent">
          <AppSidebar onSearchOpen={onSearchOpen} />

          <div className="flex-1 flex min-w-0 flex-col">
            <header className="sticky top-0 z-40 mx-2 mt-2 flex min-h-14 items-center gap-3 rounded-2xl border border-white/60 bg-card/85 px-3 py-2 shadow-[0_10px_40px_-24px_rgba(15,23,42,0.45)] backdrop-blur-xl md:mx-4 md:px-4">
              <SidebarTrigger className="-ml-1 touch-target rounded-xl" />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <h1 className="truncate text-sm font-semibold text-foreground sm:text-base">{title}</h1>
                {subtitle && (
                  <>
                    <span className="hidden text-muted-foreground/40 sm:inline">/</span>
                    <span className="hidden truncate text-xs text-muted-foreground sm:inline">{subtitle}</span>
                  </>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2 empty:hidden">{actions}</div>
            </header>

            {statusBar}

            <main className={cn("flex-1 min-h-0 pb-6", contentClassName)}>{children}</main>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
