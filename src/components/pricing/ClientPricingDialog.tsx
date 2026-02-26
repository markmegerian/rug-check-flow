import { useEffect, useMemo, useState } from "react";
import { DollarSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { cn } from "@/lib/utils";

type PricingTier = "standard" | "preferred" | "vip";

type ClientRow = {
  id: string;
  name: string;
  pricing_tier: PricingTier;
};

type ServiceRow = {
  id: string;
  name: string;
  unit: string;
  base_price: number;
  preferred_price: number;
  vip_price: number;
  active?: boolean;
};

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

interface ClientPricingDialogProps {
  triggerLabel?: string;
  fixedClientId?: string;
  className?: string;
}

export function ClientPricingDialog({ triggerLabel = "Price Lookup", fixedClientId, className }: ClientPricingDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>(fixedClientId ?? "");
  const [services, setServices] = useState<ServiceRow[]>([]);

  useEffect(() => {
    if (fixedClientId) {
      setSelectedClientId(fixedClientId);
    }
  }, [fixedClientId]);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const [clientsResult, servicesResult] = await Promise.all([
        supabaseExtended
          .from("clients")
          .select("id, name, pricing_tier")
          .order("name", { ascending: true }),
        supabaseExtended
          .from("services")
          .select("id, name, unit, base_price, preferred_price, vip_price, active")
          .eq("active", true)
          .order("name", { ascending: true }),
      ]);

      const loadedClients = (clientsResult.data ?? []) as ClientRow[];
      setClients(loadedClients);

      if (fixedClientId) {
        setSelectedClientId(fixedClientId);
      } else if (!selectedClientId && loadedClients[0]?.id) {
        setSelectedClientId(loadedClients[0].id);
      }

      setServices((servicesResult.data ?? []) as ServiceRow[]);
      setLoading(false);
    };
    void load();
  }, [fixedClientId, open, selectedClientId]);

  const activeClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  );

  const pricingTier: PricingTier = activeClient?.pricing_tier ?? "standard";
  const resolvePrice = (svc: ServiceRow) => {
    if (pricingTier === "vip") return svc.vip_price;
    if (pricingTier === "preferred") return svc.preferred_price;
    return svc.base_price;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className={cn("gap-1.5", className)}>
          <DollarSign className="h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Client pricing reference</DialogTitle>
        </DialogHeader>

        {!fixedClientId ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Select a client to view their active service prices.</p>
            <Select value={selectedClientId} onValueChange={setSelectedClientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name} ({client.pricing_tier})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        {loading ? <p className="text-sm text-muted-foreground">Loading pricing…</p> : null}

        {!loading && services.length > 0 ? (
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0">
                <tr className="text-left">
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
                    <td className="px-3 py-2 font-medium">{money.format(resolvePrice(svc))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
