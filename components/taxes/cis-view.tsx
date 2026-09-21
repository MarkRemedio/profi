"use client";

import Link from "next/link";
import { Briefcase, CalendarClock, Info, Settings } from "lucide-react";

import { useCurrency } from "@/components/currency-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ModuleRequirements } from "@/components/taxes/module-requirements";
import type { CisData } from "@/lib/accounting/tax-modules";

type CisViewProps = {
  data: CisData;
};

/**
 * HMRC's fixed penalty for a late CIS300, which is the same sum for everybody
 * and is not a figure from this workspace's books.
 */
const LATE_FILING_PENALTY = "£100"; // currency:allow a UK statutory penalty, fixed in sterling

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));

const daysUntil = (iso: string, today: string) =>
  Math.round(
    (new Date(`${iso}T00:00:00.000Z`).getTime() -
      new Date(`${today}T00:00:00.000Z`).getTime()) /
      86_400_000
  );

/**
 * The Construction Industry Scheme.
 *
 * A contractor deducts tax from what it pays subcontractors and hands it to
 * HMRC, reporting every month on a CIS300. None of that can be derived from the
 * books as they stand: nothing marks a bill as a subcontractor payment, splits
 * labour from materials, or records a verified deduction rate.
 *
 * So the one thing that is real — the monthly deadline, which falls whether or
 * not any payments were made — is shown, and the rest is set out as what would
 * have to exist. The page previously listed five invented subcontractors with
 * UTRs and verification numbers.
 */
export function CisView({ data }: CisViewProps) {
  const { format } = useCurrency();
  const days = daysUntil(data.nextReturn.dueDate, data.today);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900">CIS (Construction)</h1>
          <p className="text-slate-600">
            Deductions from subcontractor payments, and the monthly CIS300
          </p>
        </div>
        <Button asChild variant="outline" className="w-full sm:w-auto">
          <Link href="/settings/workspace#tax-profile">
            <Settings className="mr-2 size-4" />
            Tax profile
          </Link>
        </Button>
      </div>

      {!data.isContractor ? (
        <Card className="border-slate-200">
          <CardContent className="flex items-start gap-3 p-4">
            <Info className="mt-0.5 size-4 shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold text-slate-900">
                This workspace is not set up as a CIS contractor
              </p>
              <p className="m-0 mt-1 text-sm leading-relaxed text-slate-600">
                The scheme applies to businesses in construction that pay subcontractors. If that
                is you, tick <strong>We pay CIS subcontractors</strong> in your tax profile — the
                monthly deadline will then appear on your tax dashboard.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className={days <= 14 ? "border-amber-200" : undefined}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CalendarClock className="size-5 text-blue-600" />
              <CardTitle>Next CIS300</CardTitle>
            </div>
            <CardDescription>
              A contractor files every month, even for a month with no payments — a nil return is
              still a return, and missing one is an automatic {LATE_FILING_PENALTY} penalty
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div>
              <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
                Tax month ending
              </p>
              <p className="m-0 mt-1 text-sm font-semibold text-slate-900">
                {formatDate(data.nextReturn.periodEnd)}
              </p>
              <p className="m-0 text-xs text-slate-500">CIS months run to the 5th</p>
            </div>
            <div>
              <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
                Return due
              </p>
              <p className="m-0 mt-1 text-sm font-semibold text-slate-900">
                {formatDate(data.nextReturn.dueDate)}
              </p>
              <p className="m-0 text-xs text-slate-500">
                {days < 0
                  ? `${Math.abs(days)} days late`
                  : days === 0
                    ? "Today"
                    : `${days} day${days === 1 ? "" : "s"} left`}
              </p>
            </div>
            <div>
              <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
                Deductions to report
              </p>
              <p className="m-0 mt-1 text-lg font-bold text-slate-400">Not tracked</p>
              <p className="m-0 text-xs text-slate-500">See below</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Whatever CIS accounts exist */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Briefcase className="size-5 text-blue-600" />
              <CardTitle>Deductions held</CardTitle>
            </div>
            <Badge variant="outline">{data.supplierCount} suppliers on file</Badge>
          </div>
          <CardDescription>
            Balances on any account in your chart whose name mentions CIS
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.cisAccounts.length === 0 ? (
            <div className="rounded-lg bg-slate-50 px-4 py-6 text-sm text-slate-600">
              <p className="m-0 font-medium text-slate-700">No CIS account in your chart</p>
              <p className="m-0 mt-1 text-slate-500">
                Money withheld from a subcontractor belongs to HMRC, not to the supplier, so it
                needs its own liability account rather than sitting in accounts payable.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {data.cisAccounts.map((account) => (
                <div
                  key={account.code}
                  className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/60 p-3"
                >
                  <span className="min-w-0 truncate">
                    <span className="font-mono text-xs text-slate-400">{account.code}</span>{" "}
                    <span className="font-medium text-slate-800">{account.name}</span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {format(account.balanceMinor)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ModuleRequirements
        requirements={data.requirements}
        description="CIS returns cannot be produced from the books as they stand. Here is what is missing."
      />
    </div>
  );
}
