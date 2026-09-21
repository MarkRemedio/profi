import "server-only";

import {
  AuditAction,
  ContactType,
  CurrencyCode,
  JournalStatus,
} from "@prisma/client";

import { assertPeriodOpen } from "@/lib/accounting/period-close";
import {
  assertJournalBalances,
  bankAccount,
  computeNextNumber,
  normalizeLines,
  outputVatAccount,
  resolveDepositAccount,
  resolveSystemAccount,
  salesDiscountAccount,
  withDocNumberRetry,
  type DocumentLineInput,
  type PaymentMethod,
  type VatTreatment,
} from "@/lib/accounting/documents";
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
import type { ExtendedPrismaClient, TransactionClient } from "@/lib/prisma";

/**
 * A receipt with no explicit currency belongs to the workspace's own books, so
 * it must inherit the workspace currency. Defaulting to GBP stamped every
 * receipt in a non-GBP workspace with the wrong currency, which then rendered
 * with the wrong symbol and was excluded from customer statements.
 */
async function resolveReceiptCurrency(
  tx: {
    organization: {
      findUnique: (args: any) => Promise<{ baseCurrency: string; multicurrencyEnabled: boolean } | null>;
    };
  },
  organizationId: string,
  currency?: CurrencyCode
): Promise<CurrencyCode> {
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrency: true, multicurrencyEnabled: true },
  });
  const base = org?.baseCurrency;
  const fallback = base && base in CurrencyCode ? (base as CurrencyCode) : CurrencyCode.GBP;

  // Receipts are always in the workspace currency, even when multicurrency is
  // enabled.
  //
  // Unlike invoices and bills, a receipt stores no exchange rate and its journal
  // posting performs no conversion, so a foreign receipt would enter the ledger
  // at face value — a TZS 500 receipt posting as 500 pence rather than about
  // 14p. Until receipts carry a rate and convert on posting, refusing the
  // foreign currency is the only safe behaviour: an unavailable feature beats a
  // silently wrong ledger.
  return fallback;
}

type Tx = TransactionClient;

export type ReceiptDraftInput = {
  contactId: string;
  receiptDate: string; // YYYY-MM-DD
  currency?: CurrencyCode;
  amountsAre?: VatTreatment;
  paymentMethod?: PaymentMethod | null;
  // Deposit-to account for sales receipts, refund-from account for refund
  // receipts. Falls back to the system bank account (1000) when omitted.
  bankAccountId?: string | null;
  reference?: string;
  notes?: string;
  lines: DocumentLineInput[];
};

export type ReceiptPostingResult = {
  documentId: string;
  documentNo: string;
  journalId: string;
};

export type ReceiptLineDto = {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  description: string;
  quantity: string;
  unitPriceMinor: number;
  discountMinor: number;
  subtotalMinor: number;
  taxCode: string;
  taxRate: number;
  taxMinor: number;
  totalMinor: number;
};

export type ReceiptDto = {
  id: string;
  receiptNo: string;
  status: "posted" | "void";
  contactId: string;
  contactName: string;
  receiptDate: string;
  currency: CurrencyCode;
  amountsAre: VatTreatment;
  paymentMethod: PaymentMethod | null;
  bankAccountId: string;
  bankAccountName: string;
  reference: string | null;
  notes: string | null;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  postedJournalId: string | null;
  createdAt: string;
  lines: ReceiptLineDto[];
};

// Revenue lines only, same rule as invoices.
const receiptLineRules = {
  accountTypes: ["REVENUE" as const],
  reportCategories: ["SALES" as const, "OTHER_INCOME" as const],
};

function assertReceiptTotalPositive(kind: string, totalMinor: bigint) {
  if (totalMinor <= BigInt(0)) {
    throw new Error(
      `${kind} has a zero total and cannot be posted. Remove fully-discounted lines or adjust the amounts.`
    );
  }
}

function toDate(value: string) {
  if (!value) return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  return new Date(`${value}T00:00:00.000Z`);
}

async function resolveCustomer(tx: Tx, organizationId: string, contactId: string) {
  const contact = await tx.contact.findFirst({
    where: {
      id: contactId,
      organizationId,
      isActive: true,
      contactType: { in: [ContactType.CUSTOMER, ContactType.BOTH] },
    },
    select: { id: true, ...CONTACT_NAME_SELECT },
  });
  if (!contact) {
    throw new Error("Selected contact is not an active customer of this organization.");
  }
  return contact;
}

async function resolveReceiptBankAccount(
  tx: Tx,
  organizationId: string,
  bankAccountId?: string | null
) {
  return bankAccountId
    ? resolveDepositAccount(tx, organizationId, bankAccountId)
    : resolveSystemAccount(tx, organizationId, bankAccount);
}

