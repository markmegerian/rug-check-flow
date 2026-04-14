import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";
import type { Tables } from "@/integrations/supabase/types";
import type { ExtendedTableRow } from "@/integrations/supabase/extended";
import { type PendingRug } from "@/types/pending-rug";
import { type CheckInEntry } from "@/data/check-in-log";

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

function getNextWalkInCounter(): number {
  const dateKey = new Date().toISOString().slice(0, 10);
  const storageKey = `walkInCounter-${dateKey}`;
  const current = parseInt(localStorage.getItem(storageKey) ?? "100", 10);
  const next = current + 1;
  localStorage.setItem(storageKey, String(next));
  return next;
}

export function useCheckInData() {
  const [pendingRugs, setPendingRugs] = useState<PendingRug[]>([]);
  const [checkInLog, setCheckInLog] = useState<CheckInEntry[]>([]);

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

      let requestedServices: string[] = [];
      const details = item.estimate_request_details ?? "";
      const servicesMatch = details.match(/^Services:\s*(.+?)(?:\s*\||$)/);
      if (servicesMatch) {
        requestedServices = servicesMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
      }

      return {
        id: item.id,
        rugNumber: item.rug_number,
        clientName,
        rugType: item.rug_type ?? "",
        length: Number(item.length ?? 0) || undefined,
        width: Number(item.width ?? 0) || undefined,
        requestedServices,
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

  const fetchTodayLog = useCallback(async () => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from("rugs")
      .select("id, tag, description, size_length, size_width, services, checked_in_at, client_id")
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

  const addWalkIn = useCallback((clientName: string, rugNumber: string): string => {
    const id = `walkin-${getNextWalkInCounter()}`;
    const newRug: PendingRug = {
      id,
      rugNumber,
      clientName,
      requestedServices: [],
      source: "walkin",
    };
    setPendingRugs((prev) => [...prev, newRug]);
    return id;
  }, []);

  const removePendingRug = useCallback((rugId: string) => {
    setPendingRugs((prev) => prev.filter((r) => r.id !== rugId));
  }, []);

  return {
    pendingRugs,
    checkInLog,
    fetchTodayLog,
    fetchPendingPickupRugs,
    addWalkIn,
    removePendingRug,
  };
}
