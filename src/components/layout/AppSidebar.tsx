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
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-3">
        <div className="flex items-center gap-2 px-1">
          <div className="h-7 w-7 rounded-md bg-primary flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-primary-foreground">R</span>
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold text-foreground tracking-tight">{APP_NAME}</span>
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
                        className="flex items-center gap-2.5 text-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-md px-2.5 py-1.5 transition-colors"
                        activeClassName="bg-sidebar-accent text-sidebar-foreground font-medium"
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
                  className="w-full justify-start gap-2 text-muted-foreground font-normal h-8 text-xs"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Search</span>
                  <kbd className="ml-auto inline-flex h-4 items-center rounded border bg-muted px-1 text-[10px] font-medium text-muted-foreground">
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
              <Badge variant="outline" className="w-full justify-center text-[10px] border-destructive/30 text-destructive">
                Superadmin
              </Badge>
            )}
            <p className="text-[11px] text-muted-foreground truncate px-1">
              {user?.email}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="w-full justify-start gap-2 text-muted-foreground h-8 text-xs"
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
            className="h-8 w-8 text-muted-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
          </Button>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
