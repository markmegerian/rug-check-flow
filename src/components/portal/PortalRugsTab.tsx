import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PORTAL_RUGS, PortalStatus } from "@/data/mock-portal";
import { ChevronDown, ChevronRight } from "lucide-react";

const STATUS_LABELS: Record<PortalStatus, string> = {
  in_progress: "In Progress",
  ready: "Ready",
  delivered: "Delivered",
};

const STATUS_VARIANTS: Record<PortalStatus, "default" | "secondary" | "outline"> = {
  in_progress: "default",
  ready: "secondary",
  delivered: "outline",
};

type Filter = "all" | PortalStatus;

export default function PortalRugsTab() {
  const [filter, setFilter] = useState<Filter>("all");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const rugs = PORTAL_RUGS;
  const counts = {
    total: rugs.length,
    in_progress: rugs.filter((r) => r.status === "in_progress").length,
    ready: rugs.filter((r) => r.status === "ready").length,
    delivered: rugs.filter((r) => r.status === "delivered").length,
  };

  const filtered = filter === "all" ? rugs : rugs.filter((r) => r.status === filter);

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "in_progress", label: "In Progress" },
    { key: "ready", label: "Ready" },
    { key: "delivered", label: "Delivered" },
  ];

  return (
    <div className="space-y-4">
      {/* Summary pills */}
      <div className="flex flex-wrap gap-2">
        <div className="rounded-md bg-muted px-3 py-1.5 text-sm font-medium">{counts.total} Total</div>
        <div className="rounded-md bg-primary/10 text-primary px-3 py-1.5 text-sm font-medium">{counts.in_progress} In Progress</div>
        <div className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium">{counts.ready} Ready</div>
        <div className="rounded-md bg-muted px-3 py-1.5 text-sm font-medium">{counts.delivered} Delivered</div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              filter === f.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Rug table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Rug #</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Services</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((rug) => {
            const isExpanded = expandedRow === rug.id;
            return (
              <>
                <TableRow
                  key={rug.id}
                  className="cursor-pointer"
                  onClick={() => setExpandedRow(isExpanded ? null : rug.id)}
                >
                  <TableCell className="w-8 pr-0">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </TableCell>
                  <TableCell className="font-medium">{rug.rugNumber}</TableCell>
                  <TableCell>{rug.rugType}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{rug.services.join(", ")}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANTS[rug.status]}>{STATUS_LABELS[rug.status]}</Badge>
                  </TableCell>
                  <TableCell>{new Date(rug.checkedInDate).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow key={`${rug.id}-detail`}>
                    <TableCell colSpan={6} className="bg-muted/30">
                      <div className="py-2 pl-8 space-y-1 text-sm">
                        <p><span className="text-muted-foreground">Size:</span> {rug.length}' × {rug.width}'</p>
                        <p><span className="text-muted-foreground">Services:</span> {rug.services.join(", ")}</p>
                        <p><span className="text-muted-foreground">Checked in:</span> {new Date(rug.checkedInDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
