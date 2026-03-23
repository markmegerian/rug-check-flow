import { format } from "date-fns";
import {
  MapPin,
  Package,
  ArrowUpFromLine,
  CheckCircle2,
  Clock,
  ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/PageState";
import { type Stop } from "@/types/route-stop";

interface RouteListViewProps {
  stops: Stop[];
  onSelectStop: (stopId: string) => void;
  onStartStop: (stopId: string) => void;
}

function StatusIndicator({ status }: { status: Stop["status"] }) {
  switch (status) {
    case "in_progress":
      return (
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500" />
        </span>
      );
    case "completed":
    case "completed_with_exceptions":
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "unable_to_complete":
      return <CheckCircle2 className="h-4 w-4 text-muted-foreground" />;
    default:
      return <span className="inline-flex h-3 w-3 rounded-full bg-gray-300" />;
  }
}

function isCompleted(status: Stop["status"]) {
  return (
    status === "completed" ||
    status === "completed_with_exceptions" ||
    status === "unable_to_complete"
  );
}

export function RouteListView({
  stops,
  onSelectStop,
  onStartStop,
}: RouteListViewProps) {
  const completedCount = stops.filter((s) => isCompleted(s.status)).length;
  const totalCount = stops.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  if (stops.length === 0) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        <EmptyState
          className="border-dashed"
          title="No stops today"
          description="You have no assigned stops for today. Check back later or contact dispatch."
        />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      {/* Section header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Today's Route</h2>
          <span className="text-sm text-muted-foreground">
            {completedCount} of {totalCount} completed
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Stop cards */}
      <div className="space-y-3">
        {stops.map((stop, i) => {
          const completed = isCompleted(stop.status);
          const inProgress = stop.status === "in_progress";

          return (
            <div
              key={stop.id}
              className={`rounded-lg border bg-card p-4 space-y-3 shadow-card animate-fade-in-up ${
                completed ? "opacity-60" : ""
              } ${completed ? "cursor-pointer" : ""}`}
              style={{ animationDelay: `${i * 60}ms`, opacity: 0 }}
              onClick={completed ? () => onSelectStop(stop.id) : undefined}
            >
              {/* Top row: status + client info + chevron */}
              <div className="flex items-start gap-3">
                <div className="mt-1 flex-shrink-0">
                  <StatusIndicator status={stop.status} />
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-base ${completed ? "text-muted-foreground" : ""}`}>
                    {stop.clientName}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground truncate">
                      {stop.clientAddress}
                    </p>
                  </div>
                </div>

                {completed && (
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
                )}
              </div>

              {/* Badges row */}
              <div className="flex items-center gap-2 pl-6">
                <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">
                  <Package className="h-3 w-3 mr-1" />
                  {stop.deliveryItems.length} {stop.deliveryItems.length === 1 ? "delivery" : "deliveries"}
                </Badge>
                <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100">
                  <ArrowUpFromLine className="h-3 w-3 mr-1" />
                  {stop.pickupItems.length} {stop.pickupItems.length === 1 ? "pickup" : "pickups"}
                </Badge>
              </div>

              {/* Completion time for completed stops */}
              {completed && stop.completedAt && (
                <div className="flex items-center gap-1 pl-6 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    Completed at {format(new Date(stop.completedAt), "h:mm a")}
                  </span>
                </div>
              )}

              {/* Action buttons */}
              {inProgress && (
                <div className="pl-6">
                  <Button
                    className="w-full min-h-[44px]"
                    onClick={() => onSelectStop(stop.id)}
                  >
                    Continue
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              )}

              {stop.status === "queued" && (
                <div className="pl-6">
                  <Button
                    className="w-full min-h-[44px]"
                    variant="outline"
                    onClick={() => {
                      onStartStop(stop.id);
                      onSelectStop(stop.id);
                    }}
                  >
                    Begin Assignment
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
