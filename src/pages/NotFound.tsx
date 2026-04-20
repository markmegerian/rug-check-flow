import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { logger } from "@/lib/logger";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    logger.warn("route_not_found", { path: location.pathname });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <p className="text-5xl font-bold text-foreground">404</p>
        <p className="text-sm text-muted-foreground">This page doesn&apos;t exist.</p>
        <a href="/" className="inline-block text-sm text-primary hover:underline">
          Back to home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
