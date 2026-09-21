import "server-only";

import { randomUUID } from "node:crypto";

import { prisma, type DbOrTx } from "@/lib/prisma";
import { assertPeriodOpen } from "@/lib/accounting/period-close";

export type Db = DbOrTx;

export type JournalLineInput = {
  accountId: string;
  debitMinor: number;
  creditMinor: number;
  memo: string;
  contactId: string | null;
};

/**
 * Create + post a balanced journal. Mirrors backend/banking/posting.py:
 *   create journal as DRAFT → insert lines → flip to POSTED.
 * The flip is validated by the DB triggers (must balance, non-zero).
 */
export async function postBalancedJournal(
  db: Db,
  args: {
    orgId: string;
    journalDate: Date;
    memo: string;
    sourceType: string;
    sourceId: string | null;
    reversedJournalId?: string | null;
    createdByUserId: string | null;
    lines: JournalLineInput[];
  },
): Promise<string> {
  const lines = args.lines;
  if (lines.length === 0) throw new Error("Journal must have at least one line.");

  const totalDebits = lines.reduce((s, l) => s + (l.debitMinor || 0), 0);
  const totalCredits = lines.reduce((s, l) => s + (l.creditMinor || 0), 0);
  if (totalDebits !== totalCredits) {
    throw new Error(`Journal must balance: debits ${totalDebits}, credits ${totalCredits}`);
  }
  if (totalDebits === 0) throw new Error("Journal cannot be zero-value.");

  const run = async (tx: Db) => {
    await assertPeriodOpen(tx, args.orgId, args.journalDate);

    const journalId = randomUUID();
    const now = new Date();

    await tx.$executeRaw`
      INSERT INTO journals (
        id, org_id, status, journal_date, memo,
        source_type, source_id, reversed_journal_id,
        created_by_user_id, created_at, updated_at
      ) VALUES (
        ${journalId}::uuid, ${args.orgId}::uuid, 'draft', ${args.journalDate}::date, ${args.memo},
        ${args.sourceType}, ${args.sourceId}::uuid, ${args.reversedJournalId ?? null}::uuid,
        ${args.createdByUserId}::uuid, ${now}, ${now}
      )`;

    for (const line of lines) {
      await tx.$executeRaw`
        INSERT INTO journal_lines (
          id, org_id, journal_id, account_id, contact_id,
          debit_minor, credit_minor, memo, created_at
        ) VALUES (
          ${randomUUID()}::uuid, ${args.orgId}::uuid, ${journalId}::uuid, ${line.accountId}::uuid,
          ${line.contactId}::uuid, ${line.debitMinor}, ${line.creditMinor}, ${line.memo}, ${now}
        )`;
    }

    // tenancy:safe: journalId was inserted with org_id = args.orgId in the INSERT statements above; status-only update is safe
    await tx.$executeRaw`
      UPDATE journals
      SET status = 'posted', posted_at = ${now}, posted_by_user_id = ${args.createdByUserId}::uuid, updated_at = ${now}
      WHERE id = ${journalId}::uuid`;

    return journalId;
  };

  // If we were handed a transaction client, reuse it; otherwise open one.
  if ("$transaction" in db) {
    return (db as typeof prisma).$transaction((tx) => run(tx));
  }
  return run(db);
}

export async function findAccountByCode(
  db: Db,
  orgId: string,
  code: string,
): Promise<string | null> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM chart_of_accounts WHERE org_id = ${orgId}::uuid AND code = ${code} LIMIT 1`;
  return rows[0]?.id ?? null;
}
