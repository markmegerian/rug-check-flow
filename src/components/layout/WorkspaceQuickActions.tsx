import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceQuickAction<T extends string> = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  tab: T;
};

interface WorkspaceQuickActionsProps<T extends string> {
  actions: readonly WorkspaceQuickAction<T>[];
  activeTab: T;
  onSelectTab: (tab: T) => void;
  className?: string;
}

export function WorkspaceQuickActions<T extends string>({
  actions,
  activeTab,
  onSelectTab,
  className,
}: WorkspaceQuickActionsProps<T>) {
  return (
    <section className={cn("border-b border-border bg-muted/30 px-3 md:px-4 py-3", className)}>
      <div className="grid gap-2 md:gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          const isActive = activeTab === action.tab;
          return (
            <button
              key={action.id}
              onClick={() => onSelectTab(action.tab)}
              className={cn(
                "text-left rounded-xl border px-3 py-3 transition-all hover:-translate-y-0.5",
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-md"
                  : "bg-card border-border hover:bg-background hover:shadow-sm"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <p className={cn("text-xs", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    Quick task
                  </p>
                  <p className={cn("text-sm font-semibold truncate", isActive ? "text-primary-foreground" : "text-foreground")}>
                    {action.title}
                  </p>
                  <p className={cn("text-xs", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>
                    {action.description}
                  </p>
                </div>
                <div
                  className={cn(
                    "rounded-md p-1.5 shrink-0",
                    isActive ? "bg-primary-foreground/15 text-primary-foreground" : "bg-primary/10 text-primary"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div
                className={cn(
                  "pt-2 flex items-center gap-1 text-xs font-medium",
                  isActive ? "text-primary-foreground" : "text-primary"
                )}
              >
                Open <ArrowRight className="h-3 w-3" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
