import { MOCK_AUDIT_LOG } from "@/data/mock-admin";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { format } from "date-fns";

export function AuditLogTab() {
  const entries = [...MOCK_AUDIT_LOG].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in-up">
      <h2 className="text-lg font-semibold">Audit Log</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-muted-foreground whitespace-nowrap">
                {format(entry.timestamp, "M/d h:mm a")}
              </TableCell>
              <TableCell className="font-medium">{entry.userName}</TableCell>
              <TableCell>{entry.action}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-sm text-muted-foreground">Read-only log. No actions.</p>
    </div>
  );
}
