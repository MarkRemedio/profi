import "server-only";

import { JournalStatus } from "@prisma/client";

import { prisma, type TransactionClient } from "@/lib/prisma";
import {
  assertJournalBalances,
  computeNextNumber,
  createReversalJournal,
  outputVatAccount,
} from "@/lib/accounting/documents";
import { assertPeriodOpen } from "@/lib/accounting/period-close";

/**
 * Credit notes, as accounting rather than as a record of one.
 *
 * A credit note used to be a row and nothing else. Issuing one left the
 * receivable, the revenue and the output VAT exactly as the invoice had
 * recorded them — so the customer still owed the full amount in the ledger, on
 * their statement and in aged receivables, the sale was still counted, and the
 * VAT return still claimed tax on money that had been credited back. That last
 * one is the reason this was the first thing fixed: it is the only defect in
 * the product that puts a wrong number on a return to HMRC.
 *
 * The journal is the invoice's, reversed:
 *
 *     DR 4200 Sales Returns      net
 *     DR 2100 VAT Payable        tax
 *         CR 1100 Accounts Receivable   total
 *
 * Sales Returns rather than debiting 4000 Sales directly, so a month's credits
 * stay visible instead of quietly netting away the sales they reverse. And
 * rather than 4100 Sales Discount, which is a different event: a discount is a
 * price concession agreed at the point of sale, a return is a sale undone after
 * it.
 */

const salesReturnsAccount = { code: "4200", accountType: "REVENUE" as const };
const receivableAccount = { code: "1100", accountType: "ASSET" as const };

/* The extended client's transaction type, not Prisma.TransactionClient: the
   tenancy extension widens it, and the two are not assignable. */
type Tx = TransactionClient;

/**
 * Resolve one of the accounts this posting needs.
 *
 * By code within the organisation, and it throws rather than falling back to
 * "any account of the right type" — posting a credit to whichever revenue
 * account happened to sort first is worse than refusing, because nothing later
 * reveals it went to the wrong place.
 */
async function resolveAccount(
  tx: Tx,
  organizationId: string,
  target: { code: string; accountType: string }
): Promise<string> {
  const account = await tx.chartAccount.findFirst({
    where: { organizationId, code: target.code },
    select: { id: true },
  });

  if (!account) {
    throw new Error(
      `Account ${target.code} is missing from this workspace's chart of accounts, ` +
        `so a credit note cannot be posted. Seed the starter chart to add it.`
    );
  }

  return account.id;
}

/** The next credit note number, from the same sequence invoices use. */
export async function nextCreditNoteNumber(tx: Tx, organizationId: string): Promise<string> {
  const rows = await tx.creditNote.findMany({
    where: { organizationId, cnNo: { startsWith: "CN-" } },
    select: { cnNo: true },
  });

  return computeNextNumber("CN-", rows.map((row) => row.cnNo));
}

export type PostCreditNoteResult = {
  creditNoteId: string;
  journalId: string;
};

/**
 * Post a credit note to the ledger.
 *
 * Idempotent on postedJournalId: a credit note that already carries a journal
 * is returned as-is rather than posted twice, because a double credit is
 * indistinguishable from a genuine second one after the fact.
 */
