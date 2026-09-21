import "server-only";

import { AuditAction, JournalStatus, type AccountType } from "@prisma/client";

import type { TransactionClient } from "@/lib/prisma";
import { resolveSystemAccount, assertJournalBalances } from "@/lib/accounting/documents";
import { assertPeriodOpen } from "@/lib/accounting/period-close";

const bankAccount = { code: "1000", accountType: "ASSET" as AccountType };
const cashOnHandAccount = { code: "1010", accountType: "ASSET" as AccountType };
const cardClearingAccount = { code: "1020", accountType: "ASSET" as AccountType };

/**
 * Where the money actually is the moment a sale completes.
 *
 * Cash is in the till until someone banks it; card and mobile sit with the
 * payment provider until settlement. Debiting 1000 Bank for either would claim
 * money the bank account does not hold, and the ledger could never be
 * reconciled against a real statement.
 *
 * `split` has no per-tender breakdown stored on the sale, so it cannot be
 * apportioned — it is treated as cash, which is the usual case. Supporting it
 * properly needs the individual tender amounts recorded against the sale.
 */
function tenderAccountFor(paymentMethod: string) {
  switch (paymentMethod) {
    case "card":
    case "mobile":
      return cardClearingAccount;
    case "cash":
    case "split":
    default:
      return cashOnHandAccount;
  }
}
const salesAccount = { code: "4000", accountType: "REVENUE" as AccountType };
const outputVatAccount = { code: "2100", accountType: "LIABILITY" as AccountType };
const costOfSalesAccount = { code: "5000", accountType: "EXPENSE" as AccountType };
const inventoryAccount = { code: "1300", accountType: "ASSET" as AccountType };

type PosSale = {
  saleId: string;
  saleNumber: string;
  soldAt: Date;
  netMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  /** "cash" | "card" | "mobile" | "split" — decides which asset is debited. */
  paymentMethod: string;
};

/**
 * Post the sales-side journal for a completed POS sale:
 *   DR 1000 Bank (total) / CR 4000 Sales (net) / CR 2100 VAT Payable (tax).
 * Idempotent: no-ops if a pos_sale journal already exists for this sale.
 */
export async function postPosSaleJournal(
  tx: TransactionClient,
  orgId: string,
  userId: string,
  sale: PosSale
): Promise<void> {
  const existing = await tx.journal.findFirst({
    where: { organizationId: orgId, sourceType: "pos_sale", sourceId: sale.saleId },
    select: { id: true },
  });
  if (existing) return;

  // A zero-value sale (free item / 100% discount) has no ledger impact — record
  // the sale (in pos_sales) but post no journal, rather than tripping the
  // zero-total balance guard and rolling back the whole transaction.
  if (sale.totalMinor === BigInt(0)) return;

  await assertPeriodOpen(tx, orgId, sale.soldAt);

  // Debit where the money actually landed, not the bank.
  const tenderId = await resolveSystemAccount(tx, orgId, tenderAccountFor(sale.paymentMethod));
  const salesId = await resolveSystemAccount(tx, orgId, salesAccount);
  const vatId = sale.taxMinor > BigInt(0)
    ? await resolveSystemAccount(tx, orgId, outputVatAccount)
    : null;

  const lines = [
    { organizationId: orgId, accountId: tenderId, debitMinor: sale.totalMinor, creditMinor: BigInt(0), memo: `POS sale ${sale.saleNumber} (${sale.paymentMethod})` },
    { organizationId: orgId, accountId: salesId, debitMinor: BigInt(0), creditMinor: sale.netMinor, memo: `POS sale ${sale.saleNumber}` },
    ...(vatId
      ? [{ organizationId: orgId, accountId: vatId, debitMinor: BigInt(0), creditMinor: sale.taxMinor, memo: `VAT on POS sale ${sale.saleNumber}` }]
      : []),
  ];

  assertJournalBalances("POS sale", sale.saleNumber, lines);

  const journal = await tx.journal.create({
    data: {
      organizationId: orgId,
      status: JournalStatus.DRAFT,
      journalDate: sale.soldAt,
      memo: `POS sale ${sale.saleNumber}`,
      sourceType: "pos_sale",
      sourceId: sale.saleId,
      createdByUserId: userId,
      lines: { create: lines },
    },
    select: { id: true },
  });

  await tx.journal.update({
    where: { id: journal.id },
    data: { status: JournalStatus.POSTED, postedByUserId: userId, postedAt: new Date() },
  });

  await tx.auditEvent.create({
    data: {
      organizationId: orgId,
      actorUserId: userId,
      entityType: "pos_sale",
      entityId: sale.saleId,
      action: AuditAction.POST,
      after: { journalId: journal.id, totalMinor: sale.totalMinor.toString() },
    },
  });
}

