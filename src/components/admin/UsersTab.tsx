import { useState } from "react";
import { AdminUser, MOCK_ADMIN_USERS, ROLE_DEFINITIONS } from "@/data/mock-admin";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus } from "lucide-react";

export function UsersTab() {
  const [users, setUsers] = useState<AdminUser[]>(MOCK_ADMIN_USERS);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  const sheetOpen = editingUser !== null || isCreating;

  const blankUser: AdminUser = { id: "", name: "", email: "", role: "checkin_staff", status: "invited" };
  const formUser = editingUser ?? blankUser;

  const [formState, setFormState] = useState<AdminUser>(formUser);

  const openEdit = (user: AdminUser) => {
    setEditingUser(user);
    setIsCreating(false);
    setFormState({ ...user });
  };

  const openCreate = () => {
    setIsCreating(true);
    setEditingUser(null);
    setFormState({ ...blankUser, id: `u-${Date.now()}` });
  };

  const closeSheet = () => {
    setEditingUser(null);
    setIsCreating(false);
  };

  const save = () => {
    if (isCreating) {
      setUsers((prev) => [...prev, formState]);
      toast({ title: "User added", description: `${formState.name} has been invited.` });
    } else {
      setUsers((prev) => prev.map((u) => (u.id === formState.id ? formState : u)));
      toast({ title: "User updated", description: `${formState.name} saved.` });
    }
    closeSheet();
  };

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add User
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} className="cursor-pointer" onClick={() => openEdit(user)}>
              <TableCell className="font-medium">{user.name}</TableCell>
              <TableCell className="text-muted-foreground">{user.email}</TableCell>
              <TableCell>
                <Badge variant="secondary">{user.role}</Badge>
              </TableCell>
              <TableCell>
                <Badge variant={user.status === "active" ? "default" : "outline"}>
                  {user.status === "active" ? "Active" : "Invited"}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Sheet open={sheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{isCreating ? "Add User" : "Edit User"}</SheetTitle>
            <SheetDescription>
              {isCreating ? "Invite a new user to the system." : "Update user details and role."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={formState.name} onChange={(e) => setFormState({ ...formState, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={formState.email} onChange={(e) => setFormState({ ...formState, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={formState.role} onValueChange={(v) => setFormState({ ...formState, role: v as AdminUser["role"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_DEFINITIONS.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!isCreating && (
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch
                  checked={formState.status === "active"}
                  onCheckedChange={(checked) => setFormState({ ...formState, status: checked ? "active" : "invited" })}
                />
              </div>
            )}
            <Button className="w-full mt-4" onClick={save} disabled={!formState.name || !formState.email}>
              {isCreating ? "Add User" : "Save Changes"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
