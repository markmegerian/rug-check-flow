import { useCallback, useEffect, useState } from "react";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";

type AuditEntry = Tables<"audit_log">;

export function AuditLogTab() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAuditLog = useCallback(async () => {
    const { data, error } = await supabase
      .from("audit_log")
      .select("id, created_at, user_name, action, user_id")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      toast({ title: "Failed to load audit log", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    setEntries(data ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchAuditLog();
  }, [fetchAuditLog]);

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
          {!loading && entries.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                No audit entries found.
              </TableCell>
            </TableRow>
          )}
          {entries.map((entry) => (
            <TableRow key={entry.id}>
              <TableCell className="text-muted-foreground whitespace-nowrap">
                {format(new Date(entry.created_at), "M/d h:mm a")}
              </TableCell>
              <TableCell className="font-medium">{entry.user_name}</TableCell>
              <TableCell>{entry.action}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-sm text-muted-foreground">
        {loading ? "Loading audit log..." : "Read-only log. No actions."}
      </p>
    </div>
  );
}
