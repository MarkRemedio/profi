"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  Eye,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useImpersonation, type ImpersonatedClient } from "./impersonation-context";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// ─── Data ────────────────────────────────────────────────────────────────────

const clients = [
  { id: "c1",  name: "Acme Ltd",             email: "james@acme.com",         plan: "Enterprise", health: "healthy",  status: "active",    users: 12, initials: "AL", lastActive: "Just now"   },
  { id: "c2",  name: "TechFlow Systems",     email: "sarah@techflow.io",      plan: "Enterprise", health: "warning",  status: "active",    users: 9,  initials: "TS", lastActive: "2 hrs ago"  },
  { id: "c3",  name: "Green Works Co",       email: "mike@greenworks.com",    plan: "Pro",        health: "healthy",  status: "active",    users: 5,  initials: "GW", lastActive: "1 hr ago"   },
  { id: "c4",  name: "Apex Consulting",      email: "anna@apexco.com",        plan: "Pro",        health: "healthy",  status: "active",    users: 4,  initials: "AC", lastActive: "Today"      },
  { id: "c5",  name: "Orion Retail",         email: "dan@orionretail.co.uk",  plan: "Pro",        health: "healthy",  status: "active",    users: 6,  initials: "OR", lastActive: "Yesterday"  },
  { id: "c6",  name: "Brightstone Ltd",      email: "lucy@brightstone.com",   plan: "Starter",    health: "warning",  status: "active",    users: 2,  initials: "BL", lastActive: "3 days ago" },
  { id: "c7",  name: "Delta Logistics",      email: "tom@deltalog.net",       plan: "Pro",        health: "healthy",  status: "active",    users: 7,  initials: "DL", lastActive: "Today"      },
  { id: "c9",  name: "Summit Analytics",     email: "rob@summitnow.co",       plan: "Trial",      health: "healthy",  status: "trial",     users: 2,  initials: "SA", lastActive: "Today"      },
  { id: "c10", name: "Redwood Partners",     email: "kate@redwoodp.com",      plan: "Pro",        health: "critical", status: "suspended", users: 3,  initials: "RP", lastActive: "5 days ago" },
  { id: "c11", name: "Horizon Finance",      email: "alex@horizonfin.co.uk",  plan: "Enterprise", health: "healthy",  status: "active",    users: 15, initials: "HF", lastActive: "1 hr ago"   },
  { id: "c12", name: "Blue Sky Corp",        email: "carol@blueskycorp.com",  plan: "Starter",    health: "healthy",  status: "active",    users: 2,  initials: "BS", lastActive: "Today"      },
  { id: "c13", name: "Pinnacle Group",       email: "harry@pinnaclegp.com",   plan: "Pro",        health: "warning",  status: "active",    users: 5,  initials: "PG", lastActive: "2 days ago" },
  { id: "c14", name: "Aurora Services",      email: "emma@aurorasvc.co.uk",   plan: "Pro",        health: "healthy",  status: "active",    users: 4,  initials: "AS", lastActive: "Today"      },
  { id: "c15", name: "Cobalt Dynamics",      email: "ben@cobaltdyn.com",      plan: "Trial",      health: "healthy",  status: "trial",     users: 1,  initials: "CD", lastActive: "Today"      },
];

const healthDot: Record<string, string> = {
  healthy:  "bg-emerald-500",
  warning:  "bg-amber-500",
  critical: "bg-red-500",
};

const planBadge: Record<string, string> = {
  Starter:    "bg-indigo-50 text-indigo-700",
  Pro:        "bg-teal-50 text-teal-700",
  Enterprise: "bg-amber-50 text-amber-700",
  Trial:      "bg-slate-100 text-slate-600",
};

// ─── Component ───────────────────────────────────────────────────────────────

export function MasterImpersonate() {
  const [search, setSearch] = useState("");
  const { startImpersonation, isImpersonating, impersonating, stopImpersonation } = useImpersonation();
  const router = useRouter();

  const filtered = clients.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())
  );

  function handleImpersonate(client: typeof clients[0]) {
    const payload: ImpersonatedClient = {
      id:       client.id,
      name:     client.name,
      email:    client.email,
      plan:     client.plan,
      initials: client.initials,
    };
    startImpersonation(payload);
    toast.success(`Session started as ${client.name}. Redirecting to their dashboard…`);
    setTimeout(() => router.push("/dashboard"), 1200);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
            Impersonate Client
          </h1>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
            ADMIN ONLY
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Log in as a client to reproduce issues, verify their experience, or provide hands-on support.
        </p>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-600" />
        <div>
          <p className="text-sm font-bold text-amber-900">Impersonation mode — use responsibly</p>
          <p className="mt-0.5 text-xs text-amber-700">
            You will view the platform exactly as the selected client. Actions taken during impersonation
            are marked in the audit log. This session is read-only by default — destructive actions
            require an extra confirmation step.
          </p>
        </div>
      </div>

      {/* Active impersonation card */}
      {isImpersonating && impersonating && (
        <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-teal-500 text-sm font-extrabold text-white">
              {impersonating.initials}
            </div>
            <div>
              <p className="text-sm font-bold text-teal-900">Currently viewing as: {impersonating.name}</p>
              <p className="text-xs text-teal-600">{impersonating.email} · {impersonating.plan}</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-teal-300 text-teal-700 hover:bg-teal-100"
            onClick={() => { stopImpersonation(); toast.info("Impersonation session ended."); }}
          >
            End Session
          </Button>
        </div>
      )}

      {/* Search */}
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <Search className="size-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search clients by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
        />
        <span className="text-xs text-slate-400">{filtered.length} clients</span>
      </div>

      {/* Client grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((client) => (
          <div
            key={client.id}
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-teal-200 hover:shadow-md"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-extrabold text-slate-600">
                {client.initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-slate-900">{client.name}</p>
                <p className="truncate text-[10px] text-slate-400">{client.email}</p>
              </div>
              <span className={cn("size-2 shrink-0 rounded-full", healthDot[client.health])} />
            </div>

            <div className="flex items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", planBadge[client.plan])}>
                {client.plan}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-slate-400">
                <Users className="size-3" />
                {client.users} users
              </span>
              <span className="ml-auto text-[10px] text-slate-400">{client.lastActive}</span>
            </div>

            <Button
              size="sm"
              className={cn(
                "w-full gap-1.5 font-bold",
                client.status === "suspended"
                  ? "bg-slate-200 text-slate-500 hover:bg-slate-300"
                  : "bg-teal-600 text-white hover:bg-teal-700"
              )}
              disabled={client.status === "cancelled"}
              onClick={() => handleImpersonate(client)}
            >
              <Eye className="size-3.5" />
              {client.status === "suspended" ? "View (Suspended)" : "View as Client"}
            </Button>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-center">
          <Building2 className="mb-3 size-10 text-slate-200" />
          <p className="text-sm font-bold text-slate-500">No clients match your search</p>
        </div>
      )}
    </div>
  );
}
