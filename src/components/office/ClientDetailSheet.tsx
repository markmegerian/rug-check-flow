import { Trash2, X } from "lucide-react";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Tables } from "@/integrations/supabase/types";
import { ClientActivityFeed } from "./ClientActivityFeed";
import { ClientBillingSummary } from "./ClientBillingSummary";
import { NotificationCadenceCard } from "./NotificationCadenceCard";
import { type BillingReminderPreference, formatInvoiceTermsLabel } from "@/lib/billing";

type PricingTier = "standard" | "preferred" | "vip";
type PortalUser = Pick<Tables<"portal_users">, "id" | "email" | "status">;

const ROUTE_DAYS = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

type FormData = {
  name: string;
  contact_name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  pricing_tier: PricingTier;
  route_day: string;
  invoice_terms_days: number;
  billing_reminder_preference: BillingReminderPreference;
  billing_notes: string;
};

interface ClientDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  form: FormData;
  onUpdateField: <K extends keyof FormData>(key: K, value: FormData[K]) => void;
  onSave: () => void;
  portalUsers: PortalUser[];
  newPortalEmail: string;
  onNewPortalEmailChange: (email: string) => void;
  onAddPortalUser: () => void;
  onRemovePortalUser: (id: string) => void;
  onActivatePortalUser: (user: PortalUser, sendEmail: boolean) => void;
  portalActionId: string | null;
  canDeleteClient: boolean;
  deletingClient: boolean;
  onDeleteClient: () => void;
}

export function ClientDetailSheet({
  open,
  onOpenChange,
  editingId,
  form,
  onUpdateField,
  onSave,
  portalUsers,
  newPortalEmail,
  onNewPortalEmailChange,
  onAddPortalUser,
  onRemovePortalUser,
  onActivatePortalUser,
  portalActionId,
  canDeleteClient,
  deletingClient,
  onDeleteClient,
}: ClientDetailSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editingId ? "Edit Client" : "Add Client"}</SheetTitle>
          <SheetDescription>
            {editingId ? "Update client details." : "Add a new wholesale client."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-6">
          <div className="space-y-2">
            <Label>Client Name</Label>
            <Input value={form.name} onChange={(e) => onUpdateField("name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Contact Name</Label>
            <Input value={form.contact_name} onChange={(e) => onUpdateField("contact_name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => onUpdateField("phone", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => onUpdateField("email", e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Textarea value={form.address} onChange={(e) => onUpdateField("address", e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Pricing Tier</Label>
            <Select value={form.pricing_tier} onValueChange={(v) => onUpdateField("pricing_tier", v as PricingTier)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="preferred">Preferred</SelectItem>
                <SelectItem value="vip">VIP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Route Day</Label>
            <Select value={form.route_day || "none"} onValueChange={(v) => onUpdateField("route_day", v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {ROUTE_DAYS.filter(Boolean).map((day) => (
                  <SelectItem key={day} value={day}>{day}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Billing profile</h3>
              <p className="text-xs text-muted-foreground">Controls invoice terms and default collections preference for this client account.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Invoice terms</Label>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={form.invoice_terms_days}
                  onChange={(e) => onUpdateField("invoice_terms_days", Number(e.target.value) || 14)}
                />
                <p className="text-xs text-muted-foreground">{formatInvoiceTermsLabel(form.invoice_terms_days)}</p>
              </div>
              <div className="space-y-2">
                <Label>Reminder preference</Label>
                <Select
                  value={form.billing_reminder_preference}
                  onValueChange={(value) => onUpdateField("billing_reminder_preference", value as BillingReminderPreference)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="manual">Manual only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Billing Notes</Label>
              <Textarea
                value={form.billing_notes}
                onChange={(e) => onUpdateField("billing_notes", e.target.value)}
                rows={3}
                placeholder="Preferred wording, accounting contact, statement rules, special follow-up instructions..."
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => onUpdateField("notes", e.target.value)} rows={3} />
          </div>

          {editingId && (
            <>
              <Separator />
              <ClientBillingSummary
                clientId={editingId}
                invoiceTermsDays={form.invoice_terms_days}
                billingReminderPreference={form.billing_reminder_preference}
                billingNotes={form.billing_notes}
                enabled={open}
              />
              <NotificationCadenceCard clientId={editingId} enabled={open} />
              <ClientActivityFeed clientId={editingId} enabled={open} />
            </>
          )}

          {editingId && (
            <>
              <Separator />
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Portal Users</h3>
                <p className="text-xs text-muted-foreground">
                  New logins stay invited until you activate them. Onboarding emails are disabled for now, so activation is manual only.
                </p>
                {portalUsers.length === 0 && (
                  <p className="text-sm text-muted-foreground">No portal users yet.</p>
                )}
                {portalUsers.map((u) => (
                  <div key={u.id} className="rounded-md border p-2.5 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate">{u.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {u.status === "active" ? "Active access" : "Pending activation"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="secondary"
                          className={
                            u.status === "active"
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : "bg-muted text-muted-foreground"
                          }
                        >
                          {u.status === "active" ? "Active" : "Invited"}
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onRemovePortalUser(u.id)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {u.status !== "active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => onActivatePortalUser(u, false)}
                          disabled={portalActionId === u.id}
                        >
                          Activate
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Active manually — email disabled</span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <Input
                    placeholder="Email address"
                    type="email"
                    value={newPortalEmail}
                    onChange={(e) => onNewPortalEmailChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onAddPortalUser()}
                  />
                  <Button size="sm" variant="secondary" onClick={onAddPortalUser} className="shrink-0">
                    Stage Login
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        <SheetFooter className="flex-col gap-2">
          {editingId && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  disabled={deletingClient || !canDeleteClient}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {deletingClient ? "Deleting..." : "Delete Client Account"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this wholesale account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This deletes the client record and linked portal logins. Related historical records may also be
                    removed or detached based on database relationships.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDeleteClient}>Delete account</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button onClick={onSave} className="w-full">Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
