import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalRoute } from "@/components/PortalRoute";
import { LoadingState } from "@/components/states/PageState";
import { AppErrorBoundary } from "@/components/states/AppErrorBoundary";

const queryClient = new QueryClient();
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
    <LoadingState className="w-full max-w-sm" title="Loading workspace" description="Preparing your dashboard..." />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <AppErrorBoundary>
        <TooltipProvider>
          <Toaster />
          <Sonner />
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
                    <PortalRoute>
                      <WholesalePortal />
                    </PortalRoute>
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
      </AppErrorBoundary>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
