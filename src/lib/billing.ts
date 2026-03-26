import { addDays, format } from "date-fns";

export const DEFAULT_INVOICE_TERMS_DAYS = 14;
export const BILLING_REMINDER_PREFERENCES = ["email", "phone", "manual"] as const;
export const COLLECTION_ACTION_TYPES = [
  "collections_reminder_sent",
  "collections_account_handled",
  "collections_account_on_hold",
  "collections_account_disputed",
] as const;

export type BillingReminderPreference = (typeof BILLING_REMINDER_PREFERENCES)[number];
export type CollectionsActionType = (typeof COLLECTION_ACTION_TYPES)[number];

export const COLLECTION_ACTION_META: Record<CollectionsActionType, { label: string; description: string; channel: "email" | "in_app_chat" }> = {
  collections_reminder_sent: {
    label: "Reminder sent",
    description: "Log that collections follow-up went out to this client account.",
    channel: "email",
  },
  collections_account_handled: {
    label: "Marked handled",
    description: "Log that this account has an owner and a current follow-up plan.",
    channel: "in_app_chat",
  },
  collections_account_on_hold: {
    label: "Placed on hold",
    description: "Log that the account is intentionally paused from normal collections follow-up.",
    channel: "in_app_chat",
  },
  collections_account_disputed: {
    label: "Marked disputed",
    description: "Log that the overdue balance is under review or being challenged.",
    channel: "in_app_chat",
  },
};

export type CollectionsStateTone = "neutral" | "success" | "warning" | "danger";

export type CollectionsAccountState = {
  label: string;
  tone: CollectionsStateTone;
  detail: string;
};

export function getCollectionsAccountState(params: {
  oldestOverdueAgeDays: number | null;
  latestActionType?: CollectionsActionType | null;
  latestActionCreatedAt?: string | null;
}): CollectionsAccountState {
  const { oldestOverdueAgeDays, latestActionType, latestActionCreatedAt } = params;
  const ageDays = oldestOverdueAgeDays ?? 0;
  const daysSinceAction = latestActionCreatedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(latestActionCreatedAt).getTime()) / 86_400_000))
    : null;

  if (latestActionType === "collections_account_on_hold") {
    return {
      label: "On hold",
      tone: "neutral",
      detail: "Collections follow-up is intentionally paused for this account.",
    };
  }

  if (latestActionType === "collections_account_disputed") {
    return {
      label: "Disputed",
      tone: "warning",
      detail: "Resolve the dispute before resuming normal collections pressure.",
    };
  }

  if (ageDays <= 0) {
    return {
      label: "Current",
      tone: "success",
      detail: "No overdue pressure is active on this account right now.",
    };
  }

  if (latestActionType === "collections_reminder_sent" && daysSinceAction !== null && daysSinceAction < 3) {
    return {
      label: "Awaiting response",
      tone: "success",
      detail: "A reminder went out recently, so wait before sending another nudge.",
    };
  }

  if (latestActionType === "collections_account_handled" && ageDays < 14) {
    return {
      label: "Handled",
      tone: "success",
      detail: "This account has an owner and a current follow-up plan.",
    };
  }

  if (ageDays >= 21) {
    return {
      label: "Escalated",
      tone: "danger",
      detail: "The overdue window is severe enough that this account needs escalation, not just another reminder.",
    };
  }

  if (ageDays >= 14) {
    return {
      label: "Escalation due",
      tone: "danger",
      detail: "Past-due aging is high enough that collections should actively intervene now.",
    };
  }

  if (ageDays >= 7) {
    return {
      label: "Follow-up due",
      tone: "warning",
      detail: "The account is old enough that a reminder or owner review is now due.",
    };
  }

  return {
    label: "Monitor",
    tone: "neutral",
    detail: "Track the account, but it does not yet need strong collections pressure.",
  };
}

export function getCollectionsStateBadgeClass(tone: CollectionsStateTone) {
  if (tone === "danger") return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200";
  if (tone === "warning") return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  if (tone === "success") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";
  return "bg-muted text-muted-foreground";
}

