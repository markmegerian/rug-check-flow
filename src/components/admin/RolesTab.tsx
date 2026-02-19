import { ROLE_DEFINITIONS, type AdminUser } from "@/data/mock-admin";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface RolesTabProps {
  users: AdminUser[];
}

export function RolesTab({ users }: RolesTabProps) {
  const countByRole = (role: string) => users.filter((u) => u.role === role).length;

  return (
    <div className="p-4 md:p-6 space-y-4">
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
              <TableCell className="text-right font-medium">{countByRole(role.id)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-sm text-muted-foreground">Read-only — roles are predefined.</p>
    </div>
  );
}
