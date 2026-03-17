import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package, Truck, DollarSign, AlertTriangle, ClipboardList, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { supabaseExtended } from "@/integrations/supabase/extended";
import { format } from "date-fns";

interface RecentCheckIn {
  id: string;
  tag: string;
  checked_in_at: string;
  client: { company_name: string } | null;
}

interface PendingActions {
  openDisputes: number;
  unconfirmedDeliveryItems: number;
  estimatesAwaitingApproval: number;
  pendingPickupRequests: number;
}

export function OperationalDashboard() {
  const [rugsInHouse, setRugsInHouse] = useState<number>(0);
  const [dueToday, setDueToday] = useState<number>(0);
  const [revenueThisWeek, setRevenueThisWeek] = useState<number>(0);
  const [overdueInvoices, setOverdueInvoices] = useState<number>(0);
  const [recentCheckIns, setRecentCheckIns] = useState<RecentCheckIn[]>([]);
  const [pendingActions, setPendingActions] = useState<PendingActions>({
    openDisputes: 0,
    unconfirmedDeliveryItems: 0,
    estimatesAwaitingApproval: 0,
    pendingPickupRequests: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true);

      const today = format(new Date(), "yyyy-MM-dd");
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoISO = sevenDaysAgo.toISOString();

      const [
        rugsResult,
        dueTodayResult,
        revenueResult,
        overdueResult,
        overdueByDateResult,
        checkInsResult,
        disputesResult,
        unconfirmedResult,
        estimatesResult,
        pickupResult,
      ] = await Promise.all([
        // 1. Rugs in-house
        supabase
          .from("rugs")
          .select("id", { count: "exact", head: true })
          .in("status", ["checked_in", "in_production", "ready"]),

        // 2. Due today — delivery_list_items where delivery_list target_date = today
        supabase
          .from("delivery_list_items")
          .select("id, delivery_lists!inner(target_date)", { count: "exact", head: true })
          .eq("delivery_lists.target_date", today),

        // 3. Revenue this week — sum of paid invoices in last 7 days
        supabase
          .from("invoices")
          .select("total")
          .eq("status", "paid")
          .gte("paid_at", sevenDaysAgoISO),

        // 4a. Overdue invoices — status = 'overdue'
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("status", "overdue"),

        // 4b. Invoices where status = 'sent' and due_at < now
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("status", "sent")
          .lt("due_at", new Date().toISOString()),

        // 5. Recent check-ins
        supabase
          .from("rugs")
          .select("id, tag, checked_in_at, client:clients(company_name)")
          .order("checked_in_at", { ascending: false })
          .limit(10),

        // 6. Open disputes
        supabaseExtended
          .from("disputes")
          .select("id", { count: "exact", head: true })
          .eq("status", "open"),

        // 7. Unconfirmed delivery items
        supabase
          .from("delivery_list_items")
          .select("id", { count: "exact", head: true })
          .eq("confirmed_for_delivery", false),

        // 8. Estimates awaiting approval
        supabaseExtended
          .from("estimates")
          .select("id", { count: "exact", head: true })
          .eq("status", "sent"),

        // 9. Pending pickup requests
        supabaseExtended
          .from("pickup_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending"),
      ]);

      setRugsInHouse(rugsResult.count ?? 0);
      setDueToday(dueTodayResult.count ?? 0);

      const totalRevenue = (revenueResult.data ?? []).reduce(
        (sum, inv) => sum + (inv.total ?? 0),
        0
      );
      setRevenueThisWeek(totalRevenue);

      setOverdueInvoices((overdueResult.count ?? 0) + (overdueByDateResult.count ?? 0));

      setRecentCheckIns(
        (checkInsResult.data ?? []).map((r: any) => ({
          id: r.id,
          tag: r.tag,
          checked_in_at: r.checked_in_at,
          client: r.client,
        }))
      );

      setPendingActions({
        openDisputes: disputesResult.count ?? 0,
        unconfirmedDeliveryItems: unconfirmedResult.count ?? 0,
        estimatesAwaitingApproval: estimatesResult.count ?? 0,
        pendingPickupRequests: pickupResult.count ?? 0,
      });

      setLoading(false);
    }

    fetchDashboardData();
  }, []);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

  const metrics = [
    {
      label: "Rugs In-House",
      value: rugsInHouse,
      description: "Checked in, in production, or ready",
      icon: Package,
      format: (v: number) => v.toLocaleString(),
    },
    {
      label: "Due Today",
      value: dueToday,
      description: "Deliveries scheduled for today",
      icon: Truck,
      format: (v: number) => v.toLocaleString(),
    },
    {
      label: "Revenue This Week",
      value: revenueThisWeek,
      description: "From paid invoices (last 7 days)",
      icon: DollarSign,
      format: (v: number) => formatCurrency(v),
    },
    {
      label: "Overdue Invoices",
      value: overdueInvoices,
      description: "Requiring follow-up",
      icon: AlertTriangle,
      format: (v: number) => v.toLocaleString(),
    },
  ];

  const actionItems = [
    { label: "Open disputes", count: pendingActions.openDisputes },
    { label: "Unconfirmed delivery items", count: pendingActions.unconfirmedDeliveryItems },
    { label: "Estimates awaiting approval", count: pendingActions.estimatesAwaitingApproval },
    { label: "Pending pickup requests", count: pendingActions.pendingPickupRequests },
  ];

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-lg bg-muted" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="h-64 rounded-lg bg-muted" />
          <div className="h-64 rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Row 1: Key Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {metric.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metric.format(metric.value)}</div>
                <p className="text-xs text-muted-foreground mt-1">{metric.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Row 2: Side-by-side panels */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* Recent Check-Ins */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Recent Check-Ins
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentCheckIns.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent check-ins.</p>
            ) : (
              <ul className="space-y-2">
                {recentCheckIns.map((rug) => (
                  <li
                    key={rug.id}
                    className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{rug.tag}</span>
                      <span className="text-muted-foreground ml-2 truncate">
                        {rug.client?.company_name ?? "Walk-in"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      {format(new Date(rug.checked_in_at), "MMM d, h:mm a")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Pending Actions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-muted-foreground" />
              Pending Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {actionItems.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">{item.label}</span>
                  <span
                    className={`font-semibold tabular-nums ${
                      item.count > 0 ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {item.count}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
