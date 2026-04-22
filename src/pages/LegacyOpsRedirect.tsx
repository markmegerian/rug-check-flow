import { Navigate, useSearchParams } from "react-router-dom";
import { LEGACY_OPS_TAB_REDIRECTS, type LegacyOpsTab } from "@/lib/navigation-domains";

export default function LegacyOpsRedirect() {
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab") as LegacyOpsTab | null;
  const requestedThreadId = searchParams.get("threadId");
  const target = requestedTab ? LEGACY_OPS_TAB_REDIRECTS[requestedTab] : "/facility/production";

  if (!requestedThreadId || target !== "/portal/messages") {
    return <Navigate to={target} replace />;
  }

  const next = new URLSearchParams();
  next.set("threadId", requestedThreadId);
  return <Navigate to={`${target}?${next.toString()}`} replace />;
}
