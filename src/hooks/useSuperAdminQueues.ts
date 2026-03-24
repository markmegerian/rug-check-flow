import { useQuery } from "@tanstack/react-query";
import { differenceInCalendarDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended, type ExtendedTableRow } from "@/integrations/supabase/extended";
import type { Tables } from "@/integrations/supabase/types";

export type ClientResponseItem = {
  id: string;
  clientName: string;
  title: string;
  createdAt: string;
  tone: "success" | "danger" | "neutral";
};

export type OverdueInvoiceItem = Pick<
  Tables<"invoices">,
  "id" | "invoice_number" | "due_at" | "created_at" | "status" | "total" | "client_id"
> & {
  clients: { name: string } | null;
};

export type AttentionItem = {
  id: string;
  rugId: string;
  rugNumber: string;
  clientName: string;
  status: Tables<"rugs">["status"];
  photoUrl: string | null;
  ageDays: number;
  reason: string;
  checkedInAt: string;
};

export type SuperAdminQueuesData = {
  clientResponses: ClientResponseItem[];
  overdueInvoices: OverdueInvoiceItem[];
  attentionItems: AttentionItem[];
  totals: {
    responses: number;
    overdueInvoices: number;
    overdueBalance: number;
    attentionRugs: number;
  };
};

type ClientResponseRow = ExtendedTableRow<"communication_events">;
type AttentionRugRow = Pick<
  Tables<"rugs">,
  "id" | "tag" | "status" | "checked_in_at" | "notes" | "photo_url"
> & {
  clients: { name: string } | null;
};

const CLIENT_RESPONSE_EVENTS = [
  "estimate_approved_by_client",
  "estimate_rejected_by_client",
  "invoice_pdf_downloaded_by_client",
];

export const STALE_RUG_DAYS = 7;

function responseTitle(event: ClientResponseRow) {
  if (event.event_type === "estimate_approved_by_client") return event.subject || "Estimate approved";
  if (event.event_type === "estimate_rejected_by_client") return event.subject || "Estimate rejected";
  if (event.event_type === "invoice_pdf_downloaded_by_client") return event.subject || "Invoice viewed";
  return event.subject || event.event_type;
}

function responseTone(eventType: string): ClientResponseItem["tone"] {
  if (eventType === "estimate_approved_by_client") return "success";
  if (eventType === "estimate_rejected_by_client") return "danger";
  return "neutral";
}

function attentionReason(rug: AttentionRugRow, ageDays: number) {
  const noteFlag = rug.notes.trim().length > 0;
  if (rug.status === "ready" && ageDays >= STALE_RUG_DAYS) {
    return noteFlag ? `Ready ${ageDays}d · note attached` : `Ready ${ageDays}d — verify route / delivery`;
  }
  if (rug.status === "in_production" && ageDays >= STALE_RUG_DAYS) {
    return noteFlag ? `In production ${ageDays}d · note attached` : `In production ${ageDays}d — review delay`;
  }
  if (rug.status === "checked_in" && ageDays >= STALE_RUG_DAYS) {
    return noteFlag ? `Checked in ${ageDays}d · note attached` : `Checked in ${ageDays}d — confirm progression`;
  }
  if (rug.status === "picked_up" && ageDays >= STALE_RUG_DAYS) {
    return noteFlag ? `Picked up ${ageDays}d · note attached` : `Picked up ${ageDays}d — verify intake`;
  }
  if (noteFlag) return "Special note attached";
  return "Needs review";
}

function attentionPriority(item: AttentionItem) {
  const statusRank: Record<AttentionItem["status"], number> = {
    ready: 4,
    in_production: 3,
    checked_in: 2,
    picked_up: 1,
  };
  return item.ageDays * 10 + statusRank[item.status];
}

async function fetchSuperAdminQueues(): Promise<SuperAdminQueuesData> {
  const [responsesResult, overdueResult, rugsResult] = await Promise.all([
    supabaseExtended
      .from("communication_events")
      .select("id, client_id, event_type, subject, created_at")
      .in("event_type", CLIENT_RESPONSE_EVENTS)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("invoices")
      .select("id, invoice_number, due_at, created_at, status, total, client_id, clients(name)")
      .eq("status", "overdue")
      .order("due_at", { ascending: true, nullsFirst: true })
      .limit(50),
    supabase
      .from("rugs")
      .select("id, tag, status, checked_in_at, notes, photo_url, clients(name)")
      .order("checked_in_at", { ascending: true })
      .limit(300),
  ]);

  if (responsesResult.error) throw responsesResult.error;
  if (overdueResult.error) throw overdueResult.error;
  if (rugsResult.error) throw rugsResult.error;

  const responseRows = (responsesResult.data ?? []) as ClientResponseRow[];
  const responseClientIds = Array.from(new Set(responseRows.map((row) => row.client_id).filter((value): value is string => Boolean(value))));
  let clientNameMap = new Map<string, string>();

  if (responseClientIds.length > 0) {
    const { data: clientRows, error: clientError } = await supabase
      .from("clients")
      .select("id, name")
      .in("id", responseClientIds);
    if (clientError) throw clientError;
    clientNameMap = new Map(((clientRows ?? []) as Array<Pick<Tables<"clients">, "id" | "name">>).map((row) => [row.id, row.name]));
  }

  const clientResponses = responseRows.map((row) => ({
    id: row.id,
    clientName: row.client_id ? clientNameMap.get(row.client_id) ?? "Unknown client" : "Unknown client",
    title: responseTitle(row),
    createdAt: row.created_at,
    tone: responseTone(row.event_type),
  }));

  const overdueInvoices = (overdueResult.data ?? []) as unknown as OverdueInvoiceItem[];
  const overdueBalance = overdueInvoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);

  const attentionItems = ((rugsResult.data ?? []) as unknown as AttentionRugRow[])
    .map((rug) => {
      const ageDays = Math.max(0, differenceInCalendarDays(new Date(), new Date(rug.checked_in_at)));
      const noteFlag = rug.notes.trim().length > 0;
      const staleFlag = ageDays >= STALE_RUG_DAYS;
      if (!staleFlag && !noteFlag) return null;
      return {
        id: rug.id,
        rugId: rug.id,
        rugNumber: rug.tag,
        clientName: rug.clients?.name ?? "Unknown client",
        status: rug.status,
        photoUrl: rug.photo_url,
        ageDays,
        reason: attentionReason(rug, ageDays),
        checkedInAt: rug.checked_in_at,
      } satisfies AttentionItem;
    })
    .filter((item): item is AttentionItem => Boolean(item))
    .sort((a, b) => attentionPriority(b) - attentionPriority(a));

  return {
    clientResponses,
    overdueInvoices,
    attentionItems,
    totals: {
      responses: clientResponses.length,
      overdueInvoices: overdueInvoices.length,
      overdueBalance,
      attentionRugs: attentionItems.length,
    },
  };
}

export function useSuperAdminQueues() {
  return useQuery({
    queryKey: ["super-admin-queues"],
    queryFn: fetchSuperAdminQueues,
    staleTime: 60_000,
  });
}
