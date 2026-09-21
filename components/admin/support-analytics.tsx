"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Inbox,
  MessageSquare,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import type { SupportTicketPriority, SupportTicketStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDuration, type SupportAnalyticsData } from "@/lib/support/analytics";

/**
 * Priority is a severity scale, not a set of unrelated categories, so it wears
 * the reserved status colours rather than a categorical palette. Every slice
 * carries its name and count as text — a status colour never has to be read on
 * its own.
 */
const PRIORITY_COLORS: Record<SupportTicketPriority, string> = {
  LOW: "#0ca30c",
  MEDIUM: "#fab219",
  HIGH: "#ec835a",
  CRITICAL: "#d03b3b",
};

/**
 * Two series, checked for colour-vision separation rather than chosen by eye
 * (ΔE 23.1 under protanopia, 24.0 with normal vision).
 */
const SERIES_VOLUME = "#2a78d6";
const SERIES_SETTLED = "#1baf7a";

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  PENDING: "Pending",
  ON_HOLD: "On hold",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const PRIORITY_BADGE: Record<SupportTicketPriority, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-amber-50 text-amber-700",
  HIGH: "bg-orange-50 text-orange-700",
  CRITICAL: "bg-red-100 text-red-700",
};

type Trend = { text: string; positive: boolean } | null;

/**
 * A trend only appears when both periods had something to measure. A dashboard
 * that invents "+100%" out of a previous week with no tickets is worse than one
 * that admits it cannot say.
 */
function trendFrom(change: number | null, lowerIsBetter: boolean, suffix = "%"): Trend {
  if (change === null || change === 0) return null;
  return {
    text: `${change > 0 ? "+" : ""}${change}${suffix}`,
    positive: lowerIsBetter ? change < 0 : change > 0,
  };
}

