import { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceStatusBar } from "@/components/layout/WorkspaceStatusBar";
import { WorkspaceFallback, WorkspaceSurface } from "@/components/layout/WorkspaceSurface";

const InvoicesTab = lazy(() => import("@/components/office/InvoicesTab").then((m) => ({ default: m.InvoicesTab })));

const FINANCE_TITLES: Record<string, string> = {
  "/finance/invoices": "Invoice management",
  "/finance/payments": "Payments",
  "/finance/credits": "Credits",
  "/finance/collections": "Collections",
};

const FINANCE_SUBTITLES: Record<string, string> = {
  "/finance/invoices": "Search, review, and resolve invoice history",
  "/finance/payments": "Payment workflows will split into their own finance surface",
  "/finance/credits": "Credit memo workflows will split into their own finance surface",
  "/finance/collections": "Collections follow-up will split into its own finance surface",
};

function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
      {title} will move into its own dedicated finance surface.
    </div>
  );
}

export default function FinanceWorkspace() {
  const location = useLocation();
  const title = FINANCE_TITLES[location.pathname] ?? "Finance";
  const subtitle = FINANCE_SUBTITLES[location.pathname] ?? "Finance workflows";

  return (
    <AppShell
      title={title}
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