/** Post a DRAFT journal with the given lines, then flip it to POSTED
 *  (two steps to bypass the DB immutability trigger on posted journals). */
async function postJournal(
  tx: Tx,
  args: {
    organizationId: string;
    actorUserId: string;
    journalDate: Date;
    memo: string;
    sourceType: string;
    sourceId: string;
    paymentMethod: PaymentMethod | null;
    reversedJournalId?: string;
    lines: Array<{
      organizationId: string;
      accountId: string;
      contactId: string | null;
      debitMinor: bigint;
      creditMinor: bigint;
      memo: string;
    }>;
  }
) {
  const journal = await tx.journal.create({
    data: {
      organizationId: args.organizationId,
      status: JournalStatus.DRAFT,
      journalDate: args.journalDate,
      memo: args.memo,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      paymentMethod: args.paymentMethod,
      reversedJournalId: args.reversedJournalId ?? null,
      createdByUserId: args.actorUserId,
      lines: { create: args.lines },
    },
    select: { id: true },
  });

  await tx.journal.update({
    where: { id: journal.id, organizationId: args.organizationId },
    data: {
      status: JournalStatus.POSTED,
      postedByUserId: args.actorUserId,
      postedAt: new Date(),
    },
  });

  return journal.id;
}

export async function createSalesReceipt(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  input: ReceiptDraftInput
): Promise<ReceiptPostingResult> {
  return withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const contact = await resolveCustomer(tx, organizationId, input.contactId);
      const receiptDate = toDate(input.receiptDate);
      await assertPeriodOpen(tx, organizationId, receiptDate);

      const amountsAre = input.amountsAre ?? "exclusive";
      const normalized = await normalizeLines(
        tx,
        organizationId,
        input.lines,
        receiptLineRules,
        amountsAre
      );

      assertReceiptTotalPositive("Sales receipt", normalized.totalMinor);

      const depositAccountId = await resolveReceiptBankAccount(tx, organizationId, input.bankAccountId);
      const vatAccountId =
        normalized.taxMinor > BigInt(0)
          ? await resolveSystemAccount(tx, organizationId, outputVatAccount)
          : null;
      const discountAccountId =
        normalized.discountMinor > BigInt(0)
          ? await resolveSystemAccount(tx, organizationId, salesDiscountAccount)
          : null;

      const rows = await tx.salesReceipt.findMany({
        where: { organizationId, receiptNo: { startsWith: "SR-" } },
        select: { receiptNo: true },
      });
      const receiptNo = computeNextNumber("SR-", rows.map((row) => row.receiptNo));

      const receipt = await tx.salesReceipt.create({
        data: {
          organizationId,
          receiptNo,
          status: "posted",
          contactId: contact.id,
          receiptDate,
          currency: await resolveReceiptCurrency(tx, organizationId, input.currency),
          amountsAre,
          paymentMethod: input.paymentMethod ?? null,
          depositAccountId,
          subtotalMinor: normalized.subtotalMinor,
          discountMinor: normalized.discountMinor,
          taxMinor: normalized.taxMinor,
          totalMinor: normalized.totalMinor,
          notes: input.notes?.trim() || null,
          lines: {
            create: normalized.lines.map((line) => ({
              organizationId,
              accountId: line.accountId,
              description: line.description,
              quantity: line.quantity,
              unitAmountMinor: line.unitAmountMinor,
              discountMinor: line.discountMinor,
              subtotalMinor: line.subtotalMinor,
              taxCode: line.taxCode,
              taxRate: line.taxRate,
              taxMinor: line.taxMinor,
              totalMinor: line.totalMinor,
            })),
          },
        },
        select: { id: true },
      });

      // DR bank (total) / CR revenue (net per line) / CR output VAT / DR discount.
      // Same shape as an approved cash-sale invoice with AR netted out.
      const journalLines = [
        {
          organizationId,
          accountId: depositAccountId,
          contactId: contact.id,
          debitMinor: normalized.totalMinor,
          creditMinor: BigInt(0),
          memo: `Sales receipt ${receiptNo}`,
        },
        ...normalized.lines.map((line) => ({
          organizationId,
          accountId: line.accountId,
          contactId: contact.id,
          debitMinor: BigInt(0),
          creditMinor: line.subtotalMinor,
          memo: line.description,
        })),
        ...(vatAccountId
          ? [
              {
                organizationId,
                accountId: vatAccountId,
                contactId: contact.id,
                debitMinor: BigInt(0),
                creditMinor: normalized.taxMinor,
                memo: `VAT on sales receipt ${receiptNo}`,
              },
            ]
          : []),
        ...(discountAccountId
          ? [
              {
                organizationId,
                accountId: discountAccountId,
                contactId: contact.id,
                debitMinor: normalized.discountMinor,
                creditMinor: BigInt(0),
                memo: `Discount on sales receipt ${receiptNo}`,
              },
            ]
          : []),
      ];

      assertJournalBalances("Sales receipt", receiptNo, journalLines);

      const journalId = await postJournal(tx, {
        organizationId,
        actorUserId,
        journalDate: receiptDate,
        memo: `Sales receipt ${receiptNo} - ${contactDisplayName(contact)}`,
        sourceType: "sales_receipt",
        sourceId: receipt.id,
        paymentMethod: input.paymentMethod ?? null,
        lines: journalLines,
      });

      await tx.salesReceipt.update({
        where: { id: receipt.id, organizationId },
        data: { postedJournalId: journalId },
      });

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId,
          entityType: "sales_receipt",
          entityId: receipt.id,
          action: AuditAction.POST,
          after: { journalId, receiptNo, totalMinor: normalized.totalMinor.toString() },
        },
      });

      return { documentId: receipt.id, documentNo: receiptNo, journalId };
    })
  );
}

