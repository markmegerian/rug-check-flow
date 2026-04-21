import { Suspense, lazy, useState } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceStatusBar } from "@/components/layout/WorkspaceStatusBar";
import { WorkspaceFallback, WorkspaceSurface } from "@/components/layout/WorkspaceSurface";
import { RugSearchDialog } from "@/components/facility/RugSearchDialog";
import { RugDetailSheet } from "@/components/facility/RugDetailSheet";

const ProductionBoard = lazy(() => import("@/components/facility/ProductionBoard").then((m) => ({ default: m.ProductionBoard })));
const DeliveryPrepTab = lazy(() => import("@/components/facility/DeliveryPrepTab").then((m) => ({ default: m.DeliveryPrepTab })));
const InvoiceGeneratorPanel = lazy(() => import("@/components/facility/InvoiceGeneratorPanel").then((m) => ({ default: m.InvoiceGeneratorPanel })));

const FACILITY_TITLES: Record<string, string> = {
  "/facility/production": "Production",
  "/facility/delivery-prep": "Delivery Prep",
  "/facility/invoices": "Create Invoice",
};

export default function FacilityWorkspace() {
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailRugId, setDetailRugId] = useState<string | null>(null);
  const subtitle = FACILITY_TITLES[location.pathname] ?? "Facility";

  return (
    <AppShell
      title="Facility"
      subtitle={subtitle}
      contentClassName="overflow-hidden flex flex-col"
      statusBar={<WorkspaceStatusBar />}
      onSearchOpen={() => setSearchOpen(true)}
    >
      <WorkspaceSurface>
        <Suspense fallback={<WorkspaceFallback label="workspace" />}>
          {location.pathname === "/facility/delivery-prep" ? <DeliveryPrepTab /> : null}
          {location.pathname === "/facility/invoices" ? <InvoiceGeneratorPanel /> : null}
          {location.pathname === "/facility/production" ? <ProductionBoard /> : null}
        </Suspense>
      </WorkspaceSurface>

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
