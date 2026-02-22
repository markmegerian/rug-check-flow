import { useCallback, useEffect, useState } from "react";
import { supabaseExtended } from "@/integrations/supabase/extended";

type ReminderSeverity = "default" | "warning" | "critical";
type SlaBandTone = "default" | "warning" | "critical";

export type OperationalReminder = {
  id: string;
  label: string;
  description: string;
  count: number;
  href: string;
  severity: ReminderSeverity;
  slaBands: {
    label: string;
    count: number;
    tone: SlaBandTone;
  }[];
  deltaFromYesterday: number;
};

export type OperationalUpdate = {
  id: string;
  title: string;
  createdAt: string;
};

export type OperationalTrendSnapshot = {
  id: string;
  label: string;
  current: number;
  previous: number;
  delta: number;
};

type ReminderState = {
  loading: boolean;
  errorMessage: string | null;
  reminders: OperationalReminder[];
  updates: OperationalUpdate[];
  trends: OperationalTrendSnapshot[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const STALE_DAYS = 3;
const RECENT_UPDATE_DAYS = 7;

type EstimateReminderRow = { id: string; created_at: string };
type PickupReminderRow = { id: string; updated_at: string };
type OverdueInvoiceReminderRow = { id: string; due_at: string | null; created_at: string };
type UpdateReminderRow = { id: string; event_type: string; subject: string; created_at: string };

function buildEventTitle(eventType: string, subject: string) {
  if (eventType === "estimate_approved_by_client") return `Estimate approved: ${subject}`;
  if (eventType === "estimate_rejected_by_client") return `Estimate rejected: ${subject}`;
  if (eventType === "invoice_pdf_downloaded_by_client") return `Invoice viewed: ${subject}`;
  return subject || eventType;
}

function safeAgeDays(iso: string | null | undefined) {
  if (!iso) return 0;
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return 0;
  return Math.floor((Date.now() - timestamp) / MS_PER_DAY);
}

function countAtOrAbove(ages: number[], threshold: number) {
  return ages.filter((age) => age >= threshold).length;
}

function buildSlaBands(ages: number[]) {
  const band3 = ages.filter((age) => age >= 3 && age < 5).length;
  const band5 = ages.filter((age) => age >= 5 && age < 7).length;
  const band7 = ages.filter((age) => age >= 7).length;
  return [
    { label: "3-4d", count: band3, tone: "default" as const },
    { label: "5-6d", count: band5, tone: "warning" as const },
    { label: "7+d", count: band7, tone: "critical" as const },
  ];
}

function getSeverityFromBands(
  bands: { label: string; count: number; tone: SlaBandTone }[],
): ReminderSeverity {
  const band7 = bands.find((band) => band.label === "7+d")?.count ?? 0;
  const band5 = bands.find((band) => band.label === "5-6d")?.count ?? 0;
  const band3 = bands.find((band) => band.label === "3-4d")?.count ?? 0;
  if (band7 > 0) return "critical";
  if (band5 > 0 || band3 > 0) return "warning";
  return "default";
}

function buildTrendSnapshot(id: string, label: string, current: number, previous: number): OperationalTrendSnapshot {
  return { id, label, current, previous, delta: current - previous };
}

export function useOperationalReminders() {
  const [state, setState] = useState<ReminderState>({
    loading: true,
    errorMessage: null,
    reminders: [],
    updates: [],
    trends: [],
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, errorMessage: null }));

    const staleSinceIso = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const updatesSinceIso = new Date(Date.now() - RECENT_UPDATE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const [estimateResult, pickupResult, overdueInvoiceResult, updateResult] = await Promise.allSettled([
      supabaseExtended
        .from("estimates")
        .select("id, created_at")
        .eq("status", "sent")
        .lte("created_at", staleSinceIso)
        .limit(400)
        .returns<EstimateReminderRow[]>(),
      supabaseExtended
        .from("pickup_requests")
        .select("id, updated_at")
        .in("status", ["pending", "confirmed", "assigned"])
        .lte("updated_at", staleSinceIso)
        .limit(400)
        .returns<PickupReminderRow[]>(),
      supabaseExtended
        .from("invoices")
        .select("id, due_at, created_at")
        .eq("status", "overdue")
        .limit(400)
        .returns<OverdueInvoiceReminderRow[]>(),
      supabaseExtended
        .from("communication_events")
        .select("id, event_type, subject, created_at")
        .in("event_type", ["estimate_approved_by_client", "estimate_rejected_by_client", "invoice_pdf_downloaded_by_client"])
        .gte("created_at", updatesSinceIso)
        .order("created_at", { ascending: false })
        .limit(40)
        .returns<UpdateReminderRow[]>(),
    ]);

    const reminders: OperationalReminder[] = [];
    const updates: OperationalUpdate[] = [];
    const trends: OperationalTrendSnapshot[] = [];
    const errors: string[] = [];

    if (estimateResult.status === "fulfilled") {
      if (estimateResult.value.error) {
        errors.push(`estimates: ${estimateResult.value.error.message}`);
      } else {
        const estimateRows = estimateResult.value.data ?? [];
        const estimateAges = estimateRows.map((row) => safeAgeDays(row.created_at));
        const estimateBands = buildSlaBands(estimateAges);
        const estimateCurrent = countAtOrAbove(estimateAges, 3);
        const estimatePrevious = countAtOrAbove(estimateAges, 4);
        reminders.push({
          id: "stale-estimates",
          label: "Estimates waiting > 3 days",
          description: "Pending client decisions that may need a follow-up.",
          count: estimateCurrent,
          href: "/facility/office?tab=estimates&status=sent&minAgeDays=3",
          severity: getSeverityFromBands(estimateBands),
          slaBands: estimateBands,
          deltaFromYesterday: estimateCurrent - estimatePrevious,
        });
        trends.push(buildTrendSnapshot("estimates", "Stale estimates (3d+)", estimateCurrent, estimatePrevious));
      }
    } else {
      errors.push(`estimates: ${estimateResult.reason instanceof Error ? estimateResult.reason.message : "unknown error"}`);
    }

    if (pickupResult.status === "fulfilled") {
      if (pickupResult.value.error) {
        errors.push(`pickups: ${pickupResult.value.error.message}`);
      } else {
        const pickupRows = pickupResult.value.data ?? [];
        const pickupAges = pickupRows.map((row) => safeAgeDays(row.updated_at));
        const pickupBands = buildSlaBands(pickupAges);
        const pickupCurrent = countAtOrAbove(pickupAges, 3);
        const pickupPrevious = countAtOrAbove(pickupAges, 4);
        reminders.push({
          id: "stale-pickups",
          label: "Pickup requests stale > 3 days",
          description: "Requests pending route updates or assignment.",
          count: pickupCurrent,
          href: "/facility/office?tab=pickups&status=pending,confirmed,assigned&minAgeDays=3",
          severity: getSeverityFromBands(pickupBands),
          slaBands: pickupBands,
          deltaFromYesterday: pickupCurrent - pickupPrevious,
        });
        trends.push(buildTrendSnapshot("pickups", "Stale pickups (3d+)", pickupCurrent, pickupPrevious));
      }
    } else {
      errors.push(`pickups: ${pickupResult.reason instanceof Error ? pickupResult.reason.message : "unknown error"}`);
    }

    if (overdueInvoiceResult.status === "fulfilled") {
      if (overdueInvoiceResult.value.error) {
        errors.push(`invoices: ${overdueInvoiceResult.value.error.message}`);
      } else {
        const overdueRows = overdueInvoiceResult.value.data ?? [];
        const overdueAges = overdueRows.map((row) => safeAgeDays(row.due_at ?? row.created_at));
        const overdueBands = buildSlaBands(overdueAges);
        const overdueCurrent = countAtOrAbove(overdueAges, 3);
        const overduePrevious = countAtOrAbove(overdueAges, 4);
        reminders.push({
          id: "overdue-invoices",
          label: "Overdue invoices",
          description: "Outstanding balances requiring collections follow-up.",
          count: overdueCurrent,
          href: "/facility/office?tab=invoices&status=overdue&minAgeDays=3",
          severity: getSeverityFromBands(overdueBands),
          slaBands: overdueBands,
          deltaFromYesterday: overdueCurrent - overduePrevious,
        });
        trends.push(buildTrendSnapshot("overdue-invoices", "Overdue invoices (3d+)", overdueCurrent, overduePrevious));
      }
    } else {
      errors.push(
        `invoices: ${overdueInvoiceResult.reason instanceof Error ? overdueInvoiceResult.reason.message : "unknown error"}`,
      );
    }

    if (updateResult.status === "fulfilled") {
      if (updateResult.value.error) {
        errors.push(`updates: ${updateResult.value.error.message}`);
      } else {
        const updateRows = updateResult.value.data ?? [];
        const nowMs = Date.now();
        const currentWindowStart = nowMs - MS_PER_DAY;
        const priorWindowStart = nowMs - 2 * MS_PER_DAY;
        const updatesCurrent = updateRows.filter((row) => {
          const ts = Date.parse(row.created_at);
          return !Number.isNaN(ts) && ts >= currentWindowStart;
        }).length;
        const updatesPrevious = updateRows.filter((row) => {
          const ts = Date.parse(row.created_at);
          return !Number.isNaN(ts) && ts >= priorWindowStart && ts < currentWindowStart;
        }).length;

        updates.push(
          ...updateRows.slice(0, 6).map((event) => ({
            id: event.id,
            title: buildEventTitle(event.event_type, event.subject),
            createdAt: event.created_at,
          })),
        );
        trends.push(buildTrendSnapshot("client-updates", "Client updates (24h)", updatesCurrent, updatesPrevious));
      }
    } else {
      errors.push(`updates: ${updateResult.reason instanceof Error ? updateResult.reason.message : "unknown error"}`);
    }

    setState({
      loading: false,
      errorMessage: errors.length > 0 ? errors.join(" | ") : null,
      reminders,
      updates,
      trends,
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    ...state,
    refresh,
  };
}
