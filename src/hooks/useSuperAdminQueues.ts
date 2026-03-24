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
  kind: "stale_rug" | "route_exception";
  rugId: string | null;
  rugNumber: string;
  clientName: string;
  status: Tables<"rugs">["status"] | null;
  photoUrl: string | null;
  ageDays: number | null;
  reason: string;
  createdAt: string;
  checkedInAt: string | null;
  phase: "delivery" | "pickup" | null;
  exceptionCode: string | null;
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

type RouteStopRow = ExtendedTableRow<"route_stops">;
type RouteStopItemRow = ExtendedTableRow<"route_stop_items">;
type PickupRequestItemLookup = Pick<Tables<"pickup_request_items">, "id" | "rug_number">;
type RugLookup = Pick<Tables<"rugs">, "id" | "tag" | "photo_url" | "status">;
type ClientLookup = Pick<Tables<"clients">, "id" | "name">;

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

function staleAttentionPriority(item: AttentionItem) {
  const statusRank: Record<Exclude<AttentionItem["status"], null>, number> = {
    ready: 4,
    in_production: 3,
    checked_in: 2,
    picked_up: 1,
  };
  return (item.ageDays ?? 0) * 10 + (item.status ? statusRank[item.status] : 0);
}

function buildRouteExceptionReason(item: RouteStopItemRow, stop: RouteStopRow | undefined) {
  const phaseLabel = item.phase === "delivery" ? "Delivery" : "Pickup";
  const statusLabel = item.status === "disputed" ? "disputed" : "exception";
  const parts = [`${phaseLabel} ${statusLabel}`];
  const code = item.exception_code ?? stop?.exception_code;
  if (code) parts.push(code);
  const note = item.notes.trim() || stop?.notes.trim();
  if (note) parts.push(note.slice(0, 120));
  return parts.join(" — ");
}

