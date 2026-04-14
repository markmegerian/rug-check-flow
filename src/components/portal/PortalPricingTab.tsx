import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      const [clientResult, servicesResult] = await Promise.all([
        supabase.from("clients").select("name, pricing_tier").eq("id", clientId).maybeSingle(),
        supabase
          .from("services")
          .select("id, name, unit, base_price, preferred_price, vip_price")
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);

      if (clientResult.error || servicesResult.error) {
        setLoadError(clientResult.error?.message ?? servicesResult.error?.message ?? "Unable to load pricing.");
      }

      setClientPricing((clientResult.data ?? null) as ClientPricing | null);
      setServices((servicesResult.data ?? []) as ServiceRow[]);
      setIsLoading(false);
    };
    void load();
  }, [clientId]);

  const tier: PricingTier = clientPricing?.pricing_tier ?? "standard";
  const resolvePrice = useMemo(
    () => (svc: ServiceRow) => {
      const raw = tier === "vip"
        ? svc.vip_price
        : tier === "preferred"
          ? svc.preferred_price
          : svc.base_price;
      const numeric = Number(raw);
      return Number.isFinite(numeric) ? numeric : null;
    },
    [tier]
  );

  if (loading) return <p className="text-sm text-muted-foreground">Loading prices…</p>;
  if (!clientId) return <p className="text-sm text-muted-foreground">{errorMessage ?? "No portal client linked."}</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Price schedule for <span className="font-medium text-foreground">{clientPricing?.name ?? "your account"}</span> ({tier} tier).
      </p>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading pricing…</p> : null}
      {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}

      {!isLoading ? (
        <div className="rounded-md border overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Service</th>
                <th className="px-3 py-2 font-medium">Unit</th>
                <th className="px-3 py-2 font-medium">Price</th>
              </tr>
            </thead>
            <tbody>
              {services.map((svc) => (
                <tr key={svc.id} className="border-t">
                  <td className="px-3 py-2">{svc.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{svc.unit || "ea"}</td>
                  <td className="px-3 py-2 font-medium">{resolvePrice(svc) == null ? "Call for quote" : money.format(resolvePrice(svc) ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
