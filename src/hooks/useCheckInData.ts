import { useState, useCallback, useEffect } from "react";
import { subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";
import type { Tables } from "@/integrations/supabase/types";
import type { ExtendedTableRow } from "@/integrations/supabase/extended";
import { type PendingRug } from "@/types/pending-rug";
import { type CheckInEntry } from "@/data/check-in-log";
import { logger } from "@/lib/logger";

type RugRow = Pick<Tables<"rugs">, "id" | "tag" | "description" | "size_length" | "size_width" | "services" | "checked_in_at" | "client_id"> & {
  clients?: Pick<Tables<"clients">, "name"> | null;
};
type RugServiceRow = Pick<
  Tables<"rug_services">,
  "rug_id" | "service_id" | "unit_price" | "line_total" | "service_name"
>;
type CompletedPickupRequestRow = Pick<
  ExtendedTableRow<"pickup_requests">,
  "id" | "client_id" | "scheduled_date" | "status"
> & {
  clients?: Pick<Tables<"clients">, "name"> | null;
};
type CompletedPickupItemRow = Pick<
  ExtendedTableRow<"pickup_request_items">,
  "id" | "pickup_request_id" | "rug_number" | "rug_type" | "length" | "width" | "checked_in_rug_id" | "estimate_requested" | "estimate_request_details"
> & {
  pickup_requests?: CompletedPickupRequestRow | null;
};

type IdleHandle = number;

type WindowWithIdleCallback = Window & typeof globalThis & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => IdleHandle;
  cancelIdleCallback?: (handle: IdleHandle) => void;
};

type PickupSnapshotCache = {
  targetDate: string;
  items: PendingRug[];
  refreshedAt: string;
};

const PICKUP_SNAPSHOT_CACHE_KEY = "checkin-pending-pickups-v2";
const EASTERN_TIME_ZONE = "America/New_York";

function getNextWalkInCounter(): number {
  const dateKey = new Date().toISOString().slice(0, 10);
  const storageKey = `walkInCounter-${dateKey}`;
  const current = parseInt(localStorage.getItem(storageKey) ?? "100", 10);
  const next = current + 1;
  localStorage.setItem(storageKey, String(next));
  return next;
}

function getTimeZoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function zonedTimeToUtc(params: { year: number; month: number; day: number; hour: number; minute?: number; second?: number; timeZone: string }) {
  let guess = Date.UTC(params.year, params.month - 1, params.day, params.hour, params.minute ?? 0, params.second ?? 0);

  for (let i = 0; i < 5; i += 1) {
    const actual = getTimeZoneParts(new Date(guess), params.timeZone);
    const desiredUtc = Date.UTC(params.year, params.month - 1, params.day, params.hour, params.minute ?? 0, params.second ?? 0);
    const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const diff = desiredUtc - actualUtc;
    guess += diff;
    if (diff === 0) break;
  }

  return new Date(guess);
}

