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
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-all shrink-0 border",
        active
          ? "border-primary/15 bg-primary text-primary-foreground shadow-[0_10px_26px_-18px_rgba(15,23,42,0.55)]"
          : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/80 hover:border-border/70",
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
        "flex items-center gap-1 px-3 md:px-4 py-3 border-b border-border/60 bg-white/40 overflow-x-auto scrollbar-hide shrink-0 backdrop-blur-sm",
        className,
      )}
    >
      {groups
        ? groups.map((group, gi) => (
            <div key={group.label} className="flex items-center gap-1 shrink-0">
              {gi > 0 && (
                <div className="mx-2 h-6 w-px bg-border/70 shrink-0" />
              )}
              <span className="hidden pr-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/60 md:inline">
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
