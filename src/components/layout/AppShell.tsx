import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Home, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface AppShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  actions?: ReactNode;
  contentClassName?: string;
}

export function AppShell({
  title,
  subtitle,
  children,
  actions,
  contentClassName,
}: AppShellProps) {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/80 backdrop-blur-md px-4 md:px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/"
            className="h-8 w-8 rounded-md border border-border inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
            aria-label="Back to home"
          >
            <Home className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-base md:text-lg font-semibold text-foreground truncate">
              {title}
            </h1>
            {subtitle ? (
              <p className="text-xs md:text-sm text-muted-foreground truncate">{subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          {actions}
          <span className="text-sm text-muted-foreground hidden lg:inline">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-1" /> Sign Out
          </Button>
        </div>
      </header>
      <main className={cn("flex-1 min-h-0", contentClassName)}>{children}</main>
    </div>
  );
}
