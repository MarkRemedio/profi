"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRightLeft,
  Info,
  Settings,
  TrendingDown,
  TrendingUp,
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
import type { ForexData } from "@/lib/accounting/forex";

type ForexViewProps = {
  data: ForexData;
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));

/**
 * Rates carry more precision than money, and a weak currency needs it: a
 * TZS rate rounded to four decimal places is 0.0003, which hides the move
 * entirely.
 */
const formatRate = (rate: number) => (rate >= 1 ? rate.toFixed(4) : rate.toPrecision(4));

/**
 * Foreign exchange gains and losses.
 *
 * Realised differences are read from the ledger and are exact — they were
 * posted when each document was settled. Unrealised ones are not in the books
 * at all: they are what today's rates would do to what is still outstanding.
 * The page keeps the two apart, because one is a fact and the other is a
 * forecast that changes daily.
 */
export function ForexView({ data }: ForexViewProps) {
  const { format } = useCurrency();
  const { realised, unrealised } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900">Foreign Exchange</h1>
          <p className="text-slate-600">
            Gains and losses on foreign-currency invoices and bills, in {data.baseCurrency}
          </p>
        </div>
        {!data.multicurrencyEnabled && (
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/settings/workspace">
              <Settings className="mr-2 size-4" />
              Workspace settings
            </Link>
          </Button>
        )}
      </div>

      {!data.multicurrencyEnabled && (
        <Card className="border-slate-200">
          <CardContent className="flex items-start gap-3 p-4">
            <Info className="mt-0.5 size-4 shrink-0 text-slate-400" />
            <p className="m-0 text-sm leading-relaxed text-slate-600">
              Multicurrency is switched off for this workspace, so every document is raised in{" "}
              {data.baseCurrency} and no new exchange differences can arise. Anything below is
              historic. Turn multicurrency on in workspace settings to invoice in another
              currency.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="m-0 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <TrendingUp className="size-3.5 text-emerald-600" />
              Realised gains
            </p>
            <p className="m-0 mt-1 text-2xl font-black text-emerald-700">
              {format(realised.gainMinor)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="m-0 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500">
              <TrendingDown className="size-3.5 text-red-600" />
              Realised losses
            </p>
            <p className="m-0 mt-1 text-2xl font-black text-red-600">
              {format(realised.lossMinor)}
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-300">
          <CardContent className="p-4">
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
              Net, posted
            </p>
            <p
              className={`m-0 mt-1 text-2xl font-black ${
                realised.netMinor >= 0 ? "text-emerald-700" : "text-red-600"
              }`}
            >
              {format(Math.abs(realised.netMinor))}
            </p>
            <p className="m-0 mt-1 text-xs text-slate-500">
              {realised.netMinor >= 0 ? "Gain" : "Loss"} this {data.period.label}
            </p>
          </CardContent>
        </Card>

        <Card className="border-dashed">
          <CardContent className="p-4">
            <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
              Unrealised
            </p>
            {unrealised.rows.length === 0 ? (
              <>
                <p className="m-0 mt-1 text-lg font-bold text-slate-400">Nothing open</p>
                <p className="m-0 mt-1 text-xs text-slate-500">
                  No foreign-currency documents outstanding
                </p>
              </>
            ) : (
              <>
                <p
                  className={`m-0 mt-1 text-2xl font-black ${
                    unrealised.netMinor >= 0 ? "text-emerald-700" : "text-red-600"
                  }`}
                >
                  {format(Math.abs(unrealised.netMinor))}
                </p>
                <p className="m-0 mt-1 text-xs text-slate-500">
                  Not posted — {unrealised.netMinor >= 0 ? "gain" : "loss"} if settled today
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Realised */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="size-5 text-blue-600" />
            <CardTitle>Realised differences</CardTitle>
          </div>
          <CardDescription>
            Posted when a foreign document was settled at a rate other than the one it was raised
            at — {formatDate(data.period.fromDate)} to {formatDate(data.period.toDate)}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {realised.rows.length === 0 ? (
            <div className="rounded-lg bg-slate-50 px-3 py-6 text-sm text-slate-500">
              No exchange differences have been posted in this period.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="hidden sm:table-cell">Document</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {realised.rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDate(row.journalDate)}
                    </TableCell>
                    <TableCell className="max-w-[24rem] truncate">{row.label}</TableCell>
                    <TableCell className="hidden text-slate-500 sm:table-cell">
                      {row.reference ?? "—"}
                    </TableCell>
                    <TableCell
                      className={`whitespace-nowrap text-right font-semibold ${
                        row.amountMinor >= 0 ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {row.amountMinor >= 0 ? "+" : "−"}
                      {format(Math.abs(row.amountMinor))}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-bold">
                  <TableCell colSpan={3}>Net</TableCell>
                  <TableCell
                    className={`text-right ${
                      realised.netMinor >= 0 ? "text-emerald-700" : "text-red-600"
                    }`}
                  >
                    {realised.netMinor >= 0 ? "+" : "−"}
                    {format(Math.abs(realised.netMinor))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}

          {data.fxAccounts.length > 0 && (
            <p className="m-0 mt-3 text-xs leading-relaxed text-slate-500">
              Posted to{" "}
              {data.fxAccounts.map((account) => `${account.code} ${account.name}`).join(" and ")}.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Unrealised */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="size-5 text-amber-600" />
            <CardTitle>Unrealised — outstanding at today&apos;s rates</CardTitle>
          </div>
          <CardDescription>
            What is still owed, revalued at today&apos;s rate. None of this is in the books: an
            exchange difference is only posted when a document is settled.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {unrealised.rows.length === 0 ? (
            <div className="rounded-lg bg-slate-50 px-3 py-6 text-sm text-slate-500">
              No foreign-currency invoices or bills are outstanding, so there is nothing to
              revalue.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead className="hidden md:table-cell">Contact</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Rate then</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Rate now</TableHead>
                    <TableHead className="text-right">In books</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unrealised.rows.map((row) => (
                    <TableRow key={`${row.kind}:${row.id}`}>
                      <TableCell>
                        <span className="font-medium">{row.reference}</span>
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {row.kind === "invoice" ? "Receivable" : "Payable"}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden max-w-[14rem] truncate text-slate-500 md:table-cell">
                        {row.contactName}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right tabular-nums">
                        {row.currency} {(row.outstandingDocMinor / 100).toFixed(2)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums text-slate-500 sm:table-cell">
                        {formatRate(row.documentRate)}
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums text-slate-500 sm:table-cell">
                        {row.currentRate === null ? "—" : formatRate(row.currentRate)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {format(row.bookedBaseMinor)}
                      </TableCell>
                      <TableCell
                        className={`whitespace-nowrap text-right font-semibold ${
                          row.unrealisedMinor === null
                            ? "text-slate-400"
                            : row.unrealisedMinor >= 0
                              ? "text-emerald-700"
                              : "text-red-600"
                        }`}
                      >
                        {row.unrealisedMinor === null ? (
                          "No rate"
                        ) : (
                          <>
                            {row.unrealisedMinor >= 0 ? "+" : "−"}
                            {format(Math.abs(row.unrealisedMinor))}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-bold">
                    <TableCell colSpan={6}>Net if settled today</TableCell>
                    <TableCell
                      className={`text-right ${
                        unrealised.netMinor >= 0 ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {unrealised.netMinor >= 0 ? "+" : "−"}
                      {format(Math.abs(unrealised.netMinor))}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <p className="m-0 mt-3 text-xs leading-relaxed text-slate-500">
                A receivable worth more than when it was raised is a gain; a payable worth more is
                a loss, because what you owe has grown. Rates move daily, so this will read
                differently tomorrow — only settlement makes it real.
              </p>
            </>
          )}

          {unrealised.unavailableCurrencies.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <p className="m-0 text-xs leading-relaxed text-slate-600">
                Today&apos;s rate could not be fetched for{" "}
                {unrealised.unavailableCurrencies.join(", ")}, so those documents are shown at
                their booked value with no difference calculated.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rates */}
      {data.rates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rates used</CardTitle>
            <CardDescription>
              Units of {data.baseCurrency} per 1 unit of each currency
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {data.rates.map((rate) => (
                <div
                  key={rate.code}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2"
                >
                  <p className="m-0 text-xs font-bold uppercase tracking-wider text-slate-500">
                    {rate.code} → {data.baseCurrency}
                  </p>
                  <p className="m-0 mt-0.5 font-mono text-sm font-semibold text-slate-900">
                    {formatRate(rate.rate)}
                  </p>
                  <p className="m-0 text-[11px] text-slate-400">
                    published {formatDate(rate.rateDate)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
