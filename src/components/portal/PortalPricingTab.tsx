import { useEffect, useMemo, useState } from "react";
import { supabaseExtended } from "@/integrations/supabase/extended";
import type { PortalTabProps } from "./portal-tab-props";

type PricingTier = "standard" | "preferred" | "vip";

type ServiceRow = {
  id: string;
  name: string;
  unit: string;
  base_price: number;
  preferred_price: number;
  vip_price: number;
};

type ClientPricing = { pricing_tier: PricingTier; name: string };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export default function PortalPricingTab({ clientId, loading, errorMessage }: PortalTabProps) {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [clientPricing, setClientPricing] = useState<ClientPricing | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    const load = async () => {
      setIsLoading(true);
      const [clientResult, servicesResult] = await Promise.all([
        supabaseExtended.from("clients").select("name, pricing_tier").eq("id", clientId).maybeSingle(),
        supabaseExtended
          .from("services")
          .select("id, name, unit, base_price, preferred_price, vip_price")
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);
      setClientPricing((clientResult.data ?? null) as ClientPricing | null);
      setServices((servicesResult.data ?? []) as ServiceRow[]);
      setIsLoading(false);
    };
    void load();
  }, [clientId]);

  const tier: PricingTier = clientPricing?.pricing_tier ?? "standard";
  const resolvePrice = useMemo(
    () => (svc: ServiceRow) => {
      if (tier === "vip") return svc.vip_price;
      if (tier === "preferred") return svc.preferred_price;
      return svc.base_price;
    },
    [tier]
  );

  if (loading) return <p className="text-sm text-muted-foreground">Loading prices…</p>;
  if (!clientId) return <p className="text-sm text-muted-foreground">{errorMessage ?? "No portal client linked."}</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Service pricing for <span className="font-medium text-foreground">{clientPricing?.name ?? "your account"}</span>.
      </p>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading pricing…</p> : null}

      {!isLoading ? (
        <div className="rounded-md border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Your price</th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => (
                <tr key={svc.id} className="border-t">
                  <td className="px-3 py-2">{svc.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{svc.unit || "ea"}</td>
                  <td className="px-3 py-2 font-medium">{money.format(resolvePrice(svc))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
