"use server";

import { prisma } from "@/lib/prisma";
import { contactDisplayName } from "@/lib/accounting/contact-name";
import { nextCreditNoteNumber, postCreditNote, voidCreditNote } from "@/lib/accounting/credit-notes";
import { createClient } from "@/lib/supabase/server";

export async function fetchCreditNotesDB(orgId: string) {
  if (!orgId) return [];

  const notes = await prisma.creditNote.findMany({
    where: { organizationId: orgId }, // 🚀 Secured to the real active account!
    include: { contact: true },
    orderBy: { createdAt: "desc" }
  });

  return notes.map((n: any) => ({
    id: n.id,
    cnNo: n.cnNo,
    contactName: contactDisplayName(n.contact),
    date: n.date.toISOString(),
    /* Rows written before credit notes carried a split have a zero subtotal
       and a real total, which the posting path reads as "all net". The list
       shows the same reading rather than an empty column beside a real
       amount. */
    subtotalMinor: Number(n.subtotalMinor) > 0 ? Number(n.subtotalMinor) : Number(n.totalMinor),
    taxMinor: Number(n.taxMinor),
    taxCode: n.taxCode,
    totalMinor: Number(n.totalMinor),
    remainingMinor: Number(n.remainingMinor),
    status: n.status,
    posted: Boolean(n.postedJournalId),
    invoiceRef: n.invoiceRef || "N/A"
  }));
}

/**
 * Raise a credit note and post it.
 *
 * Three things this used to get wrong, all of which showed up as wrong numbers
 * rather than as errors:
 *
 *   - The number was `CN-00${Math.random()}`, so credit notes were neither
 *     sequential nor predictable. A VAT-registered business has to be able to
 *     produce them in order, and the unique constraint meant a collision failed
 *     the save outright for no reason the user could see.
 *   - A customer name that matched nothing silently created a new contact, so a
 *     typo produced a duplicate customer instead of an error.
 *   - Nothing was posted. The receivable, the revenue and the output VAT all
 *     stayed exactly as the invoice had left them.
 */
export async function createCreditNoteDB(orgId: string, data: any) {
  if (!orgId) throw new Error("No organization ID provided");

  const contact = await prisma.contact.findFirst({
    where: { organizationId: orgId, name: data.contactName },
    select: { id: true },
  });

  // Refuse rather than invent. The dialog picks from existing customers, so a
  // name that matches nothing means something is wrong upstream — and creating
  // a customer as a side effect of crediting one is how duplicate contacts get
  // into a ledger nobody can reconcile afterwards.
  if (!contact) {
    throw new Error(
      `No customer named "${data.contactName}" in this workspace. Pick an existing customer.`
    );
  }

  const totalMinor = BigInt(Math.round(Number(data.totalMinor) || 0));
  const taxMinor = BigInt(Math.round(Number(data.taxMinor) || 0));
  const subtotalMinor = totalMinor - taxMinor;

  if (totalMinor <= BigInt(0)) {
    throw new Error("A credit note needs a value greater than zero.");
  }
  if (subtotalMinor < BigInt(0)) {
    throw new Error("The VAT on a credit note cannot exceed its total.");
  }

  const created = await prisma.$transaction(async (tx) => {
    const cnNo = await nextCreditNoteNumber(tx, orgId);

    return tx.creditNote.create({
      data: {
        organizationId: orgId,
        contactId: contact.id,
        cnNo,
        date: new Date(data.date),
        invoiceRef: data.invoiceRef || "N/A",
        subtotalMinor,
        taxMinor,
        taxCode: typeof data.taxCode === "string" ? data.taxCode : "no_vat",
        totalMinor,
        remainingMinor: totalMinor,
        // A new credit note is open. Nothing else is reachable at creation,
        // and "void" in particular has to come from the void path.
        status: "open",
      },
    });
  });

  /* Posted outside the transaction that created it, because postCreditNote
     opens its own — and deliberately not swallowed: a credit note that exists
     on screen but not in the ledger is the exact failure this work set out to
     remove, so it must surface rather than leave the two out of step. */
  await postCreditNote(orgId, created.id, null);

  return created;
}

