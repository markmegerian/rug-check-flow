import { format } from "date-fns";
import {
  ArrowLeft,
  Lock,
  Truck,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import SignatureCanvas from "@/components/driver/SignatureCanvas";
import { StopItemCard } from "@/components/driver/StopItemCard";
import { type Stop } from "@/types/route-stop";

interface StopDetailViewProps {
  stop: Stop;
  isOnline: boolean;
  onBack: () => void;
  onSignOut: () => void;
  onStartStop: () => void;
  onFinalizeTruck: () => void;
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
  onSignOut,
  onStartStop,
  onFinalizeTruck,
  onCompleteStop,
  onVerifyItem,
  onItemNotes,
  onItemPhoto,
  onItemDispute,
  onItemException,
  onSignature,
}: StopDetailViewProps) {
  const locked = ["completed", "completed_with_exceptions", "unable_to_complete"].includes(stop.status);
  const allItems = [...stop.deliveryItems, ...stop.pickupItems];
  const allResolved = allItems.every((item) => ["verified", "skipped", "disputed", "exception"].includes(item.status));
  const hasSignature = Boolean(stop.signatureDataUrl);
  const canComplete = allResolved && hasSignature && !locked;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              className="min-h-[44px] min-w-[44px] flex items-center justify-center -ml-2"
              onClick={onBack}
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold truncate">{stop.clientName}</h1>
          </div>
          <div className="flex items-center gap-2">
            {!isOnline && (
              <div className="flex items-center gap-1 text-xs">
                <WifiOff className="h-4 w-4" />
                <span>Offline</span>
              </div>
            )}
            {stop.pendingEventCount > 0 && (
              <div className="flex items-center gap-1 text-xs">
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>{stop.pendingEventCount}</span>
              </div>
            )}
            <Button variant="secondary" size="sm" onClick={onSignOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>
      <main className="p-4 space-y-4 max-w-lg mx-auto">
        {locked && (
          <Alert>
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Stop {stop.status === "completed" ? "completed" : stop.status === "completed_with_exceptions" ? "completed with exceptions" : "marked unable to complete"} on{" "}
              {stop.completedAt
                ? format(new Date(stop.completedAt), "M/d/yyyy") + " at " + format(new Date(stop.completedAt), "h:mm a")
                : "unknown date"}
              . Record is locked.
            </AlertDescription>
          </Alert>
        )}

        {stop.status === "queued" && (
          <Button className="w-full min-h-[48px] text-base" onClick={onStartStop}>
            Start Stop
          </Button>
        )}

        {/* Finalize Truck Button */}
        {stop.status === "in_progress" &&
          stop.deliveryListId &&
          stop.deliveryItems.length > 0 && (
            <div className="space-y-2">
              <Button
                className="w-full min-h-[48px] text-base bg-green-600 hover:bg-green-700"
                onClick={onFinalizeTruck}
                disabled={
                  !stop.deliveryItems.every((item) => item.status === "verified" && item.loadedOnTruck)
                }
              >
                <Truck className="mr-2 h-4 w-4" />
                Finalize Truck
              </Button>
              {!stop.deliveryItems.every((item) => item.status === "verified" && item.loadedOnTruck) && (
                <p className="text-xs text-muted-foreground text-center">
                  All delivery items must be verified and loaded before finalizing truck
                </p>
              )}
            </div>
          )}

        {/* Delivery Items */}
        <section>
          <h3 className="text-sm font-semibold mb-2">Delivery Items ({stop.deliveryItems.length})</h3>
          {stop.deliveryItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No delivery items</p>
          ) : (
            <div className="space-y-3">
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
            </div>
          )}
        </section>

        {/* Pickup Items */}
        <section>
          <h3 className="text-sm font-semibold mb-2">Pickup Items ({stop.pickupItems.length})</h3>
          {stop.pickupItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pickup items</p>
          ) : (
            <div className="space-y-3">
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
            </div>
          )}
        </section>

        {/* Signature */}
        {locked ? (
          stop.signatureDataUrl && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Signature</p>
              <img
                src={stop.signatureDataUrl}
                alt="Signature"
                className="w-full h-[150px] rounded-md border border-input bg-background object-contain"
              />
            </div>
          )
        ) : (
          <>
            <SignatureCanvas
              onSignatureChange={(url) => onSignature(url)}
              disabled={false}
              initialDataUrl={stop.signatureDataUrl}
            />
            <div className="space-y-2 pt-2">
              <Button
                className="w-full min-h-[48px] text-base"
                disabled={!canComplete}
                onClick={onCompleteStop}
              >
                Complete Stop
              </Button>
              {!canComplete && (
                <p className="text-xs text-muted-foreground text-center">
                  {!allResolved && "All items must be verified, skipped, disputed, or exception. "}
                  {!hasSignature && "Signature is required."}
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
