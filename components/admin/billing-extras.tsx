"use client";

import { useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Copy,
  FileText,
  Mail,
  Plus,
  RefreshCw,
  Tag,
  Trash2,
  TrendingUp,
  XCircle,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Coupon types ─────────────────────────────────────────────────────────────

interface Coupon {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  uses: number;
  maxUses: number | null;
  expires: string | null;
  active: boolean;
  description: string;
}

const initialCoupons: Coupon[] = [
  { id: "cp1", code: "WELCOME30",   type: "percent", value: 30, uses: 14, maxUses: null, expires: null,           active: true,  description: "New client welcome discount" },
  { id: "cp2", code: "RECOVER50",   type: "percent", value: 50, uses: 3,  maxUses: 10,   expires: "30 Jun 2026",  active: true,  description: "Win-back offer for churned clients" },
  { id: "cp3", code: "FLAT20OFF",   type: "fixed",   value: 20, uses: 8,  maxUses: 20,   expires: "31 May 2026",  active: true,  description: "Flat £20 off first month" },
  { id: "cp4", code: "PARTNER15",   type: "percent", value: 15, uses: 22, maxUses: null, expires: null,           active: true,  description: "Partner referral discount" },
  { id: "cp5", code: "SUMMER2025",  type: "percent", value: 25, uses: 41, maxUses: 50,   expires: "1 Jan 2026",   active: false, description: "Summer 2025 promo — expired" },
];

// ─── Usage data ───────────────────────────────────────────────────────────────

const usageData = [
  { client: "Horizon Finance",  initials: "HF", plan: "Enterprise", invoices: 187, journals: 94,  storage: "8.2 GB", risk: "upgrade",  mrr: "£490" },
  { client: "Acme Ltd",         initials: "AL", plan: "Enterprise", invoices: 142, journals: 71,  storage: "6.8 GB", risk: "normal",   mrr: "£490" },
  { client: "TechFlow Systems", initials: "TS", plan: "Enterprise", invoices: 98,  journals: 48,  storage: "5.1 GB", risk: "normal",   mrr: "£490" },
  { client: "Orion Retail",     initials: "OR", plan: "Pro",        invoices: 56,  journals: 28,  storage: "2.4 GB", risk: "normal",   mrr: "£49"  },
  { client: "Delta Logistics",  initials: "DL", plan: "Pro",        invoices: 44,  journals: 22,  storage: "1.9 GB", risk: "normal",   mrr: "£49"  },
  { client: "Green Works Co",   initials: "GW", plan: "Pro",        invoices: 34,  journals: 17,  storage: "1.2 GB", risk: "normal",   mrr: "£49"  },
  { client: "Pinnacle Group",   initials: "PG", plan: "Pro",        invoices: 29,  journals: 15,  storage: "0.9 GB", risk: "normal",   mrr: "£49"  },
  { client: "Blue Sky Corp",    initials: "BS", plan: "Starter",    invoices: 4,   journals: 2,   storage: "0.1 GB", risk: "upgrade",  mrr: "£19"  },
];

// ─── Coupon Engine ─────────────────────────────────────────────────────────────

function CouponEngine() {
  const [coupons, setCoupons] = useState<Coupon[]>(initialCoupons);
  const [showNew, setShowNew] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState<"percent" | "fixed">("percent");
  const [newValue, setNewValue] = useState("");
  const [newDesc, setNewDesc] = useState("");

  function createCoupon() {
    if (!newCode.trim() || !newValue) return toast.error("Code and value are required.");
    const coupon: Coupon = {
      id: `cp${Date.now()}`,
      code: newCode.toUpperCase().replace(/\s/g, ""),
      type: newType,
      value: Number(newValue),
      uses: 0,
      maxUses: null,
      expires: null,
      active: true,
      description: newDesc,
    };
    setCoupons((p) => [coupon, ...p]);
    setNewCode(""); setNewValue(""); setNewDesc(""); setShowNew(false);
    toast.success(`Coupon ${coupon.code} created.`);
  }

  function toggleCoupon(id: string) {
    setCoupons((p) => p.map((c) => (c.id === id ? { ...c, active: !c.active } : c)));
  }

  function deleteCoupon(id: string) {
    setCoupons((p) => p.filter((c) => c.id !== id));
    toast.success("Coupon deleted.");
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag className="size-4 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-800">Coupon &amp; Discount Engine</h2>
        </div>
        <Button size="sm" className="gap-1.5 bg-teal-600 text-white hover:bg-teal-700" onClick={() => setShowNew(!showNew)}>
          <Plus className="size-3.5" />
          New Coupon
        </Button>
      </div>

      {/* New coupon form */}
      {showNew && (
        <div className="mb-4 rounded-lg border border-teal-100 bg-teal-50 p-4">
          <p className="mb-3 text-xs font-bold text-teal-800">Create new coupon</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Code</label>
              <input
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
                placeholder="e.g. SAVE20"
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold uppercase text-slate-800 placeholder:font-normal placeholder:text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as any)}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none"
              >
                <option value="percent">% Discount</option>
                <option value="fixed">Fixed (£)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Value</label>
              <input
                type="number"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder={newType === "percent" ? "e.g. 25" : "e.g. 20"}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-teal-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase text-slate-400">Description</label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Optional note"
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-teal-400"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="gap-1 bg-teal-600 text-xs text-white hover:bg-teal-700" onClick={createCoupon}>
              <CheckCircle2 className="size-3" /> Create
            </Button>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowNew(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Coupon table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Code</th>
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Discount</th>
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Description</th>
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Uses</th>
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Expires</th>
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Status</th>
              <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {coupons.map((c) => (
              <tr key={c.id} className={cn("transition hover:bg-slate-50/60", !c.active && "opacity-50")}>
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-extrabold text-slate-900">{c.code}</span>
                    <button onClick={() => { navigator.clipboard.writeText(c.code); toast.success("Copied!"); }}>
                      <Copy className="size-3 text-slate-300 hover:text-teal-500" />
                    </button>
                  </div>
                </td>
                <td className="py-2.5">
                  <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                    {c.type === "percent" ? `${c.value}% off` : `£${c.value} off`}
                  </span>
                </td>
                <td className="py-2.5 text-xs text-slate-500">{c.description || "—"}</td>
                <td className="py-2.5 text-xs text-slate-700">
                  {c.uses}{c.maxUses ? ` / ${c.maxUses}` : ""}
                </td>
                <td className="py-2.5 text-xs text-slate-500">{c.expires ?? "Never"}</td>
                <td className="py-2.5">
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    c.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                  )}>
                    {c.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => toggleCoupon(c.id)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title={c.active ? "Deactivate" : "Activate"}
                    >
                      {c.active ? <XCircle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
                    </button>
                    <button
                      onClick={() => deleteCoupon(c.id)}
                      className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Usage Tracking ────────────────────────────────────────────────────────────

function UsageTracking() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="size-4 text-slate-400" />
        <h2 className="text-sm font-bold text-slate-800">Usage Tracking — Invoices &amp; Storage (MTD)</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Client</th>
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Plan</th>
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Invoices MTD</th>
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Journals MTD</th>
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Storage</th>
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Signal</th>
              <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-widest text-slate-400">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {usageData.map((u) => (
              <tr key={u.client} className="hover:bg-slate-50/60">
                <td className="py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-extrabold text-slate-600">
                      {u.initials}
                    </div>
                    <span className="text-xs font-bold text-slate-900">{u.client}</span>
                  </div>
                </td>
                <td className="py-2.5">
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold",
                    u.plan === "Enterprise" ? "bg-amber-50 text-amber-700" :
                    u.plan === "Pro"        ? "bg-teal-50 text-teal-700"   : "bg-indigo-50 text-indigo-700"
                  )}>
                    {u.plan}
                  </span>
                </td>
                <td className="py-2.5 font-mono text-xs font-bold text-slate-900">{u.invoices}</td>
                <td className="py-2.5 font-mono text-xs text-slate-700">{u.journals}</td>
                <td className="py-2.5 text-xs text-slate-700">{u.storage}</td>
                <td className="py-2.5">
                  {u.risk === "upgrade" ? (
                    <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                      <TrendingUp className="size-3" /> Upgrade Candidate
                    </span>
                  ) : (
                    <span className="text-xs text-slate-300">Normal</span>
                  )}
                </td>
                <td className="py-2.5 text-right">
                  {u.risk === "upgrade" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-[11px] font-bold text-teal-600 hover:bg-teal-50"
                      onClick={() => toast.success(`Upgrade offer sent to ${u.client}.`)}
                    >
                      <Mail className="size-3" /> Offer Upgrade
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function MasterBillingExtras() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
          Billing Controls
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Coupon engine, usage tracking, and upgrade signals
        </p>
      </div>
      <CouponEngine />
      <UsageTracking />
    </div>
  );
}
