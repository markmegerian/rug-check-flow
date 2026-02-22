import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  createInvoicePdfSignedUrl,
  getInvoicePdfBucket,
  renderInvoicePdfBytes,
  resolveInvoicePdfStoragePath,
  storageObjectExists,
  uploadInvoicePdf,
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

type InvoiceLookupRow = {
  id: string;
  client_id: string | null;
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
};

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
    const forceRegenerate = Boolean(body.force_regenerate);

    if (!invoiceId) return json({ error: "invoice_id is required" }, 400);

    const { data: roleRows, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .in("role", ["office", "admin"]);

    if (roleError) return json({ error: roleError.message }, 500);
    const hasInternalRole = (roleRows ?? []).length > 0;

    const { data: invoice, error: invoiceError } = await adminClient
      .from("invoices")
      .select("id, client_id, invoice_number, total, issued_at, due_at, created_at, pdf_storage_path")
      .eq("id", invoiceId)
      .maybeSingle<InvoiceLookupRow>();

    if (invoiceError) return json({ error: invoiceError.message }, 500);
    if (!invoice) return json({ error: "Invoice not found" }, 404);

    let actor: "portal" | "office" = hasInternalRole ? "office" : "portal";

    if (!hasInternalRole) {
      if (!userEmail) return json({ error: "Unauthorized" }, 401);
      if (!invoice.client_id) return json({ error: "Invoice is missing client linkage." }, 403);

      const { data: portalRow, error: portalError } = await adminClient
        .from("portal_users")
        .select("id")
        .eq("status", "active")
        .eq("client_id", invoice.client_id)
        .eq("email", userEmail)
        .maybeSingle();

      if (portalError) return json({ error: portalError.message }, 500);
      if (!portalRow?.id) return json({ error: "Forbidden" }, 403);
      actor = "portal";
    }

    const { data: clientRow } = invoice.client_id
      ? await adminClient.from("clients").select("name").eq("id", invoice.client_id).maybeSingle()
      : { data: null };

    const { data: itemRows, error: itemError } = await adminClient
      .from("invoice_items")
      .select("description, quantity, unit_price, total")
      .eq("invoice_id", invoice.id)
      .order("created_at", { ascending: true })
      .returns<InvoiceItemLookupRow[]>();

    if (itemError) return json({ error: itemError.message }, 500);

    const bucket = getInvoicePdfBucket();
    const scopedClientId = invoice.client_id ?? "unlinked";
    const path = resolveInvoicePdfStoragePath(scopedClientId, invoice.invoice_number, invoice.pdf_storage_path);

    let generated = false;
    const exists = await storageObjectExists(adminClient, bucket, path);
    if (forceRegenerate || !exists) {
      const pdfBytes = await renderInvoicePdfBytes({
        invoiceNumber: invoice.invoice_number,
        clientName: clientRow?.name ?? "Client",
        issuedAt: invoice.issued_at ?? invoice.created_at,
        dueAt: invoice.due_at,
        totalAmount: Number(invoice.total ?? 0),
        lineItems: (itemRows ?? []).map((row) => ({
          description: row.description ?? "Service",
          quantity: Number(row.quantity ?? 1),
          unitPrice: Number(row.unit_price ?? 0),
          total: Number(row.total ?? 0),
        })),
      });
      await uploadInvoicePdf(adminClient, bucket, path, pdfBytes);
      generated = true;

      if (invoice.pdf_storage_path !== path) {
        await adminClient.from("invoices").update({ pdf_storage_path: path }).eq("id", invoice.id);
      }

      await adminClient.from("communication_events").insert({
        client_id: invoice.client_id,
        invoice_id: invoice.id,
        channel: "in_app_chat",
        direction: "outbound",
        event_type: "invoice_pdf_generated",
        subject: `${invoice.invoice_number} PDF generated`,
        body: `Generated invoice PDF at ${bucket}/${path}.`,
      });
    }

    const signedUrl = await createInvoicePdfSignedUrl(adminClient, bucket, path, 300);
    await adminClient.from("communication_events").insert({
      client_id: invoice.client_id,
      invoice_id: invoice.id,
      channel: "in_app_chat",
      direction: actor === "portal" ? "inbound" : "outbound",
      event_type: actor === "portal" ? "invoice_pdf_downloaded_by_client" : "invoice_pdf_downloaded_by_office",
      subject: `${invoice.invoice_number} downloaded`,
      body: `${actor === "portal" ? "Portal client" : "Office user"} requested invoice PDF (${bucket}/${path}).`,
      sent_to: user.email ?? null,
    });

    return json({
      success: true,
      bucket,
      path,
      generated,
      signed_url: signedUrl,
    });
  } catch (error) {
    console.error(error);
    return json({ error: "Internal server error" }, 500);
  }
});
