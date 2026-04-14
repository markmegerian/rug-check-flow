import { Suspense, lazy } from "react";
import { AppShell } from "@/components/layout/AppShell";

const CheckInLayout = lazy(() => import("@/components/facility/CheckInLayout").then((m) => ({ default: m.CheckInLayout })));

export default function CheckInWorkspace() {
  return (
    <AppShell
      title="Check-In"
      subtitle="Intake workspace"
      contentClassName="overflow-hidden flex flex-col"
    >
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden rounded-[1.25rem] md:rounded-t-[1.75rem] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,249,252,0.88))] shadow-[0_28px_70px_-42px_rgba(15,23,42,0.42)] backdrop-blur-md md:mx-4">
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading check-in…</div>}>
          <CheckInLayout />
        </Suspense>
      </div>
    </AppShell>
  );
}
