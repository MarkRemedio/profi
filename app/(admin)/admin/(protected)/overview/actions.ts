"use server";

import { ADMIN_AUDIT_LABELS, type AdminAuditAction } from "@/lib/admin/audit";
import { requireAdminPermission } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";

const ACTIVE_STATUSES = new Set(["active"]);
const TRIAL_STATUSES = new Set(["trial", "trialing"]);
const PAYMENT_PROBLEM_STATUSES = new Set(["past_due", "unpaid", "incomplete"]);
const SUSPENDED_STATUSES = new Set(["suspended"]);
const CANCELLED_STATUSES = new Set(["canceled", "cancelled"]);
const PLAN_COLORS = ["#14b8a6", "#6366f1", "#f59e0b", "#ec4899", "#0ea5e9"];
const ACTIVITY_LIMIT = 8;

export type AdminOverviewData = {
  metrics: {
    mrr: number;
    arr: number;
    activeClients: number;
    newSignups: number;
    pendingOnboarding: number;
    arpu: number;
    trialConversionRate: number;
    convertedTrials: number;
    measuredTrials: number;
    activeTrials: number;
    trialsExpiringSoon: number;
    openIssues: number;
  };
  tenantTotal: number;
  tenantStatus: Array<{
    label: string;
    count: number;
    color: string;
    pct: number;
  }>;
  mrrBySignupCohort: Array<{ month: string; mrr: number }>;
  planDistribution: Array<{ name: string; value: number; count: number; color: string }>;
  topClients: Array<{
    id: string;
    name: string;
    mrr: number;
    plan: string;
    health: "healthy" | "warning" | "critical";
    initials: string;
  }>;
  recentActivity: Array<{
    id: string;
    actor: string;
    action: string;
    target: string;
    time: string;
    severity: "info" | "warning" | "critical";
  }>;
  alerts: Array<{
    id: string;
    level: "danger" | "warning" | "info";
    text: string;
    action: string;
    href: string;
  }>;
};

function normaliseStatus(status: string | null | undefined) {
  return status?.trim().toLowerCase() ?? "";
}

function monthlyRevenue(price: number, interval: string) {
  switch (interval.trim().toLowerCase()) {
    case "year":
    case "yearly":
    case "annual":
      return price / 12;
    case "quarter":
    case "quarterly":
      return price / 3;
    case "week":
    case "weekly":
      return (price * 52) / 12;
    case "day":
    case "daily":
      return (price * 365) / 12;
    default:
      return price;
  }
}

function initialsFrom(name: string) {
  return (
    name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??"
  );
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function cohortMonths(now: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (6 - index), 1);
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: date.toLocaleDateString("en-GB", { month: "short", year: "2-digit" }),
    };
  });
}

