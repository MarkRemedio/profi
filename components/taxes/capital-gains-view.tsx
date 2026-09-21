"use client";

import Link from "next/link";
import { Building2, Info, TrendingUp } from "lucide-react";

import { useCurrency } from "@/components/currency-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ModuleRequirements } from "@/components/taxes/module-requirements";
import type { CapitalGainsData } from "@/lib/accounting/tax-modules";

type CapitalGainsViewProps = {
  data: CapitalGainsData;
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));

/**
 * Capital gains on the disposal of assets.
 *
 * A gain is proceeds less cost, less improvements and the costs of selling —
 * which needs each asset tracked individually, with its purchase date. The
 * chart of accounts holds a total for a whole class of assets and nothing more,
 * so a gain cannot be computed from it.
 *
 * What can be shown is where the assets are: the fixed asset accounts and any
 * credit posted to one, which is what a disposal looks like in the ledger.
 * That is a starting point for the conversation, not a computation. The page
 * used to invent an office building sold for £450,000.
 */
export function CapitalGainsView({ data }: CapitalGainsViewProps) {
  const { format } = useCurrency();

  const isCompany = data.structure === "limited_company";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Capital Gains</h1>
        <p className="text-slate-600">
          Asset disposals between {formatDate(data.period.fromDate)} and{" "}
          {formatDate(data.period.toDate)}
        </p>
      </div>

      <Card className="border-slate-200 bg-slate-50/60">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-slate-400" />
          <p className="m-0 text-sm leading-relaxed text-slate-600">
            {isCompany ? (
              <>
                A company does not pay capital gains tax. Profits on selling an asset are{" "}
                <strong>chargeable gains</strong>, taxed as part of corporation tax — so anything
                here feeds the computation on the{" "}
                <Link href="/taxes/corporation" className="font-semibold text-blue-600 hover:underline">
                  corporation tax
                </Link>{" "}
                page rather than a return of its own.
              </>
            ) : (
              <>
                Capital gains tax is charged on the person, not the business, and covers assets
                held outside it as well. Residential property has its own 60-day reporting
                deadline. What is below is only what the business books can see.
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {/* Asset accounts */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="size-5 text-blue-600" />
            <CardTitle>Fixed assets</CardTitle>
          </div>
          <CardDescription>
            What the balance sheet holds under fixed and non-current assets
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.assetAccounts.length === 0 ? (
            <div className="rounded-lg bg-slate-50 px-4 py-6 text-sm text-slate-600">
              <p className="m-0 font-medium text-slate-700">No fixed asset accounts</p>
              <p className="m-0 mt-1 text-slate-500">
                Nothing in this chart of accounts is categorised as a fixed or non-current asset,
                so there is no asset that could be disposed of. Property, vehicles, equipment and
                investments would each sit in one.
              </p>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link href="/accounting/chart-of-accounts">Open chart of accounts</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Carrying value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.assetAccounts.map((account) => (
                  <TableRow key={account.code}>
                    <TableCell>
                      <span className="font-mono text-xs text-slate-400">{account.code}</span>{" "}
                      <span className="font-medium">{account.name}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {format(account.balanceMinor)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Disposals */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="size-5 text-blue-600" />
            <CardTitle>Disposals this period</CardTitle>
          </div>
          <CardDescription>
            Credits posted to a fixed asset account, which is how an asset leaving the books
            appears in the ledger
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.disposals.length === 0 ? (
            <div className="rounded-lg bg-slate-50 px-4 py-6 text-sm text-slate-500">
              No fixed asset account was credited in this period, so nothing has been disposed of.
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount removed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.disposals.map((disposal) => (
                    <TableRow key={disposal.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatDate(disposal.journalDate)}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs text-slate-400">
                          {disposal.accountCode}
                        </span>{" "}
                        {disposal.accountName}
                      </TableCell>
                      <TableCell className="max-w-[20rem] truncate text-slate-600">
                        {disposal.memo}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-semibold">
                        {format(disposal.proceedsMinor)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="m-0 mt-3 text-xs leading-relaxed text-slate-500">
                This is the value taken off the balance sheet, not the gain. The gain is what the
                asset sold for less what it cost, and the books do not hold either figure per
                asset.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <ModuleRequirements
        requirements={data.requirements}
        description="A chargeable gain cannot be computed from the chart of accounts alone. Here is what is missing."
      />
    </div>
  );
}
