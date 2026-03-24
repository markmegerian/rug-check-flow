import { format } from "date-fns";
import {
  ArrowRight,
  CheckCircle2,
  Truck,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/states/PageState";
import { DRIVER_TITLE } from "@/lib/branding";
import { type Stop } from "@/types/route-stop";

interface StopListViewProps {
  queued: Stop[];
  inProgress: Stop[];
  completed: Stop[];
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  onSync: () => void;
  onSignOut: () => void;
  onSelectStop: (stopId: string) => void;
}

export function StopListView({
  queued,
  inProgress,
  completed,
  isOnline,
  pendingCount,
  isSyncing,
  onSync,
  onSignOut,
  onSelectStop,
}: StopListViewProps) {
  return (
    <div className="min-h-screen bg-background/70">
      <header className="sticky top-0 z-10 mx-2 mt-2 rounded-3xl border border-white/20 bg-primary/95 p-4 text-primary-foreground shadow-[0_20px_45px_-30px_rgba(15,23,42,0.7)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            <h1 className="text-lg font-semibold">{DRIVER_TITLE}</h1>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <div className="flex items-center gap-1 text-xs">
                <WifiOff className="h-4 w-4" />
                <span>Offline</span>
              </div>
            )}
            {pendingCount > 0 && (
              <Button variant="secondary" size="sm" className="rounded-xl" onClick={onSync}>
                <RefreshCw className={`h-4 w-4 mr-1 ${isSyncing ? "animate-spin" : ""}`} />
                Sync ({pendingCount})
              </Button>
            )}
            <Button variant="secondary" size="sm" className="rounded-xl" onClick={onSignOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>
      <main className="app-page max-w-2xl space-y-6">
        {inProgress.length > 0 && (
          <section>
            <h2 className="text-base font-semibold mb-3">In Progress ({inProgress.length})</h2>
            <div className="space-y-3">
              {inProgress.map((stop, i) => (
                <div
                  key={stop.id}
                  className="rounded-2xl border border-border/70 bg-card/95 p-4 space-y-2 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.55)] animate-fade-in-up"
                  style={{ animationDelay: `${i * 60}ms`, opacity: 0 }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-base">{stop.clientName}</p>
                      <p className="text-sm text-muted-foreground">{stop.clientAddress}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(`${stop.date}T00:00:00`), "MMM d")} — {stop.deliveryItems.length} delivery, {stop.pickupItems.length} pickup
                      </p>
                    </div>
                    {stop.pendingEventCount > 0 && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        <span>{stop.pendingEventCount}</span>
                      </div>
                    )}
                  </div>
                  <Button className="w-full min-h-[48px] rounded-xl" onClick={() => onSelectStop(stop.id)}>
                    Continue <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        {queued.length > 0 && (
          <section>
            <h2 className="text-base font-semibold mb-3">Queued ({queued.length})</h2>
            <div className="space-y-3">
              {queued.map((stop, i) => (
                <div
                  key={stop.id}
                  className="rounded-2xl border border-border/70 bg-card/95 p-4 space-y-2 shadow-[0_18px_40px_-32px_rgba(15,23,42,0.55)] animate-fade-in-up"
                  style={{ animationDelay: `${i * 60}ms`, opacity: 0 }}
                >
                  <p className="font-medium text-base">{stop.clientName}</p>
                  <p className="text-sm text-muted-foreground">{stop.clientAddress}</p>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(`${stop.date}T00:00:00`), "MMM d")} — {stop.deliveryItems.length} delivery, {stop.pickupItems.length} pickup
                  </p>
                  <Button className="w-full min-h-[48px] rounded-xl" onClick={() => onSelectStop(stop.id)}>
                    Start Stop <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </section>
        )}

        {completed.length > 0 && (
          <section>
            <h2 className="text-base font-semibold mb-3 text-muted-foreground">Completed</h2>
            <div className="space-y-3">
              {completed.map((stop) => (
                <div
                  key={stop.id}
                  className="cursor-pointer rounded-2xl border border-border/70 bg-muted/50 p-4 space-y-1"
                  onClick={() => onSelectStop(stop.id)}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-muted-foreground">{stop.clientName}</p>
                    <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(`${stop.date}T00:00:00`), "MMM d")} — {stop.deliveryItems.length} delivery, {stop.pickupItems.length} pickup
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {queued.length === 0 && inProgress.length === 0 && completed.length === 0 && (
          <EmptyState
            className="border-dashed"
            title="No assigned stops"
            description="New assignments will appear here when dispatch routes work to you."
          />
        )}
      </main>
    </div>
  );
}