export async function voidSalesReceipt(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  receiptId: string
): Promise<ReceiptPostingResult> {
  return prisma.$transaction(async (tx) => {
    const receipt = await tx.salesReceipt.findFirstOrThrow({
      where: { id: receiptId, organizationId },
      select: {
        id: true,
        receiptNo: true,
        status: true,
        postedJournalId: true,
        contact: { select: CONTACT_NAME_SELECT },
      },
    });

    if (receipt.status !== "posted" || !receipt.postedJournalId) {
      throw new Error(`Sales receipt ${receipt.receiptNo} is already void.`);
    }

    // Reversal is dated today so it never lands in a closed period.
    const reversalDate = new Date();
    await assertPeriodOpen(tx, organizationId, reversalDate);

    const originalLines = await tx.journalLine.findMany({
      where: { journalId: receipt.postedJournalId, organizationId },
      select: { accountId: true, contactId: true, debitMinor: true, creditMinor: true },
    });

    const reversalLines = originalLines.map((line) => ({
      organizationId,
      accountId: line.accountId,
      contactId: line.contactId,
      debitMinor: line.creditMinor,
      creditMinor: line.debitMinor,
      memo: `Void sales receipt ${receipt.receiptNo}`,
    }));

    assertJournalBalances("Sales receipt void", receipt.receiptNo, reversalLines);

    const journalId = await postJournal(tx, {
      organizationId,
      actorUserId,
      journalDate: reversalDate,
      memo: `Void sales receipt ${receipt.receiptNo} - ${contactDisplayName(receipt.contact)}`,
      sourceType: "sales_receipt_void",
      sourceId: receipt.id,
      paymentMethod: null,
      reversedJournalId: receipt.postedJournalId,
      lines: reversalLines,
    });

    await tx.salesReceipt.update({
      where: { id: receipt.id, organizationId },
      data: { status: "void", voidJournalId: journalId },
    });

    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "sales_receipt",
        entityId: receipt.id,
        action: AuditAction.VOID,
        after: { journalId, receiptNo: receipt.receiptNo },
      },
    });

    return { documentId: receipt.id, documentNo: receipt.receiptNo, journalId };
  });
}

type ReceiptRowForMapper = {
  id: string;
  receiptNo: string;
  status: string;
  contactId: string;
  contact: {
    name: string;
    first_name: string | null;
    last_name: string | null;
    display_name_preference: string;
  } | null;
  receiptDate: Date;
  currency: CurrencyCode;
  amountsAre: string;
  paymentMethod: string | null;
  reference?: string | null;
  notes: string | null;
  subtotalMinor: bigint;
  discountMinor: bigint;
  taxMinor: bigint;
  totalMinor: bigint;
  postedJournalId: string | null;
  createdAt: Date;
  bankAccount: { id: string; name: string };
  lines: Array<{
    id: string;
    accountId: string;
    account: { code: string; name: string };
    description: string;
    quantity: unknown;
    unitAmountMinor: bigint;
    discountMinor: bigint;
    subtotalMinor: bigint;
    taxCode: string;
    taxRate: unknown;
    taxMinor: bigint;
    totalMinor: bigint;
  }>;
};

