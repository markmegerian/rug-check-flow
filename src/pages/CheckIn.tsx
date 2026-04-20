import { Suspense, lazy, useCallback, useState } from "react";
const CheckInLayout = lazy(() => import("@/components/facility/CheckInLayout").then((m) => ({ default: m.CheckInLayout })));
const RugSearchDialog = lazy(() => import("@/components/facility/RugSearchDialog").then((m) => ({ default: m.RugSearchDialog })));
const RugDetailSheet = lazy(() => import("@/components/facility/RugDetailSheet").then((m) => ({ default: m.RugDetailSheet })));
import { AppShell } from "@/components/layout/AppShell";
import { ClientPricingDialog } from "@/components/pricing/ClientPricingDialog";
import { useAuth } from "@/contexts/AuthContext";

export default function CheckInPage() {
  const { hasRole } = useAuth();
  const isOffice = hasRole("admin") || hasRole("office");
  const [searchOpen, setSearchOpen] = useState(false);
  const [detailRugId, setDetailRugId] = useState<string | null>(null);
  const handleRugSelect = useCallback((rugId: string) => setDetailRugId(rugId), []);

  return (
    <AppShell
      title="Check-In"
      subtitle="Fast intake"
      contentClassName="overflow-hidden flex flex-col"
      onSearchOpen={() => setSearchOpen(true)}
      actions={isOffice ? <ClientPricingDialog triggerLabel="Price Lookup" /> : undefined}
    >
      <div className="app-hero flex-1 min-h-0 min-w-0 overflow-hidden md:mx-4 md:mt-4 md:h-[calc(100vh-11.5rem)]">
        <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading check-in…</div>}>
          <CheckInLayout />
        </Suspense>
      </div>

      {searchOpen ? (
        <Suspense fallback={null}>
          <RugSearchDialog open={searchOpen} onOpenChange={setSearchOpen} onSelectRug={handleRugSelect} />
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
