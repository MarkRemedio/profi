import "server-only";

import { prisma } from "@/lib/prisma";
import { accountingToday } from "@/lib/accounting/accounting-today";

const vatAccountCodes = ["1200", "2100"] as const;

function calendarYearStart() {
  const year = new Date().getFullYear();
  return `${year}-01-01`;
}

function today() {
  // Not toISOString(): that is UTC, so for part of every day the report is
  // dated yesterday and silently drops documents raised today.
  return accountingToday();
}

function validIsoDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : value;
}

function shortId(value: string | null) {
  return value ? value.slice(0, 8) : "";
}

function sourceLabel(row: {
  source_type: string | null;
  source_id: string | null;
  invoice_no: string | null;
  bill_no: string | null;
}) {
  if (row.source_type === "invoice") {
    return row.invoice_no ? `Invoice ${row.invoice_no}` : `Invoice ${shortId(row.source_id)}`;
  }

  if (row.source_type === "bill") {
    return row.bill_no ? `Bill ${row.bill_no}` : `Bill ${shortId(row.source_id)}`;
  }

  if (row.source_type === "invoice_void") return "Void invoice";
  if (row.source_type === "bill_void") return "Void bill";
  if (row.source_type === "manual" || row.source_type === "manual_reversal") {
    return "Manual journal";
  }

  return row.source_type ?? "Journal";
}

export type TaxDashboardPeriod = {
  yearStart: string;
  asOfDate: string;
  fromDate: string;
  toDate: string;
};

export type TaxRateRow = {
  code: string;
  name: string;
  rate: number;
  description: string | null;
};

export type VatActivityRow = {
  id: string;
  journalId: string;
  journalDate: string;
  accountCode: string;
  accountName: string;
  sourceLabel: string;
  memo: string | null;
  debitMinor: number;
  creditMinor: number;
};

export type TaxDashboardData = {
  period: TaxDashboardPeriod;
  taxRates: TaxRateRow[];
  vatAccounts: Array<{ code: string; name: string }>;
  outputVatMinor: number;
  inputVatMinor: number;
  netVatMinor: number;
  activity: VatActivityRow[];
};

export async function getTaxDashboard(
  organizationId: string,
  input?: { from?: string | null; to?: string | null }
): Promise<TaxDashboardData> {
  const yearStart = calendarYearStart();
  const asOfDate = today();
  const fromDate = validIsoDate(input?.from) ?? yearStart;
  const toDate = validIsoDate(input?.to) ?? asOfDate;
  const normalizedFrom = fromDate <= toDate ? fromDate : toDate;
  const normalizedTo = fromDate <= toDate ? toDate : fromDate;

  const [taxRates, vatAccounts, activityRows] = await Promise.all([
    prisma.taxRate.findMany({
      // System rates plus this organization's custom rates only — custom
      // rates from other tenants must never appear here.
      where: {
        isActive: true,
        OR: [{ organizationId: null }, { organizationId }],
      },
      orderBy: { code: "asc" },
      select: {
        code: true,
        name: true,
        rate: true,
        description: true,
      },
    }),
    prisma.chartAccount.findMany({
      where: {
        organizationId,
        code: { in: [...vatAccountCodes] },
        isActive: true,
      },
      orderBy: { code: "asc" },
      select: { code: true, name: true },
    }),
    // tenancy:safe: SQL filters by gle.org_id = organizationId in the WHERE clause; type block pushes it beyond the 12-line lint window
    prisma.$queryRaw<
      Array<{
        id: string;
        journal_id: string;
        journal_date: Date;
        account_code: string;
        account_name: string;
        journal_memo: string | null;
        line_memo: string | null;
        source_type: string | null;
        source_id: string | null;
        invoice_no: string | null;
        bill_no: string | null;
        debit_minor: bigint;
        credit_minor: bigint;
      }>
    >`
      select
        gle.id,
        gle.journal_id,
        gle.journal_date,
        gle.account_code,
        gle.account_name,
        gle.journal_memo,
        gle.line_memo,
        gle.source_type,
        gle.source_id,
        i.invoice_no,
        b.invoice_no as bill_no,
        gle.debit_minor,
        gle.credit_minor
      from general_ledger_entries gle
      left join invoices i
        on gle.source_type in ('invoice', 'invoice_void')
        and gle.source_id = i.id
        and gle.org_id = i.org_id
      left join bills b
        on gle.source_type in ('bill', 'bill_void')
        and gle.source_id = b.id
        and gle.org_id = b.org_id
      where gle.org_id = ${organizationId}::uuid
        and gle.account_code in ('1200', '2100')
        and gle.journal_date >= ${normalizedFrom}::date
        and gle.journal_date <= ${normalizedTo}::date
      order by gle.journal_date desc, gle.id desc
    `,
  ]);

  const outputVatMinor = activityRows
    .filter((row) => row.account_code === "2100")
    .reduce((total, row) => total + Number(row.credit_minor) - Number(row.debit_minor), 0);

  const inputVatMinor = activityRows
    .filter((row) => row.account_code === "1200")
    .reduce((total, row) => total + Number(row.debit_minor) - Number(row.credit_minor), 0);

  return {
    period: {
      yearStart,
      asOfDate,
      fromDate: normalizedFrom,
      toDate: normalizedTo,
    },
    taxRates: taxRates.map((taxRate) => ({
      code: taxRate.code.toLowerCase(),
      name: taxRate.name,
      rate: Number(taxRate.rate),
      description: taxRate.description,
    })),
    vatAccounts,
    outputVatMinor,
    inputVatMinor,
    netVatMinor: outputVatMinor - inputVatMinor,
    activity: activityRows.map((row) => ({
      id: row.id,
      journalId: row.journal_id,
      journalDate: row.journal_date.toISOString().slice(0, 10),
      accountCode: row.account_code,
      accountName: row.account_name,
      sourceLabel: sourceLabel(row),
      memo: row.line_memo ?? row.journal_memo,
      debitMinor: Number(row.debit_minor),
      creditMinor: Number(row.credit_minor),
    })),
  };
}