const cashOverShortAccount = { code: "6100", accountType: "EXPENSE" as AccountType };

/**
 * Reverse a single posted journal by id.
 *
 * Used when a register close is corrected: the original entries stay in the
 * ledger and are cancelled by an opposite entry, rather than being edited away.
 * Idempotent — a journal that has already been reversed is left alone.
 */
export async function reverseJournalById(
  tx: TransactionClient,
  orgId: string,
  userId: string,
  journalId: string,
  reversalSourceType: string
): Promise<void> {
  const original = await tx.journal.findFirst({
    where: { id: journalId, organizationId: orgId, status: JournalStatus.POSTED },
    include: { lines: true },
  });
  if (!original) return;

  const alreadyReversed = await tx.journal.findFirst({
    where: { organizationId: orgId, reversedJournalId: original.id },
    select: { id: true },
  });
  if (alreadyReversed) return;

  // Dated today so a correction never lands in a period that has been closed.
  await assertPeriodOpen(tx, orgId, new Date());

  const reversal = await tx.journal.create({
    data: {
      organizationId: orgId,
      status: JournalStatus.DRAFT,
      journalDate: new Date(),
      memo: `Reversal of ${original.memo ?? journalId}`,
      sourceType: reversalSourceType,
      reversedJournalId: original.id,
      createdByUserId: userId,
      lines: {
        create: original.lines.map((l) => ({
          organizationId: orgId,
          accountId: l.accountId,
          debitMinor: l.creditMinor,
          creditMinor: l.debitMinor,
          memo: `Reversal: ${l.memo ?? ""}`.trim(),
        })),
      },
    },
    select: { id: true },
  });

  await tx.journal.update({
    where: { id: reversal.id },
    data: { status: JournalStatus.POSTED, postedByUserId: userId, postedAt: new Date() },
  });
}

export type DayCloseJournals = {
  varianceJournalId: string | null;
  bankingJournalId: string | null;
};

/**
 * Post the two end-of-day entries for a register close.
 *
 * 1. Variance — the difference between expected and counted cash is a real
 *    gain or loss, not a rounding detail. Short tills debit Cash Over/Short;
 *    over tills credit it.
 * 2. Banking — cash physically taken to the bank moves out of Cash on Hand
 *    into the bank account. This is the step that finally makes the bank
 *    balance reflect reality.
 *
 * Card settlement is deliberately not handled here: the provider pays out on
 * its own schedule, usually net of fees, so it is a separate event.
 */
