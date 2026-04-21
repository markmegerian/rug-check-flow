import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createInvoicePdfSignedUrl,
  getInvoicePdfBucket,
  renderInvoicePdfBytes,
  resolveInvoicePdfStoragePath,
  ensureInvoicePdfBucket,
  storageObjectExists,
  uploadInvoicePdf,
  type InvoicePdfPayload,
  type CompanyInfo,
  type ClientInfo,
  type RugSection,
  type RugServiceLine,
} from "../_shared/invoice-pdf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ─── Row types ──────────────────────────────────────────────────────────────

type InvoiceLookupRow = {
  id: string;
  client_id: string | null;
  company_id: string | null;
  invoice_number: string;
  total: number;
  issued_at: string | null;
  due_at: string | null;
  created_at: string;
  pdf_storage_path: string | null;
};

type InvoiceItemLookupRow = {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  rug_id: string | null;
};

type EstimateLookupRow = {
  id: string;
  client_id: string | null;
  rug_id: string | null;
  estimate_number: string;
  total: number;
  created_at: string;
  sent_at: string | null;
};

type EstimateItemLookupRow = {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
  rug_service_id: string | null;
};

type RugRow = {
  id: string;
  tag: string;
  description: string | null;
  size_length: number | null;
  size_width: number | null;
  notes: string | null;
};

type RugServiceRow = {
  rug_id: string;
  service_id: string;
  service_name: string;
  service_category: string | null;
  unit_price: number;
  line_total: number;
  edges: string[] | null;
};

type ClientRow = {
  name: string;
  contact_name: string | null;
  phone: string | null;
  address: string | null;
};

type CompanyBrandingRow = {
  business_name: string | null;
  business_address: string | null;
  business_phone: string | null;
  business_email: string | null;
};

// ─── Pricing label builder ──────────────────────────────────────────────────

function buildPricingLabel(unitPrice: number, lineTotal: number, edges: string[] | null): string {
  if (unitPrice <= 0) return `0@0/unit`;

  // Edges handling: e.g. "Hand Fringe 2 Ends - HF2E"
  const edgeSuffix = edges && edges.length > 0 && edges.length < 4
    ? ` - ${edges.map(e => e === "end1" ? "E1" : e === "end2" ? "E2" : e === "side1" ? "S1" : e === "side2" ? "S2" : e).join("")}`
    : "";

  const qty = lineTotal / unitPrice;
  const roundedQty = Math.round(qty * 100) / 100;

  // Format qty: if it's a whole number show no decimals, otherwise 2
  const qtyStr = roundedQty === Math.floor(roundedQty)
    ? String(Math.floor(roundedQty))
    : roundedQty.toFixed(2);

  return `${qtyStr}@${unitPrice}/unit${edgeSuffix}`;
}

function formatRugSize(length: number | null, width: number | null): string {
  if (!length && !width) return "";
  const l = length ?? 0;
  const w = width ?? 0;
  // Match the format: "10.08 x 8" (show decimals only when needed)
  const fmt = (n: number) => n === Math.floor(n) ? String(n) : n.toFixed(2);
  return `${fmt(l)} x ${fmt(w)}`;
}

// ─── Fetch company branding ─────────────────────────────────────────────────

async function fetchCompanyInfo(adminClient: ReturnType<typeof createClient>, companyId: string | null): Promise<CompanyInfo> {
  const query = adminClient
    .from("company_branding")
    .select("business_name, business_address, business_phone, business_email");

  const { data } = await (companyId
    ? query.eq("company_id", companyId).limit(1).maybeSingle<CompanyBrandingRow>()
    : query.limit(1).maybeSingle<CompanyBrandingRow>());

  return {
    businessName: data?.business_name ?? "RugBoost",
    businessAddress: data?.business_address ?? "",
    businessPhone: data?.business_phone ?? "",
    businessFax: "",
  };
}

// ─── Build rug sections from invoice items ──────────────────────────────────

