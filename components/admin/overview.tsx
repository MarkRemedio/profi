"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Building2,
  CreditCard,
  DollarSign,
  FlaskConical,
  Percent,
  RefreshCw,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AdminOverviewData } from "@/app/(admin)/admin/(protected)/overview/actions";
import { QuickAction, QuickActions } from "@/components/shared/quick-actions";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionCard({
  title,
  icon: Icon,
  children,
  action,
  className,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-slate-400" />
          <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function MrrTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
      <p className="mb-1 text-xs font-bold text-slate-500">{label}</p>
      <p className="font-mono text-sm font-extrabold text-teal-600">
        £{payload[0].value.toLocaleString()}
      </p>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function MasterOverview({ overview }: { overview: AdminOverviewData }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const {
    metrics,
    tenantStatus,
    tenantTotal,
    mrrBySignupCohort,
    planDistribution,
    topClients,
    recentActivity,
    alerts,
  } = overview;

  const kpis = [
    {
      label: "MRR",
      value: gbp.format(metrics.mrr),
      detail: "Active paid subscriptions",
      icon: TrendingUp,
      iconBg: "bg-teal-50 text-teal-600",
    },
    {
      label: "ARR",
      value: gbp.format(metrics.arr),
      detail: "Annualised from current MRR",
      icon: TrendingUp,
      iconBg: "bg-teal-50 text-teal-600",
    },
    {
      label: "Active Clients",
      value: metrics.activeClients.toLocaleString("en-GB"),
      detail: `${metrics.newSignups} new this month`,
      icon: Building2,
      iconBg: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "Pending Onboarding",
      value: metrics.pendingOnboarding.toLocaleString("en-GB"),
      detail: "Invitations not yet established",
      icon: Users,
      iconBg: "bg-emerald-50 text-emerald-600",
    },
  ];

  const secondaryKpis = [
    {
      label: "ARPU",
      value: gbp.format(metrics.arpu),
      detail: "Average per paying client",
      icon: DollarSign,
      iconBg: "bg-violet-50 text-violet-600",
    },
    {
      label: "Trial Conversion",
      value: `${metrics.trialConversionRate.toFixed(1)}%`,
      detail: metrics.measuredTrials
        ? `${metrics.convertedTrials} of ${metrics.measuredTrials} recent signups active`
        : "No trial outcomes in the last 30 days",
      icon: Percent,
      iconBg: "bg-amber-50 text-amber-600",
    },
    {
      label: "Active Trials",
      value: metrics.activeTrials.toLocaleString("en-GB"),
      detail: `${metrics.trialsExpiringSoon} expiring within 7 days`,
      icon: FlaskConical,
      iconBg: "bg-blue-50 text-blue-500",
    },
    {
      label: "Open Support Issues",
      value: metrics.openIssues.toLocaleString("en-GB"),
      detail: "New feedback reports",
      icon: AlertCircle,
      iconBg: "bg-red-50 text-red-500",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">
              Master Overview
            </h1>
            <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-bold text-teal-700">
              SUPER ADMIN
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Waw Profi SaaS Platform &middot; {metrics.activeClients} active tenants &middot; Last updated{" "}
            <span className="font-semibold text-slate-700">
              just now
            </span>
          </p>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <Button
            variant="outline"
            size="icon"
            onClick={() => startRefresh(() => router.refresh())}
            disabled={refreshing}
            className="size-10 shrink-0"
            aria-label="Refresh dashboard"
            title="Refresh dashboard"
          >
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          </Button>

          <QuickActions>
            <QuickAction
              href="/admin/accountant?action=create"
              icon={Building2}
              label="Add client"
              description="Open the client onboarding form"
              primary
              tone="teal"
            />
            <QuickAction
              href="/admin/impersonate"
              icon={Users}
              label="Impersonate client"
              description="Choose a client workspace to view"
            />
          </QuickActions>
        </div>
      </div>

      {/* KPI Strip Row 1 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{k.label}</p>
              <div className={cn("rounded-lg p-1.5", k.iconBg)}>
                <k.icon className="size-3.5" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-extrabold text-slate-950">{k.value}</p>
            <p className="mt-1 truncate text-xs text-slate-400">{k.detail}</p>
          </div>
        ))}
      </div>

      {/* KPI Strip Row 2 — ARPU, Conversion, Trials, Issues */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {secondaryKpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{k.label}</p>
              <div className={cn("rounded-lg p-1.5", k.iconBg)}>
                <k.icon className="size-3.5" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-extrabold text-slate-950">{k.value}</p>
            <p className="mt-1 truncate text-xs text-slate-400" title={k.detail}>{k.detail}</p>
          </div>
        ))}
      </div>

      {/* Tenant Status Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-slate-400" />
            <h2 className="text-sm font-bold text-slate-800">Tenant Status — {tenantTotal} total</h2>
          </div>
          <Link href="/admin/clients" className="text-xs font-bold text-teal-600 hover:underline">Manage</Link>
        </div>
        <div className="mb-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
          {tenantStatus.map((s) => (
            <div key={s.label} className={cn("h-full transition-all", s.color)} style={{ width: `${s.pct}%` }} />
          ))}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {tenantStatus.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <span className={cn("size-2 rounded-full", s.color)} />
              <span className="text-xs text-slate-500">{s.label}</span>
              <span className="text-xs font-bold text-slate-900">{s.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* MRR Chart + Alerts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard title="Current MRR by Signup Cohort" icon={TrendingUp} className="xl:col-span-2">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={mrrBySignupCohort} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                <defs>
                  <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#14b8a6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<MrrTooltip />} />
                <Area type="monotone" dataKey="mrr" stroke="#14b8a6" strokeWidth={2.5} fill="url(#mrrGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <span className="size-2.5 inline-block rounded-full bg-teal-500" />
            Current recurring revenue grouped by client signup month
          </div>
        </SectionCard>

        <SectionCard title="Platform Alerts" icon={AlertCircle}>
          <div className="space-y-2">
            {alerts.length === 0 && (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-4 text-center text-xs font-semibold text-emerald-700">
                No platform alerts need attention.
              </div>
            )}
            {alerts.map((a, i) => (
              <div
                key={a.id}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5",
                  a.level === "danger"  && "border-red-100   bg-red-50",
                  a.level === "warning" && "border-amber-100 bg-amber-50",
                  a.level === "info"    && "border-blue-100  bg-blue-50",
                )}
              >
                {a.level === "danger" ? (
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-500" />
                ) : a.level === "warning" ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                ) : (
                  <Activity className="mt-0.5 size-4 shrink-0 text-blue-500" />
                )}
                <p className="flex-1 text-xs font-semibold leading-snug text-slate-800">{a.text}</p>
                <Link
                  href={a.href}
                  className="shrink-0 text-[10px] font-bold text-slate-400 hover:text-teal-600"
                >
                  {a.action}
                </Link>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      {/* Plan distribution + Top clients + Activity */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {/* Plan Pie */}
        <SectionCard title="Plan Distribution" icon={CreditCard}>
          {planDistribution.length > 0 ? (
            <div className="flex items-center justify-center py-2">
              <PieChart width={160} height={160}>
                <Pie
                  data={planDistribution}
                  cx={80}
                  cy={80}
                  innerRadius={50}
                  outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {planDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </div>
          ) : (
            <p className="py-16 text-center text-xs text-slate-400">No client plans yet.</p>
          )}
          <div className="mt-2 space-y-2">
            {planDistribution.map((plan) => (
              <div key={plan.name} className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: plan.color }} />
                <span className="flex-1 text-xs font-medium text-slate-600">{plan.name}</span>
                <span className="text-xs font-bold text-slate-900">
                  {plan.count} ({plan.value.toFixed(0)}%)
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Top Clients */}
        <SectionCard
          title="Top Clients by MRR"
          icon={Building2}
          action={
            <Link href="/admin/clients" className="flex items-center gap-1 text-xs font-bold text-teal-600 hover:underline">
              View all <ArrowRight className="size-3" />
            </Link>
          }
        >
          <div className="divide-y divide-slate-50">
            {topClients.length === 0 && (
              <p className="py-12 text-center text-xs text-slate-400">No paying clients yet.</p>
            )}
            {topClients.map((client) => (
              <div key={client.id} className="flex items-center gap-3 py-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-extrabold text-slate-600">
                  {client.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-800">{client.name}</p>
                  <p className="text-[10px] text-slate-400">{client.plan}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-900">{gbp.format(client.mrr)}</span>
                  <span className={cn(
                    "size-2 shrink-0 rounded-full",
                    client.health === "healthy" ? "bg-emerald-500" :
                    client.health === "warning" ? "bg-amber-500" : "bg-red-500"
                  )} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Activity Feed */}
        <SectionCard
          title="Platform Activity"
          icon={Activity}
          className="xl:col-span-1"
        >
          <div className="divide-y divide-slate-50">
            {recentActivity.length === 0 && (
              <p className="py-12 text-center text-xs text-slate-400">No admin activity recorded yet.</p>
            )}
            {recentActivity.map((item) => (
              <div key={item.id} className="flex items-start gap-3 py-2">
                <span className={cn(
                  "mt-1.5 size-1.5 shrink-0 rounded-full",
                  item.severity === "critical" ? "bg-red-500" :
                  item.severity === "warning" ? "bg-amber-500" : "bg-teal-500"
                )} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[10px] font-bold text-slate-500">
                    {item.actor} · {item.target}
                  </p>
                  <p className="text-xs font-medium text-slate-700">{item.action}</p>
                </div>
                <span className="shrink-0 text-[10px] text-slate-400">
                  {item.time}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

    </div>
  );
}
