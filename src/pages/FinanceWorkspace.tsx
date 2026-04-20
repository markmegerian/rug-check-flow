import { Suspense, lazy } from "react";
import { useLocation } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceStatusBar } from "@/components/layout/WorkspaceStatusBar";

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
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden rounded-[1.25rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,249,252,0.88))] shadow-[0_28px_70px_-42px_rgba(15,23,42,0.42)] backdrop-blur-md md:mx-4 md:mt-4">
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading workspace…</div>}>
          {location.pathname === "/finance/invoices" ? <InvoicesTab /> : null}
          {location.pathname === "/finance/payments" ? <Placeholder title="Payments" /> : null}
          {location.pathname === "/finance/credits" ? <Placeholder title="Credits" /> : null}
          {location.pathname === "/finance/collections" ? <Placeholder title="Collections" /> : null}
        </Suspense>
      </div>
    </AppShell>
  );
}
