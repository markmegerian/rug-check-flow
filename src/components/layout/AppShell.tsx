import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Home, LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
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
  showHomeLink = true,
  onSearchOpen,
}: AppShellProps) {
  const { user, signOut, isSuperAdmin } = useAuth();

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
    <div className="min-h-screen bg-gradient-to-b from-muted/30 via-background to-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 shadow-sm backdrop-blur-md px-4 md:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {showHomeLink ? (
            <Link
              to="/"
              className="h-9 w-9 rounded-xl border border-border bg-card inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors shrink-0"
              aria-label="Back to home"
            >
              <Home className="h-4 w-4" />
            </Link>
          ) : null}
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold text-foreground truncate tracking-tight">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-xs md:text-sm text-muted-foreground truncate">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {onSearchOpen && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSearchOpen}
              className="gap-1.5 text-muted-foreground"
            >
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline text-xs">Search</span>
              <kbd className="hidden sm:inline-flex h-5 items-center rounded border bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                ⌘K
              </kbd>
            </Button>
          )}
          {actions}
          {isSuperAdmin ? (
            <Badge className="border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300">
              Superadmin
            </Badge>
          ) : null}
          <span className="hidden md:inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            Live Workspace
          </span>
          <span className="text-sm text-muted-foreground hidden lg:inline">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-1" /> Sign Out
          </Button>
        </div>
      </header>
      {statusBar}
      <main className={cn("flex-1 min-h-0", contentClassName)}>{children}</main>
    </div>
  );
}
