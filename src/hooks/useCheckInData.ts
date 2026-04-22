import { useState, useCallback, useEffect } from "react";
import { subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { type PendingRug } from "@/types/pending-rug";
import { type CheckInEntry } from "@/data/check-in-log";
import { fetchCheckinPendingPickups } from "@/lib/checkin-pending-pickups";

type RugRow = Pick<Tables<"rugs">, "id" | "tag" | "description" | "size_length" | "size_width" | "services" | "checked_in_at" | "client_id"> & {
  clients?: Pick<Tables<"clients">, "name"> | null;
};
type RugServiceRow = Pick<
  Tables<"rug_services">,
  "rug_id" | "service_id" | "unit_price" | "line_total" | "service_name"
>;
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

export function useCheckInData(options?: { enableTodayLog?: boolean }) {
  const [pendingRugs, setPendingRugs] = useState<PendingRug[]>([]);
  const [checkInLog, setCheckInLog] = useState<CheckInEntry[]>([]);

  const fetchPendingPickupRugs = useCallback(async () => {
    const targetDate = getPickupSnapshotTargetDate();
    const cachedItems = readPickupSnapshotCache(targetDate);

    if (cachedItems) {
      setPendingRugs(cachedItems);
      return;
    }

    try {
      const mappedPending = await fetchCheckinPendingPickups(targetDate);

      if (mappedPending.length === 0) {
        writePickupSnapshotCache(targetDate, []);
        setPendingRugs([]);
        return;
      }

      writePickupSnapshotCache(targetDate, mappedPending);
      setPendingRugs(mappedPending);
    } catch (itemError) {
      console.error("Failed to fetch completed pickup items", itemError);
    }
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
      setPendingRugs(cachedItems);
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
    removePendingRug,
    upsertCheckInLogEntry,
  };
}
