import { Navigate, useSearchParams } from "react-router-dom";
import { LEGACY_PORTAL_TAB_REDIRECTS, type LegacyPortalTab } from "@/lib/navigation-domains";

export default function LegacyPortalRedirect() {
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") as LegacyPortalTab | null;
  const requestedThreadId = searchParams.get("threadId");
  const target = requestedTab ? LEGACY_PORTAL_TAB_REDIRECTS[requestedTab] : "/portal/rugs";

  if (!requestedThreadId || target !== "/portal/messages") {
    return <Navigate to={target} replace />;
  }

  const next = new URLSearchParams();
  next.set("threadId", requestedThreadId);
  return <Navigate to={`${target}?${next.toString()}`} replace />;
}
