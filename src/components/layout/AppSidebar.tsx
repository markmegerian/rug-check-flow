import { Link, useLocation } from "react-router-dom";
import {
  Camera,
  ClipboardCheck,
  DollarSign,
  Factory,
  FileText,
  FolderOpen,
  Home,
  Inbox,
  LogOut,
  Map,
  Package,
  Receipt,
  Search,
  ShieldCheck,
  Store,
  Truck,
  Users,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { APP_NAME } from "@/lib/branding";
import { cn } from "@/lib/utils";
import { isFacilityPath, isFinancePath, isLogisticsPath, isOfficePath, isPortalPath } from "@/lib/navigation-domains";

const SUPERADMIN_NAV_ITEMS = [
  { title: "Home", url: "/", icon: Home, active: (path: string) => path === "/" },
  { title: "Operations", url: "/ops", icon: Factory, active: (path: string) => path.startsWith("/ops") },
  { title: "Wholesale Portal", url: "/portal", icon: Store, active: (path: string) => path.startsWith("/portal") },
  { title: "Driver Portal", url: "/driver", icon: Truck, active: (path: string) => path.startsWith("/driver") },
  { title: "Mission Control", url: "/admin", icon: ShieldCheck, active: (path: string) => path.startsWith("/admin") },
] as const;

const CHECKIN_ITEM = { title: "Check-In", url: "/checkin", icon: ClipboardCheck } as const;

const FACILITY_ITEMS = [
  { title: "Check-In", url: "/checkin", icon: ClipboardCheck, active: (path: string) => path.startsWith("/checkin") },
  { title: "Production", url: "/facility/production", icon: Factory, active: (path: string) => path === "/facility/production" },
  { title: "Delivery Prep", url: "/facility/delivery-prep", icon: Package, active: (path: string) => path === "/facility/delivery-prep" },
  { title: "Invoice Generator", url: "/facility/invoices", icon: Receipt, active: (path: string) => path === "/facility/invoices" },
] as const;

const OFFICE_ITEMS = [
  { title: "Pricing", url: "/office/pricing", icon: DollarSign, active: (path: string) => path === "/office/pricing", adminOnly: true },
  { title: "Estimates", url: "/office/estimates", icon: ClipboardCheck, active: (path: string) => path === "/office/estimates" },
  { title: "Clients", url: "/office/clients", icon: Users, active: (path: string) => path === "/office/clients" },
  { title: "Jobs", url: "/office/jobs", icon: FolderOpen, active: (path: string) => path === "/office/jobs" },
  { title: "Inbox", url: "/office/inbox", icon: Inbox, active: (path: string) => path === "/office/inbox" },
] as const;

const LOGISTICS_ITEMS = [
  { title: "Deliveries", url: "/logistics/deliveries", icon: Truck, active: (path: string) => path === "/logistics/deliveries" },
  { title: "Routes", url: "/logistics/routes", icon: Map, active: (path: string) => path === "/logistics/routes" },
  { title: "Proofs", url: "/logistics/proofs", icon: Camera, active: (path: string) => path === "/logistics/proofs" },
] as const;

const FINANCE_ITEMS = [
  { title: "Invoices", url: "/finance/invoices", icon: FileText, active: (path: string) => path === "/finance/invoices" },
  { title: "Payments", url: "/finance/payments", icon: DollarSign, active: (path: string) => path === "/finance/payments" },
  { title: "Credits", url: "/finance/credits", icon: Receipt, active: (path: string) => path === "/finance/credits" },
  { title: "Collections", url: "/finance/collections", icon: Inbox, active: (path: string) => path === "/finance/collections" },
] as const;

const PORTAL_ITEMS = [
  { title: "Rugs", url: "/portal/rugs", icon: Package, active: (path: string) => path === "/portal/rugs" },
  { title: "Pickups", url: "/portal/pickups", icon: Truck, active: (path: string) => path === "/portal/pickups" },
  { title: "Estimates", url: "/portal/estimates", icon: ClipboardCheck, active: (path: string) => path === "/portal/estimates" },
  { title: "Invoices", url: "/portal/invoices", icon: Receipt, active: (path: string) => path === "/portal/invoices" },
  { title: "Messages", url: "/portal/messages", icon: Inbox, active: (path: string) => path === "/portal/messages" },
  { title: "Prices", url: "/portal/prices", icon: DollarSign, active: (path: string) => path === "/portal/prices" },
] as const;

export function AppSidebar({ onSearchOpen }: { onSearchOpen?: () => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, signOut, isSuperAdmin, isPortalUser, hasRole } = useAuth();

  const isOffice = hasRole("admin") || hasRole("office");
  const canManagePricing = hasRole("admin");

  const topLevelNavItems = isSuperAdmin
    ? SUPERADMIN_NAV_ITEMS.map((item) => ({
        title: item.title,
        url: item.url,
        icon: item.icon,
        active: item.active(location.pathname),
      }))
    : [];

  const contextualTabItems = (() => {
    if (isPortalPath(location.pathname) && isPortalUser) {
      return PORTAL_ITEMS.map((item) => ({
        title: item.title,
        url: item.url,
        icon: item.icon,
        active: item.active(location.pathname),
      }));
    }

    const items = [] as Array<{ title: string; url: string; icon: typeof Home; active: boolean }>;

    if (location.pathname.startsWith("/checkin") || isFacilityPath(location.pathname)) {
      items.push(...FACILITY_ITEMS.map((item) => ({
        title: item.title,
        url: item.url,
        icon: item.icon,
        active: item.active(location.pathname),
      })));
    }

    if (isOffice && isOfficePath(location.pathname)) {
      items.push(...OFFICE_ITEMS.filter((item) => !item.adminOnly || canManagePricing).map((item) => ({
        title: item.title,
        url: item.url,
        icon: item.icon,
        active: item.active(location.pathname),
      })));
    }

    if (isOffice && isLogisticsPath(location.pathname) && !location.pathname.startsWith("/driver")) {
      items.push(...LOGISTICS_ITEMS.map((item) => ({
        title: item.title,
        url: item.url,
        icon: item.icon,
        active: item.active(location.pathname),
      })));
    }

    if (isOffice && isFinancePath(location.pathname)) {
      items.push(...FINANCE_ITEMS.map((item) => ({
        title: item.title,
        url: item.url,
        icon: item.icon,
        active: item.active(location.pathname),
      })));
    }

    if (!items.length) {
      items.push(...FACILITY_ITEMS.map((item) => ({
        title: item.title,
        url: item.url,
        icon: item.icon,
        active: item.active(location.pathname),
      })));
    }

    return items;
  })();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/80 bg-[linear-gradient(180deg,rgba(24,31,54,0.98),rgba(17,23,42,0.98))] text-sidebar-foreground">
      <SidebarHeader className="p-3 space-y-3">
        <div className="flex items-center gap-2 px-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary shadow-[0_10px_25px_-18px_rgba(212,180,106,0.65)]">
            <span className="text-xs font-bold text-primary-foreground">R</span>
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">{APP_NAME}</span>
          )}
        </div>

        {onSearchOpen ? (
          <Button
            variant="outline"
            size={collapsed ? "icon" : "sm"}
            onClick={onSearchOpen}
            aria-label="Search rugs (Cmd+K)"
            className={cn(
              "border-sidebar-border/80 bg-sidebar-accent/40 text-sidebar-foreground/78 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              collapsed ? "h-9 w-9" : "h-9 w-full justify-start gap-2 text-xs font-normal"
            )}
          >
            <Search className="h-3.5 w-3.5" />
            {!collapsed ? (
              <>
                <span>Search</span>
                <kbd className="ml-auto inline-flex h-4 items-center rounded border border-sidebar-border/80 bg-sidebar-background/30 px-1 text-[10px] font-medium text-sidebar-foreground/60">
                  ⌘K
                </kbd>
              </>
            ) : null}
          </Button>
        ) : null}
      </SidebarHeader>

      <SidebarContent>
        {topLevelNavItems.length > 0 ? (
          <SidebarGroup>
            {!collapsed ? <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/45">Navigate</div> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {topLevelNavItems.map((item) => (
                  <SidebarMenuItem key={`top-${item.title}`}>
                    <SidebarMenuButton
                      asChild
                      isActive={item.active}
                      tooltip={collapsed ? item.title : undefined}
                    >
                      <Link
                        to={item.url}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-sidebar-foreground/72 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                          item.active && "bg-sidebar-accent text-sidebar-foreground font-medium shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}

        {contextualTabItems.length > 0 ? (
          <SidebarGroup>
            {!collapsed ? <div className="px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-sidebar-foreground/45">Workspace</div> : null}
            <SidebarGroupContent>
              <SidebarMenu>
                {contextualTabItems.map((item) => (
                  <SidebarMenuItem key={`ctx-${item.title}`}>
                    <SidebarMenuButton
                      asChild
                      isActive={item.active}
                      tooltip={collapsed ? item.title : undefined}
                    >
                      <Link
                        to={item.url}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-sidebar-foreground/72 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
                          item.active && "bg-sidebar-accent text-sidebar-foreground font-medium shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && (
          <div className="space-y-2">
            {isSuperAdmin && (
              <Badge variant="outline" className="w-full justify-center border-amber-200/20 bg-amber-300/10 text-[10px] text-amber-100">
                Mission Control
              </Badge>
            )}
            <p className="truncate px-1 text-[11px] text-sidebar-foreground/56">
              {user?.email}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="h-8 w-full justify-start gap-2 text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        )}
        {collapsed && (
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="h-8 w-8 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
