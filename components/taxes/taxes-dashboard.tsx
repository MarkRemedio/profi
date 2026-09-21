"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRightLeft,
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  Euro,
  Info,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { useCurrency } from "@/components/currency-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuickAction, QuickActions } from "@/components/shared/quick-actions";
import type { DeadlineUrgency, TaxOverviewData } from "@/lib/accounting/tax-overview";

type TaxesDashboardProps = {
  overview: TaxOverviewData;
};

const URGENCY_STYLES: Record<DeadlineUrgency, { row: string; badge: string; label: string }> = {
  overdue: {
    row: "bg-red-50 border-red-200",
    badge: "bg-red-100 text-red-700",
    label: "Overdue",
  },
  urgent: {
    row: "bg-amber-50 border-amber-200",
    badge: "bg-amber-100 text-amber-700",
    label: "Due soon",
  },
  upcoming: {
    row: "bg-slate-50 border-slate-200",
    badge: "bg-blue-100 text-blue-700",
    label: "Upcoming",
  },
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));

function countdown(daysLeft: number) {
  if (daysLeft < 0) return `${Math.abs(daysLeft)} day${daysLeft === -1 ? "" : "s"} late`;
  if (daysLeft === 0) return "Today";
  return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
}

/**
 * The tax dashboard, driven by this workspace's own setup and ledger.
 *
 * A deadline appears only if it applies to this business — a sole trader is not
 * shown corporation tax, and CIS300 only turns up for a contractor. A figure
 * appears only if it can be worked out from the books; where it cannot, the
 * card says why rather than showing a number that came from nowhere.
 */
export function TaxesDashboard({ overview }: TaxesDashboardProps) {
  const { format } = useCurrency();
  const { profile, performance } = overview;

  const modules = [
    {
      href: "/taxes/vat",
      title: "VAT",
      description: "Nine-box return, periods and adjustments",
      icon: Receipt,
    },
    {
      href: "/taxes/corporation",
      title: "Corporation tax",
      description: "Estimates, adjustments and the CT600",
      icon: Building2,
    },
    {
      href: "/taxes/self-employed",
      title: "Self-employed (MTD)",
      description: "Quarterly updates and ITSA",
      icon: Wallet,
    },
    {
      href: "/taxes/forex",
      title: "Foreign exchange",
      description: "Realised and unrealised gains and losses",
      icon: ArrowRightLeft,
    },
    {
      href: "/taxes/cis",
      title: "CIS",
      description: "Subcontractor verification and CIS300 returns",
      icon: Briefcase,
    },
    {
      href: "/taxes/ec-sales",
      title: "EC sales",
      description: "ESL returns for Northern Ireland businesses",
      icon: Euro,
    },
    {
      href: "/taxes/capital-gains",
      title: "Capital gains",
      description: "Asset disposals and 60-day reporting",
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900">Taxes &amp; Compliance</h1>
          <p className="text-slate-600">
            {profile.structureLabel} · tax year {profile.taxYearLabel}
            {profile.financialYear
              ? ` · year ends ${formatDate(profile.financialYear.endDate)}`
              : ""}
          </p>
        </div>
        <QuickActions>
          {modules.map((module, index) => (
            <QuickAction
              key={module.href}
              href={module.href}
              icon={module.icon}
              label={module.title}
              description={module.description}
              primary={index === 0}
            />
          ))}
          <QuickAction
            href="/settings/workspace#tax-profile"
            icon={ShieldCheck}
            label="Tax profile"
            description="Update the workspace tax setup"
          />
        </QuickActions>
      </div>

      {/* What we had to guess */}
      {profile.assumptions.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="flex items-start gap-3 p-4">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold text-slate-900">
                Some of your tax setup is missing
              </p>
              <ul className="m-0 mt-1 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-slate-600">
                {profile.assumptions.map((assumption) => (
                  <li key={assumption}>{assumption}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Liabilities */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Profit this year
            </CardTitle>
            <TrendingUp className="size-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-black ${
                performance.profitMinor >= 0 ? "text-slate-900" : "text-red-600"
              }`}
            >
              {format(performance.profitMinor)}
            </div>
            <p className="m-0 mt-1 text-xs text-slate-500">
              {format(performance.revenueMinor)} in, {format(performance.expensesMinor)} out
            </p>
            <p className="m-0 text-xs text-slate-400">
              {formatDate(performance.fromDate)} – {formatDate(performance.toDate)}
            </p>
          </CardContent>
        </Card>

        {overview.liabilities.map((liability) => (
          <Card key={liability.key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {liability.title}
              </CardTitle>
              <Receipt className="size-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              {liability.amountMinor === null ? (
                <>
                  <div className="text-lg font-bold text-slate-400">Not available</div>
                  <p className="m-0 mt-1 text-xs leading-relaxed text-slate-500">
                    {liability.unavailableReason}
                  </p>
                </>
              ) : (
                <>
                  <div className="text-2xl font-black text-slate-900">
                    {format(liability.amountMinor)}
                  </div>
                  <p className="m-0 mt-1 text-xs text-slate-500">{liability.detail}</p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Estimates are estimates */}
      {overview.liabilities.some((l) => l.key !== "vat" && l.amountMinor !== null) && (
        <p className="m-0 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
          <Info className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
          Tax estimates are calculated from your books as they stand. Disallowable expenses,
          capital allowances, reliefs and losses brought forward are not recorded here, so the
          final figure will differ — treat these as a guide, not a return.
        </p>
      )}

      {/* Deadlines */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarClock className="size-5 text-blue-600" />
            <CardTitle>Deadlines</CardTitle>
          </div>
          <CardDescription>
            Only the returns and payments this business actually has to make
          </CardDescription>
        </CardHeader>
        <CardContent>
          {overview.deadlines.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-6 text-sm text-slate-500">
              <CheckCircle2 className="size-4 shrink-0 text-slate-300" />
              Nothing is due in the next twelve months. Record your business structure and year end
              if you expect to see corporation tax or self assessment here.
            </div>
          ) : (
            <div className="space-y-3">
              {overview.deadlines.map((deadline) => {
                const style = URGENCY_STYLES[deadline.urgency];
                return (
                  <div
                    key={deadline.key}
                    className={`flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${style.row}`}
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`shrink-0 rounded-lg p-2 ${
                          deadline.urgency === "upcoming" ? "bg-white" : "bg-white/70"
                        }`}
                      >
                        {deadline.urgency === "overdue" ? (
                          <AlertTriangle className="size-4 text-red-600" />
                        ) : (
                          <CalendarClock className="size-4 text-slate-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="m-0 font-medium text-slate-900">{deadline.title}</p>
                        <p className="m-0 text-sm text-slate-600">
                          Due {formatDate(deadline.dueDate)} · {deadline.detail}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                      <Badge className={style.badge}>{style.label}</Badge>
                      <span
                        className={`text-sm font-medium ${
                          deadline.urgency === "overdue" ? "text-red-600" : "text-slate-600"
                        }`}
                      >
                        {countdown(deadline.daysLeft)}
                      </span>
                      <Button asChild size="sm" variant="outline" className="shrink-0">
                        <Link href={deadline.href}>Open</Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
