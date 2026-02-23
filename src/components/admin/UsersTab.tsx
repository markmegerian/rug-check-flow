import { useCallback, useEffect, useMemo, useState } from "react";
import { ROLE_DEFINITIONS, type AppRole } from "@/lib/role-definitions";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Plus } from "lucide-react";
import { EmptyState, LoadingState } from "@/components/states/PageState";
type RoleFilter = AppRole | "all";

type AdminUserRow = {
  userId: string;
  name: string;
  email: string;
  role: AppRole;
  roleCount: number;
  status: "active";
};

type FormState = {
  userId: string;
  name: string;
  email: string;
  role: AppRole;
};

type CreateMode = "existing" | "new";
type ProvisionEmployeeResponse = {
  success?: boolean;
  user_id?: string;
  email?: string;
  role?: AppRole;
  reused_existing_user?: boolean;
  error?: string;
  details?: unknown;
};

const mapProvisioningErrorMessage = (message: string | undefined) => {
  if (!message) return "Unknown error";
  if (message.toLowerCase().includes("failed to send request to edge function")) {
    return "Edge function admin-provision-employee is not reachable. Deploy it in Supabase Functions and verify project URL/keys for this environment.";
  }
  return message;
};

const ROLE_PRIORITY: AppRole[] = ["admin", "office", "checkin_staff", "driver"];
const EMPTY_FORM: FormState = {
  userId: "",
  name: "",
  email: "",
  role: "checkin_staff",
};

