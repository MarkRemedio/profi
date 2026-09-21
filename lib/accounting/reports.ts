import "server-only";

import { prisma } from "@/lib/prisma";
import { accountingToday } from "@/lib/accounting/accounting-today";

export type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  accountType: string;
  reportCategory: string;
  debitMinor: number;
  creditMinor: number;
};

export type StatementRow = {
  accountId: string;
  code: string;
  name: string;
  accountType: string;
  reportCategory: string;
  balanceMinor: number;
};

export type GeneralLedgerRow = {
  id: string;
  journalId: string;
  journalDate: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  reportCategory: string;
  memo: string | null;
  journalMemo: string | null;
  sourceType: string | null;
  sourceId: string | null;
  sourceLabel: string;
  contactName: string | null;
  debitMinor: number;
  creditMinor: number;
  runningBalanceMinor: number;
};

export type ReportPeriod = {
  /** Inclusive, yyyy-mm-dd. */
  startDate: string;
  /** Inclusive, yyyy-mm-dd. */
  endDate: string;
};

function today() {
  // Not toISOString(): that is UTC, so for part of every day the report is
  // dated yesterday and silently drops documents raised today.
  return accountingToday();
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

/**
 * The four core reports, for one period.
 *
 * The period is an argument. It used to be the calendar year, hardcoded — so a
 * business with an April year end got a profit and loss for the wrong twelve
 * months, and the date range on the screen relabelled the report without
 * changing a figure in it.
 */
export async function getCoreReports(
  organizationId: string,
  period?: Partial<ReportPeriod>
) {
  const yearStart = period?.startDate ?? `${new Date().getFullYear()}-01-01`;
  const asOfDate = period?.endDate ?? today();

  // tenancy:safe: SQL filters by org_id = organizationId in the WHERE clause; type block pushes it beyond the 12-line lint window
  const trialRows = await prisma.$queryRaw<
    Array<{
      id: string;
      code: string;
      name: string;
      account_type: string;
      report_category: string;
      debit_minor: bigint;
      credit_minor: bigint;
    }>
  >`
    select id, code, name, account_type, report_category, debit_minor, credit_minor
    from account_balances
    where org_id = ${organizationId}::uuid
    order by code asc
  `;

  // tenancy:safe: SQL filters by org_id = organizationId in the WHERE clause; type block pushes it beyond the 12-line lint window
  const pnlRows = await prisma.$queryRaw<
    Array<{
      account_id: string;
      account_code: string;
      account_name: string;
      account_type: string;
      report_category: string;
      balance_minor: bigint;
    }>
  >`
    select
      account_id,
      account_code,
      account_name,
      account_type,
      report_category,
      case
        when account_type = 'revenue'::account_type then (sum(credit_minor) - sum(debit_minor))::bigint
        else (sum(debit_minor) - sum(credit_minor))::bigint
      end as balance_minor
    from general_ledger_entries
    where org_id = ${organizationId}::uuid
      and journal_date >= ${yearStart}::date
      and journal_date <= ${asOfDate}::date
      and account_type in ('revenue'::account_type, 'expense'::account_type)
    group by account_id, account_code, account_name, account_type, report_category
    order by account_code asc
  `;

  // tenancy:safe: SQL filters by a.org_id = organizationId in the WHERE clause; type block pushes it beyond the 12-line lint window
  const balanceRows = await prisma.$queryRaw<
    Array<{
      id: string;
      code: string;
      name: string;
      account_type: string;
      report_category: string;
      balance_minor: bigint;
    }>
  >`
    select
      a.id,
      a.code,
      a.name,
      a.account_type,
      a.report_category,
      case
        when a.account_type in ('asset'::account_type, 'expense'::account_type)
          then (coalesce(sum(gle.debit_minor), 0) - coalesce(sum(gle.credit_minor), 0))::bigint
        else (coalesce(sum(gle.credit_minor), 0) - coalesce(sum(gle.debit_minor), 0))::bigint
      end as balance_minor
    from chart_of_accounts a
    left join general_ledger_entries gle
      on gle.account_id = a.id
      and gle.journal_date <= ${asOfDate}::date
    where a.org_id = ${organizationId}::uuid
      and a.account_type in ('asset'::account_type, 'liability'::account_type, 'equity'::account_type)
    group by a.id, a.code, a.name, a.account_type, a.report_category
    order by a.code asc
  `;

  // tenancy:safe: SQL filters by gle.org_id = organizationId in the WHERE clause; large type block pushes it beyond the 12-line lint window
  const ledgerRows = await prisma.$queryRaw<
    Array<{
      id: string;
      journal_id: string;
      journal_date: Date;
      account_id: string;
      account_code: string;
      account_name: string;
      report_category: string;
      journal_memo: string | null;
      line_memo: string | null;
      source_type: string | null;
      source_id: string | null;
      invoice_no: string | null;
      bill_no: string | null;
      contact_name: string | null;
      debit_minor: bigint;
      credit_minor: bigint;
    }>
  >`
    select
      gle.id,
      gle.journal_id,
      gle.journal_date,
      gle.account_id,
      gle.account_code,
      gle.account_name,
      gle.report_category,
      gle.journal_memo,
      gle.line_memo,
      gle.source_type,
      gle.source_id,
      i.invoice_no,
      b.invoice_no as bill_no,
      -- Mirrors contactDisplayName() in lib/accounting/contact-name.ts.
      -- If you change the rule there, change it here too.
      case when c.display_name_preference = 'primary'
                and nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '') is not null
           then trim(concat_ws(' ', c.first_name, c.last_name))
           else c.name
      end as contact_name,
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
    left join contacts c
      on gle.contact_id = c.id
      and gle.org_id = c.org_id
    where gle.org_id = ${organizationId}::uuid
      and gle.journal_date <= ${asOfDate}::date
    order by gle.account_code asc, gle.journal_date asc, gle.created_at asc
  `;

  /*
   * Profit earned before this period started.
   *
   * The balance sheet counts every asset, liability and equity movement since
   * the business began, but the profit added back to equity is only the current
   * period's — so anything earned earlier belonged to neither side and the
   * sheet was out by exactly that amount. It balanced only for a workspace with
   * no history, which is why it looked fine in testing.
   *
   * Computed rather than read from an account. 3200 Current Year Earnings is
   * only populated by a year-end close, and nothing in the product runs one —
   * so reading it would give zero for every workspace in existence.
   *
   * Self-correcting if a close ever does run: closing entries are posted back
   * to the same revenue and expense accounts, so their movement before the
   * period start nets to zero and this returns zero rather than double
   * counting what the close moved into equity.
   *
   * Credits less debits, over both revenue and expenses together. Revenue is a
   * credit balance and expenses are debits, so the difference is what was
   * earned. Reading each side as a positive magnitude and adding them gives
   * revenue PLUS expenses — a figure that means nothing, and one that only
   * looks plausible while a workspace has no prior expenses to give it away.
   */
  // tenancy:safe: SQL filters by org_id = organizationId in the WHERE clause
  const retainedRows = await prisma.$queryRaw<Array<{ amount: bigint }>>`
    select coalesce(sum(credit_minor - debit_minor), 0)::bigint as amount
    from general_ledger_entries
    where org_id = ${organizationId}::uuid
      and journal_date < ${yearStart}::date
      and account_type in ('revenue'::account_type, 'expense'::account_type)
  `;

  const retainedEarningsMinor = Number(retainedRows[0]?.amount ?? 0);

  const runningByAccount = new Map<string, number>();

  const generalLedger: GeneralLedgerRow[] = ledgerRows.map((row) => {
    const movement = Number(row.debit_minor) - Number(row.credit_minor);
    const runningBalanceMinor =
      (runningByAccount.get(row.account_id) ?? 0) + movement;
    runningByAccount.set(row.account_id, runningBalanceMinor);

    return {
      id: row.id,
      journalId: row.journal_id,
      journalDate: row.journal_date.toISOString().slice(0, 10),
      accountId: row.account_id,
      accountCode: row.account_code,
      accountName: row.account_name,
      reportCategory: row.report_category,
      memo: row.line_memo ?? row.journal_memo,
      journalMemo: row.journal_memo,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceLabel: sourceLabel(row),
      contactName: row.contact_name,
      debitMinor: Number(row.debit_minor),
      creditMinor: Number(row.credit_minor),
      runningBalanceMinor,
    };
  });

  return {
    period: { yearStart, asOfDate },
    /** Profit from before this period, which equity would otherwise be missing. */
    retainedEarningsMinor,
    // Standard "trial balance of balances": each account shows its NET
    // closing balance on one side only (AR nets to a debit, AP to a credit),
    // rather than gross lifetime debit/credit totals in both columns.
    // Gross totals balance, so the netted columns still balance.
    trialBalance: trialRows.map((row): TrialBalanceRow => {
      const netMinor = Number(row.debit_minor) - Number(row.credit_minor);
      return {
        accountId: row.id,
        code: row.code,
        name: row.name,
        accountType: row.account_type,
        reportCategory: row.report_category,
        debitMinor: netMinor > 0 ? netMinor : 0,
        creditMinor: netMinor < 0 ? -netMinor : 0,
      };
    }),
    profitAndLoss: pnlRows.map((row): StatementRow => ({
      accountId: row.account_id,
      code: row.account_code,
      name: row.account_name,
      accountType: row.account_type,
      reportCategory: row.report_category,
      balanceMinor: Number(row.balance_minor),
    })),
    balanceSheet: balanceRows.map((row): StatementRow => ({
      accountId: row.id,
      code: row.code,
      name: row.name,
      accountType: row.account_type,
      reportCategory: row.report_category,
      balanceMinor: Number(row.balance_minor),
    })),
    generalLedger,
  };
}
