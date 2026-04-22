import { useState, useCallback, lazy, Suspense, useRef } from "react";
import { CheckInForm } from "./CheckInForm";
import { type CheckInEntry } from "@/data/check-in-log";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { useCheckInData } from "@/hooks/useCheckInData";
import { uploadCheckinPhotoFile } from "@/lib/checkin-operations";
import { getAuthHeaders, safeInvoke } from "@/lib/supabase-helpers";

const PendingRugsPanel = lazy(async () => {
  const module = await import("./PendingRugsPanel");
  return { default: module.PendingRugsPanel };
});

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
  const [selectedRugId, setSelectedRugId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [formResetKey, setFormResetKey] = useState(0);
  const checkInIdempotencyKeyRef = useRef<string | null>(null);
  const {
    pendingRugs,
    checkInLog,
    removePendingRug,
    upsertCheckInLogEntry,
  } = useCheckInData({ enableTodayLog: false });

  const selectedRug = pendingRugs.find((r) => r.id === selectedRugId) ?? null;
  const editingEntry = checkInLog.find((e) => e.id === editingEntryId) ?? null;
  const hasPendingRail = pendingRugs.length > 0;

  const handleSelectRug = useCallback((id: string) => {
    setSelectedRugId(id);
    setEditingEntryId(null);
  }, []);

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
      serviceSnapshots: { service_id: string; service_name: string; quoted_price?: number | null; edges: string[] }[];
      totalPrice?: number;
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
        sourceRugId: selectedRug?.pickupRequestItemId ?? data.rugId ?? null,
        actorUserId: user?.id ?? null,
        clientId: data.clientId ?? selectedRug?.clientId ?? null,
        clientName: data.clientName,
        rugNumber: data.rugNumber,
        rugType: data.rugType,
        length: data.length,
        width: data.width,
        conditionNotes: data.conditionNotes,
        source: "pickup",
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
          price: 0,
        })),
        totalPrice: workflowResult.summary?.totalPrice ?? data.totalPrice ?? 0,
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
    [editingEntryId, removePendingRug, selectedRug?.clientId, selectedRug?.pickupRequestItemId, upsertCheckInLogEntry, user?.id],
  );

  return (
    <div className={cn(
      "flex h-full min-h-0 min-w-0 gap-4 p-4 md:p-5",
      hasPendingRail ? "lg:grid lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-5" : "block",
    )}>
      {hasPendingRail ? (
        <div className="hidden min-h-0 lg:block">
          <Suspense fallback={<PanelFallback label="pending rugs" />}>
            <PendingRugsPanel
              rugs={pendingRugs}
              selectedRugId={selectedRugId}
              onSelectRug={handleSelectRug}
            />
          </Suspense>
        </div>
      ) : null}

      <div className="min-h-0 min-w-0 overflow-hidden rounded-[1.5rem] border border-border/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,248,255,0.92))] shadow-[0_24px_60px_-40px_rgba(28,39,56,0.18)]">
        <CheckInForm
          key={`checkin-${formResetKey}`}
          selectedRug={selectedRug}
          editingEntry={editingEntry}
          onCheckInComplete={handleCheckInComplete}
        />
      </div>
    </div>
  );
}