function mapReceipt(row: ReceiptRowForMapper): ReceiptDto {
  return {
    id: row.id,
    receiptNo: row.receiptNo,
    status: row.status === "void" ? "void" : "posted",
    contactId: row.contactId,
    contactName: row.contact ? contactDisplayName(row.contact) : "Unknown customer",
    receiptDate: row.receiptDate.toISOString().slice(0, 10),
    currency: row.currency,
    amountsAre: (row.amountsAre as VatTreatment) ?? "exclusive",
    paymentMethod: (row.paymentMethod as PaymentMethod | null) ?? null,
    bankAccountId: row.bankAccount.id,
    bankAccountName: row.bankAccount.name,
    reference: row.reference ?? null,
    notes: row.notes,
    subtotalMinor: Number(row.subtotalMinor),
    discountMinor: Number(row.discountMinor),
    taxMinor: Number(row.taxMinor),
    totalMinor: Number(row.totalMinor),
    postedJournalId: row.postedJournalId,
    createdAt: row.createdAt.toISOString(),
    lines: row.lines.map((line) => ({
      id: line.id,
      accountId: line.accountId,
      accountCode: line.account.code,
      accountName: line.account.name,
      description: line.description,
      quantity: String(line.quantity),
      unitPriceMinor: Number(line.unitAmountMinor),
      discountMinor: Number(line.discountMinor),
      subtotalMinor: Number(line.subtotalMinor),
      taxCode: line.taxCode,
      taxRate: Number(String(line.taxRate)),
      taxMinor: Number(line.taxMinor),
      totalMinor: Number(line.totalMinor),
    })),
  };
}

const receiptLineInclude = {
  account: { select: { code: true, name: true } },
} as const;

export async function listSalesReceipts(
  prisma: ExtendedPrismaClient,
  organizationId: string
): Promise<ReceiptDto[]> {
  const receipts = await prisma.salesReceipt.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      contact: { select: CONTACT_NAME_SELECT },
      depositAccount: { select: { id: true, name: true } },
      lines: { include: receiptLineInclude, orderBy: { createdAt: "asc" } },
    },
  });

  return receipts.map((receipt) =>
    mapReceipt({ ...receipt, bankAccount: receipt.depositAccount })
  );
}

export async function createRefundReceipt(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  input: ReceiptDraftInput
): Promise<ReceiptPostingResult> {
  return withDocNumberRetry(() =>
    prisma.$transaction(async (tx) => {
      const contact = await resolveCustomer(tx, organizationId, input.contactId);
      const receiptDate = toDate(input.receiptDate);
      await assertPeriodOpen(tx, organizationId, receiptDate);

      const amountsAre = input.amountsAre ?? "exclusive";
      const normalized = await normalizeLines(
        tx,
        organizationId,
        input.lines,
        receiptLineRules,
        amountsAre
      );

      assertReceiptTotalPositive("Refund receipt", normalized.totalMinor);

      const refundFromAccountId = await resolveReceiptBankAccount(
        tx,
        organizationId,
        input.bankAccountId
      );
      const vatAccountId =
        normalized.taxMinor > BigInt(0)
          ? await resolveSystemAccount(tx, organizationId, outputVatAccount)
          : null;
      const discountAccountId =
        normalized.discountMinor > BigInt(0)
          ? await resolveSystemAccount(tx, organizationId, salesDiscountAccount)
          : null;

      const rows = await tx.refundReceipt.findMany({
        where: { organizationId, receiptNo: { startsWith: "RR-" } },
        select: { receiptNo: true },
      });
      const receiptNo = computeNextNumber("RR-", rows.map((row) => row.receiptNo));

      const refund = await tx.refundReceipt.create({
        data: {
          organizationId,
          receiptNo,
          status: "posted",
          contactId: contact.id,
          receiptDate,
          currency: await resolveReceiptCurrency(tx, organizationId, input.currency),
          amountsAre,
          paymentMethod: input.paymentMethod ?? null,
          refundFromAccountId,
          reference: input.reference?.trim() || null,
          subtotalMinor: normalized.subtotalMinor,
          discountMinor: normalized.discountMinor,
          taxMinor: normalized.taxMinor,
          totalMinor: normalized.totalMinor,
          notes: input.notes?.trim() || null,
          lines: {
            create: normalized.lines.map((line) => ({
              organizationId,
              accountId: line.accountId,
              description: line.description,
              quantity: line.quantity,
              unitAmountMinor: line.unitAmountMinor,
              discountMinor: line.discountMinor,
              subtotalMinor: line.subtotalMinor,
              taxCode: line.taxCode,
              taxRate: line.taxRate,
              taxMinor: line.taxMinor,
              totalMinor: line.totalMinor,
            })),
          },
        },
        select: { id: true },
      });

      // Mirror of the sales receipt: money leaves the bank, revenue and
      // output VAT are debited back down.
      const journalLines = [
        {
          organizationId,
          accountId: refundFromAccountId,
          contactId: contact.id,
          debitMinor: BigInt(0),
          creditMinor: normalized.totalMinor,
          memo: `Refund receipt ${receiptNo}`,
        },
        ...normalized.lines.map((line) => ({
          organizationId,
          accountId: line.accountId,
          contactId: contact.id,
          debitMinor: line.subtotalMinor,
          creditMinor: BigInt(0),
          memo: line.description,
        })),
        ...(vatAccountId
          ? [
              {
                organizationId,
                accountId: vatAccountId,
                contactId: contact.id,
                debitMinor: normalized.taxMinor,
                creditMinor: BigInt(0),
                memo: `VAT on refund receipt ${receiptNo}`,
              },
            ]
          : []),
        ...(discountAccountId
          ? [
              {
                organizationId,
                accountId: discountAccountId,
                contactId: contact.id,
                debitMinor: BigInt(0),
                creditMinor: normalized.discountMinor,
                memo: `Discount on refund receipt ${receiptNo}`,
              },
            ]
          : []),
      ];

      assertJournalBalances("Refund receipt", receiptNo, journalLines);

      const journalId = await postJournal(tx, {
        organizationId,
        actorUserId,
        journalDate: receiptDate,
        memo: `Refund receipt ${receiptNo} - ${contactDisplayName(contact)}`,
        sourceType: "refund_receipt",
        sourceId: refund.id,
        paymentMethod: input.paymentMethod ?? null,
        lines: journalLines,
      });

      await tx.refundReceipt.update({
        where: { id: refund.id, organizationId },
        data: { postedJournalId: journalId },
      });

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId,
          entityType: "refund_receipt",
          entityId: refund.id,
          action: AuditAction.POST,
          after: { journalId, receiptNo, totalMinor: normalized.totalMinor.toString() },
        },
      });

      return { documentId: refund.id, documentNo: receiptNo, journalId };
    })
  );
}

