import { useState, useCallback, lazy, Suspense, useRef } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { CheckInForm } from "./CheckInForm";
import { type CheckInEntry } from "@/data/check-in-log";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCheckInData } from "@/hooks/useCheckInData";
import { uploadCheckinPhotoFile } from "@/lib/checkin-operations";
import { getAuthHeaders, safeInvoke } from "@/lib/supabase-helpers";

const PendingRugsPanel = lazy(async () => {
  const module = await import("./PendingRugsPanel");
  return { default: module.PendingRugsPanel };
});

type MobilePanel = "form" | "pending";

type CheckInWorkflowPhoto = {
  storage_path: string;
  public_url?: string | null;
};

type CheckInWorkflowResponse = {
  status: "success" | "warning" | "error";
  rugId?: string;
  intakeJobId?: string | null;
  estimateId?: string | null;
  estimateNumber?: string | null;
  warnings?: string[];
  resetForm?: boolean;
  summary?: {
    rugNumber: string;
    clientName: string;
    checkedInAt: string;
    totalPrice: number;
  };
};

function PanelFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading {label}…
    </div>
  );
}

export function CheckInLayout() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [selectedRugId, setSelectedRugId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [formResetKey, setFormResetKey] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("pending");
  const checkInIdempotencyKeyRef = useRef<string | null>(null);
  const {
    pendingRugs,
    checkInLog,
    addWalkIn,
    removePendingRug,
    upsertCheckInLogEntry,
  } = useCheckInData({ enableTodayLog: false });

  const selectedRug = pendingRugs.find((r) => r.id === selectedRugId) ?? null;
  const editingEntry = checkInLog.find((e) => e.id === editingEntryId) ?? null;

  const handleSelectRug = useCallback((id: string) => {
    setSelectedRugId(id);
    setEditingEntryId(null);
    if (isMobile) setMobilePanel("form");
  }, [isMobile]);

  const handleCheckInComplete = useCallback(
    async (data: {
      rugId?: string;
      clientId?: string | null;
      rugNumber: string;
      clientName: string;
      rugType: string;
      length: number;
      width: number;
      selectedServices: string[];
      serviceSnapshots: { service_id: string; service_name: string; unit_price: number; line_total: number; edges: string[] }[];
      totalPrice: number;
      conditionNotes: string;
      photos: File[];
    }) => {
      const warnings: string[] = [];
      const isEditing = !!editingEntryId;
      const successTitle = isEditing ? "Entry updated" : "Check-in complete";
      const successDescription = `Rug ${data.rugNumber} ${isEditing ? "updated" : "checked in"}.`;
      const errorResult = (title: string, description: string) => ({ status: "error" as const, title, description, resetForm: false });
      const warningResult = (description: string) => ({
        status: "warning" as const,
        title: `${successTitle} with issues`,
        description,
        resetForm: true,
      });
      const successResult = (description = successDescription) => ({
        status: "success" as const,
        title: successTitle,
        description,
        resetForm: true,
      });
      const finalizeResult = <T extends { resetForm?: boolean }>(result: T) => {
        if (result.resetForm !== false) {
          checkInIdempotencyKeyRef.current = null;
          setSelectedRugId(null);
          setEditingEntryId(null);
          setFormResetKey((current) => current + 1);
        }
        return result;
      };

      const uploadTarget = editingEntryId ?? `${data.rugNumber.replace(/[^a-zA-Z0-9_-]+/g, "-") || "staged"}-${Date.now()}`;
      const uploadedPhotos = data.photos.length > 0
        ? await Promise.all(data.photos.map((file) => uploadCheckinPhotoFile(uploadTarget, file)))
        : [];
      const photoPayload = uploadedPhotos.filter(Boolean) as CheckInWorkflowPhoto[];

      if (data.photos.length > 0 && photoPayload.length === 0) {
        return finalizeResult(errorResult("Photo upload failed", "Required photos did not finish uploading."));
      }
      if (photoPayload.length < data.photos.length) {
        warnings.push("Some photos did not finish uploading.");
      }

      const authHeaders = await getAuthHeaders();
      if (!authHeaders) {
        return finalizeResult(errorResult("Unauthorized", "Sign in again and retry."));
      }

      const idempotencyKey = editingEntryId
        ? null
        : (checkInIdempotencyKeyRef.current ??= globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const workflowHeaders = idempotencyKey
        ? { ...authHeaders, "x-idempotency-key": idempotencyKey }
        : authHeaders;

      const workflow = await safeInvoke<CheckInWorkflowResponse>("check-in-workflow", {
        mode: editingEntryId ? "edit" : "create",
        rugId: editingEntryId ?? undefined,
        sourceRugId: selectedRug?.pickupRequestItemId ?? (data.rugId?.startsWith("walkin-") ? null : data.rugId ?? null),
        actorUserId: user?.id ?? null,
        clientId: data.clientId ?? selectedRug?.clientId ?? null,
        clientName: data.clientName,
        rugNumber: data.rugNumber,
        rugType: data.rugType,
        length: data.length,
        width: data.width,
        conditionNotes: data.conditionNotes,
        source: selectedRug?.source === "pickup" ? "pickup" : "dropoff",
        services: data.serviceSnapshots,
        photos: photoPayload,
      }, workflowHeaders);

      if (!workflow.success) {
        const normalizedError = (workflow.error ?? "").toLowerCase();
        if (!isEditing && normalizedError.includes("already processing")) {
          return finalizeResult({
            status: "warning" as const,
            title: "Check-in already submitted",
            description: "This check-in was already processing and may have completed successfully. Please verify the rug before retrying.",
            resetForm: true,
          });
        }
        return finalizeResult(errorResult(isEditing ? "Update failed" : "Check-in failed", workflow.error));
      }

      const workflowResult = workflow.data;
      const workflowWarnings = workflowResult.warnings ?? [];
      if (workflowResult.status === "error") {
        return finalizeResult(errorResult(isEditing ? "Update failed" : "Check-in failed", workflowWarnings.join(" ") || "Workflow failed."));
      }

      const checkedInAt = workflowResult.summary?.checkedInAt ?? new Date().toISOString();
      const rugId = workflowResult.rugId ?? editingEntryId;
      if (!rugId) {
        return finalizeResult(errorResult("Check-in failed", "Workflow did not return a rug id."));
      }

      const buildLogEntry = (resolvedRugId: string): CheckInEntry => ({
        id: resolvedRugId,
        rugNumber: workflowResult.summary?.rugNumber ?? data.rugNumber,
        clientName: workflowResult.summary?.clientName ?? data.clientName,
        rugType: data.rugType,
        length: Number(data.length) || 0,
        width: Number(data.width) || 0,
        services: data.serviceSnapshots.map((service) => ({
          id: service.service_id,
          name: service.service_name,
          price: Number(service.line_total) || 0,
        })),
        totalPrice: workflowResult.summary?.totalPrice ?? data.totalPrice,
        checkedInAt: new Date(checkedInAt),
        checkedInBy: "Staff",
      });

      if (!editingEntryId && data.rugId) {
        removePendingRug(data.rugId);
      }

      upsertCheckInLogEntry(buildLogEntry(rugId));

      const combinedWarnings = [...warnings, ...workflowWarnings];
      if (workflowResult.status === "warning" || combinedWarnings.length > 0) {
        return finalizeResult(warningResult(`${successDescription} ${combinedWarnings.join(" ")}`.trim()));
      }

      const resultDescription = workflowResult.estimateNumber
        ? `${successDescription} Draft estimate ${workflowResult.estimateNumber} created.`
        : successDescription;

      return finalizeResult(successResult(resultDescription));
    },
    [editingEntryId, removePendingRug, selectedRug?.clientId, selectedRug?.pickupRequestItemId, selectedRug?.source, upsertCheckInLogEntry, user?.id]
  );

  const handleAddWalkIn = useCallback((clientName: string, rugNumber: string, clientId?: string | null) => {
    const id = addWalkIn(clientName, rugNumber, clientId);
    setSelectedRugId(id);
    setEditingEntryId(null);
    if (isMobile) setMobilePanel("form");
  }, [isMobile, addWalkIn]);

  if (isMobile) {
    return (
      <div className="h-full flex flex-col rounded-[1.45rem] bg-transparent">
        <div className="flex shrink-0 border-b border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(241,247,252,0.54))]">
          {([
            { id: "form" as MobilePanel, label: "Check-In", icon: ClipboardList },
            { id: "pending" as MobilePanel, label: `Pending (${pendingRugs.length})`, icon: Plus },
          ]).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setMobilePanel(tab.id);
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-xs font-medium transition-colors",
                  mobilePanel === tab.id
                    ? "border-b-2 border-primary bg-white/80 text-foreground"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 min-h-0 overflow-hidden">
          {mobilePanel === "form" && (
            <CheckInForm
              key={`mobile-${formResetKey}`}
              selectedRug={selectedRug}
              editingEntry={editingEntry}
              onCheckInComplete={handleCheckInComplete}
            />
          )}
          {mobilePanel === "pending" && (
            <div className="relative h-full">
              <Suspense fallback={<PanelFallback label="pending rugs" />}>
                <PendingRugsPanel
                  rugs={pendingRugs}
                  selectedRugId={selectedRugId}
                  onSelectRug={handleSelectRug}
                  onAddWalkIn={handleAddWalkIn}
                />
              </Suspense>
              <button
                onClick={() => {
                  setSelectedRugId(null);
                  setEditingEntryId(null);
                  setMobilePanel("form");
                }}
                className="absolute bottom-4 right-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_22px_40px_-20px_rgba(59,108,235,0.32)] transition-colors hover:bg-primary/90"
              >
                <ClipboardList className="h-5 w-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-full grid grid-cols-[320px_minmax(0,1fr)] gap-4 max-xl:grid-cols-[280px_minmax(0,1fr)]")}> 
      <Suspense fallback={<PanelFallback label="pending rugs" />}>
        <PendingRugsPanel
          rugs={pendingRugs}
          selectedRugId={selectedRugId}
          onSelectRug={handleSelectRug}
          onAddWalkIn={handleAddWalkIn}
        />
      </Suspense>
      <div className="app-section relative min-h-0 min-w-0 overflow-hidden">
        <CheckInForm
          key={`desktop-${formResetKey}`}
          selectedRug={selectedRug}
          editingEntry={editingEntry}
          onCheckInComplete={handleCheckInComplete}
        />
      </div>
    </div>
  );
}
