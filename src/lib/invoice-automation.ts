import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";

/**
 * Auto-create a draft invoice when a rug is marked "ready".
 * Checks that:
 * 1. The rug has a client
 * 2. No invoice already exists for this rug
 * 3. If an estimate exists, it must be approved (or no estimate required)
 *
 * Returns invoice number on success, null if skipped.
 */
export async function maybeAutoCreateInvoice(
  rugId: string,
): Promise<{ invoiceNumber: string; total: number } | null> {
  // Fetch rug with client
  const { data: rug } = await supabase
    .from("rugs")
    .select("id, tag, client_id")
    .eq("id", rugId)
    .maybeSingle();

  if (!rug?.client_id) return null;

  // Check if an invoice already exists for this rug
  const { data: existingItems } = await supabase
    .from("invoice_items")
    .select("id")
    .eq("rug_id", rugId)
    .limit(1);

  if (existingItems && existingItems.length > 0) return null;

  // Check estimate status — if estimate exists, it must be approved
  const { data: estimates } = await supabaseExtended
    .from("estimates")
    .select("id, status")
    .eq("rug_id", rugId)
    .order("created_at", { ascending: false })
    .limit(1);

  const latestEstimate = estimates?.[0];
  if (latestEstimate) {
    // If estimate is pending/sent/rejected, don't auto-create invoice
    if (latestEstimate.status !== "approved") return null;
  }

  // Fetch rug services for line items
  const { data: rugServices } = await supabase
    .from("rug_services")
    .select("service_name, unit_price, line_total")
    .eq("rug_id", rugId);

  if (!rugServices || rugServices.length === 0) return null;

  const total = rugServices.reduce((sum, s) => sum + Number(s.line_total), 0);
  const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

  // Create invoice
  const { data: invoice, error: invError } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invoiceNumber,
      client_id: rug.client_id,
      status: "draft" as const,
      total,
      pdf_storage_path: `clients/${rug.client_id}/${invoiceNumber}.pdf`,
    })
    .select("id")
    .single();

  if (invError || !invoice) {
    console.warn("Auto-create invoice failed:", invError?.message);
    return null;
  }

  // Create line items
  const lineItems = rugServices.map((s) => ({
    invoice_id: invoice.id,
    rug_id: rugId,
    description: `${rug.tag} — ${s.service_name}`,
    quantity: 1,
    unit_price: Number(s.unit_price),
    total: Number(s.line_total),
  }));

  const { error: itemsErr } = await supabase.from("invoice_items").insert(lineItems);
  if (itemsErr) {
    console.warn("Auto-create invoice line items failed:", itemsErr.message);
    // Clean up orphaned invoice
    await supabase.from("invoices").delete().eq("id", invoice.id);
    return null;
  }

  // Log event
  try {
    await supabaseExtended.from("communication_events").insert({
      client_id: rug.client_id,
      rug_id: rugId,
      invoice_id: invoice.id,
      channel: "in_app_chat",
      direction: "outbound",
      event_type: "invoice_auto_created",
      subject: `${invoiceNumber} auto-created`,
      body: `Invoice ${invoiceNumber} was auto-created when rug ${rug.tag} was marked ready.`,
    });
  } catch (e) {
    console.warn("Failed to log invoice auto-creation event:", e);
  }

  return { invoiceNumber, total };
}
