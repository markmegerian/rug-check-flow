import { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceStatusBar } from "@/components/layout/WorkspaceStatusBar";
import { WorkspaceFallback, WorkspaceSurface } from "@/components/layout/WorkspaceSurface";

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
      <WorkspaceSurface>
        <Suspense fallback={<WorkspaceFallback label="workspace" />}>
          {location.pathname === "/logistics/deliveries" ? <DeliveriesTab /> : null}
          {location.pathname === "/logistics/routes" ? <RouteBuilder /> : null}
          {location.pathname === "/logistics/proofs" ? <DeliveryProofBoard /> : null}
        </Suspense>
      </WorkspaceSurface>
    </AppShell>
  );
}
