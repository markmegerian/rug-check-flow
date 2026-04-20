import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { LoadingState } from "@/components/states/PageState";

interface PortalRouteProps {
  children: ReactNode;
}

export function PortalRoute({ children }: PortalRouteProps) {
  const { user, roles, isPortalUser, loading, mustChangePassword } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingState className="w-full max-w-sm" title="Checking your session" description="One moment…" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (mustChangePassword) return <Navigate to="/auth/reset-password" replace />;
  if (isPortalUser || roles.length > 0) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Portal access unavailable</h2>
        <p className="text-sm text-muted-foreground">
          Your account is not linked to an active wholesale portal login.
        </p>
      </div>
    </div>
  );
}
