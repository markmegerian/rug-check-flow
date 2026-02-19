import { useState, useCallback } from "react";
import { PendingRugsPanel } from "./PendingRugsPanel";
import { CheckInForm } from "./CheckInForm";
import { CheckInLogPanel } from "./CheckInLogPanel";
import { MOCK_PENDING_RUGS, type PendingRug } from "@/data/mock-pending-rugs";
import {
  SEED_CHECK_IN_LOG,
  type CheckInEntry,
  type UserRole,
} from "@/data/check-in-log";
import { SERVICES } from "@/data/services";

let walkInCounter = 100;
let logIdCounter = 100;

export function CheckInLayout() {
  const [pendingRugs, setPendingRugs] = useState<PendingRug[]>(MOCK_PENDING_RUGS);
  const [selectedRugId, setSelectedRugId] = useState<string | null>(null);
  const [checkInLog, setCheckInLog] = useState<CheckInEntry[]>(SEED_CHECK_IN_LOG);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [userRole] = useState<UserRole>("checkin_staff");

  const selectedRug = pendingRugs.find((r) => r.id === selectedRugId) ?? null;
  const editingEntry = checkInLog.find((e) => e.id === editingEntryId) ?? null;

  const handleSelectRug = useCallback((id: string) => {
    setSelectedRugId(id);
    setEditingEntryId(null);
  }, []);

  const handleCheckInComplete = useCallback(
    (data: {
      rugId?: string;
      rugNumber: string;
      clientName: string;
      rugType: string;
      length: number;
      width: number;
      selectedServices: string[];
      totalPrice: number;
    }) => {
      const sqft = data.length * data.width;

      const services = data.selectedServices.map((svcId) => {
        const svc = SERVICES.find((s) => s.id === svcId);
        const price = svc ? (svc.unit === "sqft" ? svc.basePrice * sqft : svc.basePrice) : 0;
        return {
          id: svcId,
          name: svc?.name ?? svcId,
          price,
        };
      });

      if (editingEntryId) {
        // Update existing log entry
        setCheckInLog((prev) =>
          prev.map((e) =>
            e.id === editingEntryId
              ? {
                  ...e,
                  rugNumber: data.rugNumber,
                  clientName: data.clientName,
                  rugType: data.rugType,
                  length: data.length,
                  width: data.width,
                  services,
                  totalPrice: data.totalPrice,
                }
              : e
          )
        );
        setEditingEntryId(null);
      } else {
        // New check-in → add to log
        const entry: CheckInEntry = {
          id: `log-${++logIdCounter}`,
          rugNumber: data.rugNumber,
          clientName: data.clientName,
          rugType: data.rugType,
          length: data.length,
          width: data.width,
          services,
          totalPrice: data.totalPrice,
          checkedInAt: new Date(),
          checkedInBy: "Staff",
        };
        setCheckInLog((prev) => [entry, ...prev]);

        // Remove from pending if it came from there
        if (data.rugId) {
          setPendingRugs((prev) => prev.filter((r) => r.id !== data.rugId));
        }
      }

      setSelectedRugId(null);
    },
    [editingEntryId]
  );

  const handleEditEntry = useCallback((entryId: string) => {
    setEditingEntryId(entryId);
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
    setEditingEntryId(null);
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
        editingEntry={editingEntry}
        onCheckInComplete={handleCheckInComplete}
      />

      {/* Right Panel */}
      <CheckInLogPanel
        entries={checkInLog}
        userRole={userRole}
        onEdit={handleEditEntry}
      />
    </div>
  );
}
