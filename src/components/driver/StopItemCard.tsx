import { useState } from "react";
import { Camera, CheckCircle2, Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type StopItem } from "@/types/route-stop";

interface StopItemCardProps {
  item: StopItem;
  locked: boolean;
  onVerify: () => void;
  onNotesChange: (notes: string) => void;
  onPhotoAdd: (file: File) => void;
  onDispute?: () => void;
  onException: () => void;
  showDispute?: boolean;
}

export function StopItemCard({
  item,
  locked,
  onVerify,
  onNotesChange,
  onPhotoAdd,
  onDispute,
  onException,
  showDispute = true,
}: StopItemCardProps) {
  const [notes, setNotes] = useState(item.notes);

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <p className="font-medium text-base">
          {item.rugTag} {item.rugSize && `— ${item.rugSize} ft`}
        </p>
        {item.status === "exception" && item.exceptionCode && (
          <p className="text-xs text-muted-foreground">Exception: {item.exceptionCode}</p>
        )}
      </div>

      {locked ? (
        <div className="space-y-1">
          <p className="text-sm flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-primary" /> {item.status}
          </p>
          {item.phase === "delivery" && item.loadedOnTruck && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Truck className="h-3 w-3" /> Loaded on truck
            </p>
          )}
          <p className="text-sm text-muted-foreground">Notes: {item.notes || "—"}</p>
        </div>
      ) : (
        <>
          <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
            <Checkbox checked={item.status === "verified"} onCheckedChange={onVerify} className="h-5 w-5" />
            <span className="text-sm font-medium">Verified</span>
            {item.phase === "delivery" && item.loadedOnTruck && (
              <Badge variant="outline" className="text-xs ml-auto">
                <Truck className="h-3 w-3 mr-1" /> Loaded
              </Badge>
            )}
          </label>
          <div>
            <label className="text-sm text-muted-foreground">Notes</label>
            <Input
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                onNotesChange(e.target.value);
              }}
              placeholder="Optional notes…"
              className="mt-1 min-h-[44px]"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Photos</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {item.photos.map((photo) => (
                <div key={photo} className="relative h-14 w-14 rounded border overflow-hidden">
                  <img src={photo} alt="Evidence" className="h-full w-full object-cover" />
                </div>
              ))}
              <label className="h-14 w-14 rounded border border-dashed flex items-center justify-center text-muted-foreground cursor-pointer hover:text-foreground hover:border-primary">
                <Camera className="h-4 w-4" />
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      onPhotoAdd(file);
                    }
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            {showDispute && onDispute && (
              <Button variant="outline" size="sm" onClick={onDispute}>
                Dispute
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onException}>
              Exception
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
