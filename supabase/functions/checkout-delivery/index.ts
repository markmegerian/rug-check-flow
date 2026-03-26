import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getInvoicePdfBucket,
  renderInvoicePdfBytes,
  resolveInvoicePdfStoragePath,
  uploadInvoicePdf,
  type InvoicePdfPayload,
  type CompanyInfo,
  type RugSection,
  type RugServiceLine,
} from "../_shared/invoice-pdf.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify the caller
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: userError } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { delivery_list_id } = await req.json();
    if (!delivery_list_id) {
      return new Response(JSON.stringify({ error: "delivery_list_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the delivery list
    const { data: deliveryList, error: dlError } = await supabase
      .from("delivery_lists")
      .select("*")
      .eq("id", delivery_list_id)
      .single();

    if (dlError || !deliveryList) {
      return new Response(JSON.stringify({ error: "Delivery list not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (deliveryList.status !== "confirmed") {
      return new Response(JSON.stringify({ error: "Delivery list must be in 'confirmed' status" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get confirmed items that are loaded on truck
    const { data: items, error: itemsError } = await supabase
      .from("delivery_list_items")
      .select("id, rug_id, client_id")
      .eq("delivery_list_id", delivery_list_id)
      .eq("confirmed_for_delivery", true)
      .eq("loaded_on_truck", true);

    if (itemsError) {
      return new Response(JSON.stringify({ error: itemsError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ error: "No rugs loaded on truck" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group rugs by client
    const clientRugs: Record<string, string[]> = {};
    for (const item of items) {
      if (!item.client_id) continue;
      if (!clientRugs[item.client_id]) clientRugs[item.client_id] = [];
      clientRugs[item.client_id].push(item.rug_id);
    }

    const invoiceIds: string[] = [];

    // Fetch company branding for PDF header
    const { data: brandingRow } = await supabase
      .from("company_branding")
      .select("business_name, business_address, business_phone, business_email")
      .limit(1)
      .maybeSingle();

    const company: CompanyInfo = {
      businessName: brandingRow?.business_name ?? "RugBoost",
      businessAddress: brandingRow?.business_address ?? "",
      businessPhone: brandingRow?.business_phone ?? "",
      businessFax: "",
    };

    // Create one invoice per client
    for (const [clientId, rugIds] of Object.entries(clientRugs)) {
      const { data: clientRow } = await supabase
        .from("clients")
        .select("name, email, contact_name, phone, address")
        .eq("id", clientId)
        .maybeSingle();

      // Get rug_services for these rugs to build line items
      const { data: rugServices } = await supabase
        .from("rug_services")
        .select("rug_id, service_name, unit_price, line_total, edges")
        .in("rug_id", rugIds);

      // Get rug details for PDF sections
      const { data: rugs } = await supabase
        .from("rugs")
        .select("id, tag, description, size_length, size_width, notes")
        .in("id", rugIds);

      const rugMap: Record<string, typeof rugs extends (infer R)[] | null ? R : never> = {};
      (rugs ?? []).forEach((r) => { rugMap[r.id] = r; });

      // Group services by rug
      const svcByRug: Record<string, typeof rugServices extends (infer R)[] | null ? R[] : never[]> = {};
      for (const rs of rugServices ?? []) {
        if (!svcByRug[rs.rug_id]) svcByRug[rs.rug_id] = [];
        svcByRug[rs.rug_id].push(rs);
      }

      // Build rug sections and line items
      let invoiceTotal = 0;
      const lineItems: { description: string; quantity: number; unit_price: number; total: number; rug_id: string }[] = [];
      const rugSections: RugSection[] = [];

      for (const rugId of rugIds) {
        const rug = rugMap[rugId];
        const services = svcByRug[rugId] ?? [];
        const svcLines: RugServiceLine[] = [];

        for (const rs of services) {
          const lt = Number(rs.line_total);
          const up = Number(rs.unit_price);
          invoiceTotal += lt;
          lineItems.push({
            description: `${rug?.tag ?? rugId} — ${rs.service_name}`,
            quantity: 1,
            unit_price: up,
            total: lt,
            rug_id: rugId,
          });
          const qty = up > 0 ? Math.round((lt / up) * 100) / 100 : 1;
          const qtyStr = qty === Math.floor(qty) ? String(Math.floor(qty)) : qty.toFixed(2);
          svcLines.push({
            name: rs.service_name,
            pricingLabel: `${qtyStr}@${up}/unit`,
            extPrice: lt,
          });
        }

        const fmtDim = (n: number | null) => n == null ? 0 : n === Math.floor(n) ? String(n) : n.toFixed(2);
        rugSections.push({
          rugNumber: rug?.tag ?? rugId.slice(0, 8),
          customerRugNumber: "|",
          size: rug?.size_length || rug?.size_width ? `${fmtDim(rug?.size_length ?? null)} x ${fmtDim(rug?.size_width ?? null)}` : "",
          rugType: rug?.description ?? "",
          notes: rug?.notes ?? "",
          services: svcLines,
          subtotal: svcLines.reduce((s, l) => s + l.extPrice, 0),
        });
      }

      // Generate invoice number
      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}-${clientId.slice(0, 4).toUpperCase()}`;
      const pdfStoragePath = resolveInvoicePdfStoragePath(clientId, invoiceNumber);

      // Create invoice
      const { data: invoice, error: invError } = await supabase
        .from("invoices")
        .insert({
          client_id: clientId,
          delivery_list_id,
          invoice_number: invoiceNumber,
          status: "sent",
          total: invoiceTotal,
          issued_at: new Date().toISOString(),
          due_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          pdf_storage_path: pdfStoragePath,
        })
        .select("id")
        .single();

      if (invError || !invoice) {
        console.error("Failed to create invoice for client", clientId, invError);
        continue;
      }

      invoiceIds.push(invoice.id);

      // Create invoice items
      if (lineItems.length > 0) {
        await supabase.from("invoice_items").insert(
          lineItems.map((li) => ({
            invoice_id: invoice.id,
            description: li.description,
            quantity: li.quantity,
            unit_price: li.unit_price,
            total: li.total,
            rug_id: li.rug_id,
          }))
        );
      }

      // Generate PDF with new structured layout
      try {
        const payload: InvoicePdfPayload = {
          documentType: "invoice",
          documentNumber: invoiceNumber,
          documentDate: new Date().toISOString(),
          company,
          client: {
            name: clientRow?.name ?? "Client",
            contactName: clientRow?.contact_name ?? "",
            phone: clientRow?.phone ?? "",
            address: clientRow?.address ?? "",
          },
          rugs: rugSections,
          subtotal: invoiceTotal,
          total: invoiceTotal,
        };
        const pdfBytes = await renderInvoicePdfBytes(payload);
        await uploadInvoicePdf(supabase, getInvoicePdfBucket(), pdfStoragePath, pdfBytes);
      } catch (pdfError) {
        console.error("Failed to generate invoice PDF", { invoiceId: invoice.id, error: pdfError });
      }

      await supabase.from("communication_events").insert({
        client_id: clientId,
        invoice_id: invoice.id,
        channel: "email",
        direction: "outbound",
        event_type: "invoice_sent",
        subject: `${invoiceNumber} created and sent`,
        body: `Created invoice ${invoiceNumber} during delivery checkout for ${rugIds.length} rugs.`,
        sent_to: clientRow?.email ?? null,
      });

      // Update rugs to picked_up status
      await supabase
        .from("rugs")
        .update({ status: "picked_up", picked_up_at: new Date().toISOString() })
        .in("id", rugIds);
    }

    // Mark delivery list as checked out
    await supabase
      .from("delivery_lists")
      .update({
        status: "checked_out",
        checked_out_at: new Date().toISOString(),
        checked_out_by: user.id,
      })
      .eq("id", delivery_list_id);

    // ---------------------------------------------------------------
    // Create route_stops + route_stop_items for each delivery client
    // so they appear on the driver's Route tab immediately.
    // ---------------------------------------------------------------
    const routeDate = deliveryList.target_date;
    const routeDay = deliveryList.route_day;

    // Build a map of clientId → delivery_list_item rows for route_stop_items
    const clientItems: Record<string, { id: string; rug_id: string }[]> = {};
    for (const item of items!) {
      if (!item.client_id) continue;
      if (!clientItems[item.client_id]) clientItems[item.client_id] = [];
      clientItems[item.client_id].push({ id: item.id, rug_id: item.rug_id });
    }

    // Check for existing stops for these clients on the scheduled route date (e.g. pickup stops)
    const clientIds = Object.keys(clientItems);
    const { data: existingStops } = await supabase
      .from("route_stops")
      .select("id, client_id")
      .in("client_id", clientIds)
      .eq("route_date", routeDate)
      .eq("assigned_driver_id", user.id);

    const existingByClient: Record<string, string> = {};
    for (const s of existingStops ?? []) {
      if (s.client_id) existingByClient[s.client_id] = s.id;
    }

    let routeStopsCreated = 0;
    for (const clientId of clientIds) {
      let stopId = existingByClient[clientId];

      if (!stopId) {
        const { data: newStop, error: stopErr } = await supabase
          .from("route_stops")
          .insert({
            client_id: clientId,
            route_date: routeDate,
            route_day: routeDay,
            assigned_driver_id: user.id,
            delivery_list_id: delivery_list_id,
            status: "queued",
          })
          .select("id")
          .single();

        if (stopErr || !newStop) {
          console.error("Failed to create route stop for client", clientId, stopErr);
          continue;
        }
        stopId = newStop.id;
        routeStopsCreated++;
      } else {
        // Existing stop (e.g. pickup) — link the delivery list and align route metadata
        await supabase
          .from("route_stops")
          .update({
            delivery_list_id: delivery_list_id,
            route_date: routeDate,
            route_day: routeDay,
          })
          .eq("id", stopId);
      }

      const clientDeliveryItems = clientItems[clientId] ?? [];
      const deliveryListItemIds = clientDeliveryItems.map((di) => di.id);
      const { data: existingStopItems } = await supabase
        .from("route_stop_items")
        .select("delivery_list_item_id")
        .eq("route_stop_id", stopId)
        .eq("phase", "delivery")
        .in("delivery_list_item_id", deliveryListItemIds);

      const existingDeliveryListItemIds = new Set(
        (existingStopItems ?? [])
          .map((row) => row.delivery_list_item_id)
          .filter((value): value is string => Boolean(value))
      );

      // Create route_stop_items for each rug, but only if they do not already exist.
      const stopItems = clientDeliveryItems
        .filter((di) => !existingDeliveryListItemIds.has(di.id))
        .map((di) => ({
          route_stop_id: stopId,
          phase: "delivery",
          status: "pending",
          rug_id: di.rug_id,
          delivery_list_item_id: di.id,
        }));

      if (stopItems.length === 0) continue;

      const { error: itemsInsertErr } = await supabase
        .from("route_stop_items")
        .insert(stopItems);

      if (itemsInsertErr) {
        console.error("Failed to create route stop items for client", clientId, itemsInsertErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        invoices_created: invoiceIds.length,
        rugs_delivered: items!.length,
        route_stops_created: routeStopsCreated,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
