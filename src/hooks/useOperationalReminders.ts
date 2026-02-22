import { useCallback, useEffect, useState } from "react";
import { supabaseExtended } from "@/integrations/supabase/extended";

type ReminderSeverity = "default" | "warning" | "critical";

export type OperationalReminder = {
  id: string;
  label: string;
  description: string;
  count: number;
  href: string;
  severity: ReminderSeverity;
};

export type OperationalUpdate = {
  id: string;
  title: string;
  createdAt: string;
};

type ReminderState = {
  loading: boolean;
  errorMessage: string | null;
  reminders: OperationalReminder[];
  updates: OperationalUpdate[];
};

const STALE_DAYS = 3;
const RECENT_UPDATE_DAYS = 7;

function buildEventTitle(eventType: string, subject: string) {
  if (eventType === "estimate_approved_by_client") return `Estimate approved: ${subject}`;
  if (eventType === "estimate_rejected_by_client") return `Estimate rejected: ${subject}`;
  if (eventType === "invoice_pdf_downloaded_by_client") return `Invoice viewed: ${subject}`;
  return subject || eventType;
}

export function useOperationalReminders() {
  const [state, setState] = useState<ReminderState>({
    loading: true,
    errorMessage: null,
    reminders: [],
    updates: [],
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, errorMessage: null }));

    const staleSinceIso = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const updatesSinceIso = new Date(Date.now() - RECENT_UPDATE_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const [estimateResult, pickupResult, overdueInvoiceResult, updateResult] = await Promise.allSettled([
      supabaseExtended
        .from("estimates")
        .select("id")
        .eq("status", "sent")
        .lte("created_at", staleSinceIso)
        .limit(200),
      supabaseExtended
        .from("pickup_requests")
        .select("id")
        .in("status", ["pending", "confirmed", "assigned"])
        .lte("updated_at", staleSinceIso)
        .limit(200),
      supabaseExtended
        .from("invoices")
        .select("id")
        .eq("status", "overdue")
        .limit(200),
      supabaseExtended
        .from("communication_events")
        .select("id, event_type, subject, created_at")
        .in("event_type", ["estimate_approved_by_client", "estimate_rejected_by_client", "invoice_pdf_downloaded_by_client"])
        .gte("created_at", updatesSinceIso)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);

    const reminders: OperationalReminder[] = [];
    const updates: OperationalUpdate[] = [];
    const errors: string[] = [];

    if (estimateResult.status === "fulfilled") {
      if (estimateResult.value.error) {
        errors.push(`estimates: ${estimateResult.value.error.message}`);
      } else {
        reminders.push({
          id: "stale-estimates",
          label: "Estimates waiting > 3 days",
          description: "Pending client decisions that may need a follow-up.",
          count: estimateResult.value.data?.length ?? 0,
          href: "/facility/office",
          severity: "warning",
        });
      }
    } else {
      errors.push(`estimates: ${estimateResult.reason instanceof Error ? estimateResult.reason.message : "unknown error"}`);
    }

    if (pickupResult.status === "fulfilled") {
      if (pickupResult.value.error) {
        errors.push(`pickups: ${pickupResult.value.error.message}`);
      } else {
        reminders.push({
          id: "stale-pickups",
          label: "Pickup requests stale > 3 days",
          description: "Requests pending route updates or assignment.",
          count: pickupResult.value.data?.length ?? 0,
          href: "/facility/office",
          severity: "warning",
        });
      }
    } else {
      errors.push(`pickups: ${pickupResult.reason instanceof Error ? pickupResult.reason.message : "unknown error"}`);
    }

    if (overdueInvoiceResult.status === "fulfilled") {
      if (overdueInvoiceResult.value.error) {
        errors.push(`invoices: ${overdueInvoiceResult.value.error.message}`);
      } else {
        reminders.push({
          id: "overdue-invoices",
          label: "Overdue invoices",
          description: "Outstanding balances requiring collections follow-up.",
          count: overdueInvoiceResult.value.data?.length ?? 0,
          href: "/facility/office",
          severity: "critical",
        });
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
        updates.push(
          ...(updateResult.value.data ?? []).map((event) => ({
            id: event.id,
            title: buildEventTitle(event.event_type, event.subject),
            createdAt: event.created_at,
          })),
        );
      }
    } else {
      errors.push(`updates: ${updateResult.reason instanceof Error ? updateResult.reason.message : "unknown error"}`);
    }

    setState({
      loading: false,
      errorMessage: errors.length > 0 ? errors.join(" | ") : null,
      reminders,
      updates,
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
