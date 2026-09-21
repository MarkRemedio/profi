"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  FileText,
  Info,
  Landmark,
  Layers,
  Loader2,
  Receipt,
  Settings,
  ShieldCheck,
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
import { saveVatFilingSettings } from "@/app/(dashboard)/vat-actions";
import type { VatReturnData } from "@/lib/accounting/vat-return";
import type { VatPeriodStatus } from "@/lib/accounting/vat-periods";
import type { VatObligation } from "@/lib/tax/hmrc-types";

/**
 * What HMRC itself says about this business's filing periods.
 *
 * Null when the workspace has not authorised Making Tax Digital, which is a
 * different thing from HMRC holding no periods — the page has to distinguish
 * "we never asked" from "HMRC says there are none".
 */
export type HmrcObligationsPanel =
  | null
  | { connected: false }
  | { connected: true; ok: true; obligations: VatObligation[] }
  | { connected: true; ok: false; error: string; reauthorise: boolean };

type VatViewProps = {
  data: VatReturnData;
  hmrc?: HmrcObligationsPanel;
};

const SCHEME_LABELS: Record<string, string> = {
  standard: "Standard accounting",
  cash: "Cash accounting",
  flat_rate: "Flat rate scheme",
  retail: "Retail scheme",
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

const STATUS_BADGE: Record<VatPeriodStatus, { label: string; className: string }> = {
  future: { label: "Not started", className: "bg-slate-100 text-slate-600" },
  open: { label: "In progress", className: "bg-blue-100 text-blue-700" },
  due: { label: "Ready to file", className: "bg-amber-100 text-amber-700" },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-700" },
};

/**
 * HMRC's own filing obligations for this business.
 *
 * Shown above the calculated periods rather than replacing them, because the
 * two answer different questions: HMRC says what must be filed and by when,
 * while the table below says what the books make the figures. Where they
 * disagree, HMRC is right about the deadline and the ledger is right about the
 * amount — collapsing them into one table would hide that.
 */
function HmrcObligations({ obligations }: { obligations: VatObligation[] }) {
  return (
    <Card className="border-blue-200 bg-blue-50/40">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Landmark className="size-5 text-blue-600" />
          <CardTitle>Filing obligations from HMRC</CardTitle>
        </div>
        <CardDescription>
          Read live from HMRC Making Tax Digital — these are the periods HMRC expects, and the dates
          they must be filed by.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Due</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {obligations.map((row) => (
              <TableRow key={row.periodKey}>
                <TableCell className="font-medium">
                  {formatDate(row.start)} – {formatDate(row.end)}
                </TableCell>
                <TableCell>{formatDate(row.due)}</TableCell>
                <TableCell className="text-right">
                  {row.fulfilled ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                      Filed{row.received ? ` ${formatDate(row.received)}` : ""}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                      Open
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** dd Mmm yyyy — shorter than the ISO dates and unambiguous for a UK audience. */
function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));
}

/**
 * The VAT return, built from this workspace's own ledger.
 *
 * Every figure on this page is the sum of posted journal lines for the selected
 * period — the same lines the trial balance reads, so the return cannot drift
 * from the books. Boxes 2, 8 and 9 are the exception and say so: they cover
 * goods moving to and from Northern Ireland and the EU, which nothing in the
 * product records.
 *
 * Nothing here files anything. A connected workspace reads its real obligations
 * and their filed status from HMRC, but submitting a return is a legally
 * binding act that needs its own confirmation step, so this page must never
 * imply a return has been sent.
 */
export function VatView({ data, hmrc = null }: VatViewProps) {
  const { format } = useCurrency();
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [scheme, setScheme] = useState(data.registration.scheme ?? "standard");
  const [frequency, setFrequency] = useState(data.registration.frequency);

  const { registration, selected, boxes } = data;

  function save(next: { scheme?: string; frequency?: string }) {
    startSaving(async () => {
      const result = await saveVatFilingSettings(next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("VAT settings saved");
      // The periods on screen are derived from the frequency, so the server has
      // to rebuild them — a client-side state change would leave the table
      // showing quarters after switching to monthly.
      router.refresh();
    });
  }

  if (!registration.vatRegistered) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">VAT Returns</h1>
          <p className="text-slate-600">Your VAT position, straight from the ledger</p>
        </div>

        <Card className="border-amber-200 bg-amber-50/40">
          <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
            <div className="rounded-lg bg-amber-100 p-3 shrink-0">
              <AlertCircle className="size-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="m-0 text-lg font-semibold text-slate-900">
                This workspace is not VAT registered
              </h3>
              <p className="m-0 mt-1 text-sm text-slate-600">
                No VAT is charged on your invoices or reclaimed on your bills, so there is no
                return to prepare. Record your registration in workspace settings once HMRC
                confirms it.
              </p>
            </div>
            <Button asChild variant="outline" className="w-full shrink-0 sm:w-auto">
              <Link href="/settings/workspace#vat">
                <Settings className="mr-2 size-4" />
                VAT settings
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900">VAT Returns</h1>
          <p className="text-slate-600">
            {FREQUENCY_LABELS[registration.frequency]} returns ·{" "}
            {SCHEME_LABELS[registration.scheme ?? "standard"]}
          </p>
        </div>
        <div className="w-full sm:w-auto">
          <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
            Period
          </label>
          <Select
            value={selected.key}
            onValueChange={(key) => router.push(`/taxes/vat?period=${key}`)}
          >
            <SelectTrigger className="w-full sm:w-[260px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.periods.map((period) => (
                <SelectItem key={period.key} value={period.key}>
                  {period.label}
                  {period.status === "open" ? " (in progress)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Registration & filing setup */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-5 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
              VAT registration number
            </p>
            <p className="m-0 mt-1 font-mono text-sm font-semibold text-slate-900">
              {registration.vatNumber ? `GB ${registration.vatNumber}` : "Not recorded"}
            </p>
            {!registration.vatNumber && (
              <Link
                href="/settings/workspace#vat"
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Add it in workspace settings
              </Link>
            )}
          </div>

          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
              VAT scheme
            </p>
            <Select
              value={scheme}
              disabled={saving}
              onValueChange={(value) => {
                setScheme(value);
                save({ scheme: value });
              }}
            >
              <SelectTrigger className="mt-1 h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SCHEME_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Nothing at signup asks which scheme they are on, so the column is
                null for every workspace. Flagged like the frequency beside it,
                rather than letting "Standard accounting" read as their answer —
                cash accounting changes which period a sale falls in. */}
            {!registration.scheme && (
              <p className="m-0 mt-1 text-[11px] leading-relaxed text-amber-600">
                Assumed — confirm how you account for VAT.
              </p>
            )}
          </div>

          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
              Filing frequency
            </p>
            <Select
              value={frequency}
              disabled={saving}
              onValueChange={(value) => {
                setFrequency(value as typeof frequency);
                save({ frequency: value });
              }}
            >
              <SelectTrigger className="mt-1 h-9 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* An assumption presented as a fact is how somebody files against
                the wrong period end without ever noticing. */}
            {!registration.frequencyRecorded && (
              <p className="m-0 mt-1 text-[11px] leading-relaxed text-amber-600">
                Assumed — confirm how often you file.
              </p>
            )}
          </div>

          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
              Selected period
            </p>
            <p className="m-0 mt-1 text-sm font-semibold text-slate-900">
              {formatDate(selected.startDate)} – {formatDate(selected.endDate)}
            </p>
            <p className="m-0 text-xs text-slate-500">Due {formatDate(selected.dueDate)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Where the periods below came from. The distinction matters: a locally
          derived period can be a month out from what HMRC actually expects. */}
      {hmrc?.connected && hmrc.ok && hmrc.obligations.length > 0 ? (
        <HmrcObligations obligations={hmrc.obligations} />
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-slate-400" />
          <p className="m-0 text-xs leading-relaxed text-slate-600">
            {hmrc?.connected === false ? (
              <>
                These periods are worked out from your filing frequency and financial year end.{" "}
                <Link href="/settings/workspace" className="font-semibold text-blue-600 underline">
                  Connect this workspace to HMRC
                </Link>{" "}
                to read your real filing obligations and deadlines instead.
              </>
            ) : hmrc?.connected && !hmrc.ok ? (
              <>
                HMRC could not be reached, so these periods are worked out from your filing
                frequency and financial year end. {hmrc.error}
              </>
            ) : hmrc?.connected && hmrc.ok ? (
              <>
                HMRC holds no VAT obligations for this business in the next year. The periods below
                are worked out from your filing frequency and financial year end.
              </>
            ) : (
              <>
                These periods are worked out from your filing frequency and financial year end.
                Submitting a return to HMRC is not available from this page.
              </>
            )}
          </p>
        </div>
      )}

      {/* Periods */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock className="size-5 text-blue-600" />
            <CardTitle>VAT periods</CardTitle>
          </div>
          <CardDescription>
            Net VAT for each period, calculated from posted journals
            {data.booksStartDate
              ? ` · earlier periods are not shown, as your books start ${formatDate(data.booksStartDate)}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="hidden sm:table-cell">Dates</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Net VAT</TableHead>
                <TableHead className="text-right">&nbsp;</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.periods.map((period) => {
                const badge = STATUS_BADGE[period.status];
                const net = data.netVatByPeriod[period.key] ?? 0;

                return (
                  <TableRow
                    key={period.key}
                    className={period.key === selected.key ? "bg-blue-50/50" : undefined}
                  >
                    <TableCell className="font-medium">{period.label}</TableCell>
                    <TableCell className="hidden whitespace-nowrap text-slate-500 sm:table-cell">
                      {formatDate(period.startDate)} – {formatDate(period.endDate)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(period.dueDate)}</TableCell>
                    <TableCell>
                      <Badge className={badge.className}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold">
                      {format(Math.abs(net))}
                      <span className="ml-1 text-xs font-normal text-slate-500">
                        {net >= 0 ? "payable" : "reclaim"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {/* The selected row's button used to push the URL the page
                          was already on, so clicking it did nothing and read as
                          broken. It now says where you are. */}
                      {period.key === selected.key ? (
                        <span className="text-xs font-semibold text-blue-600">Showing below</span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/taxes/vat?period=${period.key}`)}
                        >
                          View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* The nine boxes */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Receipt className="size-5 text-blue-600" />
              <CardTitle>Return for {selected.label}</CardTitle>
            </div>
            <Badge className={STATUS_BADGE[selected.status].className}>
              {STATUS_BADGE[selected.status].label}
            </Badge>
          </div>
          <CardDescription>
            {selected.status === "open"
              ? "Still running — these figures will keep moving until the period ends."
              : `Covering ${formatDate(selected.startDate)} to ${formatDate(selected.endDate)}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-3">
              <h4 className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
                VAT due
              </h4>
              <BoxTile label="Box 1: VAT due on sales" value={boxes.box1} tone="owed" />
              <BoxTile
                label="Box 2: VAT due on NI/EU acquisitions"
                value={boxes.box2}
                tone="owed"
                unavailableNote="Not recorded — nothing marks a line as an NI or EU acquisition."
              />
              <BoxTile label="Box 3: Total VAT due" value={boxes.box3} tone="owed" emphasis />
            </div>

            <div className="space-y-3">
              <h4 className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
                VAT reclaimed
              </h4>
              <BoxTile label="Box 4: VAT reclaimed on purchases" value={boxes.box4} tone="claim" />
              <BoxTile
                label={`Box 5: Net VAT ${boxes.box5 >= 0 ? "payable" : "reclaimable"}`}
                value={Math.abs(boxes.box5)}
                tone={boxes.box5 >= 0 ? "owed" : "claim"}
                emphasis
              />
            </div>

            <div className="space-y-3">
              <h4 className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
                Values excluding VAT
              </h4>
              <BoxTile label="Box 6: Total sales" value={boxes.box6} tone="neutral" />
              <BoxTile label="Box 7: Total purchases" value={boxes.box7} tone="neutral" />
              <BoxTile
                label="Box 8: Goods dispatched to NI/EU"
                value={boxes.box8}
                tone="neutral"
                unavailableNote="Not recorded."
              />
              <BoxTile
                label="Box 9: Goods acquired from NI/EU"
                value={boxes.box9}
                tone="neutral"
                unavailableNote="Not recorded."
              />
            </div>
          </div>

          <p className="m-0 mt-4 text-[11px] leading-relaxed text-slate-500">
            Boxes 6 and 7 cover invoices, receipts, bills and expense claims. Wages, depreciation
            and other internal journals are excluded, as HMRC requires. Everything is shown in{" "}
            {registration.baseCurrency}, converted at the rate stored on each document.
          </p>
        </CardContent>
      </Card>

      {/* What the VAT is made of */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Layers className="size-5 text-blue-600" />
            <CardTitle>What makes up this return</CardTitle>
          </div>
          <CardDescription>
            Every posting that moved a VAT account in this period, grouped by where it came from
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.sources.length === 0 ? (
            <EmptyRow message="No VAT was posted in this period." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">VAT on sales</TableHead>
                  <TableHead className="text-right">VAT on purchases</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sources.map((source) => (
                  <TableRow key={source.label}>
                    <TableCell className="font-medium">{source.label}</TableCell>
                    <TableCell className="text-right text-slate-700">
                      {source.outputVatMinor === 0 ? "—" : format(source.outputVatMinor)}
                    </TableCell>
                    <TableCell className="text-right text-slate-700">
                      {source.inputVatMinor === 0 ? "—" : format(source.inputVatMinor)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-bold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right">{format(boxes.box1)}</TableCell>
                  <TableCell className="text-right">{format(boxes.box4)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Manual adjustments and late entries */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="size-5 text-blue-600" />
              <CardTitle className="text-base">Manual adjustments</CardTitle>
            </div>
            <CardDescription>
              Journals posted by hand against a VAT account in this period
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.adjustments.length === 0 ? (
              <EmptyRow message="No VAT has been adjusted by hand this period." />
            ) : (
              <div className="space-y-2">
                {data.adjustments.map((adjustment) => (
                  <div
                    key={adjustment.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{adjustment.box}</Badge>
                        <span className="text-xs text-slate-500">
                          {formatDate(adjustment.journalDate)}
                        </span>
                      </div>
                      <p className="m-0 mt-1 truncate text-sm text-slate-700">{adjustment.memo}</p>
                    </div>
                    <p
                      className={`m-0 shrink-0 text-sm font-bold ${
                        adjustment.amountMinor >= 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {adjustment.amountMinor >= 0 ? "+" : "−"}
                      {format(Math.abs(adjustment.amountMinor))}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={data.lateEntries.length > 0 ? "border-amber-200" : undefined}>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="size-5 text-amber-600" />
              <CardTitle className="text-base">Late entries</CardTitle>
            </div>
            <CardDescription>
              Dated before this period but only entered once it had started, so they fall into this
              return
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.lateEntries.length === 0 ? (
              <EmptyRow message="Nothing was entered late for an earlier period." />
            ) : (
              <div className="space-y-2">
                {data.lateEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50/50 p-3"
                  >
                    <div className="min-w-0">
                      <p className="m-0 truncate text-sm font-medium text-slate-800">
                        {entry.label}
                      </p>
                      <p className="m-0 mt-0.5 text-xs text-slate-500">
                        Dated {formatDate(entry.journalDate)} · entered{" "}
                        {formatDate(entry.postedAt)}
                      </p>
                    </div>
                    <p className="m-0 shrink-0 text-sm font-bold text-slate-700">
                      {format(Math.abs(entry.amountMinor))}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {saving && (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="size-3.5 animate-spin" />
          Saving…
        </p>
      )}
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-6 text-sm text-slate-500">
      <CheckCircle2 className="size-4 shrink-0 text-slate-300" />
      {message}
    </div>
  );
}

/**
 * One box of the return.
 *
 * A null value means the box cannot be derived from what the product records.
 * It shows as "Not recorded" rather than as zero, because zero is a claim that
 * there were none — which would be filed as a fact.
 */
function BoxTile({
  label,
  value,
  tone,
  emphasis = false,
  unavailableNote,
}: {
  label: string;
  value: number | null;
  tone: "owed" | "claim" | "neutral";
  emphasis?: boolean;
  unavailableNote?: string;
}) {
  const { format } = useCurrency();

  const palette =
    tone === "owed"
      ? emphasis
        ? "bg-red-100 border-red-200 text-red-800"
        : "bg-red-50 border-red-100 text-red-700"
      : tone === "claim"
        ? emphasis
          ? "bg-emerald-100 border-emerald-200 text-emerald-800"
          : "bg-emerald-50 border-emerald-100 text-emerald-700"
        : "bg-slate-50 border-slate-200 text-slate-800";

  if (value === null) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white p-3">
        <p className="m-0 text-sm text-slate-500">{label}</p>
        <p className="m-0 mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-400">
          <ShieldCheck className="size-3.5" />
          Not recorded
        </p>
        {unavailableNote && (
          <p className="m-0 mt-1 text-[11px] leading-relaxed text-slate-400">{unavailableNote}</p>
        )}
      </div>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${palette}`}>
      <p className="m-0 text-sm opacity-80">{label}</p>
      <p className={`m-0 mt-0.5 font-bold ${emphasis ? "text-2xl" : "text-xl"}`}>{format(value)}</p>
    </div>
  );
}