/**
 * Amend a credit note that has not been posted.
 *
 * Refused once it has, for the same reason an invoice is: the journal is in the
 * ledger and immutable, so changing the document would leave the two saying
 * different things with nothing to reveal it. The rejection is the same shape
 * as the invoice and bill guards beside it.
 *
 * The VAT fields are written here too. They were not, so an amount edited on a
 * pre-VAT credit note kept whatever split it already had — usually none — and
 * silently disagreed with its own total.
 */
export async function updateCreditNoteDB(orgId: string, id: string, data: any) {
  if (!orgId) throw new Error("No organization ID provided");

  const current = await prisma.creditNote.findFirst({
    where: { id, organizationId: orgId },
    select: { cnNo: true, postedJournalId: true },
  });

  if (!current) throw new Error("Credit note not found.");

  if (current.postedJournalId) {
    throw new Error(
      `Credit note ${current.cnNo} cannot be edited once it is posted to the ledger. ` +
        `Void it and raise a new one — that posts the reversal and keeps both on the record.`
    );
  }

  const totalMinor = BigInt(Math.round(Number(data.totalMinor) || 0));
  const taxMinor = BigInt(Math.round(Number(data.taxMinor) || 0));
  const subtotalMinor = totalMinor - taxMinor;

  if (totalMinor <= BigInt(0)) {
    throw new Error("A credit note needs a value greater than zero.");
  }
  if (subtotalMinor < BigInt(0)) {
    throw new Error("The VAT on a credit note cannot exceed its total.");
  }

  await prisma.creditNote.update({
    where: { id },
    data: {
      subtotalMinor,
      taxMinor,
      taxCode: typeof data.taxCode === "string" ? data.taxCode : "no_vat",
      totalMinor,
      remainingMinor: BigInt(Math.round(Number(data.remainingMinor) || 0)),
      /* Not taken from the client. "void" is a statement about the ledger, and
         accepting it here would let a form mark a note reversed without any
         reversal being posted — the exact drift the void path now guards
         against. Voiding goes through voidCreditNote, which posts the journal
         first and sets this afterwards. */
      status: data.status === "void" ? undefined : data.status,
    },
  });

  // Now that it has a value and a VAT split, put it in the ledger.
  await postCreditNote(orgId, id, null);

  return { count: 1 };
}

/**
 * Void a credit note, posting the reversal that undoes it.
 *
 * The answer to "how do I get rid of this one" for anything already in the
 * ledger. Deleting is only for a note that never reached it.
 */
export async function voidCreditNoteDB(orgId: string, id: string) {
  if (!orgId) throw new Error("No organization ID provided");

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Your session has expired. Please sign in again.");

  return voidCreditNote(orgId, id, data.user.id);
}

/**
 * Delete credit notes that were never posted.
 *
 * A posted one is refused: deleting the row would leave its journal behind,
 * crediting a document that no longer exists — a receivable reduced by nothing
 * anybody can point at. Nothing in the ledger is deleted to tidy a list.
 */
export async function deleteCreditNotesDB(orgId: string, ids: string[]) {
  if (!orgId) throw new Error("No organization ID provided");

  const posted = await prisma.creditNote.findMany({
    where: { id: { in: ids }, organizationId: orgId, postedJournalId: { not: null } },
    select: { cnNo: true },
  });

  if (posted.length > 0) {
    /* Points at Void, which is the actual route — the earlier wording sent
       people to refund receipts, which pay money back rather than undo a
       credit, and would have left them with two documents and a worse
       problem. */
    throw new Error(
      `${posted.map((n) => n.cnNo).join(", ")} ${posted.length === 1 ? "is" : "are"} posted to ` +
        `the ledger, so deleting would leave the journal behind. Use Void instead — it posts ` +
        `the reversal and keeps both on the record.`
    );
  }

  return await prisma.creditNote.deleteMany({
    where: { id: { in: ids }, organizationId: orgId }
  });
}