export async function postPosDayCloseJournals(
  tx: TransactionClient,
  orgId: string,
  userId: string,
  input: {
    businessDate: Date;
    varianceMinor: bigint;
    bankedMinor: bigint;
  }
): Promise<DayCloseJournals> {
  const result: DayCloseJournals = { varianceJournalId: null, bankingJournalId: null };

  if (input.varianceMinor === BigInt(0) && input.bankedMinor <= BigInt(0)) {
    return result;
  }

  await assertPeriodOpen(tx, orgId, input.businessDate);

  const cashId = await resolveSystemAccount(tx, orgId, cashOnHandAccount);

  // ── Till variance ───────────────────────────────────────────────────────
  if (input.varianceMinor !== BigInt(0)) {
    const overShortId = await resolveSystemAccount(tx, orgId, cashOverShortAccount);
    const isShort = input.varianceMinor < BigInt(0);
    const amount = isShort ? -input.varianceMinor : input.varianceMinor;

    const lines = isShort
      ? [
          // Less cash than expected: recognise the loss, reduce the till.
          { organizationId: orgId, accountId: overShortId, debitMinor: amount, creditMinor: BigInt(0), memo: "Till shortage" },
          { organizationId: orgId, accountId: cashId, debitMinor: BigInt(0), creditMinor: amount, memo: "Till shortage" },
        ]
      : [
          // More cash than expected: increase the till, recognise the gain.
          { organizationId: orgId, accountId: cashId, debitMinor: amount, creditMinor: BigInt(0), memo: "Till overage" },
          { organizationId: orgId, accountId: overShortId, debitMinor: BigInt(0), creditMinor: amount, memo: "Till overage" },
        ];

    assertJournalBalances("POS till variance", input.businessDate.toISOString().slice(0, 10), lines);

    const journal = await tx.journal.create({
      data: {
        organizationId: orgId,
        status: JournalStatus.DRAFT,
        journalDate: input.businessDate,
        memo: isShort ? "Till shortage on register close" : "Till overage on register close",
        sourceType: "pos_day_close_variance",
        sourceId: null,
        createdByUserId: userId,
        lines: { create: lines },
      },
      select: { id: true },
    });

    await tx.journal.update({
      where: { id: journal.id },
      data: { status: JournalStatus.POSTED, postedByUserId: userId, postedAt: new Date() },
    });

    result.varianceJournalId = journal.id;
  }

  // ── Cash banked ─────────────────────────────────────────────────────────
  if (input.bankedMinor > BigInt(0)) {
    const bankId = await resolveSystemAccount(tx, orgId, bankAccount);

    const lines = [
      { organizationId: orgId, accountId: bankId, debitMinor: input.bankedMinor, creditMinor: BigInt(0), memo: "Cash banked from till" },
      { organizationId: orgId, accountId: cashId, debitMinor: BigInt(0), creditMinor: input.bankedMinor, memo: "Cash banked from till" },
    ];

    assertJournalBalances("POS cash banking", input.businessDate.toISOString().slice(0, 10), lines);

    const journal = await tx.journal.create({
      data: {
        organizationId: orgId,
        status: JournalStatus.DRAFT,
        journalDate: input.businessDate,
        memo: "Cash banked from till",
        sourceType: "pos_day_close_banking",
        sourceId: null,
        createdByUserId: userId,
        lines: { create: lines },
      },
      select: { id: true },
    });

    await tx.journal.update({
      where: { id: journal.id },
      data: { status: JournalStatus.POSTED, postedByUserId: userId, postedAt: new Date() },
    });

    result.bankingJournalId = journal.id;
  }

  return result;
}

type PosCogs = {
  saleId: string;
  saleNumber: string;
  soldAt: Date;
  cogsMinor: bigint;
};

/**
 * Post the cost side of a completed POS sale: Dr Cost of Sales, Cr Inventory.
 *
 * Separate from the sales journal so each has its own source type and can be
 * reversed independently, and so a sale with no recorded cost simply has no
 * cost journal rather than an unbalanced one.
 *
 * Idempotent, matching postPosSaleJournal.
 */
