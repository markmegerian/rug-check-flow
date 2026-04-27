import { useQuery } from "@tanstack/react-query";
import { supabaseExtended } from "@/integrations/supabase/extended";

export type PortalBillingSummary = {
  openBalance: number;
  overdueBalance: number;
  openInvoices: number;
  overdueInvoices: number;
  nextDueAt: string | null;
  oldestOverdueAgeDays: number | null;
};

type InvoiceSummaryRow = {
  status: string;
  total: number | null;
  due_at: string | null;
  created_at: string;
};

export async function fetchPortalBillingSummary(clientId: string): Promise<PortalBillingSummary> {
  const { data, error } = await supabaseExtended
    .from("invoices")
    .select("status, total, due_at, created_at")
    .eq("client_id", clientId)
    .returns<InvoiceSummaryRow[]>();

  if (error) throw error;

  const invoices = data ?? [];
  const openInvoices = invoices.filter((invoice) => ["sent", "overdue"].includes(invoice.status));
  const overdueInvoices = invoices.filter((invoice) => invoice.status === "overdue");
  const datedOpenInvoices = openInvoices.filter((invoice) => Boolean(invoice.due_at));
  const nextDueAt = datedOpenInvoices.length > 0
    ? [...datedOpenInvoices].sort((a, b) => Date.parse(a.due_at ?? a.created_at) - Date.parse(b.due_at ?? b.created_at))[0]?.due_at ?? null
    : null;
  const oldestOverdueAgeDays = overdueInvoices.length > 0
    ? Math.max(...overdueInvoices.map((invoice) => Math.max(0, Math.floor((Date.now() - Date.parse(invoice.due_at ?? invoice.created_at)) / 86_400_000))))
    : null;

  return {
    openBalance: openInvoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0),
    overdueBalance: overdueInvoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0),
    openInvoices: openInvoices.length,
    overdueInvoices: overdueInvoices.length,
    nextDueAt,
    oldestOverdueAgeDays,
  };
}

export function usePortalBillingSummary(clientId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["portal-billing-summary", clientId],
    queryFn: () => fetchPortalBillingSummary(clientId as string),
    enabled: enabled && Boolean(clientId),
    staleTime: 30_000,
  });
}
