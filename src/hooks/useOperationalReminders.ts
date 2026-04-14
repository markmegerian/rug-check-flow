import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { isMissingRelationError } from "@/lib/supabase-helpers";
import { MS_PER_DAY } from "@/lib/constants";

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

const RECENT_UPDATE_DAYS = 7;
type UpdateReminderRow = { id: string; event_type: string; subject: string; created_at: string };
const REMINDER_EVENT_TYPES = [
  "estimate_approved_by_client",
  "estimate_rejected_by_client",
  "invoice_pdf_downloaded_by_client",
];


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

function countThresholds(timestamps: string[], thresholds: string[]) {
  return thresholds.map((thresholdIso) => timestamps.filter((value) => value <= thresholdIso).length);
}

async function fetchReminderData(): Promise<ReminderData> {
  const nowMs = Date.now();
  const thresholds = [3, 4, 5, 7].map((d) => new Date(nowMs - d * MS_PER_DAY).toISOString());
  const [t3, t4, t5, t7] = thresholds;
  const updatesSinceIso = new Date(nowMs - RECENT_UPDATE_DAYS * MS_PER_DAY).toISOString();
  const updatesCurrentWindowIso = new Date(nowMs - MS_PER_DAY).toISOString();
  const updatesPreviousWindowIso = new Date(nowMs - 2 * MS_PER_DAY).toISOString();

  const [estimatesResult, pickupsResult, overdueWithDueResult, overdueWithoutDueResult, updatesResult] = await Promise.all([
    supabaseExtended
      .from("estimates")
      .select("id, created_at")
      .eq("status", "sent")
      .lte("created_at", t3),
    supabaseExtended
      .from("pickup_requests")
      .select("id, updated_at")
      .in("status", ["pending", "confirmed", "assigned"])
      .lte("updated_at", t3),
    supabaseExtended
      .from("invoices")
      .select("id, due_at")
      .eq("status", "overdue")
      .not("due_at", "is", null)
      .lte("due_at", t3),
    supabaseExtended
      .from("invoices")
      .select("id, created_at")
      .eq("status", "overdue")
      .is("due_at", null)
      .lte("created_at", t3),
    supabaseExtended
      .from("communication_events")
      .select("id, event_type, subject, created_at")
      .in("event_type", REMINDER_EVENT_TYPES)
      .gte("created_at", updatesPreviousWindowIso)
      .order("created_at", { ascending: false })
      .returns<UpdateReminderRow[]>(),
  ]);

  const allErrors = [
    estimatesResult.error,
    pickupsResult.error,
    overdueWithDueResult.error,
    overdueWithoutDueResult.error,
    updatesResult.error,
  ].filter(Boolean);

  if (allErrors.some((e) => isMissingRelationError(e))) {
    return {
      reminders: [], updates: [], trends: [],
      errorMessage: "Operational reminders are unavailable in this environment because required workflow tables are missing.",
    };
  }

  if (allErrors.length > 0) {
    return {
      reminders: [],
      updates: [],
      trends: [],
      errorMessage: allErrors.map((e) => e?.message ?? "unknown error").join(" | "),
    };
  }

  const estimateTimes = (estimatesResult.data ?? []).map((row) => row.created_at).filter(Boolean) as string[];
  const pickupTimes = (pickupsResult.data ?? []).map((row) => row.updated_at).filter(Boolean) as string[];
  const overdueDueTimes = (overdueWithDueResult.data ?? []).map((row) => row.due_at).filter(Boolean) as string[];
  const overdueNoDueTimes = (overdueWithoutDueResult.data ?? []).map((row) => row.created_at).filter(Boolean) as string[];

  const [estimateCount3, estimateCount4, estimateCount5, estimateCount7] = countThresholds(estimateTimes, thresholds);
  const [pickupCount3, pickupCount4, pickupCount5, pickupCount7] = countThresholds(pickupTimes, thresholds);
  const [overdueDueCount3, overdueDueCount4, overdueDueCount5, overdueDueCount7] = countThresholds(overdueDueTimes, thresholds);
  const [overdueNoDueCount3, overdueNoDueCount4, overdueNoDueCount5, overdueNoDueCount7] = countThresholds(overdueNoDueTimes, thresholds);

  const overdueCount3 = overdueDueCount3 + overdueNoDueCount3;
  const overdueCount4 = overdueDueCount4 + overdueNoDueCount4;
  const overdueCount5 = overdueDueCount5 + overdueNoDueCount5;
  const overdueCount7 = overdueDueCount7 + overdueNoDueCount7;

  const updateRows = ((updatesResult.data ?? []) as UpdateReminderRow[])
    .filter((event) => event.created_at >= updatesSinceIso)
    .slice(0, 6);
  const updatesCurrent = updateRows.filter((event) => event.created_at >= updatesCurrentWindowIso).length;
  const updatesPrevious = updateRows.filter((event) => event.created_at >= updatesPreviousWindowIso && event.created_at < updatesCurrentWindowIso).length;

  const estimateBands = buildSlaBands(estimateCount3, estimateCount5, estimateCount7);
  const pickupBands = buildSlaBands(pickupCount3, pickupCount5, pickupCount7);
  const overdueBands = buildSlaBands(overdueCount3, overdueCount5, overdueCount7);

  const reminders: OperationalReminder[] = [
    {
      id: "stale-estimates",
      label: "Estimates waiting > 3 days",
      description: "Pending client decisions that may need a follow-up.",
      count: estimateCount3,
      href: "/ops?tab=estimates&status=sent&minAgeDays=3",
      severity: getSeverityFromBands(estimateBands),
      slaBands: estimateBands,
      deltaFromYesterday: estimateCount3 - estimateCount4,
    },
    {
      id: "stale-pickups",
      label: "Pickup requests stale > 3 days",
      description: "Requests pending route updates or assignment.",
      count: pickupCount3,
      href: "/ops?tab=jobs&status=pending,confirmed,assigned&minAgeDays=3",
      severity: getSeverityFromBands(pickupBands),
      slaBands: pickupBands,
      deltaFromYesterday: pickupCount3 - pickupCount4,
    },
    {
      id: "overdue-invoices",
      label: "Overdue invoices",
      description: "Outstanding balances requiring collections follow-up.",
      count: overdueCount3,
      href: "/ops?tab=accounts-receivable&status=overdue&minAgeDays=3",
      severity: getSeverityFromBands(overdueBands),
      slaBands: overdueBands,
      deltaFromYesterday: overdueCount3 - overdueCount4,
    },
  ];

  const updates: OperationalUpdate[] = updateRows.map((event) => ({
    id: event.id,
    title: buildEventTitle(event.event_type, event.subject),
    createdAt: event.created_at,
  }));

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
