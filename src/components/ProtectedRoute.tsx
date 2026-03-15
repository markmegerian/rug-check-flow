import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

type AppRole = "admin" | "office" | "checkin_staff" | "driver";

interface Props {
  children: React.ReactNode;
  allowedRoles?: AppRole[];
}

export function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, roles, loading, isPortalUser, mustChangePassword } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (mustChangePassword) return <Navigate to="/auth/reset-password" replace />;

  if (!allowedRoles || allowedRoles.length === 0) {
    if (roles.length > 0) return <>{children}</>;
    if (isPortalUser) return <Navigate to="/portal" replace />;
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
          <p className="text-sm text-muted-foreground">
            Your account is not assigned to an internal workspace.
          </p>
        </div>
      </div>
    );
  }

  // Check if user has at least one of the allowed roles
  const hasAccess = allowedRoles.some((r) => roles.includes(r));

  if (!hasAccess && isPortalUser) {
    return <Navigate to="/portal" replace />;
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
          <p className="text-sm text-muted-foreground">
            You don't have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
