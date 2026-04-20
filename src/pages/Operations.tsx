import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ClipboardCheck,
  Factory,
  Truck,
  Package,
  DollarSign,
  FileText,
  Users,
  Camera,
  Map,
  Receipt,
  FolderOpen,
  Inbox,
} from "lucide-react";
const InvoiceGeneratorPanel = lazy(() => import("@/components/facility/InvoiceGeneratorPanel").then((m) => ({ default: m.InvoiceGeneratorPanel })));
const DeliveryPrepTab = lazy(() => import("@/components/facility/DeliveryPrepTab").then((m) => ({ default: m.DeliveryPrepTab })));
const PricingTab = lazy(() => import("@/components/office/PricingTab").then((m) => ({ default: m.PricingTab })));
const InvoicesTab = lazy(() => import("@/components/office/InvoicesTab").then((m) => ({ default: m.InvoicesTab })));
const ClientsTab = lazy(() => import("@/components/office/ClientsTab").then((m) => ({ default: m.ClientsTab })));
const DeliveriesTab = lazy(() => import("@/components/office/DeliveriesTab").then((m) => ({ default: m.DeliveriesTab })));
const DeliveryProofBoard = lazy(() => import("@/components/office/DeliveryProofBoard").then((m) => ({ default: m.DeliveryProofBoard })));
const JobsTab = lazy(() => import("@/components/office/JobsTab").then((m) => ({ default: m.JobsTab })));
const RouteBuilder = lazy(() => import("@/components/office/RouteBuilder").then((m) => ({ default: m.RouteBuilder })));
const EstimatesTab = lazy(() => import("@/components/office/EstimatesTab").then((m) => ({ default: m.EstimatesTab })));
const InboxTab = lazy(() => import("@/components/office/InboxTab").then((m) => ({ default: m.InboxTab })));
const ProductionBoard = lazy(() => import("@/components/facility/ProductionBoard").then((m) => ({ default: m.ProductionBoard })));
const RugSearchDialog = lazy(() => import("@/components/facility/RugSearchDialog").then((m) => ({ default: m.RugSearchDialog })));
const RugDetailSheet = lazy(() => import("@/components/facility/RugDetailSheet").then((m) => ({ default: m.RugDetailSheet })));
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceStatusBar } from "@/components/layout/WorkspaceStatusBar";
import { ClientPricingDialog } from "@/components/pricing/ClientPricingDialog";
import { useAuth } from "@/contexts/AuthContext";

const FLOOR_TABS = [
  { id: "production", label: "Production", icon: Factory },
  { id: "delivery-prep", label: "Delivery Prep", icon: Package },
  { id: "invoice-generator", label: "Invoice", icon: Receipt },
] as const;

const BUSINESS_TABS_BASE = [
  { id: "accounts-receivable", label: "Accounts Receivable", icon: FileText },
  { id: "estimates", label: "Estimates", icon: ClipboardCheck },
  { id: "clients", label: "Clients", icon: Users },
  { id: "jobs", label: "Jobs", icon: FolderOpen },
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "deliveries", label: "Deliveries", icon: Truck },
  { id: "routes", label: "Routes", icon: Map },
  { id: "proofs", label: "Proofs", icon: Camera },
] as const;

const PRICING_TAB = { id: "pricing", label: "Pricing", icon: DollarSign } as const;

type FloorTabId = (typeof FLOOR_TABS)[number]["id"];
type BusinessTabId = "pricing" | (typeof BUSINESS_TABS_BASE)[number]["id"];
type TabId = FloorTabId | BusinessTabId;

export default function Operations() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const canManagePricing = hasRole("admin");
  const isOffice = hasRole("admin") || hasRole("office");

  const businessTabs = useMemo(
    () => (canManagePricing ? [PRICING_TAB, ...BUSINESS_TABS_BASE] : [...BUSINESS_TABS_BASE]),
    [canManagePricing],
  );

  const availableTabs = useMemo(
    () => [...FLOOR_TABS, ...(isOffice ? businessTabs : [])],
    [businessTabs, isOffice],
  );

  const allTabIds = useMemo(
    () => new Set<string>(availableTabs.map((tab) => tab.id)),
    [availableTabs],
  );

  const defaultTab: TabId = "production";

  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedThreadId = searchParams.get("threadId");
  const initialTab: TabId =
    requestedTab && allTabIds.has(requestedTab) ? (requestedTab as TabId) : defaultTab;
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const [searchOpen, setSearchOpen] = useState(false);
  const [detailRugId, setDetailRugId] = useState<string | null>(null);
  const handleRugSelect = useCallback((rugId: string) => setDetailRugId(rugId), []);

  useEffect(() => {
    if (requestedTab === "checkin") {
      navigate("/checkin", { replace: true });
      return;
    }
    if (requestedTab && allTabIds.has(requestedTab)) {
      setActiveTab((cur) => (cur === requestedTab ? cur : (requestedTab as TabId)));
    }
  }, [requestedTab, allTabIds, navigate]);

  const activeLabel = useMemo(
    () => availableTabs.find((tab) => tab.id === activeTab)?.label ?? "",
    [availableTabs, activeTab],
  );

  const showStatusBar = true;

  return (
    <AppShell
      title="Operations"
      subtitle={activeLabel}
      contentClassName="overflow-hidden flex flex-col"
      statusBar={showStatusBar ? <WorkspaceStatusBar /> : undefined}
      onSearchOpen={() => setSearchOpen(true)}
      actions={isOffice ? <ClientPricingDialog triggerLabel="Price Lookup" /> : undefined}
    >
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden rounded-[1.25rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,249,252,0.88))] shadow-[0_28px_70px_-42px_rgba(15,23,42,0.42)] backdrop-blur-md md:mx-4 md:mt-4">
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading workspace…</div>}>
          {/* Floor tabs */}
          {activeTab === "production" && <ProductionBoard />}
          {activeTab === "delivery-prep" && <DeliveryPrepTab />}
          {activeTab === "invoice-generator" && <InvoiceGeneratorPanel />}

          {/* Business tabs */}
          {activeTab === "pricing" && canManagePricing && <PricingTab />}
          {activeTab === "accounts-receivable" && <InvoicesTab />}
          {activeTab === "estimates" && <EstimatesTab />}
          {activeTab === "clients" && <ClientsTab />}
          {activeTab === "jobs" && <JobsTab onOpenRug={handleRugSelect} />}
          {activeTab === "inbox" && <InboxTab requestedThreadId={requestedThreadId} />}
          {activeTab === "deliveries" && <DeliveriesTab />}
          {activeTab === "routes" && <RouteBuilder />}
          {activeTab === "proofs" && <DeliveryProofBoard />}
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
