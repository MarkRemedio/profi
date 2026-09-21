"use client";

import Link from "next/link";
import { Euro, Info, Settings } from "lucide-react";

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
import { ModuleRequirements } from "@/components/taxes/module-requirements";
import type { EcSalesData } from "@/lib/accounting/tax-modules";

type ECSalesViewProps = {
  data: EcSalesData;
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00.000Z`));

/**
 * EC Sales List.
 *
 * Since Brexit an ESL is only required of Northern Ireland businesses moving
 * goods to the EU. Nothing here records whether a workspace trades under the
 * Windsor Framework, nor whether an invoice line is goods or services, so this
 * cannot produce a return.
 *
 * What it can do is find the customers who would appear on one — identified by
 * the country prefix on their VAT number — and total what they were invoiced.
 * That is a real list from real invoices, presented as what it is.
 */
export function ECSalesView({ data }: ECSalesViewProps) {
  const { format } = useCurrency();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-slate-900">EC Sales</h1>
          <p className="text-slate-600">
            EU customers invoiced between {formatDate(data.period.fromDate)} and{" "}
            {formatDate(data.period.toDate)}
          </p>
        </div>
        {!data.vatRegistered && (
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/settings/workspace#vat">
              <Settings className="mr-2 size-4" />
              VAT settings
            </Link>
          </Button>
        )}
      </div>

      <Card className="border-slate-200 bg-slate-50/60">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-slate-400" />
          <p className="m-0 text-sm leading-relaxed text-slate-600">
            Since Brexit an EC Sales List is only required for <strong>goods</strong> moved from{" "}
            <strong>Northern Ireland</strong> to the EU. Sales of services, and anything sold from
            Great Britain, are outside it. What follows is who would appear on a return, worked out
            from the country prefix on each customer&apos;s VAT number — not a return itself.
          </p>
        </CardContent>
      </Card>

      {/* Customers */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Euro className="size-5 text-blue-600" />
              <CardTitle>EU customers</CardTitle>
            </div>
            {data.customers.length > 0 && (
              <Badge variant="outline">
                {format(data.totalSalesBaseMinor)} invoiced
              </Badge>
            )}
          </div>
          <CardDescription>
            Customers whose VAT number was issued by an EU member state, with what they were
            invoiced in {data.baseCurrency}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.customers.length === 0 ? (
            <div className="rounded-lg bg-slate-50 px-4 py-6 text-sm text-slate-600">
              <p className="m-0 font-medium text-slate-700">No EU customers found</p>
              <p className="m-0 mt-1 text-slate-500">
                No customer invoiced in this period has a VAT number beginning with an EU country
                code such as DE, FR or IE.
                {data.customersWithoutVatNumber > 0 && (
                  <>
                    {" "}
                    {data.customersWithoutVatNumber} customer
                    {data.customersWithoutVatNumber === 1 ? " has" : "s have"} no VAT number
                    recorded at all, so any EU trade among them cannot be spotted.
                  </>
                )}
              </p>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link href="/sales/customers">Open customers</Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead className="hidden sm:table-cell">VAT number</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell className="text-slate-600">{customer.country}</TableCell>
                    <TableCell className="hidden font-mono text-xs text-slate-500 sm:table-cell">
                      {customer.vatNumber}
                    </TableCell>
                    <TableCell className="text-right">{customer.invoiceCount}</TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold">
                      {format(customer.salesBaseMinor)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 font-bold">
                  <TableCell colSpan={4}>Total</TableCell>
                  <TableCell className="text-right">
                    {format(data.totalSalesBaseMinor)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ModuleRequirements
        requirements={data.requirements}
        description="An EC Sales List cannot be produced from the books alone. Here is what stands between this page and a fileable return."
      />
    </div>
  );
}