export function UsersTab() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUserRow | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("existing");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [formState, setFormState] = useState<FormState>(EMPTY_FORM);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const fetchUsers = useCallback(async () => {
    const { data: roleRows, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id, role");

    if (rolesError) {
      toast({ title: "Failed to load users", description: rolesError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const rolesByUser = new Map<string, AppRole[]>();
    for (const row of roleRows ?? []) {
      const current = rolesByUser.get(row.user_id) ?? [];
      current.push(row.role);
      rolesByUser.set(row.user_id, current);
    }

    const userIds = [...rolesByUser.keys()];
    const { data: profileRows, error: profilesError } = userIds.length
      ? await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", userIds)
      : { data: [], error: null };

    if (profilesError) {
      toast({ title: "Failed to load profiles", description: profilesError.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const profileByUserId = new Map((profileRows ?? []).map((profile) => [profile.user_id, profile]));
    const merged: AdminUserRow[] = userIds
      .map((userId) => {
        const assignedRoles = rolesByUser.get(userId) ?? [];
        const primaryRole =
          ROLE_PRIORITY.find((role) => assignedRoles.includes(role)) ?? assignedRoles[0];
        if (!primaryRole) return null;

        const profile = profileByUserId.get(userId);
        return {
          userId,
          name: profile?.full_name?.trim() || "Unknown user",
          email: profile?.email || "",
          role: primaryRole,
          roleCount: assignedRoles.length,
          status: "active",
        };
      })
      .filter((user): user is AdminUserRow => user !== null)
      .sort((a, b) => a.name.localeCompare(b.name));

    setUsers(merged);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const sheetOpen = editingUser !== null || isCreating;

  const openEdit = (user: AdminUserRow) => {
    setEditingUser(user);
    setIsCreating(false);
    setFormState({
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  };

  const openCreate = () => {
    setIsCreating(true);
    setEditingUser(null);
    setCreateMode("existing");
    setTemporaryPassword("");
    setFormState(EMPTY_FORM);
  };

  const closeSheet = () => {
    setEditingUser(null);
    setIsCreating(false);
    setCreateMode("existing");
    setTemporaryPassword("");
    setFormState(EMPTY_FORM);
  };

  const roleOptions = useMemo(() => ROLE_DEFINITIONS.map((role) => role.id as AppRole), []);
  const filteredUsers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return users.filter((user) => {
      const matchesSearch =
        query.length === 0 ||
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [roleFilter, searchTerm, users]);

  const save = async () => {
    setSaving(true);

    if (isCreating) {
      const normalizedEmail = formState.email.trim().toLowerCase();
      if (!normalizedEmail) {
        toast({ title: "Email required", variant: "destructive" });
        setSaving(false);
        return;
      }

      if (createMode === "new") {
        if (!formState.name.trim()) {
          toast({ title: "Full name required", variant: "destructive" });
          setSaving(false);
          return;
        }
        if (temporaryPassword.trim().length < 8) {
          toast({
            title: "Temporary password too short",
            description: "Use at least 8 characters.",
            variant: "destructive",
          });
          setSaving(false);
          return;
        }

        const { data, error } = await supabase.functions.invoke<ProvisionEmployeeResponse>(
          "admin-provision-employee",
          {
            body: {
              email: normalizedEmail,
              full_name: formState.name.trim(),
              password: temporaryPassword.trim(),
              role: formState.role,
            },
          }
        );

        if (error || data?.error) {
          toast({
            title: "Employee provisioning failed",
            description: mapProvisioningErrorMessage(data?.error || error?.message),
            variant: "destructive",
          });
          setSaving(false);
          return;
        }

        toast({
          title: data?.reused_existing_user ? "Employee access updated" : "Employee account created",
          description: `${normalizedEmail} can now sign in as ${formState.role}.`,
        });
      } else {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .ilike("email", normalizedEmail)
          .maybeSingle();

        if (profileError) {
          toast({ title: "Lookup failed", description: profileError.message, variant: "destructive" });
          setSaving(false);
          return;
        }

        if (!profile?.user_id) {
          toast({
            title: "User not found",
            description: "Switch to “Create new employee account” to provision this employee now.",
            variant: "destructive",
          });
          setSaving(false);
          return;
        }

        await supabase.from("user_roles").delete().eq("user_id", profile.user_id);
        const { error: insertError } = await supabase
          .from("user_roles")
          .insert({ user_id: profile.user_id, role: formState.role });

        if (insertError) {
          toast({ title: "Role assignment failed", description: insertError.message, variant: "destructive" });
          setSaving(false);
          return;
        }

        toast({ title: "Role assigned", description: `${profile.email} is now ${formState.role}.` });
      }
    } else {
      if (!formState.userId) {
        toast({ title: "Missing user", variant: "destructive" });
        setSaving(false);
        return;
      }

      if (formState.userId === currentUser?.id && formState.role !== "admin") {
        toast({
          title: "Action blocked",
          description: "You cannot remove your own admin role from this screen.",
          variant: "destructive",
        });
        setSaving(false);
        return;
      }

      await supabase.from("user_roles").delete().eq("user_id", formState.userId);
      const { error: insertError } = await supabase
        .from("user_roles")
        .insert({ user_id: formState.userId, role: formState.role });

      if (insertError) {
        toast({ title: "Role update failed", description: insertError.message, variant: "destructive" });
        setSaving(false);
        return;
      }

      toast({ title: "User updated", description: `${formState.name} is now ${formState.role}.` });
    }

    await fetchUsers();
    setSaving(false);
    closeSheet();
  };

  return (
    <div className="p-4 md:p-6 space-y-4 animate-fade-in-up">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Users</h2>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Add Employee
        </Button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search by name or email"
          className="md:max-w-sm"
        />
        <Select value={roleFilter} onValueChange={(value) => setRoleFilter(value as RoleFilter)}>
          <SelectTrigger className="md:w-[180px]">
            <SelectValue placeholder="Filter role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roleOptions.map((role) => (
              <SelectItem key={`filter-${role}`} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground md:ml-auto">
          {filteredUsers.length} of {users.length} shown
        </p>
      </div>

      {loading ? (
        <LoadingState title="Loading users" description="Fetching role assignments and profile details..." />
      ) : users.length === 0 ? (
        <EmptyState
          title="No role assignments found"
          description="Add an employee account or assign a role to an existing user."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Add Employee
            </Button>
          }
        />
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          title="No users match these filters"
          description="Try adjusting search text or role filter."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchTerm("");
                setRoleFilter("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden sm:table-cell">Assignments</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.userId} className="cursor-pointer" onClick={() => openEdit(user)}>
                <TableCell className="font-medium">{user.name}</TableCell>
                <TableCell className="text-muted-foreground">{user.email || "—"}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{user.role}</Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{user.roleCount}</TableCell>
                <TableCell>
                  <Badge variant="default">Active</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Sheet open={sheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{isCreating ? "Employee Access" : "Edit Role"}</SheetTitle>
            <SheetDescription>
              {isCreating
                ? "Create a new employee account or assign a role to an existing user."
                : "Update role assignment for this user."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            {isCreating ? (
              <>
                <div className="space-y-2">
                  <Label>Access Setup</Label>
                  <Select
                    value={createMode}
                    onValueChange={(value) => {
                      setCreateMode(value as CreateMode);
                      setTemporaryPassword("");
                      setFormState((prev) => ({ ...prev, name: "", email: "" }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="existing">Assign role to existing user</SelectItem>
                      <SelectItem value="new">Create new employee account</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="user@company.com"
                    value={formState.email}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, email: e.target.value }))
                    }
                  />
                </div>
                {createMode === "new" ? (
                  <>
                    <div className="space-y-2">
                      <Label>Full Name</Label>
                      <Input
                        placeholder="Employee name"
                        value={formState.name}
                        onChange={(e) =>
                          setFormState((prev) => ({ ...prev, name: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Temporary Password</Label>
                      <Input
                        type="password"
                        placeholder="Minimum 8 characters"
                        value={temporaryPassword}
                        onChange={(e) => setTemporaryPassword(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Requires the <code className="font-mono">admin-provision-employee</code> edge function to be
                      deployed in this Supabase project.
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Existing-user mode expects this email to have signed in previously.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <p className="text-sm">{formState.name}</p>
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <p className="text-sm text-muted-foreground">{formState.email || "—"}</p>
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label>Role</Label>
              <Select
                value={formState.role}
                onValueChange={(value) =>
                  setFormState((prev) => ({ ...prev, role: value as AppRole }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full mt-4"
              onClick={save}
              disabled={
                saving ||
                (isCreating &&
                  (!formState.email.trim() ||
                    (createMode === "new" && (!formState.name.trim() || !temporaryPassword.trim()))))
              }
            >
              {saving
                ? "Saving..."
                : isCreating
                  ? createMode === "new"
                    ? "Create Employee Account"
                    : "Assign Role"
                  : "Save Changes"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