async function buildRugSections(
  adminClient: ReturnType<typeof createClient>,
  items: InvoiceItemLookupRow[],
  singleRugId?: string | null,
): Promise<RugSection[]> {
  // Group items by rug_id
  const rugIdToItems = new Map<string, InvoiceItemLookupRow[]>();
  const unlinkedItems: InvoiceItemLookupRow[] = [];

  for (const item of items) {
    const rugId = item.rug_id ?? singleRugId;
    if (rugId) {
      const list = rugIdToItems.get(rugId) ?? [];
      list.push(item);
      rugIdToItems.set(rugId, list);
    } else {
      unlinkedItems.push(item);
    }
  }

  // Fetch rug metadata
  const rugIds = [...rugIdToItems.keys()];
  let rugMap = new Map<string, RugRow>();
  if (rugIds.length > 0) {
    const { data: rugsData } = await adminClient
      .from("rugs")
      .select("id, tag, description, size_length, size_width, notes")
      .in("id", rugIds)
      .returns<RugRow[]>();

    if (rugsData) {
      rugMap = new Map(rugsData.map((r) => [r.id, r]));
    }
  }

  // Fetch rug_services for real pricing breakdown
  const rugServicesMap = new Map<string, RugServiceRow[]>();
  if (rugIds.length > 0) {
    const { data: svcData } = await adminClient
      .from("rug_services")
      .select("rug_id, service_id, service_name, service_category, unit_price, line_total, edges")
      .in("rug_id", rugIds)
      .order("created_at", { ascending: true })
      .returns<RugServiceRow[]>();

    if (svcData) {
      for (const row of svcData) {
        const list = rugServicesMap.get(row.rug_id) ?? [];
        list.push(row);
        rugServicesMap.set(row.rug_id, list);
      }
    }
  }

  const sections: RugSection[] = [];

  for (const [rugId, rugItems] of rugIdToItems) {
    const rug = rugMap.get(rugId);
    const rugServices = rugServicesMap.get(rugId) ?? [];

    // Build service lines — prefer rug_services data for pricing labels
    const serviceLines: RugServiceLine[] = [];

    if (rugServices.length > 0) {
      // Use rug_services for accurate pricing breakdown
      for (const svc of rugServices) {
        const isCleaning = (svc.service_category ?? "").toLowerCase() === "cleaning";
        const adjustedTotal = isCleaning ? Math.max(Number(svc.line_total), 35) : Number(svc.line_total);
        const adjustedUnitPrice = isCleaning ? adjustedTotal : Number(svc.unit_price);
        serviceLines.push({
          name: svc.service_name,
          pricingLabel: buildPricingLabel(
            adjustedUnitPrice,
            adjustedTotal,
            svc.edges,
          ),
          extPrice: adjustedTotal,
        });
      }
    } else {
      // Fallback: use invoice_items data
      for (const item of rugItems) {
        const _qty = item.unit_price > 0 ? item.total / item.unit_price : item.quantity;
        serviceLines.push({
          name: item.description.replace(/\s*—\s*.*$/, ""), // Remove " — RUG-TAG" suffix
          pricingLabel: buildPricingLabel(
            Number(item.unit_price),
            Number(item.total),
            null,
          ),
          extPrice: Number(item.total),
        });
      }
    }

    const subtotal = serviceLines.reduce((sum, s) => sum + s.extPrice, 0);

    sections.push({
      rugNumber: rug?.tag ?? rugId.slice(0, 8),
      customerRugNumber: "|",
      size: formatRugSize(rug?.size_length ?? null, rug?.size_width ?? null),
      rugType: rug?.description ?? "",
      notes: rug?.notes ?? "",
      services: serviceLines,
      subtotal,
    });
  }

  // Handle unlinked items (no rug_id) — put them in a generic section
  if (unlinkedItems.length > 0) {
    const serviceLines: RugServiceLine[] = unlinkedItems.map((item) => ({
      name: item.description,
      pricingLabel: `${item.quantity}@${item.unit_price}/unit`,
      extPrice: Number(item.total),
    }));
    const subtotal = serviceLines.reduce((sum, s) => sum + s.extPrice, 0);
    sections.push({
      rugNumber: "—",
      customerRugNumber: "",
      size: "",
      rugType: "",
      notes: "",
      services: serviceLines,
      subtotal,
    });
  }

  return sections;
}

