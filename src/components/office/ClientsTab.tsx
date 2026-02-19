import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { MOCK_CLIENTS, type Client, type PortalUser } from "@/data/mock-clients";

const TIER_LABELS: Record<Client["pricingTier"], string> = {
  standard: "Standard",
  preferred: "Preferred",
  vip: "VIP",
};

const TIER_COLORS: Record<Client["pricingTier"], string> = {
  standard: "bg-muted text-muted-foreground",
  preferred: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  vip: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

type FormData = {
  name: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  pricingTier: Client["pricingTier"];
};

const emptyForm: FormData = {
  name: "",
  contactName: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
  pricingTier: "standard",
};

export function ClientsTab() {
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([...MOCK_CLIENTS]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [newPortalEmail, setNewPortalEmail] = useState("");

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setPortalUsers([]);
    setNewPortalEmail("");
    setSheetOpen(true);
  };

  const openEdit = (c: Client) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      contactName: c.contactName,
      phone: c.phone,
      email: c.email,
      address: c.address,
      notes: c.notes,
      pricingTier: c.pricingTier,
    });
    setPortalUsers([...c.portalUsers]);
    setNewPortalEmail("");
    setSheetOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) return;
    if (editingId) {
      setClients((prev) =>
        prev.map((c) =>
          c.id === editingId ? { ...c, ...form, portalUsers } : c
        )
      );
    } else {
      setClients((prev) => [
        ...prev,
        {
          id: `client-${Date.now()}`,
          ...form,
          rugCount: 0,
          outstandingBalance: 0,
          portalUsers: [],
        },
      ]);
    }
    setSheetOpen(false);
  };

  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const addPortalUser = () => {
    const email = newPortalEmail.trim().toLowerCase();
    if (!email) return;
    if (portalUsers.some((u) => u.email === email)) {
      toast({ title: "Email already exists", variant: "destructive" });
      return;
    }
    setPortalUsers((prev) => [
      ...prev,
      { id: `pu-${Date.now()}`, email, status: "invited" },
    ]);
    setNewPortalEmail("");
    toast({ title: "Portal login created", description: `Invite sent to ${email}` });
  };

  const removePortalUser = (id: string) => {
    const user = portalUsers.find((u) => u.id === id);
    setPortalUsers((prev) => prev.filter((u) => u.id !== id));
    if (user) {
      toast({ title: "Portal user removed", description: user.email });
    }
  };

  return (
    <div className="p-4 md:p-6 overflow-auto h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Clients</h2>
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4 mr-1" /> Add Client
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead className="hidden md:table-cell">Contact</TableHead>
            <TableHead className="hidden sm:table-cell">Phone</TableHead>
            <TableHead className="w-16 text-center">Rugs</TableHead>
            <TableHead className="w-28 text-right">Balance</TableHead>
            <TableHead className="w-24">Tier</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.map((c) => (
            <TableRow
              key={c.id}
              className="cursor-pointer"
              onClick={() => openEdit(c)}
            >
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                {c.contactName}
              </TableCell>
              <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                {c.phone}
              </TableCell>
              <TableCell className="text-center">{c.rugCount}</TableCell>
              <TableCell className="text-right font-medium">
                {c.outstandingBalance > 0 ? `$${c.outstandingBalance.toFixed(2)}` : "—"}
              </TableCell>
              <TableCell>
                <Badge className={TIER_COLORS[c.pricingTier]} variant="secondary">
                  {TIER_LABELS[c.pricingTier]}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingId ? "Edit Client" : "Add Client"}</SheetTitle>
            <SheetDescription>
              {editingId ? "Update client details." : "Add a new wholesale client."}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label>Client Name</Label>
              <Input value={form.name} onChange={(e) => updateField("name", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Contact Name</Label>
              <Input value={form.contactName} onChange={(e) => updateField("contactName", e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={form.email} onChange={(e) => updateField("email", e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Textarea value={form.address} onChange={(e) => updateField("address", e.target.value)} rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Pricing Tier</Label>
              <Select value={form.pricingTier} onValueChange={(v) => updateField("pricingTier", v as Client["pricingTier"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="preferred">Preferred</SelectItem>
                  <SelectItem value="vip">VIP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => updateField("notes", e.target.value)} rows={3} />
            </div>

            {editingId && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">Portal Users</h3>
                  {portalUsers.length === 0 && (
                    <p className="text-sm text-muted-foreground">No portal users yet.</p>
                  )}
                  {portalUsers.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{u.email}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className={u.status === "active" ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" : "bg-muted text-muted-foreground"}>
                          {u.status === "active" ? "Active" : "Invited"}
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePortalUser(u.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Email address"
                      type="email"
                      value={newPortalEmail}
                      onChange={(e) => setNewPortalEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addPortalUser()}
                    />
                    <Button size="sm" variant="secondary" onClick={addPortalUser} className="shrink-0">
                      Create Login
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>

          <SheetFooter>
            <Button onClick={save} className="w-full">Save</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
