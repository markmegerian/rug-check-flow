import { useState, useCallback, useEffect } from "react";
import { PendingRugsPanel } from "./PendingRugsPanel";
import { CheckInForm } from "./CheckInForm";
import { CheckInLogPanel } from "./CheckInLogPanel";
import { type PendingRug } from "@/data/mock-pending-rugs";
import { type CheckInEntry, type UserRole } from "@/data/check-in-log";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

let walkInCounter = 100;

export function CheckInLayout() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [pendingRugs, setPendingRugs] = useState<PendingRug[]>([]);
  const [selectedRugId, setSelectedRugId] = useState<string | null>(null);
  const [checkInLog, setCheckInLog] = useState<CheckInEntry[]>([]);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [userRole] = useState<UserRole>("checkin_staff");

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

    const rugIds = (data ?? []).map((r: any) => r.id);

    // Fetch junction service data for these rugs
    let rugServiceMap = new Map<string, { id: string; name: string; price: number }[]>();
    let rugTotalMap = new Map<string, number>();
    if (rugIds.length > 0) {
      const { data: rs } = await supabase
        .from("rug_services")
        .select("rug_id, service_id, unit_price, line_total, services(name)")
        .in("rug_id", rugIds);
      for (const row of rs ?? []) {
        const list = rugServiceMap.get(row.rug_id) ?? [];
        list.push({
          id: row.service_id,
          name: (row as any).services?.name ?? "Unknown",
          price: Number(row.line_total),
        });
        rugServiceMap.set(row.rug_id, list);
        rugTotalMap.set(row.rug_id, (rugTotalMap.get(row.rug_id) ?? 0) + Number(row.line_total));
      }
    }

    const entries: CheckInEntry[] = (data ?? []).map((r: any) => ({
      id: r.id,
      rugNumber: r.tag,
      clientName: "",
      rugType: r.description,
      length: Number(r.size_length) || 0,
      width: Number(r.size_width) || 0,
      services: rugServiceMap.get(r.id) ?? (r.services ?? []).map((s: string) => ({ id: s, name: s, price: 0 })),
      totalPrice: rugTotalMap.get(r.id) ?? 0,
      checkedInAt: new Date(r.checked_in_at),
      checkedInBy: "Staff",
    }));

    // Resolve client names
    const clientIds = [...new Set((data ?? []).map((r: any) => r.client_id).filter(Boolean))] as string[];
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name")
        .in("id", clientIds);
      const clientMap = new Map((clients ?? []).map((c: any) => [c.id, c.name]));
      entries.forEach((e, i) => {
        const cid = (data as any)![i].client_id;
        if (cid) e.clientName = clientMap.get(cid) ?? "";
      });
    }

    setCheckInLog(entries);
  }, []);

  useEffect(() => {
    fetchTodayLog();
  }, [fetchTodayLog]);

  const selectedRug = pendingRugs.find((r) => r.id === selectedRugId) ?? null;
  const editingEntry = checkInLog.find((e) => e.id === editingEntryId) ?? null;

  const handleSelectRug = useCallback((id: string) => {
    setSelectedRugId(id);
    setEditingEntryId(null);
  }, []);

  const handleCheckInComplete = useCallback(
    async (data: {
      rugId?: string;
      rugNumber: string;
      clientName: string;
      rugType: string;
      length: number;
      width: number;
      selectedServices: string[];
      serviceSnapshots: { service_id: string; unit_price: number; line_total: number }[];
      totalPrice: number;
    }) => {
      // Find or skip client lookup
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
        // Update existing rug
        const { error } = await supabase
          .from("rugs")
          .update({
            tag: data.rugNumber,
            description: data.rugType,
            size_length: data.length,
            size_width: data.width,
            services: data.selectedServices,
            client_id: clientId,
          })
          .eq("id", editingEntryId);

        if (error) {
          toast({ title: "Update failed", description: error.message, variant: "destructive" });
          return;
        }

        // Replace junction rows: delete old, insert new
        await supabase.from("rug_services").delete().eq("rug_id", editingEntryId);
        if (data.serviceSnapshots.length > 0) {
          await supabase.from("rug_services").insert(
            data.serviceSnapshots.map((s) => ({
              rug_id: editingEntryId,
              service_id: s.service_id,
              unit_price: s.unit_price,
              line_total: s.line_total,
            }))
          );
        }

        setEditingEntryId(null);
      } else {
        // Insert new rug
        const { data: inserted, error } = await supabase.from("rugs").insert({
          tag: data.rugNumber,
          description: data.rugType,
          size_length: data.length,
          size_width: data.width,
          services: data.selectedServices,
          client_id: clientId,
          checked_in_by: user?.id ?? null,
          notes: "",
        }).select("id").single();

        if (error || !inserted) {
          toast({ title: "Check-in failed", description: error?.message, variant: "destructive" });
          return;
        }

        // Insert junction rows
        if (data.serviceSnapshots.length > 0) {
          await supabase.from("rug_services").insert(
            data.serviceSnapshots.map((s) => ({
              rug_id: inserted.id,
              service_id: s.service_id,
              unit_price: s.unit_price,
              line_total: s.line_total,
            }))
          );
        }

        // Remove from pending if it came from there
        if (data.rugId) {
          setPendingRugs((prev) => prev.filter((r) => r.id !== data.rugId));
        }
      }

      setSelectedRugId(null);
      fetchTodayLog();
    },
    [editingEntryId, user, toast, fetchTodayLog]
  );

  const handleEditEntry = useCallback((entryId: string) => {
    setEditingEntryId(entryId);
    setSelectedRugId(null);
  }, []);

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
  }, []);

  return (
    <div className="h-full grid grid-cols-[280px_1fr_260px] max-lg:grid-cols-[240px_1fr] max-md:grid-cols-1">
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
