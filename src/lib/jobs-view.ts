import type { ExtendedTableRow } from "@/integrations/supabase/extended";

export type PickupRequestRow = Pick<
  ExtendedTableRow<"pickup_requests">,
  "id" | "client_id" | "route_day" | "scheduled_date" | "status" | "notes" | "updated_at"
> & {
  clients?: { name: string; address: string | null } | null;
};

export type PickupItemRow = Pick<
  ExtendedTableRow<"pickup_request_items">,
  | "id"
  | "pickup_request_id"
  | "rug_number"
  | "rug_type"
  | "length"
  | "width"
  | "verified"
  | "checked_in_rug_id"
  | "estimate_requested"
  | "estimate_request_details"
>;

export type RugLookup = {
  id: string;
  client_id: string | null;
  tag: string;
  description: string;
  status: string;
  photo_url: string | null;
  size_length: number | null;
  size_width: number | null;
  checked_in_at: string | null;
  completed_at: string | null;
  intake_date: string | null;
  intake_source: string | null;
};

export type RugServiceLookup = {
  rug_id: string;
  service_name: string | null;
  line_total: number | null;
};

export type EstimateResponseLookup = {
  rug_id: string | null;
  event_type: string;
  subject: string | null;
  created_at: string;
};

export type InvoiceLookup = {
  id: string;
  invoice_number: string;
  status: string;
  created_at: string;
  issued_at: string | null;
};

export type ReturnEventLookup = {
  rug_id: string | null;
  event_type: string;
  created_at: string;
};

export const RETURN_EVENT_TYPES = ["rug_immediate_return_logged", "rug_reentry_logged", "rug_return_resolved"] as const;

export type LatestReturnState = {
  kind: "immediate_return" | "reentry";
  state: "open" | "resolved";
  createdAt: string;
};

export type InvoiceItemLookup = {
  rug_id: string | null;
  invoices: InvoiceLookup | InvoiceLookup[] | null;
};

export type LatestEstimateResponse = {
  status: "approved" | "rejected";
  subject: string | null;
  createdAt: string;
};

export type JobItemView = PickupItemRow & {
  linkedRug: RugLookup | null;
  linkedServices: string[];
  linkedServiceTotal: number;
  latestEstimateResponse: LatestEstimateResponse | null;
  linkedInvoice: InvoiceLookup | null;
  latestReturnState: LatestReturnState | null;
  itemSource?: string | null;
};

export type JobView = {
  key: string;
  sourceType: "pickup" | "walkin";
  clientId: string;
  clientName: string;
  clientAddress: string | null;
  scheduledDate: string;
  routeDay: string;
  requestIds: string[];
  primaryRequestId: string;
  statuses: ExtendedTableRow<"pickup_requests">["status"][];
  updatedAt: string;
  notes: string[];
  items: JobItemView[];
};

export type JobsHydrationPayload = {
  requests: PickupRequestRow[];
  items: PickupItemRow[];
  rugInventory: RugLookup[];
  rugRows: RugLookup[];
  serviceRows: RugServiceLookup[];
  estimateResponseRows: EstimateResponseLookup[];
  invoiceRows: InvoiceItemLookup[];
  returnRows: ReturnEventLookup[];
  missingClients?: Array<{ id: string; name: string; address: string | null }>;
};

function latestIso(values: string[]) {
  return values.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? new Date(0).toISOString();
}

