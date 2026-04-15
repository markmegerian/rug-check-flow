import { useState, useCallback, lazy, Suspense } from "react";
import { ClipboardList, FileText, PanelRightClose, PanelRightOpen, Plus } from "lucide-react";
import { CheckInForm } from "./CheckInForm";
import { deriveUserRole, type CheckInEntry } from "@/data/check-in-log";
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

const CheckInLogPanel = lazy(async () => {
  const module = await import("./CheckInLogPanel");
  return { default: module.CheckInLogPanel };
});

type MobilePanel = "form" | "pending" | "log";

function PanelFallback({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Loading {label}…
    </div>
  );
}

export function CheckInLayout() {
  const { user, roles } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [selectedRugId, setSelectedRugId] = useState<string | null>(null);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const userRole = deriveUserRole(roles);
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("pending");
  const [showDesktopLogPanel, setShowDesktopLogPanel] = useState(false);
  const shouldLoadTodayLog = isMobile ? mobilePanel === "log" : showDesktopLogPanel;
  const {
    pendingRugs,
    checkInLog,
    fetchTodayLog,
    addWalkIn,
    removePendingRug,
    upsertCheckInLogEntry,
  } = useCheckInData({ enableTodayLog: shouldLoadTodayLog });

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
      const toastError = (title: string, description: string) => warnings.push(`${title}: ${description}`);
      const toastSuccess = (title: string, description: string) => warnings.push(`${title}: ${description}`);

      let clientId: string | null = null;
      if (data.clientName) {
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
          return errorResult("Update failed", error.message);
        }

        const { error: delServicesErr } = await supabase.from("rug_services").delete().eq("rug_id", editingEntryId);
        if (delServicesErr) {
          return errorResult("Failed to update services", delServicesErr.message);
        }
        if (data.serviceSnapshots.length > 0) {
          const { error: insServicesErr, approvalStatusAvailable } = await insertRugServices(
            data.serviceSnapshots.map((s) => ({
              rug_id: editingEntryId,
              service_id: s.service_id,
              service_name: s.service_name,
              unit_price: s.unit_price,
              line_total: s.line_total,
              edges: s.edges,
              approval_status: "pending",
            }))
          );
          if (insServicesErr) {
            return errorResult("Failed to save services", insServicesErr.message);
          }
          if (!approvalStatusAvailable) {
            warnings.push("Services were saved, but pending/approved/rejected is not enabled in this environment yet.");
          }
        }

        if (data.photos.length > 0) {
          const uploadResults = await Promise.all(data.photos.map((file) => uploadCheckinPhoto(editingEntryId, file)));
          const firstUrl = uploadResults.find(Boolean);
          if (firstUrl) {
            await supabase.from("rugs").update({ photo_url: firstUrl }).eq("id", editingEntryId);
          } else {
            warnings.push("Required photos did not finish uploading.");
          }
        }

        upsertCheckInLogEntry(buildLogEntry(editingEntryId, new Date().toISOString()));
        setEditingEntryId(null);
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
            return errorResult("Job creation failed", jobError.message);
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
          return errorResult("Check-in failed", error?.message ?? "Unknown error");
        }

        const { data: priorSameTagRugs } = await supabase
          .from("rugs")
          .select("id, tag, status, checked_in_at, picked_up_at")
          .eq("client_id", clientId)
          .eq("tag", data.rugNumber)
          .neq("id", inserted.id)
          .order("checked_in_at", { ascending: false })
          .limit(3);

        const latestPriorSameTagRug = (priorSameTagRugs ?? [])[0] ?? null;
        if (latestPriorSameTagRug) {
          const priorStateDate = latestPriorSameTagRug.picked_up_at ?? latestPriorSameTagRug.checked_in_at;
          const continuityNote = `Return continuity: prior same-tag rug ${latestPriorSameTagRug.tag} (${latestPriorSameTagRug.id}) last status ${latestPriorSameTagRug.status}${priorStateDate ? ` on ${new Date(priorStateDate).toLocaleString()}` : ""}.`;
          const mergedContinuityNotes = [data.conditionNotes, continuityNote].filter(Boolean).join("\n\n");

          await supabase
            .from("rugs")
            .update({ notes: mergedContinuityNotes })
            .eq("id", inserted.id);

          await supabaseExtended.from("communication_events").insert({
            client_id: clientId,
            rug_id: inserted.id,
            channel: "in_app_chat",
            direction: "outbound",
            event_type: "rug_continuity_linked",
            subject: `${data.rugNumber} linked to prior same-tag history`,
            body: `New intake ${inserted.id} matches prior rug ${latestPriorSameTagRug.id} for the same client and tag. Prior status: ${latestPriorSameTagRug.status}.`,
          });
        }

        if (data.serviceSnapshots.length > 0) {
          const { error: insServicesErr, approvalStatusAvailable } = await insertRugServices(
            data.serviceSnapshots.map((s) => ({
              rug_id: inserted.id,
              service_id: s.service_id,
              service_name: s.service_name,
              unit_price: s.unit_price,
              line_total: s.line_total,
              edges: s.edges,
              approval_status: "pending",
            }))
          );
          if (insServicesErr) {
            return warningResult(`Rug ${data.rugNumber} was created, but services could not be saved: ${insServicesErr.message}`);
          }
          if (!approvalStatusAvailable) {
            warnings.push("Services were saved, but pending/approved/rejected is not enabled in this environment yet.");
          }
        }

        if (data.photos.length > 0) {
          const uploadResults = await Promise.all(data.photos.map((file) => uploadCheckinPhoto(inserted.id, file)));
          const firstUrl = uploadResults.find(Boolean);
          if (firstUrl) {
            await supabase.from("rugs").update({ photo_url: firstUrl }).eq("id", inserted.id);
          } else {
            warnings.push("Required photos did not finish uploading.");
          }
        }

        // Only link to pickup_request_items for real pickup IDs (UUIDs), not walk-in IDs
        const isWalkIn = data.rugId?.startsWith("walkin-");
        if (data.rugId && !isWalkIn) {
          const { error: pickupItemUpdateError } = await supabaseExtended
            .from("pickup_request_items")
            .update({ checked_in_rug_id: inserted.id })
            .eq("id", data.rugId);

          if (pickupItemUpdateError) {
            warnings.push(`Pickup item linking failed: ${pickupItemUpdateError.message}`);
          }
        }

        if (isRugServiceApprovalStatusAvailable()) {
          await maybeAutoCreateEstimateDraft(inserted.id, clientId, data.rugNumber, data.serviceSnapshots, toastError, toastSuccess);
        }

        // Auto-advance rug from checked_in → in_production
        await advanceRugStage(inserted.id, "checked_in");

        if (data.rugId) {
          removePendingRug(data.rugId);
        }

        upsertCheckInLogEntry(buildLogEntry(inserted.id, intakeDate));
      }

      setSelectedRugId(null);
      return warnings.length > 0 ? warningResult(`${successDescription} ${warnings.join(" ")}`) : successResult();
    },
    [editingEntryId, user, toast, selectedRug?.source, removePendingRug, upsertCheckInLogEntry]
  );

  const handleEditEntry = useCallback((entryId: string) => {
    setEditingEntryId(entryId);
    setSelectedRugId(null);
    if (isMobile) setMobilePanel("form");
  }, [isMobile]);

  const handleAddWalkIn = useCallback((clientName: string, rugNumber: string) => {
    const id = addWalkIn(clientName, rugNumber);
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
            { id: "log" as MobilePanel, label: `Log (${checkInLog.length})`, icon: FileText },
          ]).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setMobilePanel(tab.id);
                  if (tab.id === "log") {
                    fetchTodayLog();
                  }
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
          {mobilePanel === "log" && (
            <Suspense fallback={<PanelFallback label="check-in log" />}>
              <CheckInLogPanel
                entries={checkInLog}
                userRole={userRole}
                onEdit={handleEditEntry}
              />
            </Suspense>
          )}
        </div>
      </div>
    );
  }

  // Desktop: form with optional right-side log panel
  return (
    <div className={cn("h-full grid", showDesktopLogPanel ? "grid-cols-[280px_1fr_260px] max-lg:grid-cols-[240px_1fr]" : "grid-cols-[280px_1fr] max-lg:grid-cols-[240px_1fr]")}>
      <Suspense fallback={<PanelFallback label="pending rugs" />}>
        <PendingRugsPanel
          rugs={pendingRugs}
          selectedRugId={selectedRugId}
          onSelectRug={handleSelectRug}
          onAddWalkIn={handleAddWalkIn}
        />
      </Suspense>
      <div className="relative min-w-0">
        <button
          type="button"
          onClick={() => {
            const next = !showDesktopLogPanel;
            setShowDesktopLogPanel(next);
            if (next) {
              fetchTodayLog();
            }
          }}
          className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md border border-border bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm hover:text-foreground"
        >
          {showDesktopLogPanel ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
          {showDesktopLogPanel ? "Hide log" : "Show log"}
        </button>
        <CheckInForm
          selectedRug={selectedRug}
          editingEntry={editingEntry}
          onCheckInComplete={handleCheckInComplete}
        />
      </div>
      {showDesktopLogPanel && (
        <Suspense fallback={<PanelFallback label="check-in log" />}>
          <CheckInLogPanel
            entries={checkInLog}
            userRole={userRole}
            onEdit={handleEditEntry}
          />
        </Suspense>
      )}
    </div>
  );
}
