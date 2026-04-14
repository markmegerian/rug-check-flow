/**
 * Auto-invoicing at the ready stage is intentionally disabled.
 *
 * Lifecycle rule:
 * - reaching `ready` does NOT create an invoice
 * - invoice creation belongs to explicit billing / truck handoff flows
 * - actual delivery completion belongs to stop proof, not invoice timing
 *
 * Keep this helper as a no-op guard so stale imports do not silently reintroduce
 * the old wrong lifecycle behavior.
 */
export async function maybeAutoCreateInvoice(
  _rugId: string,
): Promise<{ invoiceNumber: string; total: number } | null> {
  return null;
}
