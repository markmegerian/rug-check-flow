import { useLocation } from "react-router-dom";
import {
  Home,
  Factory,
  Store,
  Truck,
  ShieldCheck,
  LogOut,
  Search,
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
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { APP_NAME } from "@/lib/branding";

const NAV_ITEMS = [
  { title: "Home", url: "/", icon: Home, end: true },
  { title: "Operations", url: "/ops", icon: Factory },
  { title: "Wholesale Portal", url: "/portal", icon: Store },
  { title: "Driver Portal", url: "/driver", icon: Truck },
  { title: "Admin", url: "/admin", icon: ShieldCheck },
];

export function AppSidebar({ onSearchOpen }: { onSearchOpen?: () => void }) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, signOut, isSuperAdmin } = useAuth();

  const isActive = (url: string, end?: boolean) =>
    end ? location.pathname === url : location.pathname.startsWith(url);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/80 bg-[linear-gradient(180deg,rgba(24,31,54,0.98),rgba(17,23,42,0.98))] text-sidebar-foreground">
      <SidebarHeader className="p-3">
        <div className="flex items-center gap-2 px-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sidebar-primary shadow-[0_10px_25px_-18px_rgba(212,180,106,0.65)]">
            <span className="text-xs font-bold text-primary-foreground">R</span>
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">{APP_NAME}</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => {
                const active = isActive(item.url, item.end);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={collapsed ? item.title : undefined}
                    >
                      <NavLink
                        to={item.url}
                        end={item.end}
                        className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-sidebar-foreground/72 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {onSearchOpen && !collapsed && (
          <>
            <SidebarSeparator />
            <SidebarGroup>
              <SidebarGroupContent>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSearchOpen}
                  aria-label="Search rugs (Cmd+K)"
                  className="h-9 w-full justify-start gap-2 border-sidebar-border/80 bg-sidebar-accent/40 text-sidebar-foreground/78 hover:bg-sidebar-accent hover:text-sidebar-foreground text-xs font-normal"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Search</span>
                  <kbd className="ml-auto inline-flex h-4 items-center rounded border border-sidebar-border/80 bg-sidebar-background/30 px-1 text-[10px] font-medium text-sidebar-foreground/60">
                    ⌘K
                  </kbd>
                </Button>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        )}
      </SidebarContent>

      <SidebarFooter className="p-3">
        {!collapsed && (
          <div className="space-y-2">
            {isSuperAdmin && (
              <Badge variant="outline" className="w-full justify-center border-amber-200/20 bg-amber-300/10 text-[10px] text-amber-100">
                Superadmin
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
