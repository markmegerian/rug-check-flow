import { useState } from "react";
import { format } from "date-fns";
import {
  ArrowLeft,
  Lock,
  WifiOff,
  RefreshCw,
  MapPin,
  Package,
  ArrowUpFromLine,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import SignatureCanvas from "@/components/driver/SignatureCanvas";
import { StopItemCard } from "@/components/driver/StopItemCard";
import { type Stop } from "@/types/route-stop";

interface StopDetailViewProps {
  stop: Stop;
  isOnline: boolean;
  onBack: () => void;
  onStartStop: () => void;
  onCompleteStop: () => void;
  onVerifyItem: (itemId: string) => void;
  onItemNotes: (itemId: string, notes: string) => void;
  onItemPhoto: (itemId: string, file: File) => void;
  onItemDispute: (itemId: string, phase: "delivery" | "pickup") => void;
  onItemException: (itemId: string) => void;
  onSignature: (dataUrl: string | null) => void;
}

export function StopDetailView({
  stop,
  isOnline,
  onBack,
  onStartStop,
  onCompleteStop,
  onVerifyItem,
  onItemNotes,
  onItemPhoto,
  onItemDispute,
  onItemException,
  onSignature,
}: StopDetailViewProps) {
  const locked = ["completed", "completed_with_exceptions", "unable_to_complete"].includes(stop.status);
  const hasDeliveries = stop.deliveryItems.length > 0;
  const hasPickups = stop.pickupItems.length > 0;

  const allDeliveriesResolved = stop.deliveryItems.every((item) =>
    ["verified", "skipped", "disputed", "exception"].includes(item.status),
  );
  const allPickupsResolved = stop.pickupItems.every((item) =>
    ["verified", "skipped", "disputed", "exception"].includes(item.status),
  );
  const allItems = [...stop.deliveryItems, ...stop.pickupItems];
  const allResolved = allItems.every((item) =>
    ["verified", "skipped", "disputed", "exception"].includes(item.status),
  );
  const hasSignature = Boolean(stop.signatureDataUrl);
  const canComplete = allResolved && hasSignature && !locked;

  // Phase tracking: delivery phase complete when all delivery items resolved + signature
  const [deliveryPhaseCollapsed, setDeliveryPhaseCollapsed] = useState(false);
  const [pickupPhaseCollapsed, setPickupPhaseCollapsed] = useState(false);

  // Determine current phase for visual guidance
  const deliveryPhaseComplete = !hasDeliveries || allDeliveriesResolved;
  const pickupPhaseComplete = !hasPickups || allPickupsResolved;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2"
              onClick={onBack}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-semibold truncate">{stop.clientName}</h1>
              <p className="text-xs opacity-80 truncate">{stop.clientAddress}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isOnline && (
              <div className="flex items-center gap-1 text-xs">
                <WifiOff className="h-4 w-4" />
              </div>
            )}
            {stop.pendingEventCount > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>{stop.pendingEventCount}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Client Info Card */}
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-sm">{stop.clientAddress || "No address on file"}</p>
          </div>
          <div className="flex items-center gap-3">
            {hasDeliveries && (
              <Badge variant="default" className="gap-1">
                <Package className="h-3 w-3" />
                {stop.deliveryItems.length} deliver{stop.deliveryItems.length !== 1 ? "ies" : "y"}
              </Badge>
            )}
            {hasPickups && (
              <Badge variant="secondary" className="gap-1">
                <ArrowUpFromLine className="h-3 w-3" />
                {stop.pickupItems.length} pickup{stop.pickupItems.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
        </div>

        {/* Locked State */}
        {locked && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Stop {stop.status === "completed" ? "completed" : stop.status === "completed_with_exceptions" ? "completed with exceptions" : "unable to complete"} on{" "}
              {stop.completedAt
                ? format(new Date(stop.completedAt), "M/d/yyyy") + " at " + format(new Date(stop.completedAt), "h:mm a")
                : "unknown date"}.
            </AlertDescription>
          </Alert>
        )}

        {/* Start Stop Button */}
        {stop.status === "queued" && (
          <Button className="w-full min-h-[48px] text-base" onClick={onStartStop}>
            Begin Assignment
          </Button>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* PHASE 1: DELIVERIES                                 */}
        {/* ═══════════════════════════════════════════════════ */}
        {hasDeliveries && (
          <section className="space-y-3">
            <button
              type="button"
              className="w-full flex items-center justify-between"
              onClick={() => setDeliveryPhaseCollapsed(!deliveryPhaseCollapsed)}
            >
              <div className="flex items-center gap-2">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  deliveryPhaseComplete
                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                    : "bg-primary/10 text-primary"
                }`}>
                  {deliveryPhaseComplete ? <CheckCircle2 className="h-4 w-4" /> : "1"}
                </div>
                <h3 className="text-base font-semibold">
                  Deliveries
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    {stop.deliveryItems.filter((i) => i.status === "verified").length}/{stop.deliveryItems.length} verified
                  </span>
                </h3>
              </div>
              {deliveryPhaseCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
            </button>

            {!deliveryPhaseCollapsed && (
              <div className="space-y-3 pl-2 border-l-2 border-primary/20 ml-3">
                <p className="text-xs text-muted-foreground pl-3">
                  Check off each rug as it is removed from the truck and handed to the client.
                </p>
                {stop.deliveryItems.map((item) => (
                  <StopItemCard
                    key={item.id}
                    item={item}
                    locked={locked}
                    onVerify={() => onVerifyItem(item.id)}
                    onNotesChange={(notes) => onItemNotes(item.id, notes)}
                    onPhotoAdd={(file) => onItemPhoto(item.id, file)}
                    onDispute={() => onItemDispute(item.id, "delivery")}
                    onException={() => onItemException(item.id)}
                  />
                ))}

                {/* Delivery confirmation message */}
                {deliveryPhaseComplete && !locked && (
                  <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-3">
                    <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      All deliveries confirmed. Proceed to signature below.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* SIGNATURE (shared for both phases)                  */}
        {/* ═══════════════════════════════════════════════════ */}
        {!locked && stop.status === "in_progress" && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                hasSignature
                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                  : deliveryPhaseComplete && pickupPhaseComplete
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}>
                {hasSignature ? <CheckCircle2 className="h-4 w-4" /> : hasDeliveries && hasPickups ? "3" : "2"}
              </div>
              <h3 className="text-base font-semibold">Customer Signature</h3>
            </div>
            <div className="pl-2 border-l-2 border-primary/20 ml-3">
              <p className="text-xs text-muted-foreground pl-3 mb-2">
                Customer signs to confirm delivery receipt and/or pickup handoff.
              </p>
              <div className="pl-3">
                <SignatureCanvas
                  onSignatureChange={(url) => onSignature(url)}
                  disabled={false}
                  initialDataUrl={stop.signatureDataUrl}
                />
              </div>
            </div>
          </section>
        )}

        {/* Locked signature display */}
        {locked && stop.signatureDataUrl && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Customer Signature</p>
            <img
              src={stop.signatureDataUrl}
              alt="Signature"
              className="w-full h-[150px] rounded-md border border-input bg-background object-contain"
            />
          </div>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* PHASE 2: PICKUPS                                    */}
        {/* ═══════════════════════════════════════════════════ */}
        {hasPickups && (
          <section className="space-y-3">
            <button
              type="button"
              className="w-full flex items-center justify-between"
              onClick={() => setPickupPhaseCollapsed(!pickupPhaseCollapsed)}
            >
              <div className="flex items-center gap-2">
                <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  pickupPhaseComplete
                    ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                    : deliveryPhaseComplete
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                }`}>
                  {pickupPhaseComplete ? <CheckCircle2 className="h-4 w-4" /> : hasDeliveries ? "2" : "1"}
                </div>
                <h3 className="text-base font-semibold">
                  Pickups
                  <span className="text-sm font-normal text-muted-foreground ml-2">
                    {stop.pickupItems.filter((i) => i.status === "verified").length}/{stop.pickupItems.length} verified
                  </span>
                </h3>
              </div>
              {pickupPhaseCollapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
            </button>

            {!pickupPhaseCollapsed && (
              <div className="space-y-3 pl-2 border-l-2 border-primary/20 ml-3">
                <p className="text-xs text-muted-foreground pl-3">
                  Confirm each rug as it is placed on the truck.
                </p>
                {stop.pickupItems.map((item) => (
                  <StopItemCard
                    key={item.id}
                    item={item}
                    locked={locked}
                    onVerify={() => onVerifyItem(item.id)}
                    onNotesChange={(notes) => onItemNotes(item.id, notes)}
                    onPhotoAdd={(file) => onItemPhoto(item.id, file)}
                    onException={() => onItemException(item.id)}
                    showDispute={false}
                  />
                ))}

                {pickupPhaseComplete && !locked && (
                  <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 p-3">
                    <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      All pickups confirmed.
                    </p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ═══════════════════════════════════════════════════ */}
        {/* COMPLETE STOP                                       */}
        {/* ═══════════════════════════════════════════════════ */}
        {!locked && stop.status === "in_progress" && (
          <div className="space-y-3 pt-2">
            <Button
              className="w-full min-h-[52px] text-base font-semibold"
              disabled={!canComplete}
              onClick={onCompleteStop}
            >
              <CheckCircle2 className="mr-2 h-5 w-5" />
              Complete Stop
            </Button>
            {!canComplete && (
              <p className="text-xs text-muted-foreground text-center">
                {!allResolved && "All items must be verified or resolved. "}
                {!hasSignature && "Customer signature is required."}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
