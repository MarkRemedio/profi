"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Key,
  ListChecks,
  Search,
  Shield,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import {
  setMulticurrencyDefaultAction,
  setOnboardingChartOfAccountsAction,
  type AuditEntry,
} from "@/app/(admin)/admin/(protected)/security/actions";
import type { OnboardingVisibilitySettings } from "@/lib/admin/platform-settings";

/**
 * Security & Audit.
 *
 * Audit Log and Onboarding are backed by real data — `audit_events` (read
 * cross-tenant) and `platform_settings` respectively.
 *
 * IP & 2FA was removed: it was a UI mock with no allowlist enforcement or 2FA
 * policy engine behind it, and the admin second factor is handled by the email
 * OTP flow instead.
 *
 * Staff & Roles was removed — admin roles and permissions are managed on the
 * Team page, and a second editor for the same data would only drift.
 */

const PAGE_SIZE = 20;

const severityConfig = {
  info:     { badge: "bg-blue-50 text-blue-600",   dot: "bg-blue-400"  },
  warning:  { badge: "bg-amber-50 text-amber-700", dot: "bg-amber-400" },
  critical: { badge: "bg-red-100 text-red-700",    dot: "bg-red-500"   },
};

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Shared 20-per-page footer: range on the left, prev/next on the bottom right. */
function TablePager({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (next: number) => void;
}) {
  if (pageCount <= 1) return null;

  const from = (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
      <p className="m-0 text-[11px] text-slate-500">
        Showing <span className="font-semibold text-slate-700">{from}–{to}</span> of{" "}
        <span className="font-semibold text-slate-700">{total}</span>
      </p>

      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          <ChevronLeft className="size-3.5" />
          Prev
        </button>
        <span className="px-2 text-[11px] font-semibold text-slate-500">
          {page} / {pageCount}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === pageCount}
          className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          Next
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Audit log ────────────────────────────────────────────────────────────────

function AuditLogSection({ auditLog }: { auditLog: AuditEntry[] }) {
  const [search, setSearch] = useState("");
  const [sevFilter, setSevFilter] = useState<"all" | "info" | "warning" | "critical">("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return auditLog.filter((e) => {
      const matchSearch =
        !q ||
        e.action.toLowerCase().includes(q) ||
        e.actor.toLowerCase().includes(q) ||
        e.target.toLowerCase().includes(q) ||
        e.targetType.toLowerCase().includes(q);
      const matchSev = sevFilter === "all" || e.severity === sevFilter;
      return matchSearch && matchSev;
    });
  }, [auditLog, search, sevFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="size-4 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-800">Master Audit Log</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
            {auditLog.length} events
          </span>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
            <Search className="size-3 text-slate-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search logs…"
              className="w-36 bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
            <Filter className="size-3 text-slate-400" />
            <select
              value={sevFilter}
              onChange={(e) => {
                setSevFilter(e.target.value as typeof sevFilter);
                setPage(1);
              }}
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none"
            >
              <option value="all">All</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="critical">Critical</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Timestamp</th>
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Actor</th>
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Action</th>
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Type</th>
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Target</th>
              <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Severity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((entry) => {
              const sc = severityConfig[entry.severity];
              return (
                <tr key={entry.id} className="hover:bg-slate-50/60">
                  <td className="py-2.5 whitespace-nowrap font-mono text-[10px] text-slate-400">
                    {formatTimestamp(entry.timestamp)}
                  </td>
                  <td className="py-2.5">
                    <p className="m-0 text-xs font-bold text-slate-800">{entry.actor}</p>
                    <p className="m-0 text-[10px] text-slate-400">{entry.actorEmail}</p>
                  </td>
                  <td className="py-2.5 text-xs text-slate-700">{entry.action}</td>
                  <td className="py-2.5">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                      {entry.targetType.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="py-2.5 text-xs text-slate-500">{entry.target}</td>
                  <td className="py-2.5">
                    <span className={cn("flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", sc.badge)}>
                      <span className={cn("size-1.5 rounded-full", sc.dot)} />
                      {entry.severity}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <p className="py-8 text-center text-xs text-slate-400">
            {auditLog.length === 0
              ? "No admin actions recorded yet. Creating admins, inviting clients, wiping data and deleting clients all write here."
              : "No log entries match your filters"}
          </p>
        )}
      </div>

      <TablePager page={safePage} pageCount={pageCount} total={filtered.length} onPage={setPage} />
    </div>
  );
}

// ─── Onboarding settings ──────────────────────────────────────────────────────

function OnboardingSettingsSection({
  onboarding,
  multicurrency,
}: {
  onboarding: OnboardingVisibilitySettings;
  multicurrency: boolean;
}) {
  const [chartOfAccounts, setChartOfAccounts] = useState(onboarding.chartOfAccounts);
  const [saving, startSave] = useTransition();

  // Re-sync when the server sends a fresh value after revalidation. Adjusted
  // during render rather than in an effect — React supports this for
  // derived-from-prop state, and it avoids setState inside an effect body.
  const [lastServerValue, setLastServerValue] = useState(onboarding.chartOfAccounts);
  if (lastServerValue !== onboarding.chartOfAccounts) {
    setLastServerValue(onboarding.chartOfAccounts);
    setChartOfAccounts(onboarding.chartOfAccounts);
  }

  const [multi, setMulti] = useState(multicurrency);
  const [lastMultiFromServer, setLastMultiFromServer] = useState(multicurrency);
  if (lastMultiFromServer !== multicurrency) {
    setLastMultiFromServer(multicurrency);
    setMulti(multicurrency);
  }

  const toggleMulticurrency = (next: boolean) => {
    setMulti(next);
    startSave(async () => {
      const result = await setMulticurrencyDefaultAction(next);
      if (!result.success) {
        setMulti(!next);
        toast.error(result.error ?? "Could not save the setting.");
        return;
      }
      toast.success(result.message ?? "Saved.");
    });
  };

  const toggle = (next: boolean) => {
    // Optimistic, reverted on failure so the switch never shows a false state.
    setChartOfAccounts(next);

    startSave(async () => {
      const result = await setOnboardingChartOfAccountsAction(next);
      if (!result.success) {
        setChartOfAccounts(!next);
        toast.error(result.error ?? "Could not save the setting.");
        return;
      }
      toast.success(result.message ?? "Saved.");
    });
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
        <div className="mb-1 flex items-center gap-2">
          <ListChecks className="size-4 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-800">Client Onboarding Steps</h2>
        </div>
        <p className="mb-5 text-xs text-slate-500">
          Controls what new clients configure themselves. Applies platform-wide, to both
          self-serve signups and accountant-invited clients.
        </p>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-100 px-4 py-3">
          <div>
            <p className="m-0 text-xs font-semibold text-slate-800">Chart of accounts step</p>
            <p className="m-0 mt-0.5 text-[11px] leading-relaxed text-slate-500">
              {chartOfAccounts
                ? "Clients choose their own chart of accounts during onboarding."
                : "Step hidden — the starter chart is created automatically, so the accounts already exist when the client first signs in."}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={chartOfAccounts}
            aria-label="Show the chart of accounts step during client onboarding"
            disabled={saving}
            onClick={() => toggle(!chartOfAccounts)}
            className={cn(
              "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full border-none transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
              chartOfAccounts ? "bg-teal-500" : "bg-slate-200"
            )}
          >
            <span
              className={cn(
                "ml-0.5 size-4 rounded-full bg-white shadow transition-transform",
                chartOfAccounts && "translate-x-4"
              )}
            />
          </button>
        </div>

        <div className="mt-3 flex items-start justify-between gap-4 rounded-lg border border-slate-100 px-4 py-3">
          <div>
            <p className="m-0 text-xs font-semibold text-slate-800">Multicurrency</p>
            <p className="m-0 mt-0.5 text-[11px] leading-relaxed text-slate-500">
              {multi
                ? "On for every workspace. Clients can raise invoices and bills in another currency, each recording the rate it was issued at."
                : "New workspaces start without it. Turning it on enables it everywhere at once; turning it off again only changes the default, so a workspace already using it keeps it."}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={multi}
            aria-label="Enable multicurrency for all workspaces"
            disabled={saving}
            onClick={() => toggleMulticurrency(!multi)}
            className={cn(
              "mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full border-none transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
              multi ? "bg-teal-500" : "bg-slate-200"
            )}
          >
            <span
              className={cn(
                "ml-0.5 size-4 rounded-full bg-white shadow transition-transform",
                multi && "translate-x-4"
              )}
            />
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <CheckCircle2 className="size-4 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-800">What clients see</h2>
        </div>
        <ol className="m-0 space-y-2 pl-4 text-[11px] text-slate-600">
          <li>Workspace defaults</li>
          <li>Sales settings</li>
          <li>Purchases</li>
          <li className={cn(!chartOfAccounts && "text-slate-300 line-through")}>
            Chart of accounts{!chartOfAccounts && " (automatic)"}
          </li>
          <li>Document branding</li>
        </ol>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function MasterSecurity({
  auditLog = [],
  onboarding = { chartOfAccounts: true },
  multicurrency = false,
}: {
  auditLog?: AuditEntry[];
  onboarding?: OnboardingVisibilitySettings;
  /** Platform-wide multicurrency default. Off unless an admin turned it on. */
  multicurrency?: boolean;
}) {
  const [tab, setTab] = useState<"audit" | "onboarding">("audit");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
          Security &amp; Audit
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Audit trail, client onboarding steps, and access policies. Admin roles are managed
          on the Team page.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1">
        {([
          { key: "audit",      label: "Audit Log"  },
          { key: "onboarding", label: "Onboarding" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-4 py-1.5 text-xs font-bold transition",
              tab === t.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "audit"      && <AuditLogSection auditLog={auditLog} />}
      {tab === "onboarding" && (
        <OnboardingSettingsSection onboarding={onboarding} multicurrency={multicurrency} />
      )}
    </div>
  );
}
