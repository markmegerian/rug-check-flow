import { Suspense, lazy, useState } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceStatusBar } from "@/components/layout/WorkspaceStatusBar";
import { RugSearchDialog } from "@/components/facility/RugSearchDialog";
import { RugDetailSheet } from "@/components/facility/RugDetailSheet";

const ProductionBoard = lazy(() => import("@/components/facility/ProductionBoard").then((m) => ({ default: m.ProductionBoard })));
const DeliveryPrepTab = lazy(() => import("@/components/facility/DeliveryPrepTab").then((m) => ({ default: m.DeliveryPrepTab })));
const InvoiceGeneratorPanel = lazy(() => import("@/components/facility/InvoiceGeneratorPanel").then((m) => ({ default: m.InvoiceGeneratorPanel })));

const FACILITY_TITLES: Record<string, string> = {
  "/facility/production": "Production",
  "/facility/delivery-prep": "Delivery Prep",
  "/facility/invoices": "Invoice Generator",
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
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden rounded-[1.25rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,249,252,0.88))] shadow-[0_28px_70px_-42px_rgba(15,23,42,0.42)] backdrop-blur-md md:mx-4 md:mt-4">
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading workspace…</div>}>
          {location.pathname === "/facility/delivery-prep" ? <DeliveryPrepTab /> : null}
          {location.pathname === "/facility/invoices" ? <InvoiceGeneratorPanel /> : null}
          {location.pathname === "/facility/production" ? <ProductionBoard /> : null}
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
