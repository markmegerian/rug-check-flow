import { Suspense, lazy } from "react";

const CheckInLayout = lazy(() => import("@/components/facility/CheckInLayout").then((m) => ({ default: m.CheckInLayout })));

export default function CheckInPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(80,132,255,0.12),transparent_42%),linear-gradient(180deg,rgba(247,250,255,0.98),rgba(241,246,255,0.96))]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-5">
        <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden rounded-[1.9rem] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(244,248,255,0.86))] shadow-[0_32px_80px_-44px_rgba(30,51,110,0.3)]">
          <Suspense fallback={<div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">Loading check-in…</div>}>
            <CheckInLayout />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
