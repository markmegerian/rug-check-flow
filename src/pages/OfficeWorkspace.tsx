import { Suspense, lazy, useState } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceStatusBar } from "@/components/layout/WorkspaceStatusBar";
import { ClientPricingDialog } from "@/components/pricing/ClientPricingDialog";
import { RugSearchDialog } from "@/components/facility/RugSearchDialog";
import { RugDetailSheet } from "@/components/facility/RugDetailSheet";
import { useAuth } from "@/contexts/AuthContext";

const PricingTab = lazy(() => import("@/components/office/PricingTab").then((m) => ({ default: m.PricingTab })));
const ClientsTab = lazy(() => import("@/components/office/ClientsTab").then((m) => ({ default: m.ClientsTab })));
const JobsTab = lazy(() => import("@/components/office/JobsTab").then((m) => ({ default: m.JobsTab })));
const EstimatesTab = lazy(() => import("@/components/office/EstimatesTab").then((m) => ({ default: m.EstimatesTab })));
const InboxTab = lazy(() => import("@/components/office/InboxTab").then((m) => ({ default: m.InboxTab })));

const OFFICE_TITLES: Record<string, string> = {
  "/office/pricing": "Pricing",
  "/office/clients": "Clients",
  "/office/jobs": "Jobs",
  "/office/estimates": "Estimates",
  "/office/inbox": "Inbox",
};

export default function OfficeWorkspace() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { hasRole } = useAuth();
  const canManagePricing = hasRole("admin");
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailRugId, setDetailRugId] = useState<string | null>(null);
  const requestedThreadId = searchParams.get("threadId");
  const subtitle = OFFICE_TITLES[location.pathname] ?? "Office";

  return (
    <AppShell
      title="Office"
      subtitle={subtitle}
      contentClassName="overflow-hidden flex flex-col"
      statusBar={<WorkspaceStatusBar />}
      onSearchOpen={() => setSearchOpen(true)}
      actions={<ClientPricingDialog triggerLabel="Price Lookup" />}
    >
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden rounded-[1.25rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,249,252,0.88))] shadow-[0_28px_70px_-42px_rgba(15,23,42,0.42)] backdrop-blur-md md:mx-4 md:mt-4">
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading workspace…</div>}>
          {location.pathname === "/office/pricing" && canManagePricing ? <PricingTab /> : null}
          {location.pathname === "/office/clients" ? <ClientsTab /> : null}
          {location.pathname === "/office/jobs" ? <JobsTab onOpenRug={setDetailRugId} /> : null}
          {location.pathname === "/office/estimates" ? <EstimatesTab /> : null}
          {location.pathname === "/office/inbox" ? <InboxTab requestedThreadId={requestedThreadId} /> : null}
        </Suspense>
      </div>

      {searchOpen ? (
        <Suspense fallback={null}>
          <RugSearchDialog open={searchOpen} onOpenChange={setSearchOpen} onSelectRug={setDetailRugId} />
        </Suspense>
      ) : null}
      {detailRugId ? (
        <Suspense fallback={null}>
          <RugDetailSheet rugId={detailRugId} open={Boolean(detailRugId)} onOpenChange={(open) => { if (!open) setDetailRugId(null); }} />
        </Suspense>
      ) : null}
    </AppShell>
  );
}