async function fetchSuperAdminQueues(): Promise<SuperAdminQueuesData> {
  const [responsesResult, overdueResult, rugsResult, routeStopItemsResult, routeStopsStatusResult] = await Promise.all([
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
    supabaseExtended
      .from("route_stop_items")
      .select("id, route_stop_id, phase, status, rug_id, pickup_request_item_id, notes, photo_urls, exception_code, created_at")
      .in("status", ["disputed", "exception"])
      .order("created_at", { ascending: false })
      .limit(100),
    supabaseExtended
      .from("route_stops")
      .select("id, client_id, route_date, route_day, status, exception_code, notes, created_at, completed_at")
      .in("status", ["completed_with_exceptions", "unable_to_complete"])
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(50),
  ]);

  if (responsesResult.error) throw responsesResult.error;
  if (overdueResult.error) throw overdueResult.error;
  if (rugsResult.error) throw rugsResult.error;
  if (routeStopItemsResult.error) throw routeStopItemsResult.error;
  if (routeStopsStatusResult.error) throw routeStopsStatusResult.error;

  const responseRows = (responsesResult.data ?? []) as ClientResponseRow[];
  const responseClientIds = Array.from(new Set(responseRows.map((row) => row.client_id).filter((value): value is string => Boolean(value))));

  const staleRugRows = (rugsResult.data ?? []) as unknown as AttentionRugRow[];
  const routeStopItems = (routeStopItemsResult.data ?? []) as RouteStopItemRow[];
  const routeStopsFromStatus = (routeStopsStatusResult.data ?? []) as RouteStopRow[];

  const routeStopIds = Array.from(new Set([...routeStopItems.map((item) => item.route_stop_id), ...routeStopsFromStatus.map((stop) => stop.id)]));
  let routeStops = routeStopsFromStatus;
  if (routeStopIds.length > 0) {
    const missingStopIds = routeStopIds.filter((id) => !routeStopsFromStatus.some((stop) => stop.id === id));
    if (missingStopIds.length > 0) {
      const { data: extraStops, error: extraStopsError } = await supabaseExtended
        .from("route_stops")
        .select("id, client_id, route_date, route_day, status, exception_code, notes, created_at, completed_at")
        .in("id", missingStopIds);
      if (extraStopsError) throw extraStopsError;
      routeStops = [...routeStopsFromStatus, ...((extraStops ?? []) as RouteStopRow[])];
    }
  }

  const clientIds = Array.from(new Set([
    ...responseClientIds,
    ...routeStops.map((stop) => stop.client_id).filter(Boolean),
  ]));

  let clientNameMap = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: clientRows, error: clientError } = await supabase
      .from("clients")
      .select("id, name")
      .in("id", clientIds);
    if (clientError) throw clientError;
    clientNameMap = new Map(((clientRows ?? []) as ClientLookup[]).map((row) => [row.id, row.name]));
  }

  const rugIds = Array.from(new Set(routeStopItems.map((item) => item.rug_id).filter((value): value is string => Boolean(value))));
  let routeItemRugMap = new Map<string, RugLookup>();
  if (rugIds.length > 0) {
    const { data: rugRows, error: rugError } = await supabase
      .from("rugs")
      .select("id, tag, photo_url, status")
      .in("id", rugIds);
    if (rugError) throw rugError;
    routeItemRugMap = new Map(((rugRows ?? []) as RugLookup[]).map((row) => [row.id, row]));
  }

  const pickupItemIds = Array.from(new Set(routeStopItems.map((item) => item.pickup_request_item_id).filter((value): value is string => Boolean(value))));
  let pickupItemMap = new Map<string, PickupRequestItemLookup>();
  if (pickupItemIds.length > 0) {
    const { data: pickupRows, error: pickupError } = await supabase
      .from("pickup_request_items")
      .select("id, rug_number")
      .in("id", pickupItemIds);
    if (pickupError) throw pickupError;
    pickupItemMap = new Map(((pickupRows ?? []) as PickupRequestItemLookup[]).map((row) => [row.id, row]));
  }

  const routeStopMap = new Map(routeStops.map((stop) => [stop.id, stop]));
  const itemExceptionStopIds = new Set(routeStopItems.map((item) => item.route_stop_id));

  const clientResponses = responseRows.map((row) => ({
    id: row.id,
    clientName: row.client_id ? clientNameMap.get(row.client_id) ?? "Unknown client" : "Unknown client",
    title: responseTitle(row),
    createdAt: row.created_at,
    tone: responseTone(row.event_type),
  }));

  const overdueInvoices = (overdueResult.data ?? []) as unknown as OverdueInvoiceItem[];
  const overdueBalance = overdueInvoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);

  const staleAttentionItems = staleRugRows
    .map((rug) => {
      const ageDays = Math.max(0, differenceInCalendarDays(new Date(), new Date(rug.checked_in_at)));
      const noteFlag = rug.notes.trim().length > 0;
      const staleFlag = ageDays >= STALE_RUG_DAYS;
      if (!staleFlag && !noteFlag) return null;
      return {
        id: `stale-${rug.id}`,
        kind: "stale_rug" as const,
        rugId: rug.id,
        rugNumber: rug.tag,
        clientName: rug.clients?.name ?? "Unknown client",
        status: rug.status,
        photoUrl: rug.photo_url,
        ageDays,
        reason: attentionReason(rug, ageDays),
        createdAt: rug.checked_in_at,
        checkedInAt: rug.checked_in_at,
        phase: null,
        exceptionCode: null,
      } satisfies AttentionItem;
    })
    .filter((item): item is AttentionItem => Boolean(item));

  const routeExceptionItems = routeStopItems.map((item) => {
    const stop = routeStopMap.get(item.route_stop_id);
    const rug = item.rug_id ? routeItemRugMap.get(item.rug_id) ?? null : null;
    const pickupItem = item.pickup_request_item_id ? pickupItemMap.get(item.pickup_request_item_id) ?? null : null;
    return {
      id: `route-item-${item.id}`,
      kind: "route_exception" as const,
      rugId: item.rug_id,
      rugNumber: rug?.tag ?? pickupItem?.rug_number ?? `Stop item ${item.id.slice(0, 8)}`,
      clientName: stop?.client_id ? clientNameMap.get(stop.client_id) ?? "Unknown client" : "Unknown client",
      status: rug?.status ?? null,
      photoUrl: rug?.photo_url ?? item.photo_urls?.[0] ?? null,
      ageDays: stop?.completed_at ? Math.max(0, differenceInCalendarDays(new Date(), new Date(stop.completed_at))) : null,
      reason: buildRouteExceptionReason(item, stop),
      createdAt: item.created_at,
      checkedInAt: null,
      phase: item.phase,
      exceptionCode: item.exception_code ?? stop?.exception_code ?? null,
    } satisfies AttentionItem;
  });

  const stopLevelExceptionItems = routeStops
    .filter((stop) => stop.status === "unable_to_complete" || !itemExceptionStopIds.has(stop.id))
    .map((stop) => ({
      id: `route-stop-${stop.id}`,
      kind: "route_exception" as const,
      rugId: null,
      rugNumber: `Stop ${stop.route_day} ${stop.route_date}`,
      clientName: clientNameMap.get(stop.client_id) ?? "Unknown client",
      status: null,
      photoUrl: null,
      ageDays: stop.completed_at ? Math.max(0, differenceInCalendarDays(new Date(), new Date(stop.completed_at))) : null,
      reason: stop.status === "unable_to_complete"
        ? `Stop unable to complete${stop.exception_code ? ` — ${stop.exception_code}` : ""}${stop.notes.trim() ? ` — ${stop.notes.trim().slice(0, 120)}` : ""}`
        : `Stop completed with exceptions${stop.exception_code ? ` — ${stop.exception_code}` : ""}${stop.notes.trim() ? ` — ${stop.notes.trim().slice(0, 120)}` : ""}`,
      createdAt: stop.completed_at ?? stop.created_at,
      checkedInAt: null,
      phase: null,
      exceptionCode: stop.exception_code,
    }) satisfies AttentionItem[]);

  const attentionItems = [...routeExceptionItems, ...stopLevelExceptionItems, ...staleAttentionItems].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "route_exception" ? -1 : 1;
    if (a.kind === "route_exception" && b.kind === "route_exception") {
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    }
    return staleAttentionPriority(b) - staleAttentionPriority(a);
  });

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
