import { useState, useCallback, useEffect } from "react";
import { PendingRugsPanel } from "./PendingRugsPanel";
import { CheckInForm } from "./CheckInForm";
import { MOCK_PENDING_RUGS, type PendingRug } from "@/data/mock-pending-rugs";

let walkInCounter = 100;

export function CheckInLayout() {
  const [pendingRugs, setPendingRugs] = useState<PendingRug[]>(MOCK_PENDING_RUGS);
  const [selectedRugId, setSelectedRugId] = useState<string | null>(null);

  const selectedRug = pendingRugs.find((r) => r.id === selectedRugId) ?? null;

  const handleSelectRug = useCallback((id: string) => {
    setSelectedRugId(id);
  }, []);

  const handleCheckInComplete = useCallback((rugId: string) => {
    setPendingRugs((prev) => prev.filter((r) => r.id !== rugId));
    setSelectedRugId(null);
  }, []);

  const handleAddWalkIn = useCallback((clientName: string, rugNumber: string) => {
    const id = `walkin-${++walkInCounter}`;
    const newRug: PendingRug = {
      id,
      rugNumber,
      clientName,
      requestedServices: [],
      source: "walkin",
    };
    setPendingRugs((prev) => [...prev, newRug]);
    setSelectedRugId(id);
  }, []);

  return (
    <div className="h-full grid grid-cols-[280px_1fr_260px] max-lg:grid-cols-[240px_1fr] max-md:grid-cols-1">
      {/* Left Panel */}
      <PendingRugsPanel
        rugs={pendingRugs}
        selectedRugId={selectedRugId}
        onSelectRug={handleSelectRug}
        onAddWalkIn={handleAddWalkIn}
      />

      {/* Center Panel */}
      <CheckInForm
        selectedRug={selectedRug}
        onCheckInComplete={handleCheckInComplete}
      />

      {/* Right Panel */}
      <div className="hidden lg:flex flex-col items-center justify-center border-l border-border bg-muted/20 text-muted-foreground text-sm">
        Order Summary — coming soon
      </div>
    </div>
  );
}
