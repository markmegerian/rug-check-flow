import { Link } from "react-router-dom";
import { Factory, Briefcase, Store, Truck, ShieldCheck } from "lucide-react";

const SECTIONS = [
  {
    to: "/facility/ops",
    icon: Factory,
    label: "Facility Ops",
    description: "Check-in, production board, pending rugs",
  },
  {
    to: "/facility/office",
    icon: Briefcase,
    label: "Office",
    description: "Clients, pricing, invoices",
  },
  {
    to: "/portal",
    icon: Store,
    label: "Wholesale Portal",
    description: "Client-facing rug tracking & pickups",
  },
  {
    to: "/driver",
    icon: Truck,
    label: "Driver Portal",
    description: "Pickup verification & signatures",
  },
  {
    to: "/admin",
    icon: ShieldCheck,
    label: "Admin",
    description: "Users, roles, audit log",
  },
];

export default function Index() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/80 backdrop-blur-md px-6 py-4">
        <h1 className="text-xl font-bold text-foreground tracking-tight">RugBoost</h1>
      </header>
      <main className="flex-1 flex items-center justify-center p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 w-full max-w-3xl">
          {SECTIONS.map((s, i) => {
            const Icon = s.icon;
            return (
              <Link
                key={s.to}
                to={s.to}
                className="flex items-start gap-4 rounded-lg border border-border bg-card p-5 shadow-card transition-all hover:shadow-medium hover:-translate-y-0.5 animate-fade-in-up"
                style={{ animationDelay: `${i * 60}ms`, opacity: 0 }}
              >
                <div className="p-2 rounded-lg bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">{s.label}</div>
                  <div className="text-sm text-muted-foreground mt-1">{s.description}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
