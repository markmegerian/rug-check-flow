import { useState, useCallback, lazy, Suspense } from "react";
import { ClipboardList, Plus } from "lucide-react";
import { CheckInForm } from "./CheckInForm";
import { type CheckInEntry } from "@/data/check-in-log";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCheckInData } from "@/hooks/useCheckInData";
import { uploadCheckinPhoto, generateJobCode, maybeAutoCreateEstimateDraft } from "@/lib/checkin-operations";
import { advanceRugStage } from "@/lib/rug-operations";
import { insertRugServices, isRugServiceApprovalStatusAvailable } from "@/lib/rug-service-approval";

const PendingRugsPanel = lazy(async () => {
  const module = await import("./PendingRugsPanel");
  return { default: module.PendingRugsPanel };
});

type MobilePanel = "form" | "pending";

function PanelFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading {label}…
    </div>
  );
}

export function CheckInLayout() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [selectedRugId, setSelectedRugId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [formResetKey, setFormResetKey] = useState(0);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("pending");
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
      const successResult = () => ({ status: "success" as const, title: successTitle, description: successDescription, resetForm: true });
      const finalizeResult = <T extends { resetForm?: boolean }>(result: T) => {
        if (result.resetForm !== false) {
          setSelectedRugId(null);
          setEditingEntryId(null);
          setFormResetKey((current) => current + 1);
        }
        return result;
      };
      const toastError = (title: string, description: string) => warnings.push(`${title}: ${description}`);
      const toastSuccess = (title: string, description: string) => warnings.push(`${title}: ${description}`);

      let clientId: string | null = data.clientId ?? selectedRug?.clientId ?? null;
      if (!clientId && data.clientName) {
        const { data: clients } = await supabase
          .from("clients")
          .select("id")
          .ilike("name", data.clientName)
          .limit(1);
        clientId = clients?.[0]?.id ?? null;
      }

      const buildLogEntry = (rugId: string, checkedInAt: string): CheckInEntry => ({
        id: rugId,
        rugNumber: data.rugNumber,
        clientName: data.clientName,
        rugType: data.rugType,
        length: Number(data.length) || 0,
        width: Number(data.width) || 0,
        services: data.serviceSnapshots.map((service) => ({
          id: service.service_id,
          name: service.service_name,
          price: Number(service.line_total) || 0,
        })),
        totalPrice: data.totalPrice,
        checkedInAt: new Date(checkedInAt),
        checkedInBy: "Staff",
      });

      if (editingEntryId) {
        const { error } = await supabase
          .from("rugs")
          .update({
            tag: data.rugNumber,
            description: data.rugType,
            size_length: data.length,
            size_width: data.width,
            services: data.selectedServices,
            client_id: clientId,
            notes: data.conditionNotes,
            checked_in_at: new Date().toISOString(),
          })
          .eq("id", editingEntryId);

        if (error) {
          return finalizeResult(errorResult("Update failed", error.message));
        }

        const { error: delServicesErr } = await supabase.from("rug_services").delete().eq("rug_id", editingEntryId);
        if (delServicesErr) {
          return finalizeResult(errorResult("Failed to update services", delServicesErr.message));
        }
        const [serviceSaveResult, photoUploadResults] = await Promise.all([
          data.serviceSnapshots.length > 0
            ? insertRugServices(
                data.serviceSnapshots.map((s) => ({
                  rug_id: editingEntryId,
                  service_id: s.service_id,
                  service_name: s.service_name,
                  unit_price: s.unit_price,
                  line_total: s.line_total,
                  edges: s.edges,
                  approval_status: "pending",
                }))
              )
            : Promise.resolve({ error: null, approvalStatusAvailable: true }),
          data.photos.length > 0
            ? Promise.all(data.photos.map((file) => uploadCheckinPhoto(editingEntryId, file)))
            : Promise.resolve([] as Array<string | null>),
        ]);

        if (serviceSaveResult.error) {
          return finalizeResult(errorResult("Failed to save services", serviceSaveResult.error.message));
        }
        if (!serviceSaveResult.approvalStatusAvailable) {
          warnings.push("Services were saved, but pending/approved/rejected is not enabled in this environment yet.");
        }

        const firstUploadedPhotoUrl = photoUploadResults.find(Boolean);
        if (data.photos.length > 0) {
          if (firstUploadedPhotoUrl) {
            void supabase
              .from("rugs")
              .update({ photo_url: firstUploadedPhotoUrl })
              .eq("id", editingEntryId)
              .then(({ error: photoUrlUpdateError }) => {
                if (photoUrlUpdateError) {
                  console.warn("Failed to update rug photo_url after check-in edit", photoUrlUpdateError);
                }
              });
          } else {
            warnings.push("Required photos did not finish uploading.");
          }
        }

        upsertCheckInLogEntry(buildLogEntry(editingEntryId, new Date().toISOString()));
        setEditingEntryId(null);
        setFormResetKey((current) => current + 1);
      } else {
        const source = data.rugId ? (selectedRug?.source === "pickup" ? "pickup" : "dropoff") : "dropoff";
        const jobCode = generateJobCode();
        const intakeDate = new Date().toISOString();

        let jobId: string | null = null;
        // intake_jobs table may not exist in all environments — graceful fallback below
        const { data: jobInsert, error: jobError } = await supabase
          .from("intake_jobs" as "rugs")
          .insert({
            job_code: jobCode,
            client_id: clientId,
            source,
            intake_date: intakeDate,
            checkin_date: intakeDate,
          } as Record<string, unknown> as never)
          .select("id")
          .single();

        if (jobError) {
          const missingIntakeJobs = /intake_jobs|schema cache|relation .*intake_jobs.* does not exist/i.test(jobError.message);
          if (!missingIntakeJobs) {
            return finalizeResult(errorResult("Job creation failed", jobError.message));
          }
          warnings.push("Intake job tracking is not yet provisioned in this environment.");
        } else {
          jobId = jobInsert?.id ?? null;
        }

        const baseRugPayload = {
          tag: data.rugNumber,
          description: data.rugType,
          size_length: data.length,
          size_width: data.width,
          services: data.selectedServices,
          client_id: clientId,
          checked_in_by: user?.id ?? null,
          checked_in_at: intakeDate,
          notes: data.conditionNotes,
        };

        const extendedRugPayload = {
          ...baseRugPayload,
          job_id: jobId,
          intake_source: source,
          intake_date: intakeDate,
        };

        let inserted: { id: string } | null = null;
        let error: { message: string } | null = null;

        // Extended rug columns (job_id, intake_source, intake_date) may not exist — graceful fallback below
        const extendedInsert = await supabase.from("rugs").insert(extendedRugPayload as Record<string, unknown> as never).select("id").single();
        inserted = extendedInsert.data;
        error = extendedInsert.error;

        if (error && /column .*job_id|column .*intake_source|column .*intake_date/i.test(error.message)) {
          const fallbackInsert = await supabase.from("rugs").insert(baseRugPayload).select("id").single();
          inserted = fallbackInsert.data as { id: string } | null;
          error = fallbackInsert.error as { message: string } | null;
        }

        if (error || !inserted) {
          return finalizeResult(errorResult("Check-in failed", error?.message ?? "Unknown error"));
        }

        const queueContinuityLinking = () => {
          if (!clientId) return;

          void (async () => {
            const { data: priorSameTagRugs, error: priorSameTagError } = await supabase
              .from("rugs")
              .select("id, tag, status, checked_in_at, picked_up_at")
              .eq("client_id", clientId)
              .eq("tag", data.rugNumber)
              .neq("id", inserted.id)
              .order("checked_in_at", { ascending: false })
              .limit(3);

            if (priorSameTagError) {
              console.warn("Failed to load prior same-tag rugs", priorSameTagError);
              return;
            }

            const latestPriorSameTagRug = (priorSameTagRugs ?? [])[0] ?? null;
            if (!latestPriorSameTagRug) return;

            const priorStateDate = latestPriorSameTagRug.picked_up_at ?? latestPriorSameTagRug.checked_in_at;
            const continuityNote = `Return continuity: prior same-tag rug ${latestPriorSameTagRug.tag} (${latestPriorSameTagRug.id}) last status ${latestPriorSameTagRug.status}${priorStateDate ? ` on ${new Date(priorStateDate).toLocaleString()}` : ""}.`;
            const mergedContinuityNotes = [data.conditionNotes, continuityNote].filter(Boolean).join("\n\n");

            const [{ error: notesUpdateError }, { error: communicationEventError }] = await Promise.all([
              supabase
                .from("rugs")
                .update({ notes: mergedContinuityNotes })
                .eq("id", inserted.id),
              supabaseExtended.from("communication_events").insert({
                client_id: clientId,
                rug_id: inserted.id,
                channel: "in_app_chat",
                direction: "outbound",
                event_type: "rug_continuity_linked",
                subject: `${data.rugNumber} linked to prior same-tag history`,
                body: `New intake ${inserted.id} matches prior rug ${latestPriorSameTagRug.id} for the same client and tag. Prior status: ${latestPriorSameTagRug.status}.`,
              }),
            ]);

            if (notesUpdateError) {
              console.warn("Failed to update rug continuity notes", notesUpdateError);
            }
            if (communicationEventError) {
              console.warn("Failed to record rug continuity event", communicationEventError);
            }
          })();
        };

        const [serviceSaveResult, photoUploadResults] = await Promise.all([
          data.serviceSnapshots.length > 0
            ? insertRugServices(
                data.serviceSnapshots.map((s) => ({
                  rug_id: inserted.id,
                  service_id: s.service_id,
                  service_name: s.service_name,
                  unit_price: s.unit_price,
                  line_total: s.line_total,
                  edges: s.edges,
                  approval_status: "pending",
                }))
              )
            : Promise.resolve({ error: null, approvalStatusAvailable: true }),
          data.photos.length > 0
            ? Promise.all(data.photos.map((file) => uploadCheckinPhoto(inserted.id, file)))
            : Promise.resolve([] as Array<string | null>),
        ]);

        if (serviceSaveResult.error) {
          return finalizeResult(warningResult(`Rug ${data.rugNumber} was created, but services could not be saved: ${serviceSaveResult.error.message}`));
        }
        if (!serviceSaveResult.approvalStatusAvailable) {
          warnings.push("Services were saved, but pending/approved/rejected is not enabled in this environment yet.");
        }

        const firstUploadedPhotoUrl = photoUploadResults.find(Boolean);
        if (data.photos.length > 0) {
          if (firstUploadedPhotoUrl) {
            void supabase
              .from("rugs")
              .update({ photo_url: firstUploadedPhotoUrl })
              .eq("id", inserted.id)
              .then(({ error: photoUrlUpdateError }) => {
                if (photoUrlUpdateError) {
                  console.warn("Failed to update rug photo_url after check-in", photoUrlUpdateError);
                }
              });
          } else {
            warnings.push("Required photos did not finish uploading.");
          }
        }

        // Only link to pickup_request_items for real pickup IDs (UUIDs), not walk-in IDs
        const isWalkIn = data.rugId?.startsWith("walkin-");
        const postSubmitTasks: Promise<unknown>[] = [advanceRugStage(inserted.id, "checked_in")];

        if (data.rugId && !isWalkIn) {
          void supabaseExtended
            .from("pickup_request_items")
            .update({ checked_in_rug_id: inserted.id })
            .eq("id", data.rugId)
            .then(({ error: pickupItemUpdateError }) => {
              if (pickupItemUpdateError) {
                console.warn("Pickup item linking failed after check-in", pickupItemUpdateError);
              }
            });
        }

        if (isRugServiceApprovalStatusAvailable()) {
          postSubmitTasks.push(
            maybeAutoCreateEstimateDraft(inserted.id, clientId, data.rugNumber, data.serviceSnapshots, toastError, toastSuccess)
          );
        }

        await Promise.all(postSubmitTasks);

        if (data.rugId) {
          removePendingRug(data.rugId);
        }

        upsertCheckInLogEntry(buildLogEntry(inserted.id, intakeDate));
        queueContinuityLinking();
      }

      return finalizeResult(
        warnings.length > 0 ? warningResult(`${successDescription} ${warnings.join(" ")}`) : successResult()
      );
    },
    [editingEntryId, user, toast, selectedRug?.source, selectedRug?.clientId, removePendingRug, upsertCheckInLogEntry]
  );

  const handleEditEntry = useCallback((entryId: string) => {
    setEditingEntryId(entryId);
    setSelectedRugId(null);
    if (isMobile) setMobilePanel("form");
  }, [isMobile]);

  const handleAddWalkIn = useCallback((clientName: string, rugNumber: string, clientId?: string | null) => {
    const id = addWalkIn(clientName, rugNumber, clientId);
    setSelectedRugId(id);
    setEditingEntryId(null);
    if (isMobile) setMobilePanel("form");
  }, [isMobile, addWalkIn]);

  // Mobile: tabbed view
  if (isMobile) {
    return (
      <div className="h-full flex flex-col">
        {/* Sub-tab bar */}
        <div className="flex border-b border-border bg-muted/30 shrink-0">
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
                    ? "text-foreground border-b-2 border-primary bg-background"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Panel content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {mobilePanel === "form" && (
            <CheckInForm
              key={`mobile-${formResetKey}-${selectedRugId ?? "blank"}-${editingEntryId ?? "new"}`}
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
                className="absolute bottom-4 right-4 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90 transition-colors"
              >
                <ClipboardList className="h-5 w-5" />
              </button>
            </div>
          )}
          {false ? null : null}
        </div>
      </div>
    );
  }

  // Desktop: form and pending queue only
  return (
    <div className={cn("h-full grid grid-cols-[280px_1fr] max-lg:grid-cols-[240px_1fr]")}>
      <Suspense fallback={<PanelFallback label="pending rugs" />}>
        <PendingRugsPanel
          rugs={pendingRugs}
          selectedRugId={selectedRugId}
          onSelectRug={handleSelectRug}
          onAddWalkIn={handleAddWalkIn}
        />
      </Suspense>
      <div className="relative min-w-0">
        <CheckInForm
          key={`desktop-${formResetKey}-${selectedRugId ?? "blank"}-${editingEntryId ?? "new"}`}
          selectedRug={selectedRug}
          editingEntry={editingEntry}
          onCheckInComplete={handleCheckInComplete}
        />
      </div>
    </div>
  );
}
