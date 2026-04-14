import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { OfflineQueueProvider } from "@/contexts/OfflineQueueContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { PortalRoute } from "@/components/PortalRoute";
import { LoadingState } from "@/components/states/PageState";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Prevent aggressive focus-triggered refetches that feel like a full page refresh
      // when users alt-tab back into the app.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Operations = lazy(() => import("./pages/Operations"));
const CheckInWorkspace = lazy(() => import("./pages/CheckInWorkspace"));
const WholesalePortal = lazy(() => import("./pages/WholesalePortal"));
const StopPortal = lazy(() => import("./pages/StopPortal"));
const AdminPanel = lazy(() => import("./pages/AdminPanel"));
const NotFound = lazy(() => import("./pages/NotFound"));

const RouteLoadingFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <LoadingState className="w-full max-w-sm" title="Loading workspace" description="Preparing your dashboard..." />
  </div>
);

const App = () => (
  <ErrorBoundary fallbackTitle="Application Error">
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Suspense fallback={<RouteLoadingFallback />}>
              <BrowserRouter>
                <Routes>
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/auth/reset-password" element={<ResetPassword />} />
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <ErrorBoundary fallbackTitle="Dashboard Error">
                          <Index />
                        </ErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/ops"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "office"]}>
                        <ErrorBoundary fallbackTitle="Operations Error">
                          <Operations />
                        </ErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/ops/checkin"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "office", "checkin_staff"]}>
                        <ErrorBoundary fallbackTitle="Check-In Error">
                          <CheckInWorkspace />
                        </ErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/portal"
                    element={
                      <PortalRoute>
                        <ErrorBoundary fallbackTitle="Portal Error">
                          <WholesalePortal />
                        </ErrorBoundary>
                      </PortalRoute>
                    }
                  />
                  <Route
                    path="/driver"
                    element={
                      <ProtectedRoute allowedRoles={["admin", "driver"]}>
                        <OfflineQueueProvider>
                          <ErrorBoundary fallbackTitle="Driver Portal Error">
                            <StopPortal />
                          </ErrorBoundary>
                        </OfflineQueueProvider>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute allowedRoles={["admin"]}>
                        <ErrorBoundary fallbackTitle="Admin Panel Error">
                          <AdminPanel />
                        </ErrorBoundary>
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
  </ErrorBoundary>
);

export default App;