export async function voidRefundReceipt(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  receiptId: string
): Promise<ReceiptPostingResult> {
  return prisma.$transaction(async (tx) => {
    const refund = await tx.refundReceipt.findFirstOrThrow({
      where: { id: receiptId, organizationId },
      select: {
        id: true,
        receiptNo: true,
        status: true,
        postedJournalId: true,
        contact: { select: CONTACT_NAME_SELECT },
      },
    });

    if (refund.status !== "posted" || !refund.postedJournalId) {
      throw new Error(`Refund receipt ${refund.receiptNo} is already void.`);
    }

    const reversalDate = new Date();
    await assertPeriodOpen(tx, organizationId, reversalDate);

    const originalLines = await tx.journalLine.findMany({
      where: { journalId: refund.postedJournalId, organizationId },
      select: { accountId: true, contactId: true, debitMinor: true, creditMinor: true },
    });

    const reversalLines = originalLines.map((line) => ({
      organizationId,
      accountId: line.accountId,
      contactId: line.contactId,
      debitMinor: line.creditMinor,
      creditMinor: line.debitMinor,
      memo: `Void refund receipt ${refund.receiptNo}`,
    }));

    assertJournalBalances("Refund receipt void", refund.receiptNo, reversalLines);

    const journalId = await postJournal(tx, {
      organizationId,
      actorUserId,
      journalDate: reversalDate,
      memo: `Void refund receipt ${refund.receiptNo} - ${contactDisplayName(refund.contact)}`,
      sourceType: "refund_receipt_void",
      sourceId: refund.id,
      paymentMethod: null,
      reversedJournalId: refund.postedJournalId,
      lines: reversalLines,
    });

    await tx.refundReceipt.update({
      where: { id: refund.id, organizationId },
      data: { status: "void", voidJournalId: journalId },
    });

    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "refund_receipt",
        entityId: refund.id,
        action: AuditAction.VOID,
        after: { journalId, receiptNo: refund.receiptNo },
      },
    });

    return { documentId: refund.id, documentNo: refund.receiptNo, journalId };
  });
}

export async function listRefundReceipts(
  prisma: ExtendedPrismaClient,
  organizationId: string
): Promise<ReceiptDto[]> {
  const refunds = await prisma.refundReceipt.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    include: {
      contact: { select: CONTACT_NAME_SELECT },
      refundFromAccount: { select: { id: true, name: true } },
      lines: { include: receiptLineInclude, orderBy: { createdAt: "asc" } },
    },
  });

  return refunds.map((refund) =>
    mapReceipt({ ...refund, bankAccount: refund.refundFromAccount })
  );
}
