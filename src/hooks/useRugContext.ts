import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";

export type RugDeliveryInfo = {
  targetDate: string;
  status: string;
  driverName: string | null;
  signatureUrl: string | null;
  photos: string[];
};

export type RugInvoiceInfo = {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
};

export type RugContext = {
  delivery: RugDeliveryInfo | null;
  invoices: RugInvoiceInfo[];
};

async function fetchRugContext(rugId: string): Promise<RugContext> {
  let delivery: RugDeliveryInfo | null = null;
  const invoices: RugInvoiceInfo[] = [];

  // Fetch delivery info: delivery_list_items → delivery_lists → route_stops
  const { data: deliveryItems } = await supabase
    .from("delivery_list_items")
    .select("delivery_list_id, delivery_lists(target_date, status)")
    .eq("rug_id", rugId)
    .order("created_at", { ascending: false })
    .limit(1)
    .returns<Array<{
      delivery_list_id: string;
      delivery_lists: { target_date: string; status: string } | null;
    }>>();

  if (deliveryItems && deliveryItems.length > 0) {
    const dl = deliveryItems[0];
    const targetDate = dl.delivery_lists?.target_date ?? "";
    const dlStatus = dl.delivery_lists?.status ?? "";

    // Try to find the route stop for this delivery to get driver + signature
    let driverName: string | null = null;
    let signatureUrl: string | null = null;
    let photos: string[] = [];

    const { data: routeStops } = await supabaseExtended
      .from("route_stops")
      .select("assigned_driver_id, signature_data_url, status")
      .eq("delivery_list_id", dl.delivery_list_id)
      .limit(1);

    if (routeStops && routeStops.length > 0) {
      const rs = routeStops[0] as { assigned_driver_id: string | null; signature_data_url: string | null; status: string };
      signatureUrl = rs.signature_data_url;

      if (rs.assigned_driver_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", rs.assigned_driver_id)
          .single();
        driverName = (profile as { display_name: string } | null)?.display_name ?? null;
      }

      // Get photos from route_stop_items for this rug
      const { data: stopItems } = await supabaseExtended
        .from("route_stop_items")
        .select("photo_urls")
        .eq("rug_id", rugId);

      if (stopItems) {
        photos = (stopItems as Array<{ photo_urls: string[] }>)
          .flatMap((i) => i.photo_urls ?? []);
      }
    }

    delivery = { targetDate, status: dlStatus, driverName, signatureUrl, photos };
  }

  // Fetch invoices linked to this rug
  const { data: invoiceItems } = await supabase
    .from("invoice_items")
    .select("invoice_id")
    .eq("rug_id", rugId);

  if (invoiceItems && invoiceItems.length > 0) {
    const invoiceIds = [...new Set(invoiceItems.map((i: { invoice_id: string }) => i.invoice_id))];
    const { data: invoiceRows } = await supabaseExtended
      .from("invoices")
      .select("id, invoice_number, status, total")
      .in("id", invoiceIds);

    if (invoiceRows) {
      for (const inv of invoiceRows as Array<{ id: string; invoice_number: string; status: string; total: number }>) {
        invoices.push({
          id: inv.id,
          invoiceNumber: inv.invoice_number,
          status: inv.status,
          total: Number(inv.total),
        });
      }
    }
  }

  return { delivery, invoices };
}

export function useRugContext(rugId: string | null) {
  return useQuery({
    queryKey: ["rug-context", rugId],
    queryFn: () => fetchRugContext(rugId!),
    enabled: Boolean(rugId),
    staleTime: 30_000,
  });
}