export async function postCreditNote(
  organizationId: string,
  creditNoteId: string,
  actorUserId: string | null
): Promise<PostCreditNoteResult> {
  return prisma.$transaction(async (tx) => {
    const note = await tx.creditNote.findFirstOrThrow({
      where: { id: creditNoteId, organizationId },
      select: {
        id: true,
        cnNo: true,
        date: true,
        contactId: true,
        subtotalMinor: true,
        taxMinor: true,
        totalMinor: true,
        postedJournalId: true,
      },
    });

    if (note.postedJournalId) {
      return { creditNoteId: note.id, journalId: note.postedJournalId };
    }

    if (note.totalMinor <= BigInt(0)) {
      throw new Error(`Credit note ${note.cnNo} has no value and cannot be posted.`);
    }

    await assertPeriodOpen(tx, organizationId, note.date);

    /* Rows written before credit notes carried a tax breakdown have a zero
       subtotal and a real total. Treating that as "all net" is the only reading
       that balances, and it matches what those documents actually did: they
       reversed nothing, so no VAT was ever credited. */
    const netMinor = note.subtotalMinor > BigInt(0) ? note.subtotalMinor : note.totalMinor;
    const taxMinor = note.taxMinor;

    if (netMinor + taxMinor !== note.totalMinor) {
      throw new Error(
        `Credit note ${note.cnNo} does not add up: net (${netMinor}) plus VAT (${taxMinor}) ` +
          `is not the total (${note.totalMinor}).`
      );
    }

    const returnsAccountId = await resolveAccount(tx, organizationId, salesReturnsAccount);
    const arAccountId = await resolveAccount(tx, organizationId, receivableAccount);
    const vatAccountId =
      taxMinor > BigInt(0)
        ? await resolveAccount(tx, organizationId, outputVatAccount)
        : null;

    const lines = [
      {
        organizationId,
        accountId: returnsAccountId,
        contactId: note.contactId,
        debitMinor: netMinor,
        creditMinor: BigInt(0),
        memo: `Credit note ${note.cnNo}`,
      },
      ...(vatAccountId
        ? [
            {
              organizationId,
              accountId: vatAccountId,
              contactId: note.contactId,
              debitMinor: taxMinor,
              creditMinor: BigInt(0),
              memo: `VAT credited on ${note.cnNo}`,
            },
          ]
        : []),
      {
        organizationId,
        accountId: arAccountId,
        contactId: note.contactId,
        debitMinor: BigInt(0),
        creditMinor: note.totalMinor,
        memo: `Credit note ${note.cnNo}`,
      },
    ];

    assertJournalBalances("Credit note", note.cnNo, lines);

    // Created as a draft first, then posted: the ledger's immutability trigger
    // refuses writes to a journal that is already posted, which is the same
    // two-step every other document here uses.
    const journal = await tx.journal.create({
      data: {
        organizationId,
        status: JournalStatus.DRAFT,
        journalDate: note.date,
        memo: `Credit note ${note.cnNo}`,
        sourceType: "credit_note",
        sourceId: note.id,
        createdByUserId: actorUserId,
        lines: { create: lines },
      },
    });

    await tx.journal.update({
      where: { id: journal.id },
      data: {
        status: JournalStatus.POSTED,
        postedByUserId: actorUserId,
        postedAt: new Date(),
      },
    });

    await tx.creditNote.update({
      where: { id: note.id },
      data: { postedJournalId: journal.id },
    });

    return { creditNoteId: note.id, journalId: journal.id };
  });
}

/**
 * Void a credit note.
 *
 * The route out, and the reason a posted credit note cannot simply be deleted.
 * Deleting the row would leave its journal in the ledger reducing a receivable
 * with nothing to point at; voiding posts an equal and opposite journal, so
 * both the credit and its reversal stay on the record and the receivable
 * returns to what it was.
 *
 * This is what invoices, bills and receipts have always done — credit notes
 * were the one document type that could post but never be undone, because
 * before they posted at all there was nothing to undo.
 *
 * Idempotent: a note already void is returned untouched rather than reversed
 * twice, which would credit the customer all over again.
 */
export async function voidCreditNote(
  organizationId: string,
  creditNoteId: string,
  actorUserId: string
): Promise<{ creditNoteId: string; reversalJournalId: string | null }> {
  return prisma.$transaction(async (tx) => {
    const note = await tx.creditNote.findFirstOrThrow({
      where: { id: creditNoteId, organizationId },
      select: { id: true, cnNo: true, status: true, postedJournalId: true },
    });

    /*
     * Idempotent on the reversal, not on the status word.
     *
     * Keying this on status === "void" made a string the record of whether the
     * ledger had been corrected, and anything that could write that string
     * could silently cost a reversal: a note marked void by another path was
     * then skipped here for ever, leaving its original journal in the books
     * with nothing against it. The reversal journal is the fact; the status is
     * a label describing it.
     */
    const existingReversal = await tx.journal.findFirst({
      where: { organizationId, sourceType: "credit_note_void", sourceId: note.id },
      select: { id: true },
    });

    if (existingReversal) {
      // Already reversed. Make sure the label agrees with the ledger, in case
      // it is the label that drifted.
      if (note.status !== "void") {
        await tx.creditNote.update({
          where: { id: note.id },
          data: { status: "void", remainingMinor: BigInt(0) },
        });
      }
      return { creditNoteId: note.id, reversalJournalId: existingReversal.id };
    }

    // Nothing posted and nothing to reverse: only the label to set.
    if (!note.postedJournalId && note.status === "void") {
      return { creditNoteId: note.id, reversalJournalId: null };
    }

    let reversalJournalId: string | null = null;

    // An unposted note has nothing in the ledger to reverse; it just becomes
    // void, which is still better than vanishing from a numbered sequence.
    if (note.postedJournalId) {
      reversalJournalId = await createReversalJournal(
        tx,
        organizationId,
        actorUserId,
        note.postedJournalId,
        `Void credit note ${note.cnNo}`,
        "credit_note_void",
        note.id
      );
    }

    await tx.creditNote.update({
      where: { id: note.id },
      // remainingMinor goes to zero: a void credit note has nothing left to
      // allocate against an invoice.
      data: { status: "void", remainingMinor: BigInt(0) },
    });

    return { creditNoteId: note.id, reversalJournalId };
  });
}
