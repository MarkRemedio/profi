"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Calculator,
  CalendarClock,
  Info,
  Minus,
  Plus,
  Settings,
  TrendingDown,
} from "lucide-react";

import { useCurrency } from "@/components/currency-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CorporationTaxData } from "@/lib/accounting/corporation-tax";


type CorporationViewProps = {
  data: CorporationTaxData;
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));

/**
 * Corporation tax, computed from the ledger as far as the books allow.
 *
 * The accounting profit is exact. Everything after it is an estimate, and the
 * page is built to keep those two apart: what the books say, then what a real
 * computation would add that this one cannot see. The previous version showed a
 * £32,500 liability against £185,000 of profit to every workspace, including
 * sole traders who do not pay corporation tax at all.
 */
export function CorporationView({ data }: CorporationViewProps) {
  const { format } = useCurrency();
  const router = useRouter();
  const { selected } = data;

  if (!data.paysCorporationTax) {
    return (
      <Shell>
        <Card className="border-slate-200">
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
            <div className="shrink-0 rounded-lg bg-slate-100 p-3">
              <Info className="size-6 text-slate-500" />
            </div>
            <div className="flex-1">
              <h3 className="m-0 text-lg font-semibold text-slate-900">
                {data.structure
                  ? "This business does not pay corporation tax"
                  : "No business structure recorded"}
              </h3>
              <p className="m-0 mt-1 text-sm text-slate-600">
                {/* A charity has a structure recorded, so telling it to record
                    one is nonsense — it needs the reason that applies to it. */}
                {data.structure === "sole_trader" || data.structure === "partnership"
                  ? "Corporation tax is charged on companies. Your profits are taxed through self assessment instead."
                  : data.structure === "charity"
                    ? "Charities are exempt on income used for charitable purposes. HMRC can still ask for a return, and non-charitable trading profits are taxable — worth checking with your accountant."
                    : "Corporation tax applies to limited companies. Record your structure so the right taxes are shown."}
              </p>
            </div>
            {data.structure === "sole_trader" || data.structure === "partnership" ? (
              <Button asChild variant="outline" className="w-full shrink-0 sm:w-auto">
                <Link href="/taxes/self-employed">
                  Self assessment
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
            ) : (
              <Button asChild variant="outline" className="w-full shrink-0 sm:w-auto">
                <Link href="/settings/workspace#tax-profile">
                  <Settings className="mr-2 size-4" />
                  Tax profile
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </Shell>
    );
  }

  if (!selected) {
    return (
      <Shell>
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
            <div className="shrink-0 rounded-lg bg-amber-100 p-3">
              <AlertCircle className="size-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="m-0 text-lg font-semibold text-slate-900">
                No financial year end recorded
              </h3>
              <p className="m-0 mt-1 text-sm text-slate-600">
                Corporation tax is charged on the profit of an accounting period, and every
                deadline is counted from when that period ends. Nothing can be worked out until
                the year end is known.
              </p>
            </div>
            <Button asChild variant="outline" className="w-full shrink-0 sm:w-auto">
              <Link href="/settings/workspace#tax-profile">
                <Settings className="mr-2 size-4" />
                Set year end
              </Link>
            </Button>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const { estimate } = selected;

  return (
    <Shell
      action={
        <div className="w-full sm:w-auto">
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Accounting year
          </label>
          <Select
            value={selected.key}
            onValueChange={(key) => router.push(`/taxes/corporation?year=${key}`)}
          >
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.years.map((year) => (
                <SelectItem key={year.key} value={year.key}>
                  {year.label}
                  {year.inProgress ? " (in progress)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      {/* Period, deadlines and the references a CT600 asks for */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-5 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
              Accounting period
            </p>
            <p className="m-0 mt-1 text-sm font-semibold text-slate-900">
              {formatDate(selected.startDate)} – {formatDate(selected.endDate)}
            </p>
            {selected.inProgress && (
              <Badge className="mt-1 bg-blue-100 text-blue-700">In progress</Badge>
            )}
          </div>
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
              Tax due
            </p>
            <p className="m-0 mt-1 text-sm font-semibold text-slate-900">
              {formatDate(selected.paymentDue)}
            </p>
            <p className="m-0 text-xs text-slate-500">Nine months and a day after the year end</p>
          </div>
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
              CT600 due
            </p>
            <p className="m-0 mt-1 text-sm font-semibold text-slate-900">
              {formatDate(selected.returnDue)}
            </p>
            <p className="m-0 text-xs text-slate-500">Three months after the payment</p>
          </div>

          {/* HMRC asks for both on the return. Better to find out they are
              missing now than at the point of filing. */}
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
              References
            </p>
            <p className="m-0 mt-1 font-mono text-sm font-semibold text-slate-900">
              {data.references.taxReference ?? (
                <span className="font-sans font-normal text-amber-600">UTR not recorded</span>
              )}
            </p>
            <p className="m-0 font-mono text-xs text-slate-500">
              {data.references.companyNumber ?? (
                <span className="font-sans text-amber-600">Company number not recorded</span>
              )}
            </p>
            {(!data.references.taxReference || !data.references.companyNumber) && (
              <Link
                href="/settings/workspace#tax-profile"
                className="mt-1 inline-block text-xs font-semibold text-blue-600 hover:underline"
              >
                Add them
              </Link>
            )}
          </div>
        </CardContent>
      </Card>

      {/* The computation */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calculator className="size-5 text-blue-600" />
            <CardTitle>Computation for {selected.label}</CardTitle>
          </div>
          <CardDescription>
            {selected.inProgress
              ? "The year is still running, so these figures keep moving."
              : "From the posted journals for this accounting period."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Line label="Revenue" value={format(selected.revenueMinor)} />
            <Line label="Expenses" value={`(${format(selected.expensesMinor)})`} />
            <Line
              label="Accounting profit"
              value={format(selected.accountingProfitMinor)}
              emphasis
            />
          </div>

          {selected.addBacks.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
                Added back
              </p>
              {selected.addBacks.map((addBack) => (
                <div key={addBack.key}>
                  <Line
                    label={addBack.label}
                    value={`+ ${format(addBack.amountMinor)}`}
                    icon={<Plus className="size-3 text-red-500" />}
                  />
                  <p className="m-0 pl-5 text-xs leading-relaxed text-slate-500">
                    {addBack.detail}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="border-t pt-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="m-0 text-sm text-blue-700">Taxable profit</p>
                <p className="m-0 mt-1 text-2xl font-bold text-blue-800">
                  {format(selected.taxableProfitMinor)}
                </p>
              </div>
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                <p className="m-0 text-sm text-purple-700">Rate</p>
                <p className="m-0 mt-1 text-base font-bold text-purple-800">{estimate.basis}</p>
                {estimate.taxableProfitMinor > 0 && (
                  <p className="m-0 mt-1 text-xs text-purple-700">
                    Effective {(estimate.effectiveRate * 100).toFixed(1)}%
                  </p>
                )}
              </div>
              <div
                className={`rounded-lg border p-4 ${
                  data.estimatesApply
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <p className="m-0 text-sm text-slate-600">Estimated tax</p>
                {data.estimatesApply ? (
                  <p className="m-0 mt-1 text-2xl font-bold text-emerald-800">
                    {format(estimate.taxMinor)}
                  </p>
                ) : (
                  <>
                    <p className="m-0 mt-1 text-lg font-bold text-slate-400">Not available</p>
                    <p className="m-0 mt-1 text-xs leading-relaxed text-slate-500">
                      The UK rate bands are in sterling, and this workspace keeps its books in{" "}
                      {data.baseCurrency}.
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {selected.taxableProfitMinor <= 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <TrendingDown className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <p className="m-0 text-sm text-slate-600">
                No taxable profit this period, so no corporation tax is due. A trading loss can
                usually be carried forward against future profits, or back against the previous
                year — worth raising with your accountant, as nothing here tracks it.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* What a real computation would add */}
      <Card className="border-amber-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="size-5 text-amber-600" />
            <CardTitle className="text-base">What this estimate leaves out</CardTitle>
          </div>
          <CardDescription>
            A filed computation includes these. None can be derived from the books, so the real
            figure will differ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.missingAdjustments.map((missing) => (
              <div key={missing.key} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 shrink-0 rounded p-1 ${
                    missing.direction === "reduces"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-red-50 text-red-600"
                  }`}
                >
                  {missing.direction === "reduces" ? (
                    <Minus className="size-3" />
                  ) : (
                    <Plus className="size-3" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="m-0 text-sm font-semibold text-slate-800">
                    {missing.label}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      {missing.direction === "reduces" ? "would reduce the bill" : "would increase it"}
                    </span>
                  </p>
                  <p className="m-0 mt-0.5 text-xs leading-relaxed text-slate-500">
                    {missing.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Previous years */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarClock className="size-5 text-blue-600" />
            <CardTitle>Previous years</CardTitle>
          </div>
          <CardDescription>
            The same computation applied to each earlier accounting period
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead className="hidden sm:table-cell">Period</TableHead>
                <TableHead className="text-right">Accounting profit</TableHead>
                <TableHead className="text-right">Taxable profit</TableHead>
                <TableHead className="text-right">Estimated tax</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.years.map((year) => (
                <TableRow
                  key={year.key}
                  className={`cursor-pointer ${year.key === selected.key ? "bg-blue-50/50" : ""}`}
                  onClick={() => router.push(`/taxes/corporation?year=${year.key}`)}
                >
                  <TableCell className="font-medium">
                    {year.label}
                    {year.inProgress && (
                      <span className="ml-2 text-xs font-normal text-blue-600">running</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap text-slate-500 sm:table-cell">
                    {formatDate(year.startDate)} – {formatDate(year.endDate)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {format(year.accountingProfitMinor)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    {format(year.taxableProfitMinor)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right font-semibold">
                    {data.estimatesApply ? format(year.estimate.taxMinor) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="m-0 mt-3 text-xs leading-relaxed text-slate-500">
            These are computed now, from the ledger as it stands today. They are not what was
            filed — a year already submitted to HMRC will have had adjustments this cannot see.
          </p>
        </CardContent>
      </Card>

      {/* Provision */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posting the provision</CardTitle>
          <CardDescription>
            The year-end journal that puts the tax charge into your books
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.provisionAccounts.length === 0 ? (
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <Info className="mt-0.5 size-4 shrink-0 text-slate-400" />
              <div className="min-w-0">
                <p className="m-0 text-sm font-medium text-slate-800">
                  No corporation tax accounts in your chart
                </p>
                <p className="m-0 mt-1 text-xs leading-relaxed text-slate-600">
                  A provision needs an expense account for the charge and a liability account for
                  what is owed. Add both in the chart of accounts, then post the journal dated{" "}
                  {formatDate(selected.endDate)} — debit the charge, credit the liability.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href="/accounting/chart-of-accounts">Chart of accounts</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/accounting/journals">Journals</Link>
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="m-0 text-sm text-slate-600">
                Post a journal dated {formatDate(selected.endDate)} against these accounts —
                debit the charge, credit the liability.
              </p>
              <div className="rounded-lg bg-slate-50 p-4 font-mono text-sm">
                {data.provisionAccounts.map((account) => (
                  <div key={account.code} className="grid grid-cols-2 gap-4 py-1">
                    <span>{account.code}</span>
                    <span className="text-slate-600">{account.name}</span>
                  </div>
                ))}
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/accounting/journals">Open journals</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}

function Shell({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900">Corporation Tax</h1>
          <p className="text-slate-600">Estimated from your ledger, before adjustments</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Line({
  label,
  value,
  emphasis = false,
  icon,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 ${
        emphasis ? "border-t pt-2 font-bold text-slate-900" : "text-slate-600"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        {icon}
        {label}
      </span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}
