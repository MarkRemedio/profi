"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  Info,
  Settings,
  Split,
  Wallet,
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
import type { ItsaQuarterStatus, SelfEmployedData } from "@/lib/accounting/self-employed";

type SelfEmployedViewProps = {
  data: SelfEmployedData;
};

const STATUS_BADGE: Record<ItsaQuarterStatus, { label: string; className: string }> = {
  future: { label: "Not started", className: "bg-slate-100 text-slate-600" },
  open: { label: "In progress", className: "bg-blue-100 text-blue-700" },
  due: { label: "Ready to submit", className: "bg-amber-100 text-amber-700" },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-700" },
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));

/**
 * Self assessment and MTD for Income Tax, from this workspace's ledger.
 *
 * Profit is on the tax year basis, 6 April to 5 April, which is what every sole
 * trader and partnership uses from 2024/25. The quarters follow the same
 * calendar, so reading the ledger by date gives the right figures with no
 * apportionment.
 *
 * The estimate deliberately understates: the books hold the business, not the
 * person. Any other income pushes them into higher bands.
 */
export function SelfEmployedView({ data }: SelfEmployedViewProps) {
  const { format } = useCurrency();
  const router = useRouter();

  if (!data.filesSelfAssessment) {
    return (
      <Shell>
        <Card className="border-slate-200">
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
            <div className="shrink-0 rounded-lg bg-slate-100 p-3">
              <Info className="size-6 text-slate-500" />
            </div>
            <div className="flex-1">
              <h3 className="m-0 text-lg font-semibold text-slate-900">
                {data.structure === "limited_company"
                  ? "A company does not file a self assessment"
                  : data.structure === "charity"
                    ? "A charity does not file a self assessment"
                    : "No business structure recorded"}
              </h3>
              <p className="m-0 mt-1 text-sm text-slate-600">
                {/* Same as the corporation tax page: a charity has recorded a
                    structure, so it must not be asked to record one. */}
                {data.structure === "limited_company"
                  ? "Company profits are taxed through corporation tax. Directors file their own personal returns, which are outside this workspace."
                  : data.structure === "charity"
                    ? "Self assessment is a personal return, filed by individuals rather than by an organisation."
                    : "Self assessment applies to sole traders and partnerships. Record your structure so the right taxes are shown."}
              </p>
            </div>
            {data.structure === "limited_company" ? (
              <Button asChild variant="outline" className="w-full shrink-0 sm:w-auto">
                <Link href="/taxes/corporation">
                  Corporation tax
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

  const { yearToDate, estimate } = data;

  return (
    <Shell
      action={
        <div className="w-full sm:w-auto">
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Tax year
          </label>
          <Select
            value={data.taxYear.label}
            onValueChange={(label) =>
              router.push(`/taxes/self-employed?year=${encodeURIComponent(label)}`)
            }
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.taxYears.map((year) => (
                <SelectItem key={year.label} value={year.label}>
                  {year.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >
      {/* Year to date */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Income" value={format(yearToDate.incomeMinor)} tone="income" />
        <Tile label="Expenses" value={format(yearToDate.expensesMinor)} tone="expense" />
        <Tile
          label="Profit"
          value={format(yearToDate.profitMinor)}
          tone={yearToDate.profitMinor >= 0 ? "profit" : "expense"}
          detail={`${formatDate(data.taxYear.startDate)} – ${formatDate(data.taxYear.endDate)}`}
        />
        <Card>
          <CardContent className="p-4">
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
              Estimated tax
            </p>
            {estimate ? (
              <>
                <p className="m-0 mt-1 text-2xl font-black text-slate-900">
                  {format(estimate.totalMinor)}
                </p>
                <p className="m-0 mt-1 text-xs text-slate-500">
                  {format(estimate.incomeTaxMinor)} income tax ·{" "}
                  {format(estimate.class4NiMinor)} Class 4 NI
                </p>
              </>
            ) : (
              <>
                <p className="m-0 mt-1 text-lg font-bold text-slate-400">Not available</p>
                <p className="m-0 mt-1 text-xs leading-relaxed text-slate-500">
                  The UK rate bands are in sterling, and this workspace keeps its books in{" "}
                  {data.baseCurrency}.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* What the estimate assumes */}
      {estimate && (
        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
            <div className="min-w-0 text-xs leading-relaxed text-slate-600">
              <p className="m-0 text-sm font-semibold text-slate-900">
                What this estimate assumes
              </p>
              <ul className="m-0 mt-1 list-disc space-y-1 pl-4">
                <li>
                  This profit is your only income. A salary, rental income, dividends or savings
                  interest would push part of it into a higher band, so treat this as a floor.
                </li>
                <li>
                  Every expense in the books is allowable. Client entertainment is not, and
                  private use of a car, phone or home has to be split out — nothing here marks
                  either.
                </li>
                <li>
                  {data.isPartnership
                    ? "You are a partnership, so this profit is shared between the partners. Each partner is taxed on their own share, not on the whole figure above."
                    : "Class 2 National Insurance is not included; most self-employed people no longer pay it."}
                </li>
                <li>
                  Bands are the 2025/26 rates for England, Wales and Northern Ireland. Scotland
                  sets its own.
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quarterly updates */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarClock className="size-5 text-blue-600" />
            <CardTitle>Quarterly updates</CardTitle>
          </div>
          <CardDescription>
            MTD quarters run 6 April to 5 July and on from there, each due by the 7th of the month
            after it ends
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quarter</TableHead>
                <TableHead className="hidden sm:table-cell">Period</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Income</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.quarters.map((quarter) => {
                const badge = STATUS_BADGE[quarter.status];
                return (
                  <TableRow key={quarter.key}>
                    <TableCell className="font-medium">{quarter.label}</TableCell>
                    <TableCell className="hidden whitespace-nowrap text-slate-500 sm:table-cell">
                      {formatDate(quarter.startDate)} – {formatDate(quarter.endDate)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(quarter.dueDate)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-emerald-700">
                      {format(quarter.incomeMinor)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-red-600">
                      {format(quarter.expensesMinor)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold">
                      {format(quarter.profitMinor)}
                    </TableCell>
                    <TableCell>
                      <Badge className={badge.className}>{badge.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="border-t-2 font-bold">
                <TableCell colSpan={3}>Year to date</TableCell>
                <TableCell className="text-right">{format(yearToDate.incomeMinor)}</TableCell>
                <TableCell className="text-right">{format(yearToDate.expensesMinor)}</TableCell>
                <TableCell className="text-right">{format(yearToDate.profitMinor)}</TableCell>
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>

          <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <Info className="mt-0.5 size-4 shrink-0 text-slate-400" />
            <p className="m-0 text-xs leading-relaxed text-slate-600">
              Nothing here is submitted to HMRC. Once this workspace is authorised for Making Tax
              Digital, quarterly updates can be sent from this page and their status read back.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Expenses by category */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Split className="size-5 text-blue-600" />
            <CardTitle>Expenses by category</CardTitle>
          </div>
          <CardDescription>
            Where the money went this tax year, taken from the account each cost was posted to
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.expenseCategories.length === 0 ? (
            <div className="rounded-lg bg-slate-50 px-3 py-6 text-sm text-slate-500">
              No expenses recorded in this tax year.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.expenseCategories.map((category) => (
                  <TableRow key={category.code}>
                    <TableCell>
                      <span className="font-mono text-xs text-slate-400">{category.code}</span>{" "}
                      <span className="font-medium">{category.name}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {format(category.amountMinor)}
                    </TableCell>
                    <TableCell className="hidden text-right text-slate-500 sm:table-cell">
                      {yearToDate.expensesMinor > 0
                        ? `${((category.amountMinor / yearToDate.expensesMinor) * 100).toFixed(1)}%`
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="m-0 mt-3 text-xs leading-relaxed text-slate-500">
            Every figure here is treated as fully allowable. Splitting private use out of a phone,
            car or home office is done on the return, and nothing in the books records the split.
          </p>
        </CardContent>
      </Card>

      {/* Key dates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Key dates for {data.taxYear.label}</CardTitle>
          <CardDescription>After the tax year ends on 5 April</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
              Return and balancing payment
            </p>
            <p className="m-0 mt-1 text-sm font-semibold text-slate-900">
              {formatDate(data.deadlines.finalDeclarationDue)}
            </p>
            <p className="m-0 text-xs text-slate-500">
              Filed online, with whatever is still owed for the year
            </p>
          </div>
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
              Second payment on account
            </p>
            <p className="m-0 mt-1 text-sm font-semibold text-slate-900">
              {formatDate(data.deadlines.secondPaymentOnAccountDue)}
            </p>
            <p className="m-0 text-xs text-slate-500">
              Half of last year&apos;s bill, paid towards the next
            </p>
          </div>
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
              Filed under
            </p>
            {/* The return is filed against a UTR, so a missing one is worth
                knowing about before the deadline rather than on the day. */}
            {data.taxReference ? (
              <>
                <p className="m-0 mt-1 font-mono text-sm font-semibold text-slate-900">
                  {data.taxReference}
                </p>
                <p className="m-0 text-xs text-slate-500">Your Unique Taxpayer Reference</p>
              </>
            ) : (
              <>
                <p className="m-0 mt-1 text-sm font-semibold text-amber-600">UTR not recorded</p>
                <Link
                  href="/settings/workspace#tax-profile"
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  Add it
                </Link>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="m-0 text-xs leading-relaxed text-slate-500">
        Profit is taken on the tax year basis — 6 April to 5 April — as required from 2024/25.
        Your accounting year end does not change it.
      </p>
    </Shell>
  );
}

function Shell({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900">Self-Employed (MTD)</h1>
          <p className="text-slate-600">
            Income tax self assessment, calculated from your ledger
          </p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  detail,
}: {
  label: string;
  value: string;
  tone: "income" | "expense" | "profit";
  detail?: string;
}) {
  const colour =
    tone === "income" ? "text-emerald-700" : tone === "expense" ? "text-red-600" : "text-slate-900";

  return (
    <Card>
      <CardContent className="p-4">
        <p className="m-0 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
          <Wallet className="size-3.5" />
          {label}
        </p>
        <p className={`m-0 mt-1 text-2xl font-black ${colour}`}>{value}</p>
        {detail && <p className="m-0 mt-1 text-xs text-slate-500">{detail}</p>}
      </CardContent>
    </Card>
  );
}
