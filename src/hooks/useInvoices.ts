import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type InvoiceRow = Tables<"invoices"> & {
  pdf_storage_path: string | null;
  clients: { name: string } | null;
  invoice_items: Tables<"invoice_items">[];
};

const INVOICES_KEY = ["invoices"] as const;
const PAGE_SIZE = 100;

async function fetchInvoices(pageIndex: number): Promise<InvoiceRow[]> {
  const from = pageIndex * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error } = await supabase
    .from("invoices")
    .select("*, pdf_storage_path, clients(name), invoice_items(*)")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;
  return (data as InvoiceRow[]) ?? [];
}

export function useInvoices(pageIndex = 0) {
  return useQuery({
    queryKey: [...INVOICES_KEY, pageIndex],
    queryFn: () => fetchInvoices(pageIndex),
    staleTime: 15_000,
  });
}

export function useInvalidateInvoices() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
}
