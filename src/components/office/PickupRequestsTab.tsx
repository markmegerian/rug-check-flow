import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/states/PageState";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { canRoleTransitionPickupStatus } from "@/lib/workflow-guards";
import type { Tables } from "@/integrations/supabase/types";
import {
  usePickupRequests,
  usePickupItems,
  useInvalidatePickupRequests,
  type PickupRequestRow,
} from "@/hooks/usePickupRequests";

type PickupStatus = PickupRequestRow["status"];

type DriverOption = {
  id: string;
  name: string;
};

type DriverRoleRow = Pick<Tables<"user_roles">, "user_id">;
type DriverProfileRow = Pick<Tables<"profiles">, "user_id" | "full_name" | "email">;

const STATUS_ORDER: PickupStatus[] = ["pending", "confirmed", "assigned", "completed", "cancelled"];
const STATUS_SET = new Set<PickupStatus>(STATUS_ORDER);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function PickupRequestsTab() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [driverSelection, setDriverSelection] = useState<Record<string, string>>({});

  const statusFilterParam = searchParams.get("status");
  const minAgeDays = Number(searchParams.get("minAgeDays") ?? 0);
  const statusFilters = (statusFilterParam ?? "")
    .split(",")
    .map((status) => status.trim())
    .filter((status): status is PickupStatus => STATUS_SET.has(status as PickupStatus));
  const hasReminderFilter = statusFilters.length > 0 || minAgeDays > 0;

  const { data: requests = [], isLoading: loading } = usePickupRequests();
  const invalidatePickupRequests = useInvalidatePickupRequests();

  const requestIds = useMemo(() => requests.map((r) => r.id), [requests]);
  const { data: items = [] } = usePickupItems(requestIds);

  // Initialize driver selections when requests load
  useEffect(() => {
    const defaultSelections: Record<string, string> = {};
    requests.forEach((r) => {
      defaultSelections[r.id] = r.assigned_driver_id ?? "none";
    });
    setDriverSelection(defaultSelections);
  }, [requests]);

  const fetchDrivers = useCallback(async () => {
    const { data: roleRows } = await supabaseExtended
      .from("user_roles")
      .select("user_id")
      .eq("role", "driver");

    const typedRoles = (roleRows ?? []) as DriverRoleRow[];
    const driverIds = [...new Set(typedRoles.map((r) => r.user_id))].filter(Boolean);
    if (driverIds.length === 0) {
      setDrivers([]);
      return;
    }

    const { data: profiles } = await supabaseExtended
      .from("profiles")
      .select("user_id, full_name, email")
      .in("user_id", driverIds);

    const typedProfiles = (profiles ?? []) as DriverProfileRow[];
    const mapped = typedProfiles.map((p) => ({
      id: p.user_id,
      name: p.full_name?.trim() || p.email || p.user_id,
    }));

    setDrivers(mapped);
  }, []);

  useEffect(() => {
    fetchDrivers();
  }, [fetchDrivers]);

  const filteredRequests = useMemo(() => {
    let filtered = [...requests];
    if (statusFilters.length > 0) {
      filtered = filtered.filter((request) => statusFilters.includes(request.status));
    }
    if (minAgeDays > 0) {
      filtered = filtered.filter((request) => {
        const ageMs = Date.now() - Date.parse(request.updated_at);
        if (!Number.isFinite(ageMs)) return false;
        return ageMs >= minAgeDays * MS_PER_DAY;
      });
    }
    return filtered;
  }, [minAgeDays, requests, statusFilters]);

  const requestsByRoute = useMemo(() => {
    const map: Record<string, PickupRequestRow[]> = {};
    for (const req of filteredRequests) {
      const key = req.route_day || "Unassigned";
      if (!map[key]) map[key] = [];
      map[key].push(req);
    }
    return map;
  }, [filteredRequests]);

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
    const current = requests.find((request) => request.id === id);
    if (!current) return;
    if (!canRoleTransitionPickupStatus("office", current.status, status)) {
      toast({
        title: "Invalid status transition",
        description: `Cannot move pickup from ${current.status} to ${status}.`,
        variant: "destructive",
      });
      return;
    }

    const { error } = await supabaseExtended
      .from("pickup_requests")
      .update({ status })
      .eq("id", id);

    if (error) {
      toast({ title: "Status update failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Pickup updated", description: `Status set to ${status}.` });
    invalidatePickupRequests();
  };

  const assignDriver = async (requestId: string) => {
    const selected = driverSelection[requestId];
    if (!selected || selected === "none") {
      toast({ title: "Select a driver first", variant: "destructive" });
      return;
    }
    const current = requests.find((request) => request.id === requestId);
    if (!current) return;
    if (!canRoleTransitionPickupStatus("office", current.status, "assigned")) {
      toast({
        title: "Assignment blocked",
        description: `Cannot assign driver while pickup is ${current.status}.`,
        variant: "destructive",
      });
      return;
    }

    const now = new Date().toISOString();
    const { error } = await supabaseExtended
      .from("pickup_requests")
      .update({
        assigned_driver_id: selected,
        assigned_at: now,
        status: "assigned",
      })
      .eq("id", requestId);

    if (error) {
      toast({ title: "Driver assignment failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Driver assigned" });
    invalidatePickupRequests();
  };

  const statusBadge = (status: PickupStatus) => {
    if (status === "pending") return <Badge variant="outline">Pending</Badge>;
    if (status === "confirmed") return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Confirmed</Badge>;
    if (status === "assigned") return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">Assigned</Badge>;
    if (status === "completed") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Completed</Badge>;
    return <Badge variant="secondary">Cancelled</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingState title="Loading pickup requests" description="Fetching request records..." />
      </div>
    );
  }

  if (filteredRequests.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        {hasReminderFilter ? "No pickup requests match the active reminder filter." : "No pickup requests yet."}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 overflow-auto h-full space-y-5 animate-fade-in-up">
      {hasReminderFilter ? (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          Reminder filter active:
          {statusFilters.length > 0 ? ` status=${statusFilters.join(",")}` : ""}
          {minAgeDays > 0 ? ` · min age ${minAgeDays} days` : ""}
        </div>
      ) : null}
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
                      <SelectTrigger className="w-[200px] h-8">
                        <SelectValue placeholder="Assign driver" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select driver</SelectItem>
                        {drivers.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => assignDriver(req.id)}>
                      Assign Driver
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {STATUS_ORDER.filter((status) =>
                      canRoleTransitionPickupStatus("office", req.status, status)
                    ).map((status) => (
                      <Button
                        key={status}
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => updateStatus(req.id, status)}
                      >
                        Mark {status}
                      </Button>
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
