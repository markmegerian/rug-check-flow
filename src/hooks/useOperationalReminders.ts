import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
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

type ReminderData = {
  reminders: OperationalReminder[];
  updates: OperationalUpdate[];
  trends: OperationalTrendSnapshot[];
  errorMessage: string | null;
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

async function countWithThreshold(
  table: "estimates" | "pickup_requests" | "invoices",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder chain
  filters: (q: any) => any,
  dateColumn: string,
  thresholdIso: string,
): Promise<number> {
  const q = filters(
    supabaseExtended.from(table).select("id", { count: "exact", head: true })
  ).lte(dateColumn, thresholdIso);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

async function fetchReminderData(): Promise<ReminderData> {
  // Probe tables first
  const [estimateProbe, pickupProbe, invoiceProbe, communicationProbe] = await Promise.all([
    supabaseExtended.from("estimates").select("id", { count: "exact", head: true }).limit(1),
    supabaseExtended.from("pickup_requests").select("id", { count: "exact", head: true }).limit(1),
    supabaseExtended.from("invoices").select("id", { count: "exact", head: true }).limit(1),
    supabaseExtended.from("communication_events").select("id", { count: "exact", head: true }).limit(1),
  ]);

  const probeErrors = [
    estimateProbe.error, pickupProbe.error, invoiceProbe.error, communicationProbe.error,
  ].filter(Boolean);

  if (probeErrors.some((e) => isMissingRelationError(e))) {
    return {
      reminders: [], updates: [], trends: [],
      errorMessage: "Operational reminders are unavailable in this environment because required workflow tables are missing.",
    };
  }

  const nowMs = Date.now();
  const thresholds = [3, 4, 5, 7].map((d) => new Date(nowMs - d * MS_PER_DAY).toISOString());
  const [t3, t4, t5, t7] = thresholds;
  const updatesSinceIso = new Date(nowMs - RECENT_UPDATE_DAYS * MS_PER_DAY).toISOString();
  const updatesCurrentWindowIso = new Date(nowMs - MS_PER_DAY).toISOString();
  const updatesPreviousWindowIso = new Date(nowMs - 2 * MS_PER_DAY).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder chain typing
  const estimateFilter = <T extends { eq: (...args: any[]) => T }>(q: T) => q.eq("status", "sent");
  const pickupFilter = <T extends { in: (...args: any[]) => T }>(q: T) => q.in("status", ["pending", "confirmed", "assigned"]);
  const overdueDueFilter = <T extends { eq: (...args: any[]) => T; not: (...args: any[]) => T }>(q: T) => q.eq("status", "overdue").not("due_at", "is", null);
  const overdueNoDueFilter = <T extends { eq: (...args: any[]) => T; is: (...args: any[]) => T }>(q: T) => q.eq("status", "overdue").is("due_at", null);

  const results = await Promise.allSettled([
    // Estimates: 3d, 4d, 5d, 7d
    countWithThreshold("estimates", estimateFilter, "created_at", t3),
    countWithThreshold("estimates", estimateFilter, "created_at", t4),
    countWithThreshold("estimates", estimateFilter, "created_at", t5),
    countWithThreshold("estimates", estimateFilter, "created_at", t7),
    // Pickups: 3d, 4d, 5d, 7d
    countWithThreshold("pickup_requests", pickupFilter, "updated_at", t3),
    countWithThreshold("pickup_requests", pickupFilter, "updated_at", t4),
    countWithThreshold("pickup_requests", pickupFilter, "updated_at", t5),
    countWithThreshold("pickup_requests", pickupFilter, "updated_at", t7),
    // Overdue with due_at: 3d, 4d, 5d, 7d
    countWithThreshold("invoices", overdueDueFilter, "due_at", t3),
    countWithThreshold("invoices", overdueDueFilter, "due_at", t4),
    countWithThreshold("invoices", overdueDueFilter, "due_at", t5),
    countWithThreshold("invoices", overdueDueFilter, "due_at", t7),
    // Overdue without due_at: 3d, 4d, 5d, 7d
    countWithThreshold("invoices", overdueNoDueFilter, "created_at", t3),
    countWithThreshold("invoices", overdueNoDueFilter, "created_at", t4),
    countWithThreshold("invoices", overdueNoDueFilter, "created_at", t5),
    countWithThreshold("invoices", overdueNoDueFilter, "created_at", t7),
    // Updates
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

  const errors: string[] = [];
  const val = (idx: number): number => {
    const r = results[idx];
    if (r.status === "rejected") {
      errors.push(r.reason instanceof Error ? r.reason.message : "unknown error");
      return 0;
    }
    return typeof r.value === "number" ? r.value : 0;
  };

  const estimateCount3 = val(0), estimateCount4 = val(1), estimateCount5 = val(2), estimateCount7 = val(3);
  const pickupCount3 = val(4), pickupCount4 = val(5), pickupCount5 = val(6), pickupCount7 = val(7);
  const overdueDueCount3 = val(8), overdueDueCount4 = val(9), overdueDueCount5 = val(10), overdueDueCount7 = val(11);
  const overdueNoDueCount3 = val(12), overdueNoDueCount4 = val(13), overdueNoDueCount5 = val(14), overdueNoDueCount7 = val(15);

  const overdueCount3 = overdueDueCount3 + overdueNoDueCount3;
  const overdueCount4 = overdueDueCount4 + overdueNoDueCount4;
  const overdueCount5 = overdueDueCount5 + overdueNoDueCount5;
  const overdueCount7 = overdueDueCount7 + overdueNoDueCount7;

  // Check communication event results
  for (let i = 16; i <= 18; i++) {
    const r = results[i];
    if (r.status === "rejected") {
      errors.push(r.reason instanceof Error ? r.reason.message : "unknown error");
    } else if (typeof r.value === "object" && r.value !== null && "error" in r.value && r.value.error) {
      errors.push((r.value.error as { message: string }).message);
    }
  }

  if (errors.length > 0) {
    return { reminders: [], updates: [], trends: [], errorMessage: errors.join(" | ") };
  }

  const estimateBands = buildSlaBands(estimateCount3, estimateCount5, estimateCount7);
  const pickupBands = buildSlaBands(pickupCount3, pickupCount5, pickupCount7);
  const overdueBands = buildSlaBands(overdueCount3, overdueCount5, overdueCount7);

  const reminders: OperationalReminder[] = [
    {
      id: "stale-estimates",
      label: "Estimates waiting > 3 days",
      description: "Pending client decisions that may need a follow-up.",
      count: estimateCount3,
      href: "/facility/office?tab=estimates&status=sent&minAgeDays=3",
      severity: getSeverityFromBands(estimateBands),
      slaBands: estimateBands,
      deltaFromYesterday: estimateCount3 - estimateCount4,
    },
    {
      id: "stale-pickups",
      label: "Pickup requests stale > 3 days",
      description: "Requests pending route updates or assignment.",
      count: pickupCount3,
      href: "/facility/office?tab=pickups&status=pending,confirmed,assigned&minAgeDays=3",
      severity: getSeverityFromBands(pickupBands),
      slaBands: pickupBands,
      deltaFromYesterday: pickupCount3 - pickupCount4,
    },
    {
      id: "overdue-invoices",
      label: "Overdue invoices",
      description: "Outstanding balances requiring collections follow-up.",
      count: overdueCount3,
      href: "/facility/office?tab=invoices&status=overdue&minAgeDays=3",
      severity: getSeverityFromBands(overdueBands),
      slaBands: overdueBands,
      deltaFromYesterday: overdueCount3 - overdueCount4,
    },
  ];

  const updateListResult = results[16];
  const updateRows = updateListResult.status === "fulfilled" && typeof updateListResult.value === "object" && updateListResult.value !== null && "data" in updateListResult.value
    ? (updateListResult.value.data ?? []) as UpdateReminderRow[]
    : [];
  const updates: OperationalUpdate[] = updateRows.map((event) => ({
    id: event.id,
    title: buildEventTitle(event.event_type, event.subject),
    createdAt: event.created_at,
  }));

  const updatesCurrentResult = results[17];
  const updatesPreviousResult = results[18];
  const updatesCurrent = updatesCurrentResult.status === "fulfilled" && typeof updatesCurrentResult.value === "object" && updatesCurrentResult.value !== null && "count" in updatesCurrentResult.value
    ? (updatesCurrentResult.value.count ?? 0) as number : 0;
  const updatesPrevious = updatesPreviousResult.status === "fulfilled" && typeof updatesPreviousResult.value === "object" && updatesPreviousResult.value !== null && "count" in updatesPreviousResult.value
    ? (updatesPreviousResult.value.count ?? 0) as number : 0;

  const trends: OperationalTrendSnapshot[] = [
    buildTrendSnapshot("estimates", "Stale estimates (3d+)", estimateCount3, estimateCount4),
    buildTrendSnapshot("pickups", "Stale pickups (3d+)", pickupCount3, pickupCount4),
    buildTrendSnapshot("overdue-invoices", "Overdue invoices (3d+)", overdueCount3, overdueCount4),
    buildTrendSnapshot("client-updates", "Client updates (24h)", updatesCurrent, updatesPrevious),
  ];

  return { reminders, updates, trends, errorMessage: null };
}

export function useOperationalReminders() {
  const queryClient = useQueryClient();
  const remindersEnabled = import.meta.env.VITE_ENABLE_OPERATIONAL_REMINDERS !== "false";

  const { data, isLoading } = useQuery({
    queryKey: ["operational-reminders"],
    queryFn: fetchReminderData,
    staleTime: 60_000,
    enabled: remindersEnabled,
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["operational-reminders"] });
  }, [queryClient]);

  return {
    loading: isLoading,
    errorMessage: data?.errorMessage ?? null,
    reminders: data?.reminders ?? [],
    updates: data?.updates ?? [],
    trends: data?.trends ?? [],
    refresh,
  };
}
