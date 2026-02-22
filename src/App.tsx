import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { DevAccountSwitcher } from "@/components/DevAccountSwitcher";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const queryClient = new QueryClient();
const devSwitcherEnabled = import.meta.env.VITE_ENABLE_DEV_SWITCHER === "true";
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const FacilityOps = lazy(() => import("./pages/FacilityOps"));
const FacilityOffice = lazy(() => import("./pages/FacilityOffice"));
const WholesalePortal = lazy(() => import("./pages/WholesalePortal"));
const DriverPortal = lazy(() => import("./pages/DriverPortal"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const NotFound = lazy(() => import("./pages/NotFound"));

const RouteLoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <p className="text-muted-foreground">Loading...</p>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {devSwitcherEnabled ? <DevAccountSwitcher /> : null}
        <Suspense fallback={<RouteLoadingFallback />}>
          <BrowserRouter>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/facility/ops"
                element={
                  <ProtectedRoute allowedRoles={["admin", "office", "checkin_staff"]}>
                    <FacilityOps />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/facility/office"
                element={
                  <ProtectedRoute allowedRoles={["admin", "office"]}>
                    <FacilityOffice />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/portal"
                element={
                  <ProtectedRoute>
                    <WholesalePortal />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/driver"
                element={
                  <ProtectedRoute allowedRoles={["admin", "driver"]}>
                    <DriverPortal />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={["admin"]}>
                    <AdminPanel />
                  </ProtectedRoute>
                }
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </Suspense>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
