import { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceStatusBar } from "@/components/layout/WorkspaceStatusBar";

const DeliveriesTab = lazy(() => import("@/components/office/DeliveriesTab").then((m) => ({ default: m.DeliveriesTab })));
const RouteBuilder = lazy(() => import("@/components/office/RouteBuilder").then((m) => ({ default: m.RouteBuilder })));
const DeliveryProofBoard = lazy(() => import("@/components/office/DeliveryProofBoard").then((m) => ({ default: m.DeliveryProofBoard })));

const LOGISTICS_TITLES: Record<string, string> = {
  "/logistics/deliveries": "Deliveries",
  "/logistics/routes": "Routes",
  "/logistics/proofs": "Proofs",
};

export default function LogisticsWorkspace() {
  const location = useLocation();
  const subtitle = LOGISTICS_TITLES[location.pathname] ?? "Logistics";

  return (
    <AppShell
      title="Logistics"
      subtitle={subtitle}
      contentClassName="overflow-hidden flex flex-col"
      statusBar={<WorkspaceStatusBar />}
    >
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden rounded-[1.25rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,249,252,0.88))] shadow-[0_28px_70px_-42px_rgba(15,23,42,0.42)] backdrop-blur-md md:mx-4 md:mt-4">
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading workspace…</div>}>
          {location.pathname === "/logistics/deliveries" ? <DeliveriesTab /> : null}
          {location.pathname === "/logistics/routes" ? <RouteBuilder /> : null}
          {location.pathname === "/logistics/proofs" ? <DeliveryProofBoard /> : null}
        </Suspense>
      </div>
    </AppShell>
  );
}
