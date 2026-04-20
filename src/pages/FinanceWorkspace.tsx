import { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceStatusBar } from "@/components/layout/WorkspaceStatusBar";
import { WorkspaceFallback, WorkspaceSurface } from "@/components/layout/WorkspaceSurface";

const InvoicesTab = lazy(() => import("@/components/office/InvoicesTab").then((m) => ({ default: m.InvoicesTab })));

const FINANCE_TITLES: Record<string, string> = {
  "/finance/invoices": "Invoices",
  "/finance/payments": "Payments",
  "/finance/credits": "Credits",
  "/finance/collections": "Collections",
};

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
      {title} workspace is reserved for the finance split.
    </div>
  );
}

export default function FinanceWorkspace() {
  const location = useLocation();
  const subtitle = FINANCE_TITLES[location.pathname] ?? "Finance";

  return (
    <AppShell
      title="Finance"
      subtitle={subtitle}
      contentClassName="overflow-hidden flex flex-col"
      statusBar={<WorkspaceStatusBar />}
    >
      <WorkspaceSurface>
        <Suspense fallback={<WorkspaceFallback label="workspace" />}>
          {location.pathname === "/finance/invoices" ? <InvoicesTab /> : null}
          {location.pathname === "/finance/payments" ? <Placeholder title="Payments" /> : null}
          {location.pathname === "/finance/credits" ? <Placeholder title="Credits" /> : null}
          {location.pathname === "/finance/collections" ? <Placeholder title="Collections" /> : null}
        </Suspense>
      </WorkspaceSurface>
    </AppShell>
  );
}
