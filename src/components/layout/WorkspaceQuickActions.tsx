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
    <section className={cn("border-b border-border bg-muted/20 px-3 md:px-4 py-3", className)}>
      <div className="grid gap-2 md:gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          const isActive = activeTab === action.tab;
          return (
            <button
              key={action.id}
              onClick={() => onSelectTab(action.tab)}
              className={cn(
                "text-left rounded-lg border px-3 py-3 transition-colors",
                isActive
                  ? "bg-background border-primary/50 shadow-sm"
                  : "bg-card border-border hover:bg-background"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Quick task</p>
                  <p className="text-sm font-semibold text-foreground truncate">{action.title}</p>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
                <div className="rounded-md p-1.5 bg-primary/10 text-primary shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="pt-2 flex items-center gap-1 text-xs font-medium text-primary">
                Open <ArrowRight className="h-3 w-3" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