export async function postPosCogsJournal(
  tx: TransactionClient,
  orgId: string,
  userId: string,
  sale: PosCogs
): Promise<void> {
  const existing = await tx.journal.findFirst({
    where: { organizationId: orgId, sourceType: "pos_cogs", sourceId: sale.saleId },
    select: { id: true },
  });
  if (existing) return;

  // No cost recorded against the products sold — post nothing rather than a
  // zero-value journal. Deliberately does NOT block the sale: refusing to serve
  // a customer because a cost price was never entered is not acceptable at a
  // till. Gross profit will be overstated for these lines until cost is set.
  if (sale.cogsMinor <= BigInt(0)) return;

  await assertPeriodOpen(tx, orgId, sale.soldAt);

  const cogsId = await resolveSystemAccount(tx, orgId, costOfSalesAccount);
  const inventoryId = await resolveSystemAccount(tx, orgId, inventoryAccount);

  const lines = [
    { organizationId: orgId, accountId: cogsId, debitMinor: sale.cogsMinor, creditMinor: BigInt(0), memo: `Cost of POS sale ${sale.saleNumber}` },
    { organizationId: orgId, accountId: inventoryId, debitMinor: BigInt(0), creditMinor: sale.cogsMinor, memo: `Stock out for POS sale ${sale.saleNumber}` },
  ];

  assertJournalBalances("POS cost of sales", sale.saleNumber, lines);

  const journal = await tx.journal.create({
    data: {
      organizationId: orgId,
      status: JournalStatus.DRAFT,
      journalDate: sale.soldAt,
      memo: `Cost of POS sale ${sale.saleNumber}`,
      sourceType: "pos_cogs",
      sourceId: sale.saleId,
      createdByUserId: userId,
      lines: { create: lines },
    },
    select: { id: true },
  });

  await tx.journal.update({
    where: { id: journal.id },
    data: { status: JournalStatus.POSTED, postedByUserId: userId, postedAt: new Date() },
  });

  await tx.auditEvent.create({
    data: {
      organizationId: orgId,
      actorUserId: userId,
      entityType: "pos_sale",
      entityId: sale.saleId,
      action: AuditAction.POST,
      after: { journalId: journal.id, cogsMinor: sale.cogsMinor.toString() },
    },
  });
}

/**
 * Post a reversing journal for a POS sale (used by refund and delete). Mirrors the
 * original pos_sale journal with debits/credits swapped, dated today so it never
 * lands in a closed period. Idempotent: no-ops if the sale was never posted or a
 * reversal already exists.
 */
export async function reversePosSaleJournal(
  tx: TransactionClient,
  orgId: string,
  userId: string,
  saleId: string,
  reversalSourceType: "pos_refund" | "pos_sale_void"
): Promise<void> {
  // Both sides must unwind. Reversing only the revenue journal would leave the
  // cost of a refunded sale sitting in Cost of Sales forever.
  await reverseBySourceType(tx, orgId, userId, saleId, "pos_sale", reversalSourceType);
  await reverseBySourceType(tx, orgId, userId, saleId, "pos_cogs", `${reversalSourceType}_cogs`);
}

async function reverseBySourceType(
  tx: TransactionClient,
  orgId: string,
  userId: string,
  saleId: string,
  originalSourceType: "pos_sale" | "pos_cogs",
  reversalSourceType: string
): Promise<void> {
  const original = await tx.journal.findFirst({
    where: { organizationId: orgId, sourceType: originalSourceType, sourceId: saleId, status: JournalStatus.POSTED },
    include: { lines: true },
  });
  if (!original) return;

  const existingReversal = await tx.journal.findFirst({
    where: { organizationId: orgId, sourceId: saleId, sourceType: reversalSourceType },
    select: { id: true },
  });
  if (existingReversal) return;

  await assertPeriodOpen(tx, orgId, new Date());

  const reversedLines = original.lines.map((l) => ({
    organizationId: orgId,
    accountId: l.accountId,
    debitMinor: l.creditMinor,
    creditMinor: l.debitMinor,
    memo: `Reversal of POS sale (${reversalSourceType})`,
  }));

  const reversal = await tx.journal.create({
    data: {
      organizationId: orgId,
      status: JournalStatus.DRAFT,
      journalDate: new Date(),
      memo: `Reversal of POS sale ${saleId}`,
      sourceType: reversalSourceType,
      sourceId: saleId,
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

  await tx.auditEvent.create({
    data: {
      organizationId: orgId,
      actorUserId: userId,
      entityType: "pos_sale",
      entityId: saleId,
      action: AuditAction.REVERSE,
      after: { journalId: reversal.id, reversedJournalId: original.id, kind: reversalSourceType },
    },
  });
}