// ─── Main handler ───────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return json({ error: "Supabase environment is not configured for this function." }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const anonClient = createClient(supabaseUrl, anonKey);
    const token = authHeader.replace("Bearer ", "");

    const { data: userData, error: userError } = await anonClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
    const user = userData.user;
    const userEmail = user.email?.toLowerCase();

    const body = await req.json().catch(() => ({}));
    const invoiceId = typeof body.invoice_id === "string" ? body.invoice_id : "";
    const estimateId = typeof body.estimate_id === "string" ? body.estimate_id : "";
    const forceRegenerate = Boolean(body.force_regenerate);
    const documentType: "invoice" | "estimate" = estimateId ? "estimate" : "invoice";

    if (!invoiceId && !estimateId) return json({ error: "invoice_id or estimate_id is required" }, 400);

    // Auth: check role
    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["office", "admin"]);

    if (roleError) return json({ error: roleError.message }, 500);
    const hasInternalRole = (roleRows ?? []).length > 0;

    let companyId: string | null = null;
    let documentNumber: string;
    let documentDate: string;
    let clientId: string | null;
    let totalAmount: number;
    let pdfStoragePath: string | null;
    let rugSections: RugSection[];

    if (documentType === "estimate" && estimateId) {
      // ─── Estimate flow ──────────────────────────────────────────────────
      const { data: estimate, error: estError } = await adminClient
        .from("estimates")
        .select("id, client_id, rug_id, estimate_number, total, created_at, sent_at, company_id")
        .eq("id", estimateId)
        .maybeSingle<EstimateLookupRow & { company_id?: string | null }>();

      if (estError) return json({ error: estError.message }, 500);
      if (!estimate) return json({ error: "Estimate not found" }, 404);

      documentNumber = estimate.estimate_number;
      documentDate = estimate.sent_at ?? estimate.created_at;
      clientId = estimate.client_id;
      companyId = estimate.company_id ?? null;
      totalAmount = Number(estimate.total ?? 0);
      pdfStoragePath = null;

      if (!hasInternalRole) {
        const { data: portalRow, error: portalError } = await adminClient
          .from("portal_users")
          .select("id")
          .eq("status", "active")
          .eq("client_id", clientId)
          .eq("email", userEmail)
          .maybeSingle();

        if (portalError) return json({ error: portalError.message }, 500);
        if (!portalRow?.id) return json({ error: "Forbidden" }, 403);
      }

      // Fetch estimate items
      const { data: estItems, error: estItemError } = await adminClient
        .from("estimate_items")
        .select("description, quantity, unit_price, total, rug_service_id")
        .eq("estimate_id", estimate.id)
        .order("created_at", { ascending: true })
        .returns<EstimateItemLookupRow[]>();

      if (estItemError) return json({ error: estItemError.message }, 500);

      // Convert to invoice item format for buildRugSections
      const itemsForSections: InvoiceItemLookupRow[] = (estItems ?? []).map((ei) => ({
        description: ei.description,
        quantity: Number(ei.quantity),
        unit_price: Number(ei.unit_price),
        total: Number(ei.total),
        rug_id: estimate.rug_id, // Estimates are linked to a single rug
      }));

      rugSections = await buildRugSections(adminClient, itemsForSections, estimate.rug_id);

    } else {
      // ─── Invoice flow ───────────────────────────────────────────────────
      const { data: invoice, error: invoiceError } = await adminClient
        .from("invoices")
        .select("id, client_id, company_id, invoice_number, total, issued_at, due_at, created_at, pdf_storage_path")
        .eq("id", invoiceId)
        .maybeSingle<InvoiceLookupRow>();

      if (invoiceError) return json({ error: invoiceError.message }, 500);
      if (!invoice) return json({ error: "Invoice not found" }, 404);

      documentNumber = invoice.invoice_number;
      documentDate = invoice.issued_at ?? invoice.created_at;
      clientId = invoice.client_id;
      companyId = invoice.company_id ?? null;
      totalAmount = Number(invoice.total ?? 0);
      pdfStoragePath = invoice.pdf_storage_path;

      // Portal access check
      if (!hasInternalRole) {
        if (!userEmail) return json({ error: "Unauthorized" }, 401);
        if (!clientId) return json({ error: "Invoice is missing client linkage." }, 403);

        const { data: portalRow, error: portalError } = await adminClient
          .from("portal_users")
          .select("id")
          .eq("status", "active")
          .eq("client_id", clientId)
          .eq("email", userEmail)
          .maybeSingle();

        if (portalError) return json({ error: portalError.message }, 500);
        if (!portalRow?.id) return json({ error: "Forbidden" }, 403);
      }

      // Fetch invoice items with rug_id
      const { data: itemRows, error: itemError } = await adminClient
        .from("invoice_items")
        .select("description, quantity, unit_price, total, rug_id")
        .eq("invoice_id", invoice.id)
        .order("created_at", { ascending: true })
        .returns<InvoiceItemLookupRow[]>();

      if (itemError) return json({ error: itemError.message }, 500);

      rugSections = await buildRugSections(adminClient, itemRows ?? []);
    }

    // Fetch company branding
    const company = await fetchCompanyInfo(adminClient, companyId);

    // Fetch client info
    let clientInfo: ClientInfo = { name: "Client", contactName: "", phone: "", address: "" };
    if (clientId) {
      const { data: clientRow } = await adminClient
        .from("clients")
        .select("name, contact_name, phone, address")
        .eq("id", clientId)
        .maybeSingle<ClientRow>();

      if (clientRow) {
        clientInfo = {
          name: clientRow.name,
          contactName: clientRow.contact_name ?? "",
          phone: clientRow.phone ?? "",
          address: clientRow.address ?? "",
        };
      }
    }

    // Build payload
    const subtotal = rugSections.reduce((sum, r) => sum + r.subtotal, 0);
    const payload: InvoicePdfPayload = {
      documentType,
      documentNumber,
      documentDate,
      company,
      client: clientInfo,
      rugs: rugSections,
      subtotal,
      total: totalAmount,
    };

    // Storage
    const bucket = getInvoicePdfBucket();
    await ensureInvoicePdfBucket(adminClient, bucket);
    const scopedClientId = clientId ?? "unlinked";
    const path = resolveInvoicePdfStoragePath(scopedClientId, documentNumber, pdfStoragePath);

    let generated = false;
    const exists = await storageObjectExists(adminClient, bucket, path);
    if (forceRegenerate || !exists) {
      const pdfBytes = await renderInvoicePdfBytes(payload);
      await uploadInvoicePdf(adminClient, bucket, path, pdfBytes);
      generated = true;

      if (documentType === "invoice" && pdfStoragePath !== path) {
        await adminClient.from("invoices").update({ pdf_storage_path: path }).eq("id", invoiceId);
      }

      await adminClient.from("communication_events").insert({
        client_id: clientId,
        invoice_id: documentType === "invoice" ? invoiceId : null,
        estimate_id: documentType === "estimate" ? estimateId : null,
        channel: "in_app_chat",
        direction: "outbound",
        event_type: `${documentType}_pdf_generated`,
        subject: `${documentNumber} PDF generated`,
        body: `Generated ${documentType} PDF at ${bucket}/${path}.`,
      }).then(({ error: e }) => { if (e) console.warn("Failed to log generation event", e); });
    }

    const signedUrl = await createInvoicePdfSignedUrl(adminClient, bucket, path, 300);

    const actor = hasInternalRole ? "office" : "portal";
    await adminClient.from("communication_events").insert({
      client_id: clientId,
      invoice_id: documentType === "invoice" ? invoiceId : null,
      estimate_id: documentType === "estimate" ? estimateId : null,
      channel: "in_app_chat",
      direction: actor === "portal" ? "inbound" : "outbound",
      event_type: actor === "portal" ? `${documentType}_pdf_downloaded_by_client` : `${documentType}_pdf_downloaded_by_office`,
      subject: `${documentNumber} downloaded`,
      body: `${actor === "portal" ? "Portal client" : "Office user"} requested ${documentType} PDF.`,
      sent_to: user.email ?? null,
    }).then(({ error: e }) => { if (e) console.warn("Failed to log download event", e); });

    return json({
      success: true,
      bucket,
      path,
      generated,
      signed_url: signedUrl,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error("invoice-pdf unhandled error", error);
    return json({ error: "Internal server error", details }, 500);
  }
});