function Panel({
  title,
  hint,
  children,
  className,
  action,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-800">{title}</p>
          <p className="text-[10px] text-slate-400">{hint}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Shown in place of a chart when there is genuinely nothing to plot. */
function Empty({ message, height = 180 }: { message: string; height?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center"
      style={{ height }}
    >
      <p className="text-[11px] text-slate-400">{message}</p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  iconBg,
  trend,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ElementType;
  iconBg: string;
  trend: Trend;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className={cn("flex size-9 items-center justify-center rounded-lg", iconBg)}>
          <Icon className="size-4" />
        </div>
        {trend && (
          <span
            className={cn(
              "flex items-center gap-0.5 text-xs font-bold",
              trend.positive ? "text-emerald-600" : "text-red-500",
            )}
          >
            {trend.positive ? (
              <TrendingUp className="size-3.5" />
            ) : (
              <TrendingDown className="size-3.5" />
            )}
            {trend.text}
          </span>
        )}
      </div>
      <p className="text-2xl font-extrabold text-slate-900">{value}</p>
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-0.5 text-[10px] text-slate-400">{sub}</p>
    </div>
  );
}

export function MasterSupportAnalytics({ analytics }: { analytics: SupportAnalyticsData }) {
  const { kpis, windowDays } = analytics;
  const period = `Last ${windowDays} days`;

  const openPriority = analytics.priorityMix.filter((slice) => slice.value > 0);
  const respondedTickets = kpis.respondedInWindow;
  const hasResponseData = analytics.responseTrend.some((point) => point.avgMin !== null);
  const hasVolume = analytics.volumeTrend.some((point) => point.created > 0 || point.settled > 0);
  const maxCategory = Math.max(1, ...analytics.categoryMix.map((row) => row.total));

  function exportCsv() {
    const rows: string[][] = [
      ["Support analytics", period],
      [],
      ["Metric", "Value"],
      ["Average first response", formatDuration(kpis.firstResponseMinutes)],
      ["Tickets answered", String(respondedTickets)],
      [
        "Resolution rate",
        kpis.resolutionRatePct === null ? "n/a" : `${kpis.resolutionRatePct}%`,
      ],
      ["Tickets raised", String(kpis.createdInWindow)],
      ["Tickets settled", String(kpis.settledInWindow)],
      ["Open conversations", String(kpis.openCount)],
      ["Awaiting our reply", String(kpis.awaitingReplyCount)],
      ["Average time to resolve", formatDuration(kpis.resolutionMinutes)],
      [],
      ["Agent", "Settled", "Open", "Replies", "Avg reply"],
      ...analytics.agents.map((agent) => [
        agent.name,
        String(agent.settled),
        String(agent.open),
        String(agent.replies),
        formatDuration(agent.avgReplyMinutes),
      ]),
    ];

    // Quote every field: subjects and workspace names routinely contain commas.
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\r\n");

    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `support-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (analytics.ticketsAllTime === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-slate-100">
          <Inbox className="size-5 text-slate-400" />
        </div>
        <p className="mt-3 text-sm font-bold text-slate-800">No support tickets yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
          Response times, resolution rates and agent performance will appear here as soon as the
          first conversation comes in.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-4 gap-1.5 text-xs">
          <Link href="/admin/support-new">
            Open the support inbox
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Avg. First Response"
          value={formatDuration(kpis.firstResponseMinutes)}
          sub={
            respondedTickets === 0
              ? "No tickets answered yet"
              : `Across ${respondedTickets} answered ${respondedTickets === 1 ? "ticket" : "tickets"}`
          }
          icon={Clock}
          iconBg="bg-teal-50 text-teal-600"
          trend={trendFrom(kpis.firstResponseTrendPct, true)}
        />
        <KpiCard
          label="Resolution Rate"
          value={kpis.resolutionRatePct === null ? "—" : `${kpis.resolutionRatePct}%`}
          sub={`Of ${kpis.createdInWindow} raised in the period`}
          icon={CheckCircle2}
          iconBg="bg-emerald-50 text-emerald-600"
          trend={trendFrom(kpis.resolutionRateTrendPts, false, "pts")}
        />
        <KpiCard
          label="Open Conversations"
          value={String(kpis.openCount)}
          sub={
            kpis.awaitingReplyCount === 0
              ? "None waiting on a reply"
              : `${kpis.awaitingReplyCount} awaiting your reply`
          }
          icon={MessageSquare}
          iconBg="bg-amber-50 text-amber-600"
          trend={
            kpis.backlogNet === 0
              ? null
              : { text: `${kpis.backlogNet > 0 ? "+" : ""}${kpis.backlogNet}`, positive: kpis.backlogNet < 0 }
          }
        />
        <KpiCard
          label="Avg. Time to Resolve"
          value={formatDuration(kpis.resolutionMinutes)}
          sub={
            kpis.settledInWindow === 0
              ? "Nothing resolved in the period"
              : `Across ${kpis.settledInWindow} resolved`
          }
          icon={Timer}
          iconBg="bg-indigo-50 text-indigo-600"
          trend={trendFrom(kpis.resolutionTrendPct, true)}
        />
      </div>

      {/* Response time + priority */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel
          title="Response Time Trend"
          hint="Average first reply to tickets raised each day"
          className="lg:col-span-2"
        >
          {hasResponseData ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={analytics.responseTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  formatter={(value) => [formatDuration(Number(value)), "First response"]}
                />
                {/* Days with no tickets stay as gaps rather than being drawn as
                    a zero-minute response time. */}
                <Line
                  type="monotone"
                  dataKey="avgMin"
                  stroke={SERIES_VOLUME}
                  strokeWidth={2}
                  connectNulls={false}
                  dot={{ r: 4, fill: SERIES_VOLUME }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty message="No tickets have been answered in this period yet." />
          )}
        </Panel>

        <Panel title="Open by Priority" hint="How the current backlog is weighted">
          {openPriority.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={openPriority}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={44}
                  outerRadius={72}
                  paddingAngle={2}
                >
                  {openPriority.map((slice) => (
                    <Cell key={slice.priority} fill={PRIORITY_COLORS[slice.priority]} />
                  ))}
                </Pie>
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(value, name) => [`${value} open`, String(name)]}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <Empty message="Nothing is open right now." />
          )}
        </Panel>
      </div>

      {/* Volume + category */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Daily Volume" hint="Tickets raised against tickets resolved">
          {hasVolume ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={analytics.volumeTrend} barSize={18} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 10 }} />
                <Bar dataKey="created" fill={SERIES_VOLUME} radius={[4, 4, 0, 0]} name="Raised" />
                <Bar
                  dataKey="settled"
                  fill={SERIES_SETTLED}
                  radius={[4, 4, 0, 0]}
                  name="Resolved"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty message="No tickets were raised or resolved in this period." />
          )}
        </Panel>

        <Panel title="Volume by Category" hint="Where the conversations are coming from">
          {analytics.categoryMix.length > 0 ? (
            <div className="space-y-3">
              {/* One hue: each row already names itself, so colour has no
                  identity to carry and a categorical palette would be noise. */}
              {analytics.categoryMix.map((row) => (
                <div key={row.category}>
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="truncate text-xs font-semibold capitalize text-slate-700">
                      {row.category}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {row.total} total · {row.open} open
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${Math.round((row.total / maxCategory) * 100)}%`,
                        backgroundColor: SERIES_VOLUME,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty message="No categories to show yet." />
          )}
        </Panel>
      </div>

      {/* Agents */}
      <Panel
        title="Agent Performance"
        hint={`Replies measured over the last ${windowDays} days`}
        action={
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 gap-1.5 text-xs"
            onClick={exportCsv}
          >
            Export CSV
          </Button>
        }
      >
        {analytics.agents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Agent
                  </th>
                  <th className="pb-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Resolved
                  </th>
                  <th className="pb-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Open
                  </th>
                  <th className="pb-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Replies
                  </th>
                  <th className="pb-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Avg Reply
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {analytics.agents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-slate-700 text-[9px] font-extrabold text-white">
                          {agent.initials}
                        </div>
                        <span className="text-xs font-semibold text-slate-800">{agent.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-center text-xs font-bold text-emerald-600">
                      {agent.settled}
                    </td>
                    <td className="py-2.5 text-center">
                      <span
                        className={cn(
                          "text-xs font-bold",
                          agent.open > 2 ? "text-amber-600" : "text-slate-500",
                        )}
                      >
                        {agent.open}
                      </span>
                    </td>
                    <td className="py-2.5 text-center text-xs font-semibold text-slate-500">
                      {agent.replies}
                    </td>
                    <td className="py-2.5 text-center">
                      {agent.avgReplyMinutes === null ? (
                        <span className="text-[10px] text-slate-400">—</span>
                      ) : (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold",
                            agent.avgReplyMinutes <= 10
                              ? "bg-emerald-50 text-emerald-700"
                              : agent.avgReplyMinutes <= 60
                                ? "bg-amber-50 text-amber-700"
                                : "bg-red-50 text-red-700",
                          )}
                        >
                          {formatDuration(agent.avgReplyMinutes)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            message="No ticket has been assigned or answered yet, so there is nothing to compare."
            height={120}
          />
        )}
      </Panel>

      {/* Needs attention */}
      <Panel
        title="Needs Attention"
        hint="Open tickets waiting on a reply from us, or raised as high priority"
        action={
          <Button asChild size="sm" variant="outline" className="shrink-0 gap-1.5 text-xs">
            <Link href="/admin/support-new">
              Open inbox
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        }
      >
        {analytics.attention.length > 0 ? (
          <div className="space-y-2">
            {analytics.attention.map((row) => (
              <div
                key={row.id}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:gap-3",
                  row.awaitingReply
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-slate-200 bg-slate-50 text-slate-700",
                )}
              >
                <AlertCircle className="size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold">{row.organizationName}</span>
                    <span className="text-[10px] opacity-70">{row.reference}</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase",
                        PRIORITY_BADGE[row.priority],
                      )}
                    >
                      {row.priority}
                    </span>
                    <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                      {STATUS_LABELS[row.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px]">{row.subject}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[10px] font-semibold">
                    {row.awaitingReply
                      ? `waiting ${formatDuration(row.waitingMinutes)}`
                      : `open ${formatDuration(row.waitingMinutes)}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty message="Nothing is waiting on a reply and no high-priority ticket is open." height={120} />
        )}
      </Panel>
    </div>
  );
}
