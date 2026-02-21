import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import type { Enums, Tables, TablesInsert } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { usePortalClient } from "@/hooks/usePortalClient";

type EstimateStatus = Enums<"estimate_status">;

type EstimateRow = Pick<
  Tables<"estimates">,
  "id" | "estimate_number" | "status" | "total" | "created_at" | "sent_at" | "approved_at" | "rejected_at"
> & {
  rugs?: { tag: string } | null;
};

type EstimateUpdateResult = { id: string };

const statusBadge = (status: EstimateStatus) => {
  if (status === "sent") return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Pending approval</Badge>;
  if (status === "approved") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Rejected</Badge>;
  if (status === "expired") return <Badge variant="secondary">Expired</Badge>;
  return <Badge variant="outline">Draft</Badge>;
};

export default function PortalEstimatesTab() {
  const { toast } = useToast();
  const { clientId, loading: portalClientLoading, errorMessage } = usePortalClient();
  const [estimates, setEstimates] = useState<EstimateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchEstimates = useCallback(async (activeClientId: string) => {
    const { data, error } = await supabase
      .from("estimates")
      .select("id, estimate_number, status, total, created_at, sent_at, approved_at, rejected_at, rugs(tag)")
      .eq("client_id", activeClientId)
      .order("created_at", { ascending: false })
      .limit(200)
      .returns<EstimateRow[]>();

    if (error) {
      toast({ title: "Failed to load estimates", description: error.message, variant: "destructive" });
      return;
    }
    setEstimates(data ?? []);
  }, [toast]);

  useEffect(() => {
    if (portalClientLoading) {
      setLoading(true);
      return;
    }

    if (errorMessage) {
      toast({ title: "No portal access", description: errorMessage, variant: "destructive" });
      setLoading(false);
      setEstimates([]);
      return;
    }

    if (!clientId) {
      setLoading(false);
      return;
    }

    const init = async () => {
      setLoading(true);
      await fetchEstimates(clientId);
      setLoading(false);
    };

    init();
  }, [clientId, errorMessage, fetchEstimates, portalClientLoading, toast]);

  const updateStatus = async (estimate: EstimateRow, nextStatus: "approved" | "rejected") => {
    if (!clientId || estimate.status !== "sent") return;

    setUpdatingId(estimate.id);

    const timestampField = nextStatus === "approved" ? "approved_at" : "rejected_at";
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from("estimates")
      .update({ status: nextStatus, [timestampField]: nowIso })
      .eq("id", estimate.id)
      .eq("client_id", clientId)
      .eq("status", "sent")
      .select("id")
      .maybeSingle<EstimateUpdateResult>();
      .maybeSingle<Pick<Tables<"estimates">, "id">>();

    if (error) {
      toast({ title: "Failed to update estimate", description: error.message, variant: "destructive" });
      setUpdatingId(null);
      return;
    }

    if (!data?.id) {
      toast({ title: "Estimate already updated", description: "Reload and check the latest status." });
      setUpdatingId(null);
      await fetchEstimates(clientId);
      return;
    }

    const eventType = nextStatus === "approved" ? "estimate_approved_by_client" : "estimate_rejected_by_client";
    const eventPayload: TablesInsert<"communication_events"> = {
      client_id: clientId,
      estimate_id: estimate.id,
      channel: "in_app_chat",
      direction: "inbound",
      event_type: eventType,
      subject: `${estimate.estimate_number} ${nextStatus}`,
      body: `Portal client marked estimate ${estimate.estimate_number} as ${nextStatus}.`,
    };
    await supabase.from("communication_events").insert(eventPayload);

    setEstimates((prev) => prev.map((row) => row.id === estimate.id ? { ...row, status: nextStatus, [timestampField]: nowIso } : row));
    toast({ title: `Estimate ${nextStatus}` });
    setUpdatingId(null);
  };

  const pending = useMemo(() => estimates.filter((e) => e.status === "sent"), [estimates]);
  const history = useMemo(() => estimates.filter((e) => e.status !== "sent"), [estimates]);

  if (portalLoading || loading) {
    return <div className="text-sm text-muted-foreground">Loading estimates…</div>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estimate approvals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">No estimates awaiting your approval.</p>
          ) : (
            pending.map((estimate) => (
              <div key={estimate.id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{estimate.estimate_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {estimate.rugs?.tag ?? "Unknown rug"} · ${Number(estimate.total).toFixed(2)}
                    </p>
                  </div>
                  {statusBadge(estimate.status)}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => updateStatus(estimate, "approved")}
                    disabled={updatingId === estimate.id}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => updateStatus(estimate, "rejected")}
                    disabled={updatingId === estimate.id}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estimate history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No estimate history yet.</p>
          ) : (
            history.map((estimate, index) => (
              <div key={estimate.id}>
                <div className="flex items-center justify-between gap-3 py-1.5">
                  <div>
                    <p className="text-sm font-medium">{estimate.estimate_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {estimate.rugs?.tag ?? "Unknown rug"} · ${Number(estimate.total).toFixed(2)}
                    </p>
                  </div>
                  {statusBadge(estimate.status)}
                </div>
                {index < history.length - 1 && <Separator />}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