function formatTimeZoneDate(date: Date, timeZone: string) {
  const parts = getTimeZoneParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function getPickupSnapshotTargetDate(now = new Date()) {
  const easternNow = getTimeZoneParts(now, EASTERN_TIME_ZONE);
  const easternNoonUtc = zonedTimeToUtc({
    year: easternNow.year,
    month: easternNow.month,
    day: easternNow.day,
    hour: 12,
    minute: 0,
    second: 0,
    timeZone: EASTERN_TIME_ZONE,
  });

  const snapshotSourceDate = easternNow.hour >= 6 ? subDays(easternNoonUtc, 1) : subDays(easternNoonUtc, 2);
  return formatTimeZoneDate(snapshotSourceDate, EASTERN_TIME_ZONE);
}

function readPickupSnapshotCache(targetDate: string): PendingRug[] | null {
  try {
    const raw = localStorage.getItem(PICKUP_SNAPSHOT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PickupSnapshotCache;
    if (parsed.targetDate !== targetDate || !Array.isArray(parsed.items)) return null;
    return parsed.items;
  } catch {
    return null;
  }
}

function writePickupSnapshotCache(targetDate: string, items: PendingRug[]) {
  const payload: PickupSnapshotCache = {
    targetDate,
    items,
    refreshedAt: new Date().toISOString(),
  };
  localStorage.setItem(PICKUP_SNAPSHOT_CACHE_KEY, JSON.stringify(payload));
}

function removePickupFromSnapshotCache(pickupItemId: string) {
  try {
    const raw = localStorage.getItem(PICKUP_SNAPSHOT_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as PickupSnapshotCache;
    if (!Array.isArray(parsed.items)) return;
    parsed.items = parsed.items.filter((item) => item.pickupRequestItemId !== pickupItemId && item.id !== pickupItemId);
    localStorage.setItem(PICKUP_SNAPSHOT_CACHE_KEY, JSON.stringify(parsed));
  } catch {
    // no-op
  }
}

function parseRequestedServices(details: string | null | undefined) {
  const source = details ?? "";
  const servicesMatch = source.match(/^Services:\s*(.+?)(?:\s*\||$)/);
  if (!servicesMatch) return [];
  return servicesMatch[1].split(",").map((service) => service.trim()).filter(Boolean);
}

export function useCheckInData(options?: { enableTodayLog?: boolean }) {
  const [pendingRugs, setPendingRugs] = useState<PendingRug[]>([]);
  const [checkInLog, setCheckInLog] = useState<CheckInEntry[]>([]);

  const fetchPendingPickupRugs = useCallback(async () => {
    const targetDate = getPickupSnapshotTargetDate();
    const cachedItems = readPickupSnapshotCache(targetDate);

    if (cachedItems) {
      setPendingRugs((prev) => {
        const walkIns = prev.filter((rug) => rug.source === "walkin");
        return [...cachedItems, ...walkIns];
      });
      return;
    }

    const { data: itemRows, error: itemError } = await supabaseExtended
      .from("pickup_request_items")
      .select("id, pickup_request_id, rug_number, rug_type, length, width, checked_in_rug_id, estimate_requested, estimate_request_details, pickup_requests!inner(id, client_id, scheduled_date, status, clients(name))")
      .eq("pickup_requests.status", "completed")
      .eq("pickup_requests.scheduled_date", targetDate)
      .is("checked_in_rug_id", null)
      .limit(400);

    if (itemError) {
      logger.error("pickup_items_fetch_failed", itemError);
      return;
    }

    const pendingItems = (itemRows ?? []) as CompletedPickupItemRow[];
    if (pendingItems.length === 0) {
      writePickupSnapshotCache(targetDate, []);
      setPendingRugs((prev) => prev.filter((rug) => rug.source === "walkin"));
      return;
    }

    const mappedPending: PendingRug[] = pendingItems.map((item) => {
      const request = item.pickup_requests;
      return {
        id: item.id,
        rugNumber: item.rug_number,
        clientId: request?.client_id ?? null,
        clientName: request?.clients?.name ?? "Unknown client",
        rugType: item.rug_type ?? "",
        length: Number(item.length ?? 0) || undefined,
        width: Number(item.width ?? 0) || undefined,
        requestedServices: parseRequestedServices(item.estimate_request_details),
        source: "pickup",
        pickupRequestId: request?.id,
        pickupRequestItemId: item.id,
        pickupDate: request?.scheduled_date,
        estimateRequested: Boolean(item.estimate_requested),
        estimateRequestDetails: item.estimate_request_details ?? undefined,
      };
    });

    writePickupSnapshotCache(targetDate, mappedPending);
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
      .select("id, tag, description, size_length, size_width, services, checked_in_at, client_id, clients(name)")
      .gte("checked_in_at", todayStart.toISOString())
      .order("checked_in_at", { ascending: false })
      .limit(100);

    if (error) {
      logger.error("checkin_log_fetch_failed", error);
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
      clientName: rug.clients?.name ?? "",
      rugType: rug.description,
      length: Number(rug.size_length) || 0,
      width: Number(rug.size_width) || 0,
      services: rugServiceMap.get(rug.id) ?? (rug.services ?? []).map((serviceName) => ({ id: serviceName, name: serviceName, price: 0 })),
      totalPrice: rugTotalMap.get(rug.id) ?? 0,
      checkedInAt: new Date(rug.checked_in_at),
      checkedInBy: "Staff",
    }));

    setCheckInLog(entries);
  }, []);

  useEffect(() => {
    const targetDate = getPickupSnapshotTargetDate();
    const cachedItems = readPickupSnapshotCache(targetDate);

    if (cachedItems) {
      setPendingRugs((prev) => {
        const walkIns = prev.filter((rug) => rug.source === "walkin");
        return [...cachedItems, ...walkIns];
      });
      return;
    }

    const win = window as WindowWithIdleCallback;
    if (typeof win.requestIdleCallback === "function") {
      const handle = win.requestIdleCallback(() => {
        void fetchPendingPickupRugs();
      }, { timeout: 800 });
      return () => {
        if (typeof win.cancelIdleCallback === "function") {
          win.cancelIdleCallback(handle);
        }
      };
    }

    const timer = window.setTimeout(() => {
      void fetchPendingPickupRugs();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [fetchPendingPickupRugs]);

  useEffect(() => {
    if (options?.enableTodayLog === false) return;
    const timer = window.setTimeout(() => {
      fetchTodayLog();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [fetchTodayLog, options?.enableTodayLog]);

  const addWalkIn = useCallback((clientName: string, rugNumber: string, clientId?: string | null): string => {
    const id = `walkin-${getNextWalkInCounter()}`;
    const newRug: PendingRug = {
      id,
      rugNumber,
      clientId: clientId ?? null,
      clientName,
      requestedServices: [],
      source: "walkin",
    };
    setPendingRugs((prev) => [...prev, newRug]);
    return id;
  }, []);

  const removePendingRug = useCallback((rugId: string) => {
    removePickupFromSnapshotCache(rugId);
    setPendingRugs((prev) => prev.filter((r) => r.id !== rugId));
  }, []);

  const upsertCheckInLogEntry = useCallback((entry: CheckInEntry) => {
    setCheckInLog((prev) => {
      const next = [entry, ...prev.filter((existing) => existing.id !== entry.id)];
      next.sort((a, b) => b.checkedInAt.getTime() - a.checkedInAt.getTime());
      return next.slice(0, 100);
    });
  }, []);

  return {
    pendingRugs,
    checkInLog,
    fetchTodayLog,
    fetchPendingPickupRugs,
    addWalkIn,
    removePendingRug,
    upsertCheckInLogEntry,
  };
}
