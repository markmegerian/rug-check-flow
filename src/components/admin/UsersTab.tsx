import { useCallback, useEffect, useMemo, useState } from "react";
import { ROLE_DEFINITIONS } from "@/data/mock-admin";
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
import type { Tables } from "@/integrations/supabase/types";
import { Plus } from "lucide-react";
import { EmptyState, LoadingState } from "@/components/states/PageState";

type AppRole = Tables<"user_roles">["role"];

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
  const [formState, setFormState] = useState<FormState>(EMPTY_FORM);

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
    setFormState(EMPTY_FORM);
  };

  const closeSheet = () => {
    setEditingUser(null);
    setIsCreating(false);
    setFormState(EMPTY_FORM);
  };

  const roleOptions = useMemo(() => ROLE_DEFINITIONS.map((role) => role.id as AppRole), []);

  const save = async () => {
    setSaving(true);

    if (isCreating) {
      const normalizedEmail = formState.email.trim().toLowerCase();
      if (!normalizedEmail) {
        toast({ title: "Email required", variant: "destructive" });
        setSaving(false);
        return;
      }

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
          description: "This email must sign in once before role assignment.",
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
          <Plus className="h-4 w-4 mr-1" /> Assign Role
        </Button>
      </div>

      {loading ? (
        <LoadingState title="Loading users" description="Fetching role assignments and profile details..." />
      ) : users.length === 0 ? (
        <EmptyState
          title="No role assignments found"
          description="Assign a role to start granting workspace access."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Assign Role
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
            {users.map((user) => (
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
            <SheetTitle>{isCreating ? "Assign Role" : "Edit Role"}</SheetTitle>
            <SheetDescription>
              {isCreating
                ? "Assign a role to an existing user profile."
                : "Update role assignment for this user."}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 mt-6">
            {isCreating ? (
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
              disabled={saving || (isCreating && !formState.email.trim())}
            >
              {saving ? "Saving..." : isCreating ? "Assign Role" : "Save Changes"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
