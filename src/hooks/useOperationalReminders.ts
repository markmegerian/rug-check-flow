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
const RECENT_UPDATE_DAYS = 7;
type UpdateReminderRow = { id: string; event_type: string; subject: string; created_at: string };
const REMINDER_EVENT_TYPES = [
  "estimate_approved_by_client",
  "estimate_rejected_by_client",
  "invoice_pdf_downloaded_by_client",
];

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string };
  if (maybe.code === "PGRST205" || maybe.code === "42P01") return true;
  return (maybe.message ?? "").toLowerCase().includes("could not find the table");
}

function buildEventTitle(eventType: string, subject: string) {
  if (eventType === "estimate_approved_by_client") return `Estimate approved: ${subject}`;
  if (eventType === "estimate_rejected_by_client") return `Estimate rejected: ${subject}`;
  if (eventType === "invoice_pdf_downloaded_by_client") return `Invoice viewed: ${subject}`;
  return subject || eventType;
}

function buildSlaBands(count3: number, count5: number, count7: number) {
  const band3 = Math.max(0, count3 - count5);
  const band5 = Math.max(0, count5 - count7);
  const band7 = Math.max(0, count7);
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
    const remindersEnabled = import.meta.env.VITE_ENABLE_OPERATIONAL_REMINDERS !== "false";
    if (!remindersEnabled) {
      setState({
        loading: false,
        errorMessage: null,
        reminders: [],
        updates: [],
        trends: [],
      });
      return;
    }

    setState((prev) => ({ ...prev, loading: true, errorMessage: null }));

    const [estimateProbe, pickupProbe, invoiceProbe, communicationProbe] = await Promise.all([
      supabaseExtended.from("estimates").select("id", { count: "exact", head: true }).limit(1),
      supabaseExtended.from("pickup_requests").select("id", { count: "exact", head: true }).limit(1),
      supabaseExtended.from("invoices").select("id", { count: "exact", head: true }).limit(1),
      supabaseExtended.from("communication_events").select("id", { count: "exact", head: true }).limit(1),
    ]);

    const probeErrors = [
      estimateProbe.error,
      pickupProbe.error,
      invoiceProbe.error,
      communicationProbe.error,
    ].filter(Boolean);

    if (probeErrors.some((error) => isMissingRelationError(error))) {
      setState({
        loading: false,
        errorMessage:
          "Operational reminders are unavailable in this environment because required workflow tables are missing.",
        reminders: [],
        updates: [],
        trends: [],
      });
      return;
    }

    const nowMs = Date.now();
    const threshold3Iso = new Date(nowMs - 3 * MS_PER_DAY).toISOString();
    const threshold4Iso = new Date(nowMs - 4 * MS_PER_DAY).toISOString();
    const threshold5Iso = new Date(nowMs - 5 * MS_PER_DAY).toISOString();
    const threshold7Iso = new Date(nowMs - 7 * MS_PER_DAY).toISOString();
    const updatesSinceIso = new Date(Date.now() - RECENT_UPDATE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const updatesCurrentWindowIso = new Date(nowMs - MS_PER_DAY).toISOString();
    const updatesPreviousWindowIso = new Date(nowMs - 2 * MS_PER_DAY).toISOString();

    const [
      estimateCount3Result,
      estimateCount4Result,
      estimateCount5Result,
      estimateCount7Result,
      pickupCount3Result,
      pickupCount4Result,
      pickupCount5Result,
      pickupCount7Result,
      overdueDueCount3Result,
      overdueDueCount4Result,
      overdueDueCount5Result,
      overdueDueCount7Result,
      overdueNoDueCount3Result,
      overdueNoDueCount4Result,
      overdueNoDueCount5Result,
      overdueNoDueCount7Result,
      updateListResult,
      updatesCurrentCountResult,
      updatesPreviousCountResult,
    ] = await Promise.allSettled([
      supabaseExtended
        .from("estimates")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .lte("created_at", threshold3Iso),
      supabaseExtended
        .from("estimates")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .lte("created_at", threshold4Iso),
      supabaseExtended
        .from("estimates")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .lte("created_at", threshold5Iso),
      supabaseExtended
        .from("estimates")
        .select("id", { count: "exact", head: true })
        .eq("status", "sent")
        .lte("created_at", threshold7Iso),
      supabaseExtended
        .from("pickup_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "confirmed", "assigned"])
        .lte("updated_at", threshold3Iso),
      supabaseExtended
        .from("pickup_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "confirmed", "assigned"])
        .lte("updated_at", threshold4Iso),
      supabaseExtended
        .from("pickup_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "confirmed", "assigned"])
        .lte("updated_at", threshold5Iso),
      supabaseExtended
        .from("pickup_requests")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "confirmed", "assigned"])
        .lte("updated_at", threshold7Iso),
      supabaseExtended
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("status", "overdue")
        .not("due_at", "is", null)
        .lte("due_at", threshold3Iso),
      supabaseExtended
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("status", "overdue")
        .not("due_at", "is", null)
        .lte("due_at", threshold4Iso),
      supabaseExtended
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("status", "overdue")
        .not("due_at", "is", null)
        .lte("due_at", threshold5Iso),
      supabaseExtended
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("status", "overdue")
        .not("due_at", "is", null)
        .lte("due_at", threshold7Iso),
      supabaseExtended
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("status", "overdue")
        .is("due_at", null)
        .lte("created_at", threshold3Iso),
      supabaseExtended
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("status", "overdue")
        .is("due_at", null)
        .lte("created_at", threshold4Iso),
      supabaseExtended
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("status", "overdue")
        .is("due_at", null)
        .lte("created_at", threshold5Iso),
      supabaseExtended
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("status", "overdue")
        .is("due_at", null)
        .lte("created_at", threshold7Iso),
      supabaseExtended
        .from("communication_events")
        .select("id, event_type, subject, created_at")
        .in("event_type", REMINDER_EVENT_TYPES)
        .gte("created_at", updatesSinceIso)
        .order("created_at", { ascending: false })
        .limit(6)
        .returns<UpdateReminderRow[]>(),
      supabaseExtended
        .from("communication_events")
        .select("id", { count: "exact", head: true })
        .in("event_type", REMINDER_EVENT_TYPES)
        .gte("created_at", updatesCurrentWindowIso),
      supabaseExtended
        .from("communication_events")
        .select("id", { count: "exact", head: true })
        .in("event_type", REMINDER_EVENT_TYPES)
        .gte("created_at", updatesPreviousWindowIso)
        .lt("created_at", updatesCurrentWindowIso),
    ]);

    const reminders: OperationalReminder[] = [];
    const updates: OperationalUpdate[] = [];
    const trends: OperationalTrendSnapshot[] = [];
    const errors: string[] = [];

    const settledResults = [
      ["estimate-3d", estimateCount3Result],
      ["estimate-4d", estimateCount4Result],
      ["estimate-5d", estimateCount5Result],
      ["estimate-7d", estimateCount7Result],
      ["pickup-3d", pickupCount3Result],
      ["pickup-4d", pickupCount4Result],
      ["pickup-5d", pickupCount5Result],
      ["pickup-7d", pickupCount7Result],
      ["overdue-due-3d", overdueDueCount3Result],
      ["overdue-due-4d", overdueDueCount4Result],
      ["overdue-due-5d", overdueDueCount5Result],
      ["overdue-due-7d", overdueDueCount7Result],
      ["overdue-nodue-3d", overdueNoDueCount3Result],
      ["overdue-nodue-4d", overdueNoDueCount4Result],
      ["overdue-nodue-5d", overdueNoDueCount5Result],
      ["overdue-nodue-7d", overdueNoDueCount7Result],
      ["updates-list", updateListResult],
      ["updates-current", updatesCurrentCountResult],
      ["updates-previous", updatesPreviousCountResult],
    ] as const;

    for (const [key, result] of settledResults) {
      if (result.status === "rejected") {
        errors.push(`${key}: ${result.reason instanceof Error ? result.reason.message : "unknown error"}`);
      } else if (result.value.error) {
        errors.push(`${key}: ${result.value.error.message}`);
      }
    }

    if (errors.length === 0) {
      const estimateCount3 = estimateCount3Result.status === "fulfilled" ? estimateCount3Result.value.count ?? 0 : 0;
      const estimateCount4 = estimateCount4Result.status === "fulfilled" ? estimateCount4Result.value.count ?? 0 : 0;
      const estimateCount5 = estimateCount5Result.status === "fulfilled" ? estimateCount5Result.value.count ?? 0 : 0;
      const estimateCount7 = estimateCount7Result.status === "fulfilled" ? estimateCount7Result.value.count ?? 0 : 0;
      const estimateBands = buildSlaBands(estimateCount3, estimateCount5, estimateCount7);

      const pickupCount3 = pickupCount3Result.status === "fulfilled" ? pickupCount3Result.value.count ?? 0 : 0;
      const pickupCount4 = pickupCount4Result.status === "fulfilled" ? pickupCount4Result.value.count ?? 0 : 0;
      const pickupCount5 = pickupCount5Result.status === "fulfilled" ? pickupCount5Result.value.count ?? 0 : 0;
      const pickupCount7 = pickupCount7Result.status === "fulfilled" ? pickupCount7Result.value.count ?? 0 : 0;
      const pickupBands = buildSlaBands(pickupCount3, pickupCount5, pickupCount7);

      const overdueDueCount3 = overdueDueCount3Result.status === "fulfilled" ? overdueDueCount3Result.value.count ?? 0 : 0;
      const overdueDueCount4 = overdueDueCount4Result.status === "fulfilled" ? overdueDueCount4Result.value.count ?? 0 : 0;
      const overdueDueCount5 = overdueDueCount5Result.status === "fulfilled" ? overdueDueCount5Result.value.count ?? 0 : 0;
      const overdueDueCount7 = overdueDueCount7Result.status === "fulfilled" ? overdueDueCount7Result.value.count ?? 0 : 0;
      const overdueNoDueCount3 =
        overdueNoDueCount3Result.status === "fulfilled" ? overdueNoDueCount3Result.value.count ?? 0 : 0;
      const overdueNoDueCount4 =
        overdueNoDueCount4Result.status === "fulfilled" ? overdueNoDueCount4Result.value.count ?? 0 : 0;
      const overdueNoDueCount5 =
        overdueNoDueCount5Result.status === "fulfilled" ? overdueNoDueCount5Result.value.count ?? 0 : 0;
      const overdueNoDueCount7 =
        overdueNoDueCount7Result.status === "fulfilled" ? overdueNoDueCount7Result.value.count ?? 0 : 0;

      const overdueCount3 = overdueDueCount3 + overdueNoDueCount3;
      const overdueCount4 = overdueDueCount4 + overdueNoDueCount4;
      const overdueCount5 = overdueDueCount5 + overdueNoDueCount5;
      const overdueCount7 = overdueDueCount7 + overdueNoDueCount7;
      const overdueBands = buildSlaBands(overdueCount3, overdueCount5, overdueCount7);

      reminders.push({
        id: "stale-estimates",
        label: "Estimates waiting > 3 days",
        description: "Pending client decisions that may need a follow-up.",
        count: estimateCount3,
        href: "/facility/office?tab=estimates&status=sent&minAgeDays=3",
        severity: getSeverityFromBands(estimateBands),
        slaBands: estimateBands,
        deltaFromYesterday: estimateCount3 - estimateCount4,
      });
      reminders.push({
        id: "stale-pickups",
        label: "Pickup requests stale > 3 days",
        description: "Requests pending route updates or assignment.",
        count: pickupCount3,
        href: "/facility/office?tab=pickups&status=pending,confirmed,assigned&minAgeDays=3",
        severity: getSeverityFromBands(pickupBands),
        slaBands: pickupBands,
        deltaFromYesterday: pickupCount3 - pickupCount4,
      });
      reminders.push({
        id: "overdue-invoices",
        label: "Overdue invoices",
        description: "Outstanding balances requiring collections follow-up.",
        count: overdueCount3,
        href: "/facility/office?tab=invoices&status=overdue&minAgeDays=3",
        severity: getSeverityFromBands(overdueBands),
        slaBands: overdueBands,
        deltaFromYesterday: overdueCount3 - overdueCount4,
      });

      const updateRows = updateListResult.status === "fulfilled" ? updateListResult.value.data ?? [] : [];
      updates.push(
        ...updateRows.map((event) => ({
          id: event.id,
          title: buildEventTitle(event.event_type, event.subject),
          createdAt: event.created_at,
        })),
      );
      const updatesCurrent =
        updatesCurrentCountResult.status === "fulfilled" ? updatesCurrentCountResult.value.count ?? 0 : 0;
      const updatesPrevious =
        updatesPreviousCountResult.status === "fulfilled" ? updatesPreviousCountResult.value.count ?? 0 : 0;

      trends.push(buildTrendSnapshot("estimates", "Stale estimates (3d+)", estimateCount3, estimateCount4));
      trends.push(buildTrendSnapshot("pickups", "Stale pickups (3d+)", pickupCount3, pickupCount4));
      trends.push(buildTrendSnapshot("overdue-invoices", "Overdue invoices (3d+)", overdueCount3, overdueCount4));
      trends.push(buildTrendSnapshot("client-updates", "Client updates (24h)", updatesCurrent, updatesPrevious));
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
