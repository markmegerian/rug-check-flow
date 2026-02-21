import { useCallback, useEffect, useMemo, useState } from "react";
import { ROLE_DEFINITIONS } from "@/data/mock-admin";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";

type AppRole = Tables<"user_roles">["role"];

export function RolesTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<AppRole, number>>({
    admin: 0,
    office: 0,
    checkin_staff: 0,
    driver: 0,
  });

  const fetchCounts = useCallback(async () => {
    const { data, error } = await supabase.from("user_roles").select("role");
    if (error) {
      toast({ title: "Failed to load role counts", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const next: Record<AppRole, number> = {
      admin: 0,
      office: 0,
      checkin_staff: 0,
      driver: 0,
    };

    for (const row of data ?? []) {
      next[row.role] += 1;
    }

    setCounts(next);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  const totalUsers = useMemo(
    () => Object.values(counts).reduce((sum, count) => sum + count, 0),
    [counts]
  );

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in-up">
      <h2 className="text-lg font-semibold">Roles</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Role</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Users</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ROLE_DEFINITIONS.map((role) => (
            <TableRow key={role.id}>
              <TableCell>
                <Badge variant="secondary">{role.name}</Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">{role.description}</TableCell>
              <TableCell className="text-right font-medium">{counts[role.id as AppRole] ?? 0}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-sm text-muted-foreground">
        {loading ? "Loading role distribution..." : `Read-only role definitions. ${totalUsers} total assignments.`}
      </p>
    </div>
  );
}
