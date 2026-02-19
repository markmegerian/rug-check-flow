import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PORTAL_RUGS, PORTAL_PICKUPS } from "@/data/mock-portal";
import { useToast } from "@/hooks/use-toast";
import { Truck } from "lucide-react";

export default function PortalPickupsTab() {
  const { toast } = useToast();
  const readyRugs = PORTAL_RUGS.filter((r) => r.status === "ready");

  return (
    <div className="space-y-6">
      {/* Ready for Pickup */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">
          Ready for Pickup ({readyRugs.length} rug{readyRugs.length !== 1 ? "s" : ""})
        </h3>
        {readyRugs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rugs ready for pickup right now.</p>
        ) : (
          <div className="space-y-2">
            {readyRugs.map((rug) => (
              <div key={rug.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium">{rug.rugNumber}</span>
                  <span className="text-muted-foreground">{rug.rugType}</span>
                  <span className="text-muted-foreground truncate max-w-[200px]">{rug.services.join(", ")}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Ready since {new Date(rug.checkedInDate).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                </span>
              </div>
            ))}
            <Button
              className="mt-2"
              onClick={() => toast({ title: "Pickup requested", description: "We'll confirm your pickup time shortly." })}
            >
              <Truck className="mr-2 h-4 w-4" />
              Request Pickup
            </Button>
          </div>
        )}
      </div>

      {/* Scheduled Pickups */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Scheduled Pickups</h3>
        {PORTAL_PICKUPS.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pickups scheduled.</p>
        ) : (
          <div className="space-y-2">
            {PORTAL_PICKUPS.map((pickup) => (
              <div key={pickup.id} className="flex items-center justify-between rounded-md border p-3">
                <div className="text-sm">
                  <span className="font-medium">
                    {new Date(pickup.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="text-muted-foreground ml-2">
                    — {pickup.rugNumbers.length} rug{pickup.rugNumbers.length !== 1 ? "s" : ""} ({pickup.rugNumbers.join(", ")})
                  </span>
                </div>
                <Badge variant={pickup.status === "confirmed" ? "secondary" : "outline"}>
                  {pickup.status === "confirmed" ? "Confirmed" : "Pending"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
