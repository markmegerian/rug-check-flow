import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface BaseStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  icon: ReactNode;
}

function BaseState({ title, description, action, className, icon }: BaseStateProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-8 text-center flex flex-col items-center justify-center gap-2",
        className
      )}
    >
      <div className="text-muted-foreground">{icon}</div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description ? <p className="text-sm text-muted-foreground max-w-md">{description}</p> : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

interface StateProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function LoadingState({
  title = "Loading",
  description = "Please wait while we fetch your data.",
  action,
  className,
}: StateProps) {
  return (
    <BaseState
      title={title}
      description={description}
      action={action}
      className={className}
      icon={<Loader2 className="h-5 w-5 animate-spin" />}
    />
  );
}

export function EmptyState({
  title = "Nothing to show",
  description = "Data will appear here once available.",
  action,
  className,
}: StateProps) {
  return (
    <BaseState
      title={title}
      description={description}
      action={action}
      className={className}
      icon={<Inbox className="h-5 w-5" />}
    />
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "Please try again or contact support if the issue persists.",
  action,
  className,
}: StateProps) {
  return (
    <BaseState
      title={title}
      description={description}
      action={action}
      className={className}
      icon={<AlertTriangle className="h-5 w-5" />}
    />
  );
}
