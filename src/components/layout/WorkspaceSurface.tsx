import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface WorkspaceSurfaceProps {
  children: ReactNode;
  fallbackLabel?: string;
  className?: string;
}

export function WorkspaceSurface({ children, className }: WorkspaceSurfaceProps) {
  return (
    <div className={cn("app-hero flex-1 min-h-0 min-w-0 overflow-hidden md:mx-4 md:mt-4", className)}>
      {children}
    </div>
  );
}

export function WorkspaceFallback({ label = "workflow" }: { label?: string }) {
  return <div className="p-6 text-sm text-muted-foreground">Loading {label}…</div>;
}