export function getCollectionsNextAction(params: {
  oldestOverdueAgeDays: number | null;
  latestActionType?: CollectionsActionType | null;
  latestActionCreatedAt?: string | null;
}) {
  const state = getCollectionsAccountState(params);

  if (params.latestActionType === "collections_account_on_hold") {
    return { label: "Wait for manual release from hold", tone: "neutral" as CollectionsStateTone };
  }
  if (params.latestActionType === "collections_account_disputed") {
    return { label: "Resolve the dispute before more collections outreach", tone: "warning" as CollectionsStateTone };
  }
  if (params.latestActionType === "collections_reminder_sent" && params.latestActionCreatedAt) {
    const daysSinceAction = Math.max(0, Math.floor((Date.now() - new Date(params.latestActionCreatedAt).getTime()) / 86_400_000));
    if (daysSinceAction < 3) {
      return { label: "Wait for response window to pass", tone: "success" as CollectionsStateTone };
    }
  }
  if (state.tone === "danger") {
    return { label: "Escalate account review now", tone: "danger" as CollectionsStateTone };
  }
  if (state.tone === "warning") {
    return { label: "Send reminder or assign owner review", tone: "warning" as CollectionsStateTone };
  }
  if (state.tone === "success") {
    return { label: "Monitor account and wait for next change", tone: "success" as CollectionsStateTone };
  }
  return { label: "Monitor account aging", tone: "neutral" as CollectionsStateTone };
}

export function normalizeInvoiceTermsDays(value: number | null | undefined) {
  if (!Number.isFinite(value)) return DEFAULT_INVOICE_TERMS_DAYS;
  return Math.min(90, Math.max(1, Math.trunc(value as number)));
}

export function calculateInvoiceDueDate(issueDate: Date, invoiceTermsDays: number | null | undefined) {
  return format(addDays(issueDate, normalizeInvoiceTermsDays(invoiceTermsDays)), "yyyy-MM-dd");
}

export function formatInvoiceTermsLabel(invoiceTermsDays: number | null | undefined) {
  const normalized = normalizeInvoiceTermsDays(invoiceTermsDays);
  return normalized === 1 ? "Net 1 day" : `Net ${normalized} days`;
}

export function formatReminderPreferenceLabel(preference: BillingReminderPreference | string | null | undefined) {
  if (preference === "phone") return "Phone";
  if (preference === "manual") return "Manual only";
  return "Email";
}

export function getPortalBillingState(params: {
  overdueInvoices: number;
  oldestOverdueAgeDays: number | null;
  openInvoices: number;
  nextDueAt: string | null;
}) {
  const { overdueInvoices, oldestOverdueAgeDays, openInvoices, nextDueAt } = params;

  if (overdueInvoices > 0) {
    if ((oldestOverdueAgeDays ?? 0) >= 14) {
      return {
        label: "Payment overdue",
        tone: "danger" as CollectionsStateTone,
        detail: "One or more invoices are meaningfully past due and should be settled as soon as possible.",
      };
    }

    return {
      label: "Payment due now",
      tone: "warning" as CollectionsStateTone,
      detail: "At least one invoice is overdue and needs attention.",
    };
  }

  if (openInvoices > 0 && nextDueAt) {
    const daysUntilDue = Math.ceil((new Date(nextDueAt).getTime() - Date.now()) / 86_400_000);
    if (daysUntilDue <= 7) {
      return {
        label: "Upcoming payment",
        tone: "warning" as CollectionsStateTone,
        detail: "An open invoice is due soon, so this account should review the balance now.",
      };
    }

    return {
      label: "Open balance",
      tone: "neutral" as CollectionsStateTone,
      detail: "There is an outstanding balance, but nothing is overdue right now.",
    };
  }

  return {
    label: "Paid up",
    tone: "success" as CollectionsStateTone,
    detail: "No open or overdue invoices need attention right now.",
  };
}
