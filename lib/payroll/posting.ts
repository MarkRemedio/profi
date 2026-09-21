import "server-only";

import { AuditAction, JournalStatus, type AccountType, type AccountReportCategory } from "@prisma/client";

import type { TransactionClient } from "@/lib/prisma";
import { resolveSystemAccount, resolveOrCreateSystemAccount, assertJournalBalances } from "@/lib/accounting/documents";
import { assertPeriodOpen } from "@/lib/accounting/period-close";

const payrollExpenseAccount = { code: "7000", accountType: "EXPENSE" as AccountType };
const bankAccount = { code: "1000", accountType: "ASSET" as AccountType };
const payeNiPayableAccount = {
  code: "2200", name: "PAYE & NI Payable",
  accountType: "LIABILITY" as AccountType, reportCategory: "CURRENT_LIABILITY" as AccountReportCategory,
};
const pensionPayableAccount = {
  code: "2210", name: "Pension Payable",
  accountType: "LIABILITY" as AccountType, reportCategory: "CURRENT_LIABILITY" as AccountReportCategory,
};

/**
 * Post the payroll journal for an approved run:
 *   DR 7000 Payroll Expenses (gross)
 *      CR 2200 PAYE & NI Payable (tax + NI)   [omitted if 0]
 *      CR 2210 Pension Payable (pension)        [omitted if 0]
 *      CR 1000 Bank (net)
 * Idempotent: no-ops (returns null) if the run already has a journal_id or is missing.
 */
export async function postPayrollRunJournal(
  tx: TransactionClient,
  orgId: string,
  userId: string,
  runId: string
): Promise<string | null> {
  const run = await tx.payrollRun.findFirst({
    where: { id: runId, organizationId: orgId },
    select: {
      journal_id: true, name: true, payDate: true,
      totalGrossMinor: true, totalTaxMinor: true, totalNIMinor: true,
      totalPensionMinor: true, totalNetMinor: true,
    },
  });
  if (!run || run.journal_id) return null;

  await assertPeriodOpen(tx, orgId, run.payDate);

  const payableMinor = run.totalTaxMinor + run.totalNIMinor;

  const expenseId = await resolveSystemAccount(tx, orgId, payrollExpenseAccount);
  const bankId = await resolveSystemAccount(tx, orgId, bankAccount);
  const payeNiId = payableMinor > BigInt(0)
    ? await resolveOrCreateSystemAccount(tx, orgId, payeNiPayableAccount) : null;
  const pensionId = run.totalPensionMinor > BigInt(0)
    ? await resolveOrCreateSystemAccount(tx, orgId, pensionPayableAccount) : null;

  const lines = [
    { organizationId: orgId, accountId: expenseId, debitMinor: run.totalGrossMinor, creditMinor: BigInt(0), memo: `Payroll ${run.name}` },
    ...(payeNiId
      ? [{ organizationId: orgId, accountId: payeNiId, debitMinor: BigInt(0), creditMinor: payableMinor, memo: `PAYE & NI for ${run.name}` }]
      : []),
    ...(pensionId
      ? [{ organizationId: orgId, accountId: pensionId, debitMinor: BigInt(0), creditMinor: run.totalPensionMinor, memo: `Pension for ${run.name}` }]
      : []),
    { organizationId: orgId, accountId: bankId, debitMinor: BigInt(0), creditMinor: run.totalNetMinor, memo: `Net pay for ${run.name}` },
  ];

  assertJournalBalances("Payroll run", run.name, lines);

  const journal = await tx.journal.create({
    data: {
      organizationId: orgId,
      status: JournalStatus.DRAFT,
      journalDate: run.payDate,
      memo: `Payroll ${run.name}`,
      sourceType: "payroll_run",
      sourceId: runId,
      createdByUserId: userId,
      lines: { create: lines },
    },
    select: { id: true },
  });

  await tx.journal.update({
    where: { id: journal.id },
    data: { status: JournalStatus.POSTED, postedByUserId: userId, postedAt: new Date() },
  });

  await tx.payrollRun.update({ where: { id: runId }, data: { journal_id: journal.id } });

  await tx.auditEvent.create({
    data: {
      organizationId: orgId,
      actorUserId: userId,
      entityType: "payroll_run",
      entityId: runId,
      action: AuditAction.POST,
      after: { journalId: journal.id, totalGrossMinor: run.totalGrossMinor.toString() },
    },
  });

  return journal.id;
}

/**
 * Reverse an approved payroll run's journal. Mirrors the original with debits/credits
 * swapped, dated today so it never lands in a closed period. Clears the run's journal_id.
 * Idempotent: no-ops if the run was never posted or a reversal already exists.
 */
export async function reversePayrollRunJournal(
  tx: TransactionClient,
  orgId: string,
  userId: string,
  runId: string
): Promise<void> {
  const original = await tx.journal.findFirst({
    where: { organizationId: orgId, sourceType: "payroll_run", sourceId: runId, status: JournalStatus.POSTED },
    include: { lines: true },
  });
  if (!original) return;

  const existingReversal = await tx.journal.findFirst({
    where: { organizationId: orgId, sourceType: "payroll_run_void", sourceId: runId },
    select: { id: true },
  });
  if (existingReversal) return;

  await assertPeriodOpen(tx, orgId, new Date());

  const reversedLines = original.lines.map((l) => ({
    organizationId: orgId,
    accountId: l.accountId,
    debitMinor: l.creditMinor,
    creditMinor: l.debitMinor,
    memo: "Reversal of payroll run",
  }));

  const reversal = await tx.journal.create({
    data: {
      organizationId: orgId,
      status: JournalStatus.DRAFT,
      journalDate: new Date(),
      memo: `Reversal of payroll run ${runId}`,
      sourceType: "payroll_run_void",
      sourceId: runId,
      reversedJournalId: original.id,
      createdByUserId: userId,
      lines: { create: reversedLines },
    },
    select: { id: true },
  });

  await tx.journal.update({
    where: { id: reversal.id },
    data: { status: JournalStatus.POSTED, postedByUserId: userId, postedAt: new Date() },
  });

  await tx.payrollRun.update({ where: { id: runId }, data: { journal_id: null } });

  await tx.auditEvent.create({
    data: {
      organizationId: orgId,
      actorUserId: userId,
      entityType: "payroll_run",
      entityId: runId,
      action: AuditAction.REVERSE,
      after: { journalId: reversal.id, reversedJournalId: original.id },
    },
  });
}
