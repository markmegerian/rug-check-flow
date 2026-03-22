import { supabase } from "@/integrations/supabase/client";
import { PRODUCTION_STAGES } from "@/data/production";
import { maybeAutoCreateInvoice } from "@/lib/invoice-automation";

/**
 * Advance a rug to the next production stage.
 * Returns the next stage id on success, or null on failure/no-op.
 */
export async function advanceRugStage(
  rugId: string,
  currentStatus: string
): Promise<{ nextStage: string; error?: string; autoInvoice?: string } | null> {
  const idx = PRODUCTION_STAGES.findIndex((s) => s.id === currentStatus);
  if (idx < 0 || idx >= PRODUCTION_STAGES.length - 1) return null;

  const nextStage = PRODUCTION_STAGES[idx + 1].id;
  const updates: Record<string, string> = { status: nextStage };
  if (nextStage === "ready") updates.completed_at = new Date().toISOString();
  if (nextStage === "picked_up") updates.picked_up_at = new Date().toISOString();

  const { error } = await supabase.from("rugs").update(updates).eq("id", rugId);
  if (error) return { nextStage, error: error.message };

  // Auto-create invoice when rug reaches "ready" status
  if (nextStage === "ready") {
    const invoiceResult = await maybeAutoCreateInvoice(rugId);
    if (invoiceResult) {
      return { nextStage, autoInvoice: invoiceResult.invoiceNumber };
    }
  }

  return { nextStage };
}

/**
 * Create a draft invoice from rug services.
 * Returns the invoice number on success, or an error string.
 */
export async function createDraftInvoice(input: {
  clientId: string;
  rugId: string;
  rugTag: string;
  services: Array<{ service_name: string; line_total: number }>;
}): Promise<{ invoiceNumber: string; total: number; error?: string }> {
  const { clientId, rugId, rugTag, services } = input;
  const invNum = `INV-${Date.now().toString(36).toUpperCase()}`;
  const total = services.reduce((sum, s) => sum + Number(s.line_total), 0);

  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .insert({
      invoice_number: invNum,
      client_id: clientId,
      status: "draft" as const,
      total,
      pdf_storage_path: `clients/${clientId}/${invNum}.pdf`,
    })
    .select("id")
    .single();

  if (invErr || !inv) {
    return { invoiceNumber: invNum, total, error: invErr?.message ?? "Insert failed" };
  }

  const lineItems = services.map((s) => ({
    invoice_id: inv.id,
    rug_id: rugId,
    description: `${s.service_name} — ${rugTag}`,
    quantity: 1,
    unit_price: Number(s.line_total),
    total: Number(s.line_total),
  }));

  const { error: itemsErr } = await supabase.from("invoice_items").insert(lineItems);
  if (itemsErr) {
    return { invoiceNumber: invNum, total, error: itemsErr.message };
  }

  return { invoiceNumber: invNum, total };
}
