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
  desktopWidthClassName = "md:w-48",
  className,
  mobileLabelMode = "desktop-only",
}: WorkspaceTabsProps<T>) {
  return (
    <nav
      className={cn(
        "order-last md:order-first border-t md:border-t-0 md:border-r border-border bg-card/60 backdrop-blur-sm flex md:flex-col shrink-0 z-20",
        desktopWidthClassName,
        className
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
              "flex-1 md:flex-none flex flex-col md:flex-row items-center justify-center md:justify-start gap-0.5 md:gap-3 px-1 py-2 md:px-4 md:py-3 text-xs md:text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground md:shadow-sm md:border-r-2 md:border-primary border-t-2 md:border-t-0 border-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span
              className={cn(
                "truncate",
                mobileLabelMode === "desktop-only" ? "hidden md:inline" : "md:inline"
              )}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
