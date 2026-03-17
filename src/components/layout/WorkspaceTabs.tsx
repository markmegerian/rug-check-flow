import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceTabItem<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
};

interface WorkspaceTabsProps<T extends string> {
  tabs: readonly WorkspaceTabItem<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  desktopWidthClassName?: string;
  className?: string;
  mobileLabelMode?: "always" | "desktop-only";
}

export function WorkspaceTabs<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  className,
}: WorkspaceTabsProps<T>) {
  return (
    <nav
      className={cn(
        "flex items-center gap-1 px-3 md:px-4 py-2 border-b border-border bg-card overflow-x-auto scrollbar-hide shrink-0",
        className,
      )}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors shrink-0",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
