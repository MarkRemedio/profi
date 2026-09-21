import "server-only";

import { JournalStatus } from "@prisma/client";

import { prisma, type DbOrTx } from "@/lib/prisma";

/**
 * Strip the time component from a Date, returning a new Date at UTC midnight
 * of the same calendar day. Journal.journalDate is a `@db.Date` column, so all
 * comparisons must be date-only — comparing a stored midnight against a
 * `new Date()` with a non-zero time would silently let same-day postings slip
 * past the period-close guard.
 */
function toUtcDate(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Throw if `journalDate` falls inside a closed accounting period.
 *
 * A period is "closed" when a posted journal exists with sourceType = "period_close"
 * whose journalDate is on or after the candidate date. Posting into such a period
 * would corrupt the close (which already swept revenue/expense balances into
 * Current Year Earnings as of its journalDate).
 */
export async function assertPeriodOpen(
  client: DbOrTx,
  organizationId: string,
  journalDate: Date,
): Promise<void> {
  const candidate = toUtcDate(journalDate);
  const blockingClose = await client.journal.findFirst({
    where: {
      organizationId,
      sourceType: "period_close",
      status: JournalStatus.POSTED,
      journalDate: { gte: candidate },
    },
    select: { journalDate: true },
    orderBy: { journalDate: "asc" },
  });

  if (blockingClose) {
    const candidateLabel = candidate.toISOString().slice(0, 10);
    const closedThrough = blockingClose.journalDate.toISOString().slice(0, 10);
    throw new Error(
      `Cannot post a journal dated ${candidateLabel}: the accounting period through ${closedThrough} is closed.`,
    );
  }
}

export type ClosePeriodResult = {
  journalId: string;
  revenueTotalMinor: number;
  expenseTotalMinor: number;
  netProfitMinor: number;
  closedAt: Date;
};

/**
 * Close the accounting period by:
 * 1. Crediting all revenue accounts → 3200 Current Year Earnings (debiting revenue)
 * 2. Debiting all expense accounts → 3200 Current Year Earnings (crediting expense)
 *
 * After this, 3200 Current Year Earnings has balance = YTD net profit,
 * ready for the balance sheet equity section.
 *
 * Run at year-end (or any period end).
 */
export async function closePeriod(
  organizationId: string,
  closingDate: Date,
  asOfDate: string, // e.g. "2025-12-31"
): Promise<ClosePeriodResult> {
  const yearStart = `${asOfDate.split("-")[0]}-01-01`;
  const closingDateOnly = toUtcDate(closingDate);

  return prisma.$transaction(async (tx) => {
    // 0. Reject re-close (same date) or out-of-order close (a later close already exists).
    const blockingClose = await tx.journal.findFirst({
      where: {
        organizationId,
        sourceType: "period_close",
        status: JournalStatus.POSTED,
        journalDate: { gte: closingDateOnly },
      },
      select: { journalDate: true },
      orderBy: { journalDate: "asc" },
    });
    if (blockingClose) {
      const blockerLabel = blockingClose.journalDate.toISOString().slice(0, 10);
      if (blockingClose.journalDate.getTime() === closingDateOnly.getTime()) {
        throw new Error(
          `A period close already exists for ${blockerLabel}. Reverse it before closing the period again.`,
        );
      }
      throw new Error(
        `Cannot close period through ${asOfDate}: a later close already exists for ${blockerLabel}.`,
      );
    }

    // 1. Get revenue accounts with YTD credit > debit (positive revenue balance)
    const revenueAccounts = await tx.$queryRaw<
      Array<{ account_id: string; balance_minor: bigint }>
    >`
      select
        gle.account_id,
        (sum(gle.credit_minor) - sum(gle.debit_minor))::bigint as balance_minor
      from general_ledger_entries gle
      join chart_of_accounts a on a.id = gle.account_id
      where gle.org_id = ${organizationId}::uuid
        and gle.journal_date >= ${yearStart}::date
        and gle.journal_date <= ${asOfDate}::date
        and a.account_type = 'revenue'::account_type
      group by gle.account_id
      having sum(gle.credit_minor) > sum(gle.debit_minor)
    `;

    // 2. Get expense accounts with YTD debit > credit (positive expense balance)
    const expenseAccounts = await tx.$queryRaw<
      Array<{ account_id: string; balance_minor: bigint }>
    >`
      select
        gle.account_id,
        (sum(gle.debit_minor) - sum(gle.credit_minor))::bigint as balance_minor
      from general_ledger_entries gle
      join chart_of_accounts a on a.id = gle.account_id
      where gle.org_id = ${organizationId}::uuid
        and gle.journal_date >= ${yearStart}::date
        and gle.journal_date <= ${asOfDate}::date
        and a.account_type = 'expense'::account_type
      group by gle.account_id
      having sum(gle.debit_minor) > sum(gle.credit_minor)
    `;

    // 3. Find the 3200 Current Year Earnings account for this org
    const cyeAccount = await tx.chartAccount.findFirst({
      where: { organizationId, code: "3200" },
      select: { id: true },
    });
    if (!cyeAccount) {
      throw new Error(
        "3200 Current Year Earnings account not found. Ensure account templates have been seeded.",
      );
    }

    // 4. Build closing journal lines
    type ClosingLine = {
      accountId: string;
      debitMinor: bigint;
      creditMinor: bigint;
      memo: string;
    };
    const lines: ClosingLine[] = [];

    // Close revenue: DR Revenue > CR 3200
    for (const rev of revenueAccounts) {
      if (Number(rev.balance_minor) > 0) {
        lines.push({
          accountId: rev.account_id,
          debitMinor: rev.balance_minor,
          creditMinor: BigInt(0),
          memo: "Period close: transfer revenue to Current Year Earnings",
        });
        lines.push({
          accountId: cyeAccount.id,
          debitMinor: BigInt(0),
          creditMinor: rev.balance_minor,
          memo: "Period close: transfer revenue to Current Year Earnings",
        });
      }
    }

    // Close expenses: DR 3200 > CR Expense
    for (const exp of expenseAccounts) {
      if (Number(exp.balance_minor) > 0) {
        lines.push({
          accountId: cyeAccount.id,
          debitMinor: exp.balance_minor,
          creditMinor: BigInt(0),
          memo: "Period close: transfer expense to Current Year Earnings",
        });
        lines.push({
          accountId: exp.account_id,
          debitMinor: BigInt(0),
          creditMinor: exp.balance_minor,
          memo: "Period close: transfer expense to Current Year Earnings",
        });
      }
    }

    if (lines.length === 0) {
      throw new Error("No revenue or expense balances to close for this period.");
    }

    // 5. Create and post the closing journal atomically
    const journal = await tx.journal.create({
      data: {
        organizationId,
        status: JournalStatus.DRAFT,
        journalDate: closingDateOnly,
        sourceType: "period_close",
        memo: `Period close ${asOfDate}`,
        lines: {
          create: lines.map((l) => ({
            organizationId,
            accountId: l.accountId,
            debitMinor: l.debitMinor,
            creditMinor: l.creditMinor,
            memo: l.memo,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });

    const postedAt = new Date();
    await tx.journal.update({
      where: { id: journal.id },
      data: { status: JournalStatus.POSTED, postedAt },
    });

    const revenueTotal = revenueAccounts.reduce((s, r) => s + Number(r.balance_minor), 0);
    const expenseTotal = expenseAccounts.reduce((s, e) => s + Number(e.balance_minor), 0);
    const netProfit = Number(revenueTotal) - Number(expenseTotal);

    return {
      journalId: journal.id,
      revenueTotalMinor: Number(revenueTotal),
      expenseTotalMinor: Number(expenseTotal),
      netProfitMinor: netProfit,
      closedAt: postedAt,
    };
  });
}