export function buildJobsView(payload: JobsHydrationPayload): JobView[] {
  const {
    requests,
    items,
    rugInventory,
    rugRows,
    serviceRows,
    estimateResponseRows,
    invoiceRows,
    returnRows,
    missingClients = [],
  } = payload;

  const rugMap = new Map(rugRows.map((rug) => [rug.id, rug]));
  const serviceMap = new Map<string, string[]>();
  const serviceTotalMap = new Map<string, number>();
  const estimateResponseMap = new Map<string, LatestEstimateResponse>();
  const invoiceMap = new Map<string, InvoiceLookup>();
  const returnEventMap = new Map<string, LatestReturnState>();

  for (const row of serviceRows) {
    const current = serviceMap.get(row.rug_id) ?? [];
    const name = row.service_name?.trim();
    if (name && !current.includes(name)) current.push(name);
    serviceMap.set(row.rug_id, current);
    serviceTotalMap.set(row.rug_id, (serviceTotalMap.get(row.rug_id) ?? 0) + Number(row.line_total ?? 0));
  }

  for (const row of estimateResponseRows) {
    if (!row.rug_id || estimateResponseMap.has(row.rug_id)) continue;
    estimateResponseMap.set(row.rug_id, {
      status: row.event_type === "estimate_approved_by_client" ? "approved" : "rejected",
      subject: row.subject,
      createdAt: row.created_at,
    });
  }

  for (const row of invoiceRows) {
    if (!row.rug_id || invoiceMap.has(row.rug_id) || !row.invoices) continue;
    const invoice = Array.isArray(row.invoices) ? row.invoices[0] ?? null : row.invoices;
    if (!invoice) continue;
    invoiceMap.set(row.rug_id, invoice);
  }

  const groupedReturnEvents = new Map<string, ReturnEventLookup[]>();
  for (const row of returnRows) {
    if (!row.rug_id) continue;
    const existing = groupedReturnEvents.get(row.rug_id) ?? [];
    existing.push(row);
    groupedReturnEvents.set(row.rug_id, existing);
  }

  for (const [rugId, events] of groupedReturnEvents.entries()) {
    const latest = events[0];
    const activeEvent = events.find((event) => event.event_type !== "rug_return_resolved") ?? latest;
    if (!latest || !activeEvent) continue;
    returnEventMap.set(rugId, {
      kind: activeEvent.event_type === "rug_immediate_return_logged" ? "immediate_return" : "reentry",
      state: latest.event_type === "rug_return_resolved" ? "resolved" : "open",
      createdAt: activeEvent.created_at,
    });
  }

  const requestById = new Map(requests.map((request) => [request.id, request]));
  const clientInfoById = new Map<string, { name: string; address: string | null }>();
  for (const request of requests) {
    clientInfoById.set(request.client_id, {
      name: request.clients?.name ?? "Unknown client",
      address: request.clients?.address ?? null,
    });
  }

  for (const client of missingClients) {
    clientInfoById.set(client.id, { name: client.name, address: client.address });
  }

  const grouped = new Map<string, JobView>();
  const upsertJob = (input: {
    key: string;
    sourceType: "pickup" | "walkin";
    clientId: string;
    clientName: string;
    clientAddress: string | null;
    scheduledDate: string;
    routeDay: string;
    requestId?: string;
    status?: ExtendedTableRow<"pickup_requests">["status"];
    updatedAt: string;
    note?: string | null;
  }) => {
    const existing = grouped.get(input.key);
    if (existing) {
      if (input.requestId && !existing.requestIds.includes(input.requestId)) {
        existing.requestIds.push(input.requestId);
      }
      if (input.requestId && !existing.primaryRequestId) {
        existing.primaryRequestId = input.requestId;
      }
      if (input.status && !existing.statuses.includes(input.status)) {
        existing.statuses.push(input.status);
      }
      if (input.note?.trim()) {
        existing.notes.push(input.note.trim());
      }
      existing.updatedAt = latestIso([existing.updatedAt, input.updatedAt]);
      return existing;
    }

    const created: JobView = {
      key: input.key,
      sourceType: input.sourceType,
      clientId: input.clientId,
      clientName: input.clientName,
      clientAddress: input.clientAddress,
      scheduledDate: input.scheduledDate,
      routeDay: input.routeDay,
      requestIds: input.requestId ? [input.requestId] : [],
      primaryRequestId: input.requestId ?? "",
      statuses: input.status ? [input.status] : [],
      updatedAt: input.updatedAt,
      notes: input.note?.trim() ? [input.note.trim()] : [],
      items: [],
    };
    grouped.set(input.key, created);
    return created;
  };

  for (const item of items) {
    const request = requestById.get(item.pickup_request_id);
    if (!request) continue;
    const linkedRug = item.checked_in_rug_id ? rugMap.get(item.checked_in_rug_id) ?? null : null;
    const linkedServices = item.checked_in_rug_id ? serviceMap.get(item.checked_in_rug_id) ?? [] : [];
    const linkedServiceTotal = item.checked_in_rug_id ? serviceTotalMap.get(item.checked_in_rug_id) ?? 0 : 0;
    const latestEstimateResponse = item.checked_in_rug_id ? estimateResponseMap.get(item.checked_in_rug_id) ?? null : null;
    const linkedInvoice = item.checked_in_rug_id ? invoiceMap.get(item.checked_in_rug_id) ?? null : null;
    const latestReturnState = item.checked_in_rug_id ? returnEventMap.get(item.checked_in_rug_id) ?? null : null;
    const eventDate = linkedRug?.intake_date?.slice(0, 10) ?? linkedRug?.checked_in_at?.slice(0, 10) ?? request.scheduled_date;
    const sourceType = linkedRug?.intake_source === "pickup" ? "pickup" : "walkin";
    const sourceLabel = sourceType === "pickup" ? "Pickup" : "Walk-in";
    const key = `${request.client_id}__${sourceType}__${eventDate}`;
    const job = upsertJob({
      key,
      sourceType,
      clientId: request.client_id,
      clientName: request.clients?.name ?? clientInfoById.get(request.client_id)?.name ?? "Unknown client",
      clientAddress: request.clients?.address ?? clientInfoById.get(request.client_id)?.address ?? null,
      scheduledDate: eventDate,
      routeDay: sourceLabel,
      requestId: request.id,
      status: request.status,
      updatedAt: linkedRug?.checked_in_at ?? request.updated_at,
      note: request.notes,
    });
    job.items.push({ ...item, linkedRug, linkedServices, linkedServiceTotal, latestEstimateResponse, linkedInvoice, latestReturnState, itemSource: linkedRug?.intake_source ?? "pickup" });
  }

  const representedRugIds = new Set(items.map((item) => item.checked_in_rug_id).filter((value): value is string => Boolean(value)));
  for (const rug of rugInventory) {
    if (!rug.client_id || representedRugIds.has(rug.id)) continue;
    const eventDate = rug.intake_date?.slice(0, 10) ?? rug.checked_in_at?.slice(0, 10);
    if (!eventDate) continue;
    const clientInfo = clientInfoById.get(rug.client_id);
    const sourceType = rug.intake_source === "pickup" ? "pickup" : "walkin";
    const key = `${rug.client_id}__${sourceType}__${eventDate}`;
    const job = upsertJob({
      key,
      sourceType,
      clientId: rug.client_id,
      clientName: clientInfo?.name ?? "Unknown client",
      clientAddress: clientInfo?.address ?? null,
      scheduledDate: eventDate,
      routeDay: sourceType === "pickup" ? "Pickup" : "Walk-in",
      updatedAt: rug.checked_in_at ?? rug.completed_at ?? new Date(0).toISOString(),
    });
    job.items.push({
      id: `rug:${rug.id}`,
      pickup_request_id: "",
      rug_number: rug.tag,
      rug_type: rug.description,
      length: rug.size_length,
      width: rug.size_width,
      verified: true,
      checked_in_rug_id: rug.id,
      estimate_requested: false,
      estimate_request_details: null,
      linkedRug: rug,
      linkedServices: serviceMap.get(rug.id) ?? [],
      linkedServiceTotal: serviceTotalMap.get(rug.id) ?? 0,
      latestEstimateResponse: estimateResponseMap.get(rug.id) ?? null,
      linkedInvoice: invoiceMap.get(rug.id) ?? null,
      latestReturnState: returnEventMap.get(rug.id) ?? null,
      itemSource: rug.intake_source,
    });
  }

  return Array.from(grouped.values())
    .filter((job) => job.items.length > 0)
    .map((job) => ({
      ...job,
      notes: Array.from(new Set(job.notes.filter(Boolean))),
      items: [...job.items].sort((a, b) =>
        a.rug_number.localeCompare(b.rug_number, undefined, { numeric: true, sensitivity: "base" }),
      ),
    }))
    .sort((a, b) => Date.parse(`${b.scheduledDate}T12:00:00`) - Date.parse(`${a.scheduledDate}T12:00:00`));
}
