import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { EmptyState, ErrorState, LoadingState } from "@/components/states/PageState";
import { supabaseExtended, type ExtendedTableRow } from "@/integrations/supabase/extended";
import { canRoleTransitionEstimateStatus, type EstimateStatus } from "@/lib/workflow-guards";
import type { Tables } from "@/integrations/supabase/types";

type EstimateRow = {
  id: ExtendedTableRow<"estimates">["id"];
  estimate_number: ExtendedTableRow<"estimates">["estimate_number"];
  status: ExtendedTableRow<"estimates">["status"];
  total: ExtendedTableRow<"estimates">["total"];
  created_at: ExtendedTableRow<"estimates">["created_at"];
  sent_at: ExtendedTableRow<"estimates">["sent_at"];
  approved_at: ExtendedTableRow<"estimates">["approved_at"];
  rejected_at: ExtendedTableRow<"estimates">["rejected_at"];
  rugs?: Pick<Tables<"rugs">, "tag"> | null;
};

type PortalUserLookup = Pick<Tables<"portal_users">, "client_id">;

const statusBadge = (status: EstimateStatus) => {
  if (status === "sent") return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">Pending approval</Badge>;
  if (status === "approved") return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Rejected</Badge>;
  if (status === "expired") return <Badge variant="secondary">Expired</Badge>;
  return <Badge variant="outline">Draft</Badge>;
};

export default function PortalEstimatesTab() {
  const { toast } = useToast();
  const [clientId, setClientId] = useState<string | null>(null);
  const [estimates, setEstimates] = useState<EstimateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchEstimates = useCallback(async (activeClientId: string) => {
    const { data, error } = await supabaseExtended
      .from("estimates")
      .select("id, estimate_number, status, total, created_at, sent_at, approved_at, rejected_at, rugs(tag)")
      .eq("client_id", activeClientId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      toast({ title: "Failed to load estimates", description: error.message, variant: "destructive" });
      return;
    }

    setEstimates((data ?? []) as unknown as EstimateRow[]);
  }, [toast]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setAccessError(null);

      const { data: authData } = await supabaseExtended.auth.getUser();
      const email = authData.user?.email?.toLowerCase();
      if (!email) {
        setAccessError("Portal account required. Please sign in again.");
        setLoading(false);
        return;
      }

      const { data: portalUser } = await supabaseExtended
        .from("portal_users")
        .select("client_id")
        .eq("email", email)
        .eq("status", "active")
        .maybeSingle();

      const typedPortalUser = portalUser as PortalUserLookup | null;
      if (!typedPortalUser?.client_id) {
        setAccessError("No active portal access was found for your account.");
        setLoading(false);
        return;
      }

      setClientId(typedPortalUser.client_id);
      await fetchEstimates(typedPortalUser.client_id);
      setLoading(false);
    };

    init();
  }, [fetchEstimates, toast]);

  const updateStatus = async (estimate: EstimateRow, nextStatus: "approved" | "rejected") => {
    if (!clientId) return;
    if (!canRoleTransitionEstimateStatus("portal", estimate.status, nextStatus)) {
      toast({
        title: "Update blocked",
        description: `Estimate cannot move from ${estimate.status} to ${nextStatus}.`,
        variant: "destructive",
      });
      return;
    }

    setUpdatingId(estimate.id);

    const timestampField = nextStatus === "approved" ? "approved_at" : "rejected_at";
    const nowIso = new Date().toISOString();

    const { data, error } = await supabaseExtended
      .from("estimates")
      .update({ status: nextStatus, [timestampField]: nowIso })
      .eq("id", estimate.id)
      .eq("client_id", clientId)
      .eq("status", "sent")
      .select("id")
      .maybeSingle();

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
    await supabaseExtended.from("communication_events").insert({
      client_id: clientId,
      estimate_id: estimate.id,
      channel: "in_app_chat",
      direction: "inbound",
      event_type: eventType,
      subject: `${estimate.estimate_number} ${nextStatus}`,
      body: `Portal client marked estimate ${estimate.estimate_number} as ${nextStatus}.`,
    });

    setEstimates((prev) => prev.map((row) => row.id === estimate.id ? { ...row, status: nextStatus, [timestampField]: nowIso } : row));
    toast({ title: `Estimate ${nextStatus}` });
    setUpdatingId(null);
  };

  const pending = useMemo(() => estimates.filter((e) => e.status === "sent"), [estimates]);
  const history = useMemo(() => estimates.filter((e) => e.status !== "sent"), [estimates]);

  if (loading) {
    return <LoadingState title="Loading estimates" description="Checking pending estimate approvals..." />;
  }

  if (accessError) {
    return <ErrorState title="Portal access unavailable" description={accessError} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estimate approvals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? (
            <EmptyState
              className="border-dashed"
              title="No approvals pending"
              description="Any sent estimate waiting for your approval will show up here."
            />
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
            <EmptyState
              className="border-dashed"
              title="No estimate history yet"
              description="Past approved, rejected, draft, and expired estimates will appear here."
            />
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
