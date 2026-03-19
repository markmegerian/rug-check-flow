import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";

/**
 * Deduplication helper: checks whether a notification with the given type and
 * matching metadata key/value already exists for a user within the last 24 hours.
 * Returns `true` if a duplicate exists (i.e. skip inserting).
 */
async function isDuplicate(
  userId: string,
  type: string,
  metadataKey: string,
  metadataValue: string
): Promise<boolean> {
  const twentyFourHoursAgo = new Date(
    Date.now() - 24 * 60 * 60 * 1000
  ).toISOString();

  const { data } = await supabaseExtended
    .from("notifications")
    .select("id, metadata")
    .eq("user_id", userId)
    .eq("type", type)
    .gte("created_at", twentyFourHoursAgo)
    .limit(100);

  if (!data || data.length === 0) return false;

  return data.some((row) => {
    const meta = row.metadata as Record<string, unknown> | null;
    return meta && String(meta[metadataKey]) === metadataValue;
  });
}

/**
 * Checks for invoices with status='sent' whose due_at is in the past.
 * Creates an "overdue_invoice" notification for each staff user, deduped
 * within a 24-hour window.
 */
export async function checkOverdueInvoices(
  staffUserIds: string[]
): Promise<number> {
  const now = new Date().toISOString();

  const { data: overdueInvoices, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, due_at")
    .eq("status", "sent")
    .lt("due_at", now);

  if (error || !overdueInvoices || overdueInvoices.length === 0) return 0;

  let created = 0;

  for (const invoice of overdueInvoices) {
    const dueDate = new Date(invoice.due_at!);
    const daysOverdue = Math.floor(
      (Date.now() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    for (const userId of staffUserIds) {
      const duplicate = await isDuplicate(
        userId,
        "overdue_invoice",
        "invoice_id",
        invoice.id
      );
      if (duplicate) continue;

      const { error: insertError } = await supabaseExtended
        .from("notifications")
        .insert({
          user_id: userId,
          type: "overdue_invoice",
          title: "Overdue Invoice",
          message: `Invoice ${invoice.invoice_number} is overdue by ${daysOverdue} days`,
          metadata: {
            invoice_id: invoice.id,
            days_overdue: daysOverdue,
          },
          read: false,
        });

      if (!insertError) created++;
    }
  }

  return created;
}

/**
 * Checks for pickup requests that have been "pending" for more than 3 days.
 * Creates a "stale_pickup" notification for each staff user.
 */
export async function checkStalePickups(
  staffUserIds: string[]
): Promise<number> {
  const threeDaysAgo = new Date(
    Date.now() - 3 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: stalePickups, error } = await supabaseExtended
    .from("pickup_requests")
    .select("id, client_id, created_at")
    .eq("status", "pending")
    .lt("created_at", threeDaysAgo);

  if (error || !stalePickups || stalePickups.length === 0) return 0;

  // Gather unique client IDs to fetch names in one query
  const clientIds = [...new Set(stalePickups.map((p) => p.client_id))];
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .in("id", clientIds);

  const clientNameMap = new Map(
    (clients ?? []).map((c) => [c.id, c.name])
  );

  let created = 0;

  for (const pickup of stalePickups) {
    const createdDate = new Date(pickup.created_at);
    const daysPending = Math.floor(
      (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const clientName = clientNameMap.get(pickup.client_id) ?? "Unknown";

    for (const userId of staffUserIds) {
      const duplicate = await isDuplicate(
        userId,
        "stale_pickup",
        "pickup_request_id",
        pickup.id
      );
      if (duplicate) continue;

      const { error: insertError } = await supabaseExtended
        .from("notifications")
        .insert({
          user_id: userId,
          type: "stale_pickup",
          title: "Stale Pickup Request",
          message: `Pickup for ${clientName} has been pending for ${daysPending} days`,
          metadata: {
            pickup_request_id: pickup.id,
            days_pending: daysPending,
          },
          read: false,
        });

      if (!insertError) created++;
    }
  }

  return created;
}

/**
 * Checks for disputes with status='open' that have been unresolved for more
 * than 2 days. Creates a "open_dispute" notification for each staff user.
 */
export async function checkOpenDisputes(
  staffUserIds: string[]
): Promise<number> {
  const twoDaysAgo = new Date(
    Date.now() - 2 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: openDisputes, error } = await supabaseExtended
    .from("disputes")
    .select("id, client_id, type, created_at")
    .eq("status", "open")
    .lt("created_at", twoDaysAgo);

  if (error || !openDisputes || openDisputes.length === 0) return 0;

  // Fetch client names
  const clientIds = [...new Set(openDisputes.map((d) => d.client_id))];
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name")
    .in("id", clientIds);

  const clientNameMap = new Map(
    (clients ?? []).map((c) => [c.id, c.name])
  );

  let created = 0;

  for (const dispute of openDisputes) {
    const createdDate = new Date(dispute.created_at);
    const daysOpen = Math.floor(
      (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const clientName = clientNameMap.get(dispute.client_id) ?? "Unknown";

    for (const userId of staffUserIds) {
      const duplicate = await isDuplicate(
        userId,
        "open_dispute",
        "dispute_id",
        dispute.id
      );
      if (duplicate) continue;

      const { error: insertError } = await supabaseExtended
        .from("notifications")
        .insert({
          user_id: userId,
          type: "open_dispute",
          title: "Unresolved Dispute",
          message: `${dispute.type.replace("_", " ")} dispute for ${clientName} has been open for ${daysOpen} days`,
          metadata: {
            dispute_id: dispute.id,
            days_open: daysOpen,
          },
          read: false,
        });

      if (!insertError) created++;
    }
  }

  return created;
}

/**
 * Runs all reminder checks and returns the count of new notifications
 * created by each check.
 */
export async function runAllReminders(
  staffUserIds: string[]
): Promise<{ overdue: number; stalePickups: number; disputes: number }> {
  const [overdue, stalePickups, disputes] = await Promise.all([
    checkOverdueInvoices(staffUserIds),
    checkStalePickups(staffUserIds),
    checkOpenDisputes(staffUserIds),
  ]);

  return { overdue, stalePickups, disputes };
}
