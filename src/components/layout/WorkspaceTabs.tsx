import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceTabItem<T extends string> = {
  id: T;
  label: string;
  icon: LucideIcon;
};

export type WorkspaceTabGroup<T extends string> = {
  label: string;
  tabs: readonly WorkspaceTabItem<T>[];
};

interface WorkspaceTabsProps<T extends string> {
  tabs: readonly WorkspaceTabItem<T>[];
  groups?: readonly WorkspaceTabGroup<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  desktopWidthClassName?: string;
  className?: string;
  mobileLabelMode?: "always" | "desktop-only";
}

function TabButton<T extends string>({
  tab,
  active,
  onTabChange,
}: {
  tab: WorkspaceTabItem<T>;
  active: boolean;
  onTabChange: (tab: T) => void;
}) {
  const Icon = tab.icon;
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
}

export function WorkspaceTabs<T extends string>({
  tabs,
  groups,
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
      {groups
        ? groups.map((group, gi) => (
            <div key={group.label} className="flex items-center gap-1 shrink-0">
              {gi > 0 && (
                <div className="h-5 w-px bg-border mx-1.5 shrink-0" />
              )}
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium pr-1 hidden md:inline">
                {group.label}
              </span>
              {group.tabs.map((tab) => (
                <TabButton
                  key={tab.id}
                  tab={tab}
                  active={activeTab === tab.id}
                  onTabChange={onTabChange}
                />
              ))}
            </div>
          ))
        : tabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              active={activeTab === tab.id}
              onTabChange={onTabChange}
            />
          ))}
    </nav>
  );
}
