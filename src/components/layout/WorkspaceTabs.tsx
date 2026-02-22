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
        "order-last md:order-first border-t md:border-t-0 md:border-r border-border/80 bg-card/70 backdrop-blur-sm flex md:flex-col shrink-0 z-20 p-1.5 md:p-2 gap-1",
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
              "flex-1 md:flex-none rounded-lg border flex flex-col md:flex-row items-center justify-center md:justify-start gap-0.5 md:gap-3 px-1.5 py-2 md:px-3 md:py-2.5 text-xs md:text-sm font-medium transition-all",
              active
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "text-muted-foreground border-transparent hover:text-foreground hover:bg-background/70"
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
