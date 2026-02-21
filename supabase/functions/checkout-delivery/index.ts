import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      .select("rug_id, client_id")
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

    // Create one invoice per client
    for (const [clientId, rugIds] of Object.entries(clientRugs)) {
      // Get rug_services for these rugs to build line items
      const { data: rugServices } = await supabase
        .from("rug_services")
        .select("rug_id, service_name, unit_price, line_total")
        .in("rug_id", rugIds);

      // Get rug tags for descriptions
      const { data: rugs } = await supabase
        .from("rugs")
        .select("id, tag")
        .in("id", rugIds);

      const rugTagMap: Record<string, string> = {};
      (rugs ?? []).forEach((r) => { rugTagMap[r.id] = r.tag; });

      // Calculate total
      let invoiceTotal = 0;
      const lineItems: { description: string; quantity: number; unit_price: number; total: number; rug_id: string }[] = [];

      for (const rs of rugServices ?? []) {
        const lineTotal = Number(rs.line_total);
        invoiceTotal += lineTotal;
        lineItems.push({
          description: `${rugTagMap[rs.rug_id] ?? rs.rug_id} — ${rs.service_name}`,
          quantity: 1,
          unit_price: Number(rs.unit_price),
          total: lineTotal,
          rug_id: rs.rug_id,
        });
      }

      // Generate invoice number
      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}-${clientId.slice(0, 4).toUpperCase()}`;

      // Create invoice
      const { data: invoice, error: invError } = await supabase
        .from("invoices")
        .insert({
          client_id: clientId,
          invoice_number: invoiceNumber,
          status: "sent",
          total: invoiceTotal,
          issued_at: new Date().toISOString(),
          due_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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

    return new Response(
      JSON.stringify({
        success: true,
        invoices_created: invoiceIds.length,
        rugs_delivered: items.length,
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
