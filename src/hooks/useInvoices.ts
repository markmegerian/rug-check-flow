import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type InvoiceRow = Tables<"invoices"> & {
  clients: { name: string } | null;
  invoice_items: Tables<"invoice_items">[];
};

const INVOICES_KEY = ["invoices"] as const;
const PAGE_SIZE = 100;

async function fetchInvoicesPage(pageIndex: number): Promise<InvoiceRow[]> {
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

export function useInvoices() {
  return useInfiniteQuery({
    queryKey: [...INVOICES_KEY],
    queryFn: ({ pageParam }) => fetchInvoicesPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.length === PAGE_SIZE ? lastPageParam + 1 : undefined,
    staleTime: 15_000,
  });
}

export { PAGE_SIZE as INVOICES_PAGE_SIZE };

export function useInvalidateInvoices() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: INVOICES_KEY });
}
