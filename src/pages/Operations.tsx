import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
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
const CheckInLayout = lazy(() => import("@/components/facility/CheckInLayout").then((m) => ({ default: m.CheckInLayout })));
const ProductionBoard = lazy(() => import("@/components/facility/ProductionBoard").then((m) => ({ default: m.ProductionBoard })));
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
const RugSearchDialog = lazy(() => import("@/components/facility/RugSearchDialog").then((m) => ({ default: m.RugSearchDialog })));
const RugDetailSheet = lazy(() => import("@/components/facility/RugDetailSheet").then((m) => ({ default: m.RugDetailSheet })));
const WorkspaceStatusBar = lazy(() => import("@/components/layout/WorkspaceStatusBar").then((m) => ({ default: m.WorkspaceStatusBar })));
const ClientPricingDialog = lazy(() => import("@/components/pricing/ClientPricingDialog").then((m) => ({ default: m.ClientPricingDialog })));
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceTabs, type WorkspaceTabGroup } from "@/components/layout/WorkspaceTabs";
import { useAuth } from "@/contexts/AuthContext";

const FLOOR_TABS = [
  { id: "checkin", label: "Check-In", icon: ClipboardCheck },
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
  const { hasRole, isSuperAdmin } = useAuth();
  const canManagePricing = hasRole("admin");
  const isOffice = hasRole("admin") || hasRole("office");

  const businessTabs = useMemo(
    () => (canManagePricing ? [PRICING_TAB, ...BUSINESS_TABS_BASE] : [...BUSINESS_TABS_BASE]),
    [canManagePricing],
  );

  const groups = useMemo(() => {
    const g: WorkspaceTabGroup<TabId>[] = [{ label: "Floor", tabs: FLOOR_TABS }];
    if (isOffice) {
      g.push({ label: "Business", tabs: businessTabs });
    }
    return g;
  }, [isOffice, businessTabs]);

  const allTabIds = useMemo(
    () => new Set<string>(groups.flatMap((g) => g.tabs.map((t) => t.id))),
    [groups],
  );

  const defaultTab: TabId = "checkin";

  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const requestedThreadId = searchParams.get("threadId");
  const initialTab: TabId =
    requestedTab && allTabIds.has(requestedTab) ? (requestedTab as TabId) : defaultTab;
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const [searchOpen, setSearchOpen] = useState(false);
  const [detailRugId, setDetailRugId] = useState<string | null>(null);
  const [deferChrome, setDeferChrome] = useState(false);
  const handleRugSelect = useCallback((rugId: string) => setDetailRugId(rugId), []);

  const handleTabChange = (nextTab: TabId) => {
    setActiveTab(nextTab);
    const next = new URLSearchParams(searchParams);
    next.set("tab", nextTab);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (requestedTab && allTabIds.has(requestedTab)) {
      setActiveTab((cur) => (cur === requestedTab ? cur : (requestedTab as TabId)));
    }
  }, [requestedTab, allTabIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(() => setDeferChrome(true), { timeout: 1500 });
      return () => window.cancelIdleCallback(id);
    }
    const timeoutId = window.setTimeout(() => setDeferChrome(true), 400);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const activeLabel = useMemo(() => {
    for (const g of groups) {
      const found = g.tabs.find((t) => t.id === activeTab);
      if (found) return found.label;
    }
    return "";
  }, [groups, activeTab]);

  return (
    <AppShell
      title="Operations"
      subtitle={activeLabel}
      contentClassName="overflow-hidden flex flex-col"
      statusBar={deferChrome ? (
        <Suspense fallback={null}>
          <WorkspaceStatusBar />
        </Suspense>
      ) : null}
      onSearchOpen={() => setSearchOpen(true)}
      actions={isOffice && deferChrome ? (
        <Suspense fallback={null}>
          <ClientPricingDialog triggerLabel="Price Lookup" />
        </Suspense>
      ) : undefined}
    >
      {isSuperAdmin ? (
        <WorkspaceTabs
          tabs={[]}
          groups={groups}
          activeTab={activeTab}
          onTabChange={(tabId) => handleTabChange(tabId as TabId)}
        />
      ) : null}

      <div className="flex-1 min-h-0 min-w-0 overflow-hidden rounded-[1.25rem] md:rounded-t-[1.75rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,249,252,0.88))] shadow-[0_28px_70px_-42px_rgba(15,23,42,0.42)] backdrop-blur-md md:mx-4">
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading workspace…</div>}>
          {/* Floor tabs */}
          {activeTab === "checkin" && <CheckInLayout />}
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
