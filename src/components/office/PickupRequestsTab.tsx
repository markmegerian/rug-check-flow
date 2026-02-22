import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type PickupStatus = "pending" | "confirmed" | "assigned" | "completed" | "cancelled";

type PickupRequestRow = {
  id: string;
  client_id: string;
  route_day: string;
  scheduled_date: string;
  status: PickupStatus;
  notes: string;
  assigned_driver_id: string | null;
  clients?: { name: string } | null;
};

type PickupItemRow = {
  id: string;
  pickup_request_id: string;
  rug_number: string;
  is_new: boolean;
};

type DriverOption = { id: string; name: string };
type UserRoleRow = Pick<Tables<"user_roles">, "user_id">;
type ProfileRow = Pick<Tables<"profiles">, "user_id" | "full_name" | "email">;

const STATUS_ORDER: PickupStatus[] = ["pending", "confirmed", "assigned", "completed", "cancelled"];

export function PickupRequestsTab() {
  const { toast } = useToast();
  const [requests, setRequests] = useState<PickupRequestRow[]>([]);
  const [items, setItems] = useState<PickupItemRow[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [driverSelection, setDriverSelection] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchDrivers = useCallback(async () => {
    const { data: roleRows } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "driver")
      .returns<UserRoleRow[]>();

    const driverIds = [...new Set((roleRows ?? []).map((r) => r.user_id))].filter(Boolean);
    if (driverIds.length === 0) { setDrivers([]); return; }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", driverIds)
      .returns<ProfileRow[]>();

    setDrivers((profiles ?? []).map((p) => ({
      id: p.user_id,
      name: p.full_name?.trim() || p.email || p.user_id,
    })));
  }, []);

  const fetchAll = useCallback(async () => {
    const { data: reqData, error: reqErr } = await (supabase as any)
      .from("pickup_requests")
      .select("id, client_id, route_day, scheduled_date, status, notes, assigned_driver_id, clients(name)")
      .order("scheduled_date", { ascending: true }) as { data: PickupRequestRow[] | null; error: any };

    if (reqErr) {
      toast({ title: "Failed to load pickup requests", description: reqErr.message, variant: "destructive" });
      setLoading(false); return;
    }

    const typedRequests = reqData ?? [];
    setRequests(typedRequests);

    const defaultSelections: Record<string, string> = {};
    typedRequests.forEach((r) => { defaultSelections[r.id] = r.assigned_driver_id ?? "none"; });
    setDriverSelection(defaultSelections);

    const reqIds = typedRequests.map((r) => r.id);
    if (reqIds.length === 0) { setItems([]); setLoading(false); return; }

    const { data: itemData } = await (supabase as any)
      .from("pickup_request_items")
      .select("id, pickup_request_id, rug_number, is_new")
      .in("pickup_request_id", reqIds) as { data: PickupItemRow[] | null; error: any };

    setItems(itemData ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { fetchDrivers(); fetchAll(); }, [fetchAll, fetchDrivers]);

  const requestsByRoute = useMemo(() => {
    const map: Record<string, PickupRequestRow[]> = {};
    for (const req of requests) {
      const key = req.route_day || "Unassigned";
      if (!map[key]) map[key] = [];
      map[key].push(req);
    }
    return map;
  }, [requests]);

  const itemCounts = useMemo(() => {
    const counts: Record<string, { ready: number; newRugs: number }> = {};
    items.forEach((i) => {
      if (!counts[i.pickup_request_id]) counts[i.pickup_request_id] = { ready: 0, newRugs: 0 };
      if (i.is_new) counts[i.pickup_request_id].newRugs += 1;
      else counts[i.pickup_request_id].ready += 1;
    });
    return counts;
  }, [items]);

  const updateStatus = async (id: string, status: PickupStatus) => {
    const { error } = await (supabase as any)
      .from("pickup_requests")
      .update({ status })
      .eq("id", id);

    if (error) {
      toast({ title: "Status update failed", description: error.message, variant: "destructive" });
      return;
    }
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    toast({ title: "Pickup updated", description: `Status set to ${status}.` });
  };

  const assignDriver = async (requestId: string) => {
    const selected = driverSelection[requestId];
    if (!selected || selected === "none") {
      toast({ title: "Select a driver first", variant: "destructive" }); return;
    }
    const now = new Date().toISOString();
    const { error } = await (supabase as any)
      .from("pickup_requests")
      .update({ assigned_driver_id: selected, assigned_at: now, status: "assigned" })
      .eq("id", requestId);

    if (error) {
      toast({ title: "Driver assignment failed", description: error.message, variant: "destructive" }); return;
    }
    setRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, assigned_driver_id: selected, status: "assigned" as PickupStatus } : r)));
    toast({ title: "Driver assigned" });
  };

  const statusBadge = (status: PickupStatus) => {
    if (status === "pending") return <Badge variant="outline">Pending</Badge>;
    if (status === "confirmed") return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Confirmed</Badge>;
    if (status === "assigned") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Assigned</Badge>;
    if (status === "completed") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Completed</Badge>;
    return <Badge variant="secondary">Cancelled</Badge>;
  };

  if (loading) return <div className="flex items-center justify-center h-full text-muted-foreground">Loading pickup requests…</div>;
  if (requests.length === 0) return <div className="flex items-center justify-center h-full text-muted-foreground">No pickup requests yet.</div>;

  return (
    <div className="p-4 md:p-6 overflow-auto h-full space-y-5 animate-fade-in-up">
      <h2 className="text-lg font-semibold text-foreground">Pickup Requests</h2>

      {Object.entries(requestsByRoute).map(([routeDay, list]) => (
        <section key={routeDay} className="border rounded-lg bg-card overflow-hidden">
          <div className="px-4 py-3 flex items-center justify-between">
            <h3 className="font-medium text-sm">{routeDay}</h3>
            <Badge variant="secondary" className="text-xs">{list.length}</Badge>
          </div>
          <Separator />
          <div className="divide-y">
            {list.map((req) => {
              const counts = itemCounts[req.id] ?? { ready: 0, newRugs: 0 };
              return (
                <div key={req.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <p className="text-sm font-medium">{req.clients?.name ?? "Unknown client"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(`${req.scheduled_date}T00:00:00`).toLocaleDateString()} · {counts.ready} ready rugs · {counts.newRugs} new rugs
                      </p>
                    </div>
                    {statusBadge(req.status)}
                  </div>
                  {req.notes && <p className="text-xs text-muted-foreground">Notes: {req.notes}</p>}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Select value={driverSelection[req.id] ?? "none"} onValueChange={(v) => setDriverSelection((prev) => ({ ...prev, [req.id]: v }))}>
                      <SelectTrigger className="w-[200px] h-8"><SelectValue placeholder="Assign driver" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select driver</SelectItem>
                        {drivers.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => assignDriver(req.id)}>Assign Driver</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_ORDER.filter((s) => s !== req.status).map((status) => (
                      <Button key={status} size="sm" variant="outline" className="h-7 text-xs" onClick={() => updateStatus(req.id, status)}>Mark {status}</Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
