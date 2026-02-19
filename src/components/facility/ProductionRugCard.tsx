import { useState } from "react";
import { Check, Circle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ProductionRug,
  ServiceTask,
  ServiceStatus,
  ProductionStage,
  PRODUCTION_STAGES,
  STAFF_MEMBERS,
  currentStaffName,
} from "@/data/production";

interface ProductionRugCardProps {
  rug: ProductionRug;
  editMode: boolean;
  onUpdateServices: (rugId: string, services: ServiceTask[]) => void;
  onAdvanceStage: (rugId: string) => void;
}

function StatusIcon({ status }: { status: ServiceStatus }) {
  if (status === "complete")
    return <Check className="h-3.5 w-3.5 text-green-600" />;
  if (status === "in_progress")
    return <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
}

export function ProductionRugCard({
  rug,
  editMode,
  onUpdateServices,
  onAdvanceStage,
}: ProductionRugCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const allComplete = rug.services.every((s) => s.status === "complete");
  const stageIndex = PRODUCTION_STAGES.findIndex((s) => s.id === rug.stage);
  const isLastStage = stageIndex === PRODUCTION_STAGES.length - 1;

  const myPending = rug.services.filter(
    (s) => s.assignedTo === currentStaffName && s.status === "pending"
  );
  const myInProgress = rug.services.filter(
    (s) => s.assignedTo === currentStaffName && s.status === "in_progress"
  );

  const handleStartAll = () => {
    const updated = rug.services.map((s) =>
      s.assignedTo === currentStaffName && s.status === "pending"
        ? { ...s, status: "in_progress" as const }
        : s
    );
    onUpdateServices(rug.id, updated);
  };

  const handleCompleteAll = () => {
    const updated = rug.services.map((s) =>
      s.assignedTo === currentStaffName && s.status === "in_progress"
        ? { ...s, status: "complete" as const }
        : s
    );
    onUpdateServices(rug.id, updated);
  };

  const handleAssignChange = (serviceId: string, staff: string) => {
    const updated = rug.services.map((s) =>
      s.id === serviceId ? { ...s, assignedTo: staff || null } : s
    );
    onUpdateServices(rug.id, updated);
  };

  return (
    <div className="rounded-md border bg-card text-card-foreground shadow-sm">
      {/* Collapsed header */}
      <button
        className="w-full text-left px-3 py-2.5 flex items-start justify-between gap-2"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-sm">{rug.rugNumber}</span>
            <span className="text-sm text-muted-foreground truncate">
              {rug.clientName}
            </span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {rug.length}×{rug.width} ft · {rug.rugType}
          </div>
          {/* Compact service indicators */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {rug.services.map((s) => {
              const dimmed =
                !showAll && s.assignedTo !== currentStaffName;
              return (
                <span
                  key={s.id}
                  className={cn(
                    "inline-flex items-center gap-1 text-xs",
                    dimmed && "opacity-40"
                  )}
                >
                  <StatusIcon status={s.status} />
                  <span className="truncate max-w-[80px]">{s.name}</span>
                </span>
              );
            })}
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t px-3 py-2.5 space-y-2">
          {/* Show All toggle */}
          <button
            className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? "Show mine only" : "Show all services"}
          </button>

          {/* Service list */}
          <ul className="space-y-1.5">
            {rug.services.map((s) => {
              const dimmed =
                !showAll && s.assignedTo !== currentStaffName;
              return (
                <li
                  key={s.id}
                  className={cn(
                    "flex items-center gap-2 text-sm",
                    dimmed && "opacity-40"
                  )}
                >
                  <StatusIcon status={s.status} />
                  <span className="flex-1 truncate">{s.name}</span>
                  {editMode && (
                    <Select
                      value={s.assignedTo ?? ""}
                      onValueChange={(v) => handleAssignChange(s.id, v)}
                    >
                      <SelectTrigger className="h-7 w-24 text-xs">
                        <SelectValue placeholder="Assign" />
                      </SelectTrigger>
                      <SelectContent>
                        {STAFF_MEMBERS.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {!editMode && s.assignedTo && (
                    <Badge variant="outline" className="text-xs h-5 px-1.5">
                      {s.assignedTo}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {myPending.length > 0 && (
              <Button size="sm" variant="secondary" onClick={handleStartAll}>
                Start All Assigned ({myPending.length})
              </Button>
            )}
            {myInProgress.length > 0 && (
              <Button size="sm" variant="secondary" onClick={handleCompleteAll}>
                Complete All Assigned ({myInProgress.length})
              </Button>
            )}
            {!isLastStage && (
              <Button
                size="sm"
                disabled={!allComplete}
                onClick={() => onAdvanceStage(rug.id)}
              >
                Advance Stage
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
