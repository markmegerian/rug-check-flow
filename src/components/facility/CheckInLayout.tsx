import { useState, useCallback, useEffect } from "react";
import { ClipboardList, FileText, Plus } from "lucide-react";
import { PendingRugsPanel } from "./PendingRugsPanel";
import { CheckInForm } from "./CheckInForm";
import { CheckInLogPanel } from "./CheckInLogPanel";
import { type PendingRug } from "@/data/mock-pending-rugs";
import { type CheckInEntry, type UserRole } from "@/data/check-in-log";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";
import type { Tables } from "@/integrations/supabase/types";
import type { ExtendedTableRow } from "@/integrations/supabase/extended";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

let walkInCounter = 100;

type MobilePanel = "form" | "pending" | "log";

type RugRow = Tables<"rugs">;
type RugServiceRow = Pick<
  Tables<"rug_services">,
  "rug_id" | "service_id" | "unit_price" | "line_total" | "service_name"
>;
type ClientNameRow = Pick<Tables<"clients">, "id" | "name">;
type CompletedPickupRequestRow = Pick<
  ExtendedTableRow<"pickup_requests">,
  "id" | "client_id" | "scheduled_date" | "status"
>;
type CompletedPickupItemRow = Pick<
  ExtendedTableRow<"pickup_request_items">,
  "id" | "pickup_request_id" | "rug_number" | "rug_type" | "length" | "width" | "checked_in_rug_id" | "estimate_requested" | "estimate_request_details"
>;