function relativeTime(value: Date, now: Date) {
  const minutes = Math.max(0, Math.floor((now.getTime() - value.getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export async function getAdminOverview(): Promise<AdminOverviewData> {
  await requireAdminPermission("overview");

  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const conversionWindowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const expiringSoon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const cohorts = cohortMonths(now);
  const cohortStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);

  // The overview is deliberately platform-wide. The permission check above
  // authorizes the admin; this context explicitly allows the cross-org reads.
  const [organizations, openIssues, pendingOnboarding, auditEvents] = await runAsSystem(async () =>
    Promise.all([
      prisma.organization.findMany({
        where: { deleted_at: null },
        select: {
          id: true,
          name: true,
          subscription_status: true,
          createdAt: true,
          trialEndsAt: true,
          subscriptionPlan: {
            select: { name: true, price: true, interval: true },
          },
        },
      }),
      prisma.feedbackReport.count({ where: { status: "NEW" } }),
      prisma.clientInvitation.count({ where: { status: { not: "established" } } }),
      prisma.adminAuditEvent.findMany({
        orderBy: { createdAt: "desc" },
        take: ACTIVITY_LIMIT,
        select: {
          id: true,
          actorName: true,
          actorEmail: true,
          action: true,
          targetLabel: true,
          targetId: true,
          severity: true,
          createdAt: true,
        },
      }),
    ]),
  );

  const enriched = organizations.map((organization) => {
    const status = normaliseStatus(organization.subscription_status);
    const price = Number(organization.subscriptionPlan?.price ?? 0);
    const mrr = organization.subscriptionPlan
      ? monthlyRevenue(price, organization.subscriptionPlan.interval)
      : 0;

    return { organization, status, mrr };
  });

  const paying = enriched.filter(({ status, mrr }) => ACTIVE_STATUSES.has(status) && mrr > 0);
  const mrr = paying.reduce((sum, item) => sum + item.mrr, 0);
  const activeClients = enriched.filter(({ status }) => ACTIVE_STATUSES.has(status)).length;
  const activeTrials = enriched.filter(({ status }) => TRIAL_STATUSES.has(status)).length;
  const suspended = enriched.filter(({ status }) => SUSPENDED_STATUSES.has(status)).length;
  const paymentProblems = enriched.filter(({ status }) =>
    PAYMENT_PROBLEM_STATUSES.has(status),
  ).length;
  const cancelled = enriched.filter(({ status }) => CANCELLED_STATUSES.has(status)).length;
  const newSignups = enriched.filter(
    ({ organization }) => organization.createdAt >= currentMonthStart,
  ).length;
  const trialsExpiringSoon = enriched.filter(
    ({ organization, status }) =>
      TRIAL_STATUSES.has(status) &&
      organization.trialEndsAt !== null &&
      organization.trialEndsAt >= now &&
      organization.trialEndsAt <= expiringSoon,
  ).length;

  // Existing data has no status history. This intentionally measures the current
  // outcome of the last 30 days' signup cohort: active versus still trialing.
  const conversionCohort = enriched.filter(
    ({ organization, status }) =>
      organization.createdAt >= conversionWindowStart &&
      (ACTIVE_STATUSES.has(status) || TRIAL_STATUSES.has(status)),
  );
  const convertedTrials = conversionCohort.filter(({ status }) =>
    ACTIVE_STATUSES.has(status),
  ).length;
  const trialConversionRate = conversionCohort.length
    ? (convertedTrials / conversionCohort.length) * 100
    : 0;

  const knownTenantCount = activeClients + activeTrials + suspended + paymentProblems + cancelled;
  const other = Math.max(organizations.length - knownTenantCount, 0);
  const statusRows = [
    { label: "Active", count: activeClients, color: "bg-emerald-500" },
    { label: "Trial", count: activeTrials, color: "bg-blue-400" },
    { label: "Suspended", count: suspended, color: "bg-amber-500" },
    { label: "Payment issue", count: paymentProblems, color: "bg-red-500" },
    { label: "Cancelled", count: cancelled, color: "bg-slate-400" },
    { label: "Other", count: other, color: "bg-violet-400" },
  ].filter((row) => row.count > 0);

  const tenantStatus = statusRows.map((row) => ({
    ...row,
    pct: organizations.length ? (row.count / organizations.length) * 100 : 0,
  }));

  // This is current MRR grouped by when each paying client signed up. It is not
  // presented as historical MRR because the schema does not retain plan history.
  const mrrBySignupCohort = cohorts.map((cohort) => ({
    month: cohort.label,
    mrr: paying
      .filter(({ organization }) => {
        if (organization.createdAt < cohortStart) return false;
        return (
          `${organization.createdAt.getFullYear()}-${organization.createdAt.getMonth()}` ===
          cohort.key
        );
      })
      .reduce((sum, item) => sum + item.mrr, 0),
  }));

  const planCounts = new Map<string, number>();
  for (const { organization } of enriched) {
    const planName = organization.subscriptionPlan?.name ?? "No plan";
    planCounts.set(planName, (planCounts.get(planName) ?? 0) + 1);
  }
  const planDistribution = [...planCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count], index) => ({
      name,
      count,
      value: organizations.length ? (count / organizations.length) * 100 : 0,
      color: PLAN_COLORS[index % PLAN_COLORS.length],
    }));

  const topClients = paying
    .sort((a, b) => b.mrr - a.mrr)
    .slice(0, 5)
    .map(({ organization, status, mrr: clientMrr }) => ({
      id: organization.id,
      name: organization.name,
      mrr: clientMrr,
      plan: organization.subscriptionPlan?.name ?? "No plan",
      health: PAYMENT_PROBLEM_STATUSES.has(status)
        ? ("critical" as const)
        : SUSPENDED_STATUSES.has(status)
          ? ("warning" as const)
          : ("healthy" as const),
      initials: initialsFrom(organization.name),
    }));

  // `severity` is a free-text column in the database, so anything unrecognised
  // is treated as informational rather than trusted into the union.
  const auditSeverity = (value: string): "info" | "warning" | "critical" =>
    value === "critical" || value === "warning" ? value : "info";

  const recentActivity = auditEvents.map((event) => ({
    id: event.id,
    actor: event.actorName || event.actorEmail?.split("@")[0] || "System",
    action:
      ADMIN_AUDIT_LABELS[event.action as AdminAuditAction] ?? event.action.replace(/[._]/g, " "),
    target: event.targetLabel ?? event.targetId ?? "Platform",
    time: relativeTime(event.createdAt, now),
    severity: auditSeverity(event.severity),
  }));

  const alerts: AdminOverviewData["alerts"] = [];
  if (paymentProblems > 0) {
    alerts.push({
      id: "payment-problems",
      level: "danger",
      text: `${paymentProblems} client${paymentProblems === 1 ? " has" : "s have"} a payment issue`,
      action: "Review",
      href: "/admin/subscriptions",
    });
  }
  if (openIssues > 0) {
    alerts.push({
      id: "open-feedback",
      level: "warning",
      text: `${openIssues} new support issue${openIssues === 1 ? "" : "s"} need review`,
      action: "Review",
      href: "/admin/feedback",
    });
  }
  if (trialsExpiringSoon > 0) {
    alerts.push({
      id: "expiring-trials",
      level: "warning",
      text: `${trialsExpiringSoon} trial${trialsExpiringSoon === 1 ? "" : "s"} expire within 7 days`,
      action: "View",
      href: "/admin/clients",
    });
  }
  if (pendingOnboarding > 0) {
    alerts.push({
      id: "pending-onboarding",
      level: "info",
      text: `${pendingOnboarding} client onboarding${pendingOnboarding === 1 ? " is" : "s are"} still pending`,
      action: "View",
      href: "/admin/accountant",
    });
  }

  return {
    metrics: {
      mrr,
      arr: mrr * 12,
      activeClients,
      newSignups,
      pendingOnboarding,
      arpu: paying.length ? mrr / paying.length : 0,
      trialConversionRate,
      convertedTrials,
      measuredTrials: conversionCohort.length,
      activeTrials,
      trialsExpiringSoon,
      openIssues,
    },
    tenantTotal: organizations.length,
    tenantStatus,
    mrrBySignupCohort,
    planDistribution,
    topClients,
    recentActivity,
    alerts,
  };
}