export function CheckInLayout() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [pendingRugs, setPendingRugs] = useState<PendingRug[]>([]);
  const [selectedRugId, setSelectedRugId] = useState<string | null>(null);
  const [checkInLog, setCheckInLog] = useState<CheckInEntry[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [userRole] = useState<UserRole>("checkin_staff");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("form");

  const fetchPendingPickupRugs = useCallback(async () => {
    const { data: requestRows, error: requestError } = await supabaseExtended
      .from("pickup_requests")
      .select("id, client_id, scheduled_date, status")
      .eq("status", "completed")
      .order("scheduled_date", { ascending: true })
      .limit(250);

    if (requestError) {
      console.error("Failed to fetch completed pickup requests", requestError);
      return;
    }

    const completedRequests = (requestRows ?? []) as CompletedPickupRequestRow[];
    if (completedRequests.length === 0) {
      setPendingRugs((prev) => prev.filter((rug) => rug.source === "walkin"));
      return;
    }

    const requestIds = completedRequests.map((request) => request.id);
    const { data: itemRows, error: itemError } = await supabaseExtended
      .from("pickup_request_items")
      .select("id, pickup_request_id, rug_number, rug_type, length, width, checked_in_rug_id, estimate_requested, estimate_request_details")
      .in("pickup_request_id", requestIds)
      .is("checked_in_rug_id", null)
      .limit(1000);

    if (itemError) {
      console.error("Failed to fetch completed pickup items", itemError);
      return;
    }

    const pendingItems = (itemRows ?? []) as CompletedPickupItemRow[];
    if (pendingItems.length === 0) {
      setPendingRugs((prev) => prev.filter((rug) => rug.source === "walkin"));
      return;
    }

    const requestById = new Map(completedRequests.map((request) => [request.id, request]));
    const clientIds = [...new Set(completedRequests.map((request) => request.client_id).filter(Boolean))] as string[];
    let clientNameById = new Map<string, string>();

    if (clientIds.length > 0) {
      const { data: clientRows } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds);
      const typedClientRows = (clientRows ?? []) as ClientNameRow[];
      clientNameById = new Map(typedClientRows.map((row) => [row.id, row.name]));
    }

    const mappedPending = pendingItems.map((item) => {
      const request = requestById.get(item.pickup_request_id);
      const clientName = request?.client_id ? clientNameById.get(request.client_id) ?? "Unknown client" : "Unknown client";
      return {
        id: item.id,
        rugNumber: item.rug_number,
        clientName,
        rugType: item.rug_type ?? "",
        length: Number(item.length ?? 0) || undefined,
        width: Number(item.width ?? 0) || undefined,
        requestedServices: [],
        source: "pickup" as const,
        pickupRequestId: request?.id,
        pickupRequestItemId: item.id,
        pickupDate: request?.scheduled_date,
        estimateRequested: Boolean(item.estimate_requested),
        estimateRequestDetails: item.estimate_request_details ?? undefined,
      };
    });

    setPendingRugs((prev) => {
      const walkIns = prev.filter((rug) => rug.source === "walkin");
      return [...mappedPending, ...walkIns];
    });
  }, []);

  // Fetch today's check-ins from DB
  const fetchTodayLog = useCallback(async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from("rugs")
      .select("*")
      .gte("checked_in_at", todayStart.toISOString())
      .order("checked_in_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch log", error);
      return;
    }

    const rugRows = (data ?? []) as RugRow[];
    const rugIds = rugRows.map((rug) => rug.id);

    const rugServiceMap = new Map<string, { id: string; name: string; price: number }[]>();
    const rugTotalMap = new Map<string, number>();
    if (rugIds.length > 0) {
      const { data: rs } = await supabase
        .from("rug_services")
        .select("rug_id, service_id, unit_price, line_total, service_name")
        .in("rug_id", rugIds);
      const serviceRows = (rs ?? []) as RugServiceRow[];
      for (const row of serviceRows) {
        const list = rugServiceMap.get(row.rug_id) ?? [];
        list.push({
          id: row.service_id,
          name: row.service_name || "Unknown",
          price: Number(row.line_total),
        });
        rugServiceMap.set(row.rug_id, list);
        rugTotalMap.set(row.rug_id, (rugTotalMap.get(row.rug_id) ?? 0) + Number(row.line_total));
      }
    }

    const entries: CheckInEntry[] = rugRows.map((rug) => ({
      id: rug.id,
      rugNumber: rug.tag,
      clientName: "",
      rugType: rug.description,
      length: Number(rug.size_length) || 0,
      width: Number(rug.size_width) || 0,
      services: rugServiceMap.get(rug.id) ?? (rug.services ?? []).map((serviceName) => ({ id: serviceName, name: serviceName, price: 0 })),
      totalPrice: rugTotalMap.get(rug.id) ?? 0,
      checkedInAt: new Date(rug.checked_in_at),
      checkedInBy: "Staff",
    }));

    const clientIds = [...new Set(rugRows.map((rug) => rug.client_id).filter(Boolean))] as string[];
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds);
      const typedClients = (clients ?? []) as ClientNameRow[];
      const clientMap = new Map(typedClients.map((client) => [client.id, client.name]));
      entries.forEach((e, i) => {
        const cid = rugRows[i]?.client_id;
        if (cid) e.clientName = clientMap.get(cid) ?? "";
      });
    }

    setCheckInLog(entries);
  }, []);

  useEffect(() => {
    fetchTodayLog();
    fetchPendingPickupRugs();
  }, [fetchTodayLog, fetchPendingPickupRugs]);

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
      const generateJobCode = () => `JOB-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      const uploadCheckinPhoto = async (rugId: string, file: File) => {
        const path = `rugs/${rugId}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
        const { error: uploadError } = await supabase.storage
          .from("checkin-photos")
          .upload(path, file, { upsert: false });
        if (uploadError) return null;
        const { data: publicUrl } = supabase.storage.from("checkin-photos").getPublicUrl(path);
        return publicUrl.publicUrl;
      };

      const maybeAutoCreateEstimateDraft = async (rugId: string, clientIdValue: string | null) => {
        if (data.serviceSnapshots.length === 0) return;

        const serviceIds = data.serviceSnapshots.map((service) => service.service_id);
        const { data: serviceRows, error: serviceError } = await supabase
          .from("services")
          .select("id, name, requires_estimate")
          .in("id", serviceIds);

        if (serviceError) {
          toast({ title: "Estimate rule lookup failed", description: serviceError.message, variant: "destructive" });
          return;
        }

        const rows = (serviceRows ?? []) as Array<{ id: string; name: string; requires_estimate: boolean | null }>;
        const requiresEstimate = rows.some((row) => Boolean(row.requires_estimate));
        if (!requiresEstimate) return;

        const estimateNumber = `EST-${Date.now().toString(36).toUpperCase()}`;
        const total = data.serviceSnapshots.reduce((sum, service) => sum + Number(service.line_total ?? 0), 0);

        const { data: insertedEstimate, error: estimateError } = await supabaseExtended
          .from("estimates")
          .insert({
            rug_id: rugId,
            client_id: clientIdValue,
            estimate_number: estimateNumber,
            status: "draft",
            version: 1,
            total,
          })
          .select("id")
          .single();

        if (estimateError || !insertedEstimate) {
          toast({ title: "Estimate draft auto-create failed", description: estimateError?.message ?? "Unknown error", variant: "destructive" });
          return;
        }

        const estimateItems = data.serviceSnapshots.map((service) => ({
          estimate_id: insertedEstimate.id,
          rug_service_id: null,
          description: `${data.rugNumber} — ${service.service_name}`,
          quantity: 1,
          unit_price: Number(service.unit_price ?? 0),
          total: Number(service.line_total ?? 0),
        }));

        const { error: itemError } = await supabaseExtended.from("estimate_items").insert(estimateItems);
        if (itemError) {
          await supabaseExtended.from("estimates").delete().eq("id", insertedEstimate.id);
          toast({ title: "Estimate draft item sync failed", description: itemError.message, variant: "destructive" });
          return;
        }

        await supabaseExtended.from("communication_events").insert({
          client_id: clientIdValue,
          rug_id: rugId,
          estimate_id: insertedEstimate.id,
          channel: "in_app_chat",
          direction: "outbound",
          event_type: "estimate_auto_drafted_from_checkin",
          subject: `${estimateNumber} auto-drafted`,
          body: `Estimate ${estimateNumber} was auto-created from check-in service selections.`,
        });

        toast({ title: "Estimate draft auto-created", description: `${estimateNumber} is ready for office review.` });
      };

      let clientId: string | null = null;
      if (data.clientName) {
        const { data: clients } = await supabase
          .from("clients")
          .select("id")
          .ilike("name", data.clientName)
          .limit(1);
        clientId = clients?.[0]?.id ?? null;
      }

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
          toast({ title: "Update failed", description: error.message, variant: "destructive" });
          return;
        }

        await supabase.from("rug_services").delete().eq("rug_id", editingEntryId);
        if (data.serviceSnapshots.length > 0) {
          await supabase.from("rug_services").insert(
            data.serviceSnapshots.map((s) => ({
              rug_id: editingEntryId,
              service_id: s.service_id,
              service_name: s.service_name,
              unit_price: s.unit_price,
              line_total: s.line_total,
              edges: s.edges,
            }))
          );
        }

        if (data.photos.length > 0) {
          const firstPhotoUrl = await uploadCheckinPhoto(editingEntryId, data.photos[0]);
          if (firstPhotoUrl) {
            await supabase.from("rugs").update({ photo_url: firstPhotoUrl }).eq("id", editingEntryId);
          }
        }

        setEditingEntryId(null);
      } else {
        const source = data.rugId ? (selectedRug?.source === "pickup" ? "pickup" : "dropoff") : "dropoff";
        const jobCode = generateJobCode();
        const intakeDate = new Date().toISOString();

        let jobId: string | null = null;
        const { data: jobInsert, error: jobError } = await supabase
          .from("intake_jobs")
          .insert({
            job_code: jobCode,
            client_id: clientId,
            source,
            intake_date: intakeDate,
            checkin_date: intakeDate,
          } as never)
          .select("id")
          .single();

        if (jobError) {
          const missingIntakeJobs = /intake_jobs|schema cache|relation .*intake_jobs.* does not exist/i.test(jobError.message);
          if (!missingIntakeJobs) {
            toast({ title: "Job creation failed", description: jobError.message, variant: "destructive" });
            return;
          }
          toast({
            title: "Job tracking unavailable",
            description: "Check-in will continue, but intake job tracking is not yet provisioned in this environment.",
            variant: "destructive",
          });
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

        const extendedInsert = await supabase.from("rugs").insert(extendedRugPayload as never).select("id").single();
        inserted = extendedInsert.data as { id: string } | null;
        error = extendedInsert.error as { message: string } | null;

        if (error && /column .*job_id|column .*intake_source|column .*intake_date/i.test(error.message)) {
          const fallbackInsert = await supabase.from("rugs").insert(baseRugPayload).select("id").single();
          inserted = fallbackInsert.data as { id: string } | null;
          error = fallbackInsert.error as { message: string } | null;
        }

        if (error || !inserted) {
          toast({ title: "Check-in failed", description: error?.message, variant: "destructive" });
          return;
        }

        if (data.serviceSnapshots.length > 0) {
          await supabase.from("rug_services").insert(
            data.serviceSnapshots.map((s) => ({
              rug_id: inserted.id,
              service_id: s.service_id,
              service_name: s.service_name,
              unit_price: s.unit_price,
              line_total: s.line_total,
              edges: s.edges,
            }))
          );
        }

        if (data.photos.length > 0) {
          const firstPhotoUrl = await uploadCheckinPhoto(inserted.id, data.photos[0]);
          if (firstPhotoUrl) {
            await supabase.from("rugs").update({ photo_url: firstPhotoUrl }).eq("id", inserted.id);
          }
        }

        if (data.rugId) {
          const { error: pickupItemUpdateError } = await supabaseExtended
            .from("pickup_request_items")
            .update({ checked_in_rug_id: inserted.id })
            .eq("id", data.rugId);

          if (pickupItemUpdateError) {
            toast({
              title: "Pickup item linking failed",
              description: pickupItemUpdateError.message,
              variant: "destructive",
            });
          }
        }

        await maybeAutoCreateEstimateDraft(inserted.id, clientId);

        if (data.rugId) {
          setPendingRugs((prev) => prev.filter((r) => r.id !== data.rugId));
        }
      }

      setSelectedRugId(null);
      fetchTodayLog();
      fetchPendingPickupRugs();
    },
    [editingEntryId, user, toast, fetchTodayLog, selectedRug?.source, fetchPendingPickupRugs]
  );

  const handleEditEntry = useCallback((entryId: string) => {
    setEditingEntryId(entryId);
    setSelectedRugId(null);
    if (isMobile) setMobilePanel("form");
  }, [isMobile]);

  const handleAddWalkIn = useCallback((clientName: string, rugNumber: string) => {
    const id = `walkin-${++walkInCounter}`;
    const newRug: PendingRug = {
      id,
      rugNumber,
      clientName,
      requestedServices: [],
      source: "walkin",
    };
    setPendingRugs((prev) => [...prev, newRug]);
    setSelectedRugId(id);
    setEditingEntryId(null);
    if (isMobile) setMobilePanel("form");
  }, [isMobile]);

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
                onClick={() => setMobilePanel(tab.id)}
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
            <PendingRugsPanel
              rugs={pendingRugs}
              selectedRugId={selectedRugId}
              onSelectRug={handleSelectRug}
              onAddWalkIn={handleAddWalkIn}
            />
          )}
          {mobilePanel === "log" && (
            <CheckInLogPanel
              entries={checkInLog}
              userRole={userRole}
              onEdit={handleEditEntry}
            />
          )}
        </div>
      </div>
    );
  }

  // Desktop: 3-panel layout
  return (
    <div className="h-full grid grid-cols-[280px_1fr_260px] max-lg:grid-cols-[240px_1fr]">
      <PendingRugsPanel
        rugs={pendingRugs}
        selectedRugId={selectedRugId}
        onSelectRug={handleSelectRug}
        onAddWalkIn={handleAddWalkIn}
      />
      <CheckInForm
        selectedRug={selectedRug}
        editingEntry={editingEntry}
        onCheckInComplete={handleCheckInComplete}
      />
      <CheckInLogPanel
        entries={checkInLog}
        userRole={userRole}
        onEdit={handleEditEntry}
      />
    </div>
  );
}
