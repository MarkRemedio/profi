import "server-only";

import {
  AuditAction,
  BillStatus,
  ContactType,
  CurrencyCode,
  InvoiceStatus,
  JournalStatus,
  type AccountReportCategory,
  type AccountType,
  type Prisma,
} from "@prisma/client";

import { poundsToMinor } from "@/lib/accounting/money";
import { isBillingPeriodUnit } from "@/lib/accounting/billing-period";
import { ensureOtherChargesAccount, ensureShippingAccount } from "@/lib/accounting/chart-accounts";
import {
  convertJournalLines,
  convertMinor,
  fetchExchangeRate,
  computeFxSettlement,
  fxGainAccount,
  fxLossAccount,
} from "@/lib/accounting/exchange-rates";
import { assertPeriodOpen } from "@/lib/accounting/period-close";
import { validateTrackingAssignments } from "@/lib/accounting/tracking";
import type {
  TrackingAssignmentDto,
  TrackingAssignmentInput,
} from "@/lib/accounting/tracking-types";
import { getAmountPaidMap, getPaymentDetailsMap } from "@/lib/accounting/payments";
import {
  PURCHASE_SETTINGS_DEFAULTS,
  startingSequenceNumber,
} from "@/lib/accounting/purchase-defaults";
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
import type { ExtendedPrismaClient, TransactionClient } from "@/lib/prisma";
import {
  type InvoiceAttachmentInput,
  validateInvoiceAttachmentInput,
} from "@/lib/sales/invoice-attachments";
import {
  type BillAttachmentInput,
  validateBillAttachmentInput,
} from "@/lib/accounting/bill-attachments";
import {
  recalculatePurchaseOrderStatuses,
} from "@/lib/accounting/purchase-orders";
import type { InvoiceBatchCreateResult } from "@/lib/accounting/invoice-batch";

type Tx = TransactionClient;

type InvoiceForMapper = Prisma.InvoiceGetPayload<{
  include: typeof documentInclude;
}>;

type BillForMapper = Prisma.BillGetPayload<{
  include: typeof documentInclude;
}>;

export type DocumentLineInput = {
  id?: string;
  accountId: string;
  description: string;
  location?: string;
  amount?: string;
  quantity?: string;
  unitPrice?: string;
  discount?: string;
  taxCode: string;
  purchaseOrderLineId?: string | null;
  purchaseOrderNumber?: string | null;
  /**
   * Set only by withAdditionalChargeLines when the line was materialised from
   * a catalogue charge item, so an edited draft can lift it back into the
   * additional-charges control. Never trusted from the client on its own —
   * the account is always resolved from the charge item server-side.
   */
  chargeItemId?: string | null;
};

/**
 * One additional charge on an invoice. Either picked from the org's charge
 * catalogue (chargeItemId set — the account comes from the catalogue row) or
 * typed straight onto the form (no chargeItemId — posts to the shared Other
 * Charges income account, the same mechanism as shipping).
 */
export type AdditionalChargeInput = {
  chargeItemId?: string | null;
  /** Defaults to the catalogue item's name; required for a custom charge. */
  description?: string;
  /**
   * Custom charges only: the income account the user picked on the form.
   * Ignored for catalogue charges (their account always comes from the
   * catalogue row) and validated by normalizeLines exactly like any ordinary
   * line's account. Absent, the shared Other Charges account is used.
   */
  accountId?: string | null;
  /** Integer minor units, as edited on the form (prefilled from the default). */
  amountMinor: number;
  /** Defaults to the catalogue item's default tax code, else no_vat. */
  taxCode?: string;
};

/**
 * How entered line amounts relate to VAT:
 * - exclusive: amounts are net, VAT is added on top (historic behavior)
 * - inclusive: amounts are gross, VAT is backed out of them
 * - no_vat:    no VAT is calculated; lines are stored with the no_vat code
 */
export type VatTreatment = "exclusive" | "inclusive" | "no_vat";

/** How a payment journal was settled. Only set on payment journals. */
export type PaymentMethod = "cash" | "cheque" | "bank_transfer";

export type DocumentDraftInput = {
  id?: string;
  contactId?: string;
  contactName: string;
  documentNo: string;
  issueDate: string;
  dueDate: string;
  currency?: CurrencyCode;
  lines: DocumentLineInput[];
  // Optional shipping fee. Materialised server-side as an ordinary document
  // line (against the shipping income/expense account) so it flows into
  // subtotal/tax/total, AR/AP, VAT, and reports with no special cases.
  shippingAmount?: string;
  shippingTaxCode?: string;
  // Optional additional charges chosen from the org's charge catalogue.
  // Materialised server-side as ordinary document lines posted to each
  // charge item's own account — the same mechanism as shipping.
  additionalCharges?: AdditionalChargeInput[];
  /**
   * Marks this bill as an employee expense claim. Claims are ordinary bills —
   * debit the expense, credit accounts payable to the claimant — so they use
   * this same path rather than a parallel one.
   */
  isExpenseClaim?: boolean;
  /**
   * Units of the workspace currency per 1 unit of this document's currency.
   * Supplied by the client from what the user saw and accepted, so an old
   * document keeps the rate it was raised at even after rates move.
   */
  exchangeRate?: number;
  // NEW: Cash sale flags
  isCashSale?: boolean;
  depositAccountId?: string | null;
  // Per-document address snapshot (prefilled from the contact, edited per document).
  billingAddress?: string;
  /** Expense-claim metadata stored on bills. */
  paymentMethod?: string;
  /** Expense-claim metadata stored on bills. */
  location?: string;
  /** Expense-claim metadata stored on bills. */
  notes?: string;
  amountsAre?: VatTreatment;
  paymentTermsDays?: number | null;
  // Optional purchase-order number and free-text reference. Metadata only —
  // they never affect totals or posting, and are shown on the customer statement.
  poNumber?: string;
  reference?: string;
  /** Private supporting files that are included when the invoice is emailed. */
  attachments?: InvoiceAttachmentInput[];
  /** Private receipt attachment used by expense claims. */
  receiptAttachment?: BillAttachmentInput | null;
  /**
   * Optional service/billing period this invoice covers (invoices only).
   * The rule (unit + count, e.g. 4 weeks) is stored with the explicit dates
   * so the next invoice in the sequence can be derived deterministically.
   * Dates are ISO yyyy-mm-dd. Metadata only — never affects totals or posting.
   */
  servicePeriodUnit?: "week" | "month" | "day" | null;
  servicePeriodCount?: number | null;
  servicePeriodStart?: string | null;
  servicePeriodEnd?: string | null;
  /**
   * Invoice-owned reporting dimensions. Undefined preserves existing values
   * when an older editor saves a draft; an explicit empty array clears them.
   */
  trackingAssignments?: TrackingAssignmentInput[];
};

export type ContactSummary = {
  id: string;
  name: string;
  email: string | null;
  contactType: string;
  paymentTermsDays: number;
  paymentScheduleType: "day_of_month" | "end_of_month" | null;
  paymentScheduleDay: number | null;
  billingAddress: string | null;
  /** Saved legal registration number, used by invoice previews when enabled. */
  registrationNumber?: string | null;
  /**
   * The currency this contact is normally billed in. Drives the default
   * currency on a new invoice or bill, the same way paymentTermsDays drives
   * the due date.
   */
  defaultCurrency: string;
};

export type ChartAccountOption = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  reportCategory: string;
  taxCode: string;
};

export type TaxRateOption = {
  code: string;
  name: string;
  rate: number;
};

export type DocumentLineDto = {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountReportCategory: string;
  description: string;
  location: string | null;
  amountMinor: number;
  quantity: string;
  unitPriceMinor: number;
  discountMinor: number;
  subtotalMinor: number;
  taxCode: string;
  taxRate: number;
  taxMinor: number;
  totalMinor: number;
  purchaseOrderLineId: string | null;
  purchaseOrderNumber: string | null;
  /** Set when this line was materialised from a catalogue charge item. */
  chargeItemId: string | null;
};

export type InvoicePaymentSummary = {
  accountCode: string;
  accountName: string;
  amountMinor: number;
  paidAt: string;
};

export type InvoiceWithLines = {
  amountPaidMinor: number;
  payments: InvoicePaymentSummary[];
  amountsAre: VatTreatment;
  id: string;
  contactId: string;
  contactName: string;
  contactRegistrationNumber: string | null;
  paymentTermsDays: number;
  invoiceNo: string;
  issueDate: string;
  dueDate: string | null;
  status: "draft" | "approved" | "sent" | "void";
  currency: CurrencyCode;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  /** Units of the base currency per 1 unit of this document's currency. */
  exchangeRate: number;
  /**
   * The document total in the workspace's own currency, fixed at the rate on
   * the day it was raised. Reports that add several documents together must use
   * this: totalling `totalMinor` across currencies adds shillings to pounds.
   */
  baseTotalMinor: number;
  /** Settled so far, in the workspace's currency. Comparable across documents. */
  baseAmountPaidMinor: number;
  billingAddress: string | null;
  poNumber: string | null;
  reference: string | null;
  postedJournalId: string | null;
  createdAt: string;
  attachments: Array<InvoiceAttachmentInput & { id: string }>;
  /** Optional service/billing period (null on invoices without one). */
  servicePeriodUnit: "week" | "month" | "day" | null;
  servicePeriodCount: number | null;
  servicePeriodStart: string | null;
  servicePeriodEnd: string | null;
  trackingAssignments: TrackingAssignmentDto[];
  lines: DocumentLineDto[];
};

export type BillWithLines = {
  id: string;
  contactId: string;
  contactName: string;
  invoiceNo: string;
  issueDate: string;
  dueDate: string | null;
  status: "draft" | "approved" | "paid" | "void";
  currency: CurrencyCode;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  /** Units of the base currency per 1 unit of this bill's currency. */
  exchangeRate: number;
  /**
   * The bill total in the workspace's own currency, fixed at the rate on the
   * day it was raised. Reports that add several bills together must use this.
   */
  baseTotalMinor: number;
  /**
   * Settled so far against this bill, in the bill's own currency.
   *
   * Bills can only be paid in full today, so this is either zero or the whole
   * total. It is carried anyway because aged payables has to subtract it: the
   * moment a part-payment becomes possible, a report that reads the bill total
   * alone overstates what is owed, and that is not a failure anyone would
   * notice from the screen.
   */
  amountPaidMinor: number;
  /** Settled so far, in the workspace's currency. Comparable across bills. */
  baseAmountPaidMinor: number;
  billingAddress: string | null;
  location: string | null;
  department: string | null;
  amountsAre: VatTreatment;
  paymentTermsDays: number | null;
  postedJournalId: string | null;
  paidJournalId: string | null;
  paidAt: string | null;
  createdAt: string;
  purchaseOrderNumbers: string[];
  lines: DocumentLineDto[];
};

export type PostingResult = {
  documentId: string;
  journalId: string | null;
};

const receivableAccount = {
  code: "1100",
  accountType: "ASSET" as AccountType,
};

const payableAccount = {
  code: "2000",
  accountType: "LIABILITY" as AccountType,
};

export const bankAccount = {
  code: "1000",
  accountType: "ASSET" as AccountType,
};

// Input VAT (recoverable from HMRC) — debited when bills carry VAT.
const inputVatAccount = {
  code: "1200",
  accountType: "ASSET" as AccountType,
};

// Output VAT (owed to HMRC) — credited when invoices carry VAT.
export const outputVatAccount = {
  code: "2100",
  accountType: "LIABILITY" as AccountType,
};

export const salesDiscountAccount = {
  code: "4100",
  accountType: "REVENUE" as AccountType,
};

const purchaseDiscountAccount = {
  code: "5100",
  accountType: "EXPENSE" as AccountType,
};

function toDate(value: string) {
  if (!value) return new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`);
  return new Date(`${value}T00:00:00.000Z`);
}

function optionalDate(value: string) {
  return value ? toDate(value) : null;
}

function isoDate(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? null;
}

function enumToLower<T extends string>(value: T) {
  return value.toLowerCase() as Lowercase<T>;
}

function decimalToNumber(value: Prisma.Decimal | number | string) {
  return Number(value.toString());
}

function taxBasisPoints(rate: Prisma.Decimal | number | string) {
  return Math.round(Number(rate.toString()) * 100);
}

function calculateTax(subtotalMinor: bigint, rate: Prisma.Decimal | number | string) {
  // Round half-up. Plain BigInt division truncates toward zero, which always
  // rounds VAT DOWN (e.g. 9999p * 2000bps / 10000 = 1999 instead of 2000).
  // Adding half the divisor (5000n = 10000n / 2) before dividing rounds to the
  // nearest minor unit. Inputs are non-negative, so half-up is correct here.
  return (subtotalMinor * BigInt(taxBasisPoints(rate)) + BigInt(5_000)) / BigInt(10_000);
}

// Backs the VAT portion out of a gross amount: gross * bps / (10000 + bps),
// rounded half-up. The net becomes gross - tax, so net + tax always equals the
// entered gross exactly and journals stay balanced.
function extractInclusiveTax(grossMinor: bigint, rate: Prisma.Decimal | number | string) {
  const basisPoints = BigInt(taxBasisPoints(rate));
  if (basisPoints <= BigInt(0)) return BigInt(0);
  const divisor = BigInt(10_000) + basisPoints;
  return (grossMinor * basisPoints + divisor / BigInt(2)) / divisor;
}

function quantityToHundredths(value: string) {
  const normalized = value.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error("Enter a positive quantity with up to 2 decimal places.");
  }

  const [whole, fractional = ""] = normalized.split(".");
  const quantity = BigInt(whole) * BigInt(100) + BigInt(fractional.padEnd(2, "0"));
  if (quantity <= BigInt(0)) {
    throw new Error("Line quantities must be positive.");
  }

  return quantity;
}

function formatQuantity(quantityHundredths: bigint) {
  const whole = quantityHundredths / BigInt(100);
  const fractional = quantityHundredths % BigInt(100);
  return `${whole}.${fractional.toString().padStart(2, "0")}`;
}

function calculateLineSubtotal(unitAmountMinor: bigint, quantityHundredths: bigint) {
  return (unitAmountMinor * quantityHundredths + BigInt(50)) / BigInt(100);
}


/**
 * Resolve the rate a document is stored at.
 *
 * A document in the workspace's own currency is always 1 — never looked up, so
 * the common case costs nothing. Otherwise the client's rate is trusted when it
 * is sane, because the user saw and accepted it; only when absent is the
 * published rate fetched.
 */
async function resolveDocumentRate(
  tx: { organization: { findUnique: (args: any) => Promise<{ baseCurrency: string } | null> } },
  organizationId: string,
  documentCurrency: string,
  issueDate: Date,
  supplied?: number
): Promise<number> {
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrency: true },
  });
  const base = org?.baseCurrency ?? "GBP"; // currency:allow last-resort default
  if (documentCurrency === base) return 1;

  if (typeof supplied === "number" && Number.isFinite(supplied) && supplied > 0) {
    return supplied;
  }

  const looked = await fetchExchangeRate(documentCurrency, base, issueDate);
  if (!looked) {
    throw new Error(
      `No exchange rate available for ${documentCurrency} to ${base} on ` +
        `${issueDate.toISOString().slice(0, 10)}. Enter one manually.`
    );
  }
  return looked.rate;
}

/**
 * Fall back to the workspace's own currency rather than GBP.
 *
 * Every document created without an explicit currency used to be stamped GBP,
 * so a workspace keeping its books in another currency produced invoices and
 * bills that disagreed with the rest of its ledger — and, because the customer
 * statement drops documents whose currency does not match, those documents were
 * then silently excluded from statements.
 */
async function normalizeCurrency(
  tx: {
    organization: {
      findUnique: (args: any) => Promise<{ baseCurrency: string; multicurrencyEnabled: boolean } | null>;
    };
  },
  organizationId: string,
  currency?: CurrencyCode,
  /** The currency this document is already stored with, when editing. */
  existingCurrency?: CurrencyCode | null
) {
  const org = await tx.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrency: true, multicurrencyEnabled: true },
  });
  const base = org?.baseCurrency;
  const fallback = base && base in CurrencyCode ? (base as CurrencyCode) : CurrencyCode.GBP;

  // A document that has posted keeps the currency it was raised in, always:
  // its journals are already in the ledger at that rate, so re-stamping it
  // would misstate them by the exchange rate. Callers pass existingCurrency
  // only for non-draft documents — a draft has posted nothing, so correcting a
  // currency picked in error is both safe and expected.
  if (existingCurrency) return existingCurrency;

  // Choosing a foreign currency for a new document requires the workspace to
  // have multicurrency switched on.
  if (!org?.multicurrencyEnabled) return fallback;

  return currency ?? fallback;
}

function assertNonEmpty(value: string, message: string) {
  if (!value.trim()) throw new Error(message);
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

function assertPostableDocument(
  documentType: "invoice" | "bill",
  documentNo: string,
  totalMinor: bigint,
  lines: Array<{ description: string; subtotalMinor: bigint }>
) {
  if (totalMinor <= BigInt(0)) {
    throw new Error(
      `${documentType === "invoice" ? "Invoice" : "Bill"} ${documentNo} has a zero total. Edit the draft and add a positive line amount before approving.`
    );
  }

  if (lines.length === 0) {
    throw new Error(
      `${documentType === "invoice" ? "Invoice" : "Bill"} ${documentNo} has no lines. Edit the draft and add at least one line before approving.`
    );
  }

  const invalidLine = lines.find((line) => line.subtotalMinor <= BigInt(0));
  if (invalidLine) {
    throw new Error(
      `${documentType === "invoice" ? "Invoice" : "Bill"} ${documentNo} has an invalid line amount${
        invalidLine.description ? ` for "${invalidLine.description}"` : ""
      }. Edit the draft and save a positive amount before approving.`
    );
  }
}

/** True if the error is a unique-constraint violation (Prisma P2002, raw PG 23505,
 *  or a P2010 raw-query failure wrapping a unique violation). */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; message?: string; meta?: { code?: string } };
  const topCode = e?.code ?? "";
  const metaCode = e?.meta?.code ?? "";
  if (topCode === "P2002" || topCode === "23505") return true;
  if (metaCode === "P2002" || metaCode === "23505") return true;
  const msg = String(e?.message ?? "");
  return /23505|duplicate key value|unique constraint/i.test(msg);
}

/** Retry `fn` when it fails with a unique-violation (e.g. a raced document number),
 *  up to `retries` attempts. Each attempt re-runs the whole transaction, so the
 *  number generator re-reads and mints a fresh value. */
export async function withDocNumberRetry<T>(fn: () => Promise<T>, retries = 5): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

/**
 * Given a set of existing document numbers, find the true numeric maximum of
 * those matching `${prefix}<digits>` and return the next padded number.
 *
 * We must NOT rely on lexicographic ordering (orderBy invoiceNo desc): "INV-9999"
 * sorts ABOVE "INV-10000" as a string, so a DESC string sort breaks and collides
 * once the sequence passes 9999. Instead we parse the trailing integer of every
 * matching row and take the real max. Padding is to a minimum width of 4 but is
 * not fixed-width: numbers above 9999 simply grow (INV-10000), which keeps the
 * sequence strictly increasing and unique.
 *
 * NOTE on concurrency: this read-then-increment is not race-free. Two concurrent
 * approvals could both read the same max and mint the same number. The schema has
 * a unique constraint on [organizationId, invoiceNo], so a duplicate fails at
 * commit rather than corrupting data; saveInvoiceDraft and saveBillDraft retry
 * automatically on unique-violation via withDocNumberRetry, so collisions are
 * resolved without surfacing an error to the caller.
 */
/**
 * The highest number already used under a prefix, or 0 if none.
 *
 * Split out of computeNextNumber so a caller with its own idea of where the
 * sequence should resume — a configured "next number", say — can compare
 * against what actually exists rather than blindly overwriting it.
 */
export function highestSequenceNumber(prefix: string, existing: string[]): number {
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  let max = 0;
  for (const value of existing) {
    const match = value.match(pattern);
    if (match) {
      const n = parseInt(match[1], 10);
      if (Number.isFinite(n) && n > max && n < 100000) max = n;
    }
  }
  return max;
}

export function computeNextNumber(prefix: string, existing: string[]): string {
  const next = highestSequenceNumber(prefix, existing) + 1;
  return `${prefix}${next}`;
}

/**
 * Safety net: verify a set of about-to-be-posted journal lines balances
 * (sum of debits == sum of credits) and is non-zero, mirroring the manual
 * journal path in app/accounting/journals/actions.ts. The document approval
 * paths build lines from header totals (AR/AP, VAT, gross revenue/expense, and
 * a separate contra-discount line); this assertion guards against any drift
 * between the stored header totals and the line amounts before we post.
 *
 * NOTE: this does NOT change the gross-vs-net discount classification — that
 * remains a deferred accounting-policy decision. The discount is still recorded
 * via a separate contra line, which balances arithmetically today; this check
 * simply fails loudly if that arithmetic ever stops holding.
 */
export function assertJournalBalances(
  label: string,
  ref: string,
  lines: Array<{ debitMinor: bigint; creditMinor: bigint }>
) {
  const debitTotal = lines.reduce((sum, line) => sum + line.debitMinor, BigInt(0));
  const creditTotal = lines.reduce((sum, line) => sum + line.creditMinor, BigInt(0));

  if (debitTotal !== creditTotal) {
    throw new Error(
      `${label} ${ref} journal is unbalanced: debits (${debitTotal}) do not equal credits (${creditTotal}).`
    );
  }

  if (debitTotal === BigInt(0)) {
    throw new Error(
      `${label} ${ref} journal has zero total and cannot be posted.`
    );
  }
}

/**
 * Generate the next sequential invoice number for an organization.
 * Looks for the pattern INV-NNNN and increments numerically. Falls back to
 * INV-0001 if no matching invoices exist.
 */
async function nextInvoiceNumber(tx: Tx, organizationId: string): Promise<string> {
  const rows = await tx.invoice.findMany({
    where: { organizationId, invoiceNo: { startsWith: "INV-" } },
    select: { invoiceNo: true },
  });

  return computeNextNumber("INV-", rows.map((row) => row.invoiceNo));
}

/**
 * Generate the next sequential bill number for an organization.
 * Looks for the pattern BILL-NNNN and increments numerically. Falls back to
 * BILL-0001 if no matching bills exist.
 */
/**
 * The next document number for a purchase document.
 *
 * Two things this used to get wrong. The prefix was the literal "BILL-", so the
 * workspace's configured Supplier Bill Prefix was ignored entirely — it only
 * looked right because the default happens to be "BILL-". And expense claims
 * share the bill table, so a claim was numbered from the bill sequence and
 * showed up as "BILL-1" on the Expense Claims page while the setting beside it
 * said "EXP-".
 *
 * The kind chooses the *prefix*, but the highest existing number is read across
 * everything already using that prefix, claim or not. Filtering the scan by
 * kind as well would hide the legacy claims that were numbered BILL-1 and
 * BILL-3 from the bill sequence, and since bills have no unique constraint on
 * (org_id, invoice_no), the next bill would silently reissue BILL-3.
 *
 * @param isExpenseClaim  claims use the claim prefix
 */
export async function nextBillNumber(
  tx: Tx,
  organizationId: string,
  isExpenseClaim = false
): Promise<string> {
  // findFirst, not findUnique: PurchaseSettings is org-scoped and the tenancy
  // extension refuses unique-only lookups it cannot inject organizationId into.
  const settings = await tx.purchaseSettings.findFirst({
    where: { organizationId },
    select: { billPrefix: true, claimPrefix: true, nextBillNumber: true, nextClaimNumber: true },
  });

  // Falls back to the same defaults the settings page displays. A workspace
  // that has never saved its purchase settings has no row here, and the page
  // shows its own defaults regardless — so without this, the number assigned
  // disagreed with the sequence number shown on screen.
  const prefix = isExpenseClaim
    ? settings?.claimPrefix || PURCHASE_SETTINGS_DEFAULTS.claimPrefix
    : settings?.billPrefix || PURCHASE_SETTINGS_DEFAULTS.billPrefix;

  const rows = await tx.bill.findMany({
    where: { organizationId, invoiceNo: { startsWith: prefix } },
    select: { invoiceNo: true },
  });

  /*
   * The field is called "Next Bill Sequence No.", so it takes effect from the
   * next document rather than only on an empty series.
   *
   * It is a starting point, not a ceiling. An earlier attempt clamped it to
   * `max(highest + 1, configured)` on the theory that a lower value would
   * re-use a live number — but that is not what "lower" means. A workspace
   * sitting on EXP-5001 and EXP-5002 has every number below 5001 free, and
   * somebody migrating from another system where they had reached 1000 needs
   * exactly that. Clamping ignored their setting for no benefit.
   *
   * So: begin at the configured number and walk up to the first one not
   * already issued. That honours the setting whenever it can, and skips rather
   * than duplicates when it cannot — which matters, since bills carry no
   * unique constraint on (org_id, invoice_no) to catch a repeat.
   */
  const numbers = rows.map((row) => row.invoiceNo);
  const used = new Set<number>();
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  for (const value of numbers) {
    const match = value.match(pattern);
    if (match) used.add(parseInt(match[1], 10));
  }

  const configured = startingSequenceNumber(
    isExpenseClaim
      ? settings?.nextClaimNumber ?? PURCHASE_SETTINGS_DEFAULTS.nextClaimNumber
      : settings?.nextBillNumber ?? PURCHASE_SETTINGS_DEFAULTS.nextBillNumber
  );

  let candidate = configured ?? highestSequenceNumber(prefix, numbers) + 1;
  // Bounded by the 100000 ceiling the number parser already applies, so this
  // cannot run away even on a workspace with a very full series.
  while (used.has(candidate) && candidate < 100000) candidate += 1;

  return `${prefix}${candidate}`;
}

async function getTaxRate(tx: Tx, organizationId: string, code: string) {
  // Org-specific custom rate wins; otherwise fall back to the system rate.
  const taxRate =
    (await tx.taxRate.findFirst({
      where: { code, organizationId },
      select: { rate: true },
    })) ??
    (await tx.taxRate.findFirst({
      where: { code, organizationId: null },
      select: { rate: true },
    }));

  return taxRate?.rate ?? 0;
}

export async function resolveSystemAccount(
  tx: Tx,
  organizationId: string,
  target: { code: string; accountType: AccountType }
) {
  const account = await tx.chartAccount.findFirst({
    where: {
      organizationId,
      isActive: true,
      code: target.code,
      accountType: target.accountType,
    },
    select: { id: true },
  });

  if (!account) {
    throw new Error(
      `Required system account ${target.code} (${target.accountType}) is missing from the chart of accounts for this organization.`
    );
  }

  return account.id;
}

// Validates a caller-supplied deposit account id. Client-side account lists
// can't be trusted, so the account must be an active BANK-category account
// belonging to this organization. Filtering on report category (not a code
// deny-list) keeps control accounts (AR, VAT) and non-liquid assets (stock,
// fixed assets) out even if the chart of accounts grows.
export async function resolveDepositAccount(
  tx: Tx,
  organizationId: string,
  accountId: string
) {
  const account = await tx.chartAccount.findFirst({
    where: {
      id: accountId,
      organizationId,
      isActive: true,
      accountType: bankAccount.accountType,
      reportCategory: "BANK" as AccountReportCategory,
    },
    select: { id: true },
  });

  if (!account) {
    throw new Error(
      "Selected deposit account is not a valid bank account for this organization."
    );
  }

  return account.id;
}

export async function resolveOrCreateSystemAccount(
  tx: Tx,
  organizationId: string,
  target: { code: string; name: string; accountType: AccountType; reportCategory: AccountReportCategory }
) {
  const existing = await tx.chartAccount.findFirst({
    where: { organizationId, isActive: true, code: target.code, accountType: target.accountType },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await tx.chartAccount.create({
    data: {
      organizationId,
      code: target.code,
      name: target.name,
      accountType: target.accountType,
      reportCategory: target.reportCategory,
      taxCode: "no_vat",
      taxRate: "0",
      isSystem: true,
      isActive: true,
    },
    select: { id: true },
  });
  return created.id;
}

async function resolveContact(
  tx: Tx,
  organizationId: string,
  input: { contactId?: string; contactName: string; contactType: ContactType }
) {
  if (input.contactId) {
    const contact = await tx.contact.findFirstOrThrow({
      where: { id: input.contactId, organizationId },
      select: { id: true, contactType: true },
    });

    if (contact.contactType !== input.contactType && contact.contactType !== ContactType.BOTH) {
      await tx.contact.update({
        where: { id: contact.id },
        data: { contactType: ContactType.BOTH },
      });
    }

    return contact.id;
  }

  assertNonEmpty(input.contactName, "Contact name is required.");

  const existing = await tx.contact.findFirst({
    where: {
      organizationId,
      name: { equals: input.contactName.trim(), mode: "insensitive" },
    },
    select: { id: true, contactType: true },
  });

  if (existing) {
    if (existing.contactType !== input.contactType && existing.contactType !== ContactType.BOTH) {
      await tx.contact.update({
        where: { id: existing.id },
        data: { contactType: ContactType.BOTH },
      });
    }

    return existing.id;
  }

  const contact = await tx.contact.create({
    data: {
      organizationId,
      contactType: input.contactType,
      name: input.contactName.trim(),
      paymentTermsDays: 30,
      defaultCurrency: CurrencyCode.GBP,
      isActive: true,
    },
    select: { id: true },
  });

  return contact.id;
}

/**
 * Materialise the optional shipping fee as an ordinary trailing document line
 * (against the shipping income/expense account) so VAT, posting, and reports
 * need no special cases. Returns `input.lines` unchanged when no positive
 * shipping amount was entered. The line inherits the document's VAT treatment
 * via normalizeLines, exactly like any other line.
 */
async function withShippingLine(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  input: DocumentDraftInput,
  kind: "income" | "expense"
): Promise<DocumentLineInput[]> {
  const raw = input.shippingAmount?.trim();
  if (!raw || poundsToMinor(raw) <= BigInt(0)) return input.lines;

  const account = await ensureShippingAccount(prisma, organizationId, kind);
  return [
    ...input.lines,
    {
      accountId: account.id,
      description: "Shipping",
      quantity: "1",
      unitPrice: raw,
      taxCode: input.shippingTaxCode?.trim() || "no_vat",
    },
  ];
}

/**
 * Sanitise the optional service-period fields on an invoice draft.
 *
 * The period is its dates: without a complete start/end range nothing is
 * stored, including the rule. The rule (unit + count) is kept only when it is
 * one of the supported shapes, so a malformed client payload degrades to
 * "dates without a rule" rather than junk the next-invoice flow trips over.
 * End before start is rejected outright — that is not a style of period the
 * warnings can explain, it is a range that does not exist.
 */
function normalizeServicePeriod(input: DocumentDraftInput): {
  unit: "week" | "month" | "day" | null;
  count: number | null;
  start: Date | null;
  end: Date | null;
} {
  const start = input.servicePeriodStart ? toDate(input.servicePeriodStart) : null;
  const end = input.servicePeriodEnd ? toDate(input.servicePeriodEnd) : null;
  if (!start || !end) return { unit: null, count: null, start: null, end: null };
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error("Service period dates must be valid dates.");
  }
  if (end.getTime() < start.getTime()) {
    throw new Error("Service period end cannot be before its start.");
  }
  const unit = isBillingPeriodUnit(input.servicePeriodUnit)
    ? input.servicePeriodUnit
    : null;
  const count =
    unit &&
    typeof input.servicePeriodCount === "number" &&
    Number.isInteger(input.servicePeriodCount) &&
    input.servicePeriodCount > 0
      ? input.servicePeriodCount
      : null;
  return { unit: count ? unit : null, count, start, end };
}

/** Integer minor units → the pounds string normalizeLines parses. Integer math, no floats. */
function minorToPounds(minor: number): string {
  return `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;
}

/**
 * Materialise catalogue charges as ordinary trailing document lines, the same
 * way withShippingLine does — so VAT, posting, and reports need no special
 * cases. Each charge item must belong to this organisation and be active, and
 * its account is resolved here from the catalogue row — a client-sent account
 * is never trusted. The stored line carries chargeItemId so an edited draft
 * lifts it back into the additional-charges control instead of showing it as
 * an ordinary line.
 */
async function withAdditionalChargeLines(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  input: DocumentDraftInput,
  lines: DocumentLineInput[]
): Promise<DocumentLineInput[]> {
  const charges = input.additionalCharges ?? [];
  if (charges.length === 0) return lines;

  const catalogueIds = charges.flatMap((charge) => (charge.chargeItemId ? [charge.chargeItemId] : []));
  const items = catalogueIds.length
    ? await prisma.chargeItem.findMany({
        where: { id: { in: catalogueIds }, organizationId },
        select: { id: true, name: true, accountId: true, defaultTaxCode: true, isActive: true },
      })
    : [];
  const itemsById = new Map(items.map((item) => [item.id, item]));

  // Custom charges without a chosen account post to the shared Other Charges
  // income account, ensured exactly the way shipping's is. A chosen account
  // passes through normalizeLines' validation like any ordinary line.
  const customAccount = charges.some((charge) => !charge.chargeItemId && !charge.accountId?.trim())
    ? await ensureOtherChargesAccount(prisma, organizationId)
    : null;

  const chargeLines: DocumentLineInput[] = charges.map((charge) => {
    const amountMinor = Math.round(Number(charge.amountMinor));

    if (!charge.chargeItemId) {
      const description = charge.description?.trim();
      if (!description) {
        throw new Error("Give each custom charge a name so the invoice line says what it is.");
      }
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        throw new Error(`Enter a positive amount for the "${description}" charge.`);
      }
      return {
        accountId: charge.accountId?.trim() || customAccount!.id,
        description,
        quantity: "1",
        unitPrice: minorToPounds(amountMinor),
        taxCode: charge.taxCode?.trim() || "no_vat",
      };
    }

    const item = itemsById.get(charge.chargeItemId);
    if (!item) throw new Error("Selected additional charge is not available.");
    if (!item.isActive) {
      throw new Error(`Additional charge "${item.name}" has been archived. Remove it, or restore it via "Manage saved charges" on the invoice form.`);
    }

    if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
      throw new Error(`Enter a positive amount for the "${item.name}" charge.`);
    }

    return {
      accountId: item.accountId,
      description: charge.description?.trim() || item.name,
      quantity: "1",
      unitPrice: minorToPounds(amountMinor),
      taxCode: charge.taxCode?.trim() || item.defaultTaxCode || "no_vat",
      chargeItemId: item.id,
    };
  });

  return [...lines, ...chargeLines];
}

export async function normalizeLines(
  tx: Tx,
  organizationId: string,
  lines: DocumentLineInput[],
  allowed: {
    accountTypes: AccountType[];
    reportCategories: AccountReportCategory[];
  },
  amountsAre: VatTreatment = "exclusive"
) {
  if (lines.length === 0) throw new Error("At least one line is required.");

  const normalized = [];

  for (const line of lines) {
    assertNonEmpty(line.accountId, "Each line needs an account.");
    assertNonEmpty(line.description, "Each line needs a description.");

    const account = await tx.chartAccount.findFirst({
      where: {
        id: line.accountId,
        organizationId,
        isActive: true,
      },
      select: {
        id: true,
        accountType: true,
        reportCategory: true,
      },
    });

    if (!account) throw new Error("Selected account is not available.");
    if (!allowed.accountTypes.includes(account.accountType)) {
      throw new Error("Selected account type is not valid for this document.");
    }
    if (!allowed.reportCategories.includes(account.reportCategory)) {
      throw new Error("Selected report category is not valid for this document.");
    }

    const quantityHundredths = quantityToHundredths(line.quantity ?? "1");
    const unitAmountMinor = poundsToMinor(line.unitPrice ?? line.amount ?? "");
    if (unitAmountMinor <= BigInt(0)) throw new Error("Line unit prices must be positive.");

    const subtotalMinor = calculateLineSubtotal(unitAmountMinor, quantityHundredths);
    if (subtotalMinor <= BigInt(0)) throw new Error("Line amounts must be positive.");

    const discountMinor = line.discount ? poundsToMinor(line.discount) : BigInt(0);
    if (discountMinor < BigInt(0)) throw new Error("Line discounts cannot be negative.");
    if (discountMinor > subtotalMinor) throw new Error("Line discount cannot exceed the line amount.");

    const netMinor = subtotalMinor - discountMinor;

    // VAT per the document's treatment. Every mode preserves the stored
    // invariant total = subtotal - discount + tax, which posting relies on
    // to balance the journal (revenue = subtotal, VAT = tax, AR = total).
    let storedSubtotalMinor = subtotalMinor;
    let taxCode = line.taxCode;
    let taxRate = await getTaxRate(tx, organizationId, line.taxCode);
    let taxMinor: bigint;
    let totalMinor: bigint;

    if (amountsAre === "no_vat") {
      taxCode = "no_vat";
      taxRate = 0;
      taxMinor = BigInt(0);
      totalMinor = netMinor;
    } else if (amountsAre === "inclusive") {
      // Entered amounts are gross: back VAT out of the discounted gross, so
      // the document total equals exactly what the user typed.
      taxMinor = extractInclusiveTax(netMinor, taxRate);
      totalMinor = netMinor;
      storedSubtotalMinor = subtotalMinor - taxMinor;
    } else {
      taxMinor = calculateTax(netMinor, taxRate);
      totalMinor = netMinor + taxMinor;
    }

    normalized.push({
      accountId: account.id,
      description: line.description.trim(),
      location: line.location?.trim() || null,
      quantity: formatQuantity(quantityHundredths),
      unitAmountMinor,
      discountMinor,
      subtotalMinor: storedSubtotalMinor,
      taxCode,
      taxRate,
      taxMinor,
      totalMinor,
      purchaseOrderLineId: line.purchaseOrderLineId ?? null,
      purchaseOrderNumber: line.purchaseOrderNumber ?? null,
      chargeItemId: line.chargeItemId ?? null,
    });
  }

  return {
    lines: normalized,
    subtotalMinor: normalized.reduce((total, line) => total + line.subtotalMinor, BigInt(0)),
    discountMinor: normalized.reduce((total, line) => total + line.discountMinor, BigInt(0)),
    taxMinor: normalized.reduce((total, line) => total + line.taxMinor, BigInt(0)),
    totalMinor: normalized.reduce((total, line) => total + line.totalMinor, BigInt(0)),
  };
}
function mapInvoice(invoice: InvoiceForMapper): InvoiceWithLines {
  return {
    id: invoice.id,
    contactId: invoice.contactId,
    contactName: invoice.contact ? contactDisplayName(invoice.contact) : "Unknown customer",
    contactRegistrationNumber: invoice.contact?.registration_number ?? null,
    paymentTermsDays: invoice.paymentTermsDays ?? invoice.contact?.paymentTermsDays ?? 30,
    invoiceNo: invoice.invoiceNo,
    issueDate: invoice.issueDate.toISOString().slice(0, 10),
    dueDate: isoDate(invoice.dueDate),
    // 🚀 FIXED: Explicitly cast the lowercase string to the strict union literal type
    status: (invoice.status ? enumToLower(invoice.status) : "draft") as "draft" | "approved" | "sent" | "void", 
    currency: invoice.currency,
    subtotalMinor: Number(invoice.subtotalMinor),
    discountMinor: Number(invoice.discountMinor),
    taxMinor: Number(invoice.taxMinor),
    totalMinor: Number(invoice.totalMinor),
    // The rate this document was raised at, so any list showing several
    // invoices can total them in one currency instead of adding pesos to pence.
    exchangeRate: Number((invoice as any).exchangeRate ?? 1),
    // Falls back to the face value for rows raised before the base columns
    // existed, which were single-currency and so identical either way.
    baseTotalMinor: Number((invoice as any).baseTotalMinor ?? invoice.totalMinor ?? 0),
    baseAmountPaidMinor: Number((invoice as any).baseAmountPaidMinor ?? 0),
    amountPaidMinor: (invoice as any).amountPaidMinor ?? 0,
    payments: (invoice as any).payments ?? [],
    amountsAre: ((invoice as any).amountsAre ?? "exclusive") as VatTreatment,
    billingAddress: invoice.billingAddress ?? null,
    poNumber: (invoice as any).poNumber ?? null,
    reference: (invoice as any).reference ?? null,
    postedJournalId: invoice.postedJournalId,
    attachments: (invoice as any).attachments ?? [],
    // Cast via the runtime guard rather than blindly: the column is free text
    // at the DB level, and a value outside the union must not leak upward.
    servicePeriodUnit: isBillingPeriodUnit((invoice as any).servicePeriodUnit)
      ? ((invoice as any).servicePeriodUnit as "week" | "month" | "day")
      : null,
    servicePeriodCount: (invoice as any).servicePeriodCount ?? null,
    servicePeriodStart: isoDate((invoice as any).servicePeriodStart ?? null),
    servicePeriodEnd: isoDate((invoice as any).servicePeriodEnd ?? null),
    trackingAssignments: ((invoice as any).trackingAssignments ?? []).map(
      (assignment: any): TrackingAssignmentDto => ({
        dimensionId: assignment.dimensionId,
        optionId: assignment.optionId,
        dimensionKey: assignment.dimension.key,
        dimensionLabel: assignment.dimension.label,
        optionName: assignment.option.name,
      })
    ),
    // 🚀 FIXED: Check instance type to safely handle both Date objects and raw strings
    createdAt: invoice.createdAt instanceof Date ? invoice.createdAt.toISOString() : String(invoice.createdAt),
    lines: invoice.lines.map((line) => ({
      id: line.id,
      accountId: line.accountId,
      accountCode: line.account?.code ?? "----",
      accountName: line.account?.name ?? "Unknown account",
      accountReportCategory: line.account ? enumToLower(line.account.reportCategory) : "expense",
      description: line.description,
      location: line.location ?? null,
      amountMinor: Number(line.unitAmountMinor),
      quantity: line.quantity.toString(),
      unitPriceMinor: Number(line.unitAmountMinor),
      discountMinor: Number(line.discountMinor),
      subtotalMinor: Number(line.subtotalMinor),
      taxCode: line.taxCode,
      taxRate: decimalToNumber(line.taxRate),
      taxMinor: Number(line.taxMinor),
      totalMinor: Number(line.totalMinor),
      purchaseOrderLineId: null,
      purchaseOrderNumber: null,
      chargeItemId: (line as any).chargeItemId ?? null,
    })),
  };
}


function mapBill(bill: BillForMapper): BillWithLines {
  const purchaseOrderNumbers = new Set<string>();
  const lines = bill.lines.map((line) => {
    if (line.purchaseOrderLine?.purchaseOrder?.poNumber) {
      purchaseOrderNumbers.add(line.purchaseOrderLine.purchaseOrder.poNumber);
    }

    return {
      id: line.id,
      accountId: line.accountId,
      accountCode: line.account?.code ?? "----",
      accountName: line.account?.name ?? "Unknown account",
      accountReportCategory: line.account ? enumToLower(line.account.reportCategory) : "expense",
      description: line.description,
      // Carried over from the mapping this replaced. Bills have no line
      // location today; the field exists because sales documents do.
      location: null,
      amountMinor: Number(line.unitAmountMinor),
      quantity: line.quantity.toString(),
      unitPriceMinor: Number(line.unitAmountMinor),
      discountMinor: Number(line.discountMinor),
      subtotalMinor: Number(line.subtotalMinor),
      taxCode: line.taxCode,
      taxRate: decimalToNumber(line.taxRate),
      taxMinor: Number(line.taxMinor),
      totalMinor: Number(line.totalMinor),
      purchaseOrderLineId: line.purchaseOrderLineId ?? null,
      purchaseOrderNumber: line.purchaseOrderLine?.purchaseOrder?.poNumber ?? null,
      // Bills have no charge catalogue today; the field exists because the
      // line DTO is shared with sales documents.
      chargeItemId: null,
    };
  });

  return {
    id: bill.id,
    contactId: bill.contactId,
    contactName: bill.contact ? contactDisplayName(bill.contact) : "Unknown supplier",
    invoiceNo: bill.invoiceNo,
    issueDate: bill.issueDate.toISOString().slice(0, 10),
    dueDate: isoDate(bill.dueDate),
    // 🚀 FIXED: Explicitly cast the lowercase string to the bill status union literal type
    status: (bill.status ? enumToLower(bill.status) : "draft") as "draft" | "approved" | "paid" | "void", 
    currency: bill.currency,
    exchangeRate: Number((bill as any).exchangeRate ?? 1),
    // The total in the workspace's currency. Any report adding several bills
    // into one figure must use this rather than the face value, which is
    // denominated in whatever the supplier billed in.
    baseTotalMinor: Number((bill as any).baseTotalMinor ?? bill.totalMinor ?? 0),
    // Attached by listBills from the payment journals; absent on the other
    // callers of this mapper, which read a single bill and never age it.
    amountPaidMinor: Number((bill as any).amountPaidMinor ?? 0),
    baseAmountPaidMinor: Number((bill as any).baseAmountPaidMinor ?? 0),
    subtotalMinor: Number(bill.subtotalMinor),
    discountMinor: Number(bill.discountMinor),
    taxMinor: Number(bill.taxMinor),
    totalMinor: Number(bill.totalMinor),
    billingAddress: bill.billingAddress ?? null,
    location: bill.location ?? null,
    department: (bill.contact as any)?.employee?.department ?? null,
    amountsAre: ((bill as any).amountsAre ?? "exclusive") as VatTreatment,
    paymentTermsDays: (bill as any).paymentTermsDays ?? null,
    postedJournalId: bill.postedJournalId,
    paidJournalId: bill.paidJournalId,
    paidAt: bill.paidAt ? bill.paidAt.toISOString() : null,
    // 🚀 FIXED: Check instance type to safely handle both Date objects and raw strings
    createdAt: bill.createdAt instanceof Date ? bill.createdAt.toISOString() : String(bill.createdAt),
    /* The lines mapped above, rather than a second mapping of the same rows.
       This was re-mapping bill.lines inline with a copy that predates the
       purchase-order fields, so the mapper at the top of this function — the
       one that reads the PO number — was computed and then thrown away, and no
       bill ever carried a purchase order through. */
    lines,
    purchaseOrderNumbers: Array.from(purchaseOrderNumbers),
  };
}

const documentInclude = {
  contact: {
    select: { ...CONTACT_NAME_SELECT, paymentTermsDays: true, registration_number: true },
  },
  lines: {
    orderBy: { createdAt: "asc" as const },
    include: {
      account: { select: { code: true, name: true, reportCategory: true } },
      purchaseOrderLine: {
        select: {
          id: true,
          purchaseOrder: { select: { poNumber: true } },
        },
      },
    },
  },
  attachments: {
    orderBy: { createdAt: "asc" as const },
    select: { id: true, storagePath: true, filename: true, contentType: true, sizeBytes: true },
  },
};

export async function listInvoices(prisma: ExtendedPrismaClient, organizationId: string) {
  const invoices = await prisma.invoice.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    // Explicitly select only the columns that actually exist in your database right now
    select: {
      id: true,
      contactId: true,
      invoiceNo: true,
      issueDate: true,
      dueDate: true,
      status: true,
      currency: true,
      // Needed to show paid amounts and totals in the invoice's own currency.
      exchangeRate: true,
      baseTotalMinor: true,
      subtotalMinor: true,
      taxMinor: true,
      totalMinor: true,
      billingAddress: true,
      poNumber: true,
      reference: true,
      attachments: {
        orderBy: { createdAt: "asc" as const },
        select: { id: true, storagePath: true, filename: true, contentType: true, sizeBytes: true },
      },
      amountsAre: true,
      paymentTermsDays: true,
      servicePeriodUnit: true,
      servicePeriodCount: true,
      servicePeriodStart: true,
      servicePeriodEnd: true,
      postedJournalId: true,
      trackingAssignments: {
        orderBy: { dimension: { position: "asc" as const } },
        select: {
          dimensionId: true,
          optionId: true,
          dimension: { select: { key: true, label: true } },
          option: { select: { name: true } },
        },
      },
      createdAt: true,
      contact: {
        select: { ...CONTACT_NAME_SELECT, paymentTermsDays: true, registration_number: true },
      },
      lines: {
        orderBy: { createdAt: "asc" as const },
        select: {
          id: true,
          accountId: true,
          description: true,
          // Read by the mapper below and printed as the Location column. Absent
          // from the select, so it typechecked as missing and every document
          // showed a dash for a location the customer had been given.
          location: true,
          quantity: true,
          unitAmountMinor: true,
          subtotalMinor: true,
          taxCode: true,
          taxRate: true,
          taxMinor: true,
          totalMinor: true,
          chargeItemId: true,
          account: { select: { code: true, name: true, reportCategory: true } },
        },
      },
    },
  });

  // Derive POSTED payments per invoice (amount + deposit account), excluding POSTED reversals
  const paymentDetailsMap = await getPaymentDetailsMap(prisma, organizationId, "invoice_payment");

  // Reverse-engineer the discount AND patch the paid status!
  const patchedInvoices = invoices.map((invoice) => {
    const sub = BigInt(invoice.subtotalMinor.toString());
    const tax = BigInt(invoice.taxMinor.toString());
    const tot = BigInt(invoice.totalMinor.toString());
    const calculatedInvDiscount = sub + tax - tot;

    const paymentDetails = paymentDetailsMap.get(invoice.id) ?? [];
    const totalPaid = paymentDetails.reduce((sum, payment) => sum + payment.amountMinor, BigInt(0));

    // Payment journals are posted in the workspace currency, but this invoice is
    // shown in its own. Without converting back, paying a PHP 495 invoice in
    // full displayed as "paid PHP 5.95" — the GBP figure wearing a peso sign.
    const invoiceRate = Number((invoice as any).exchangeRate ?? 1);
    const baseTotal = Number((invoice as any).baseTotalMinor ?? 0);
    const toDocument = (baseMinor: bigint) =>
      invoiceRate === 1 ? Number(baseMinor) : Math.round(Number(baseMinor) / invoiceRate);

    // Converting back is lossy for a weak currency: at 3,547 shillings to the
    // pound, one penny is TSh 35.47, so TSh 995.00 stores as GBP 0.28 and
    // reconverts to TSh 993.23. That phantom TSh 1.77 could never be paid,
    // because it rounds to nothing in the ledger and a zero journal is
    // rejected. So once the base amount is fully relieved the invoice is
    // settled, and the document total is reported as paid rather than a
    // reconverted approximation of it.
    const isFullySettled = baseTotal > 0 && Number(totalPaid) >= baseTotal;

    return {
      ...invoice,
      // We keep the original status (draft, approved, sent) so the UI knows what color to use!
      amountPaidMinor: isFullySettled ? Number(invoice.totalMinor) : toDocument(totalPaid),
      // Already in the workspace currency — payment journals are posted there.
      baseAmountPaidMinor: Number(totalPaid),
      // A settled invoice paid in one go shows that payment as the invoice
      // total. Reconverting the base figure loses a penny on a weak currency —
      // TSh 1,000.00 came back as TSh 999.99 — so the header read "paid in
      // full" while the payment beneath it appeared to be a penny short.
      payments: paymentDetails.map((payment) => ({
        accountCode: payment.accountCode,
        accountName: payment.accountName,
        amountMinor:
          isFullySettled && paymentDetails.length === 1
            ? Number(invoice.totalMinor)
            : toDocument(payment.amountMinor),
        paidAt: payment.paidAt,
      })),
      discountMinor: calculatedInvDiscount > BigInt(0) ? calculatedInvDiscount : BigInt(0),
      lines: invoice.lines.map((line) => {
        const lSub = BigInt(line.subtotalMinor.toString());
        const lTax = BigInt(line.taxMinor.toString());
        const lTot = BigInt(line.totalMinor.toString());
        const calculatedLineDiscount = lSub + lTax - lTot;

        return {
          ...line,
          discountMinor: calculatedLineDiscount > BigInt(0) ? calculatedLineDiscount : BigInt(0),
        };
      }),
    };
  });

  return patchedInvoices.map(mapInvoice as any);
}

export async function listBills(prisma: ExtendedPrismaClient, organizationId: string) {
  const bills = await prisma.bill.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      contactId: true,
      invoiceNo: true,
      issueDate: true,
      dueDate: true,
      status: true,
      currency: true,
      // Needed so bill tiles can total across currencies.
      exchangeRate: true,
      baseTotalMinor: true,
      subtotalMinor: true,
      discountMinor: true,
      taxMinor: true,
      totalMinor: true,
      billingAddress: true,
      location: true,
      amountsAre: true,
      paymentTermsDays: true,
      postedJournalId: true,
      paidJournalId: true,
      paidAt: true,
      createdAt: true,
      contact: {
        select: {
          ...CONTACT_NAME_SELECT,
          paymentTermsDays: true,
          employee: { select: { department: true } },
        },
      },
      lines: {
        orderBy: { createdAt: "asc" as const },
        select: {
          id: true,
          accountId: true,
          description: true,
          quantity: true,
          unitAmountMinor: true,
          subtotalMinor: true,
          discountMinor: true,
          taxCode: true,
          taxRate: true,
          taxMinor: true,
          totalMinor: true,
          account: { select: { code: true, name: true, reportCategory: true } },
        },
      },
    },
  });

  /* How much of each bill has been settled, measured from the payable that was
     relieved rather than the cash that left. For a foreign bill those differ by
     the exchange movement, and the payable side is the one denominated at the
     rate the bill was raised at — the same measure baseTotalMinor carries, so
     the two can be subtracted.

     Aged payables previously read the bill total alone and only dropped a bill
     once its status reached paid. That is right today because payBill settles
     in full, but it is right by accident: nothing in the report would survive
     part-payment being added. */
  const apAccount = await prisma.chartAccount.findFirst({
    where: { organizationId, code: payableAccount.code },
    select: { id: true },
  });
  const paidMap = await getAmountPaidMap(prisma, organizationId, "bill_payment", apAccount?.id);

  const withPayments = bills.map((bill) => {
    const basePaid = paidMap.get(bill.id) ?? BigInt(0);
    const billRate = Number((bill as any).exchangeRate ?? 1);
    const baseTotal = Number((bill as any).baseTotalMinor ?? bill.totalMinor ?? 0);
    /* Reconverting is lossy on a weak currency — a penny of base is thousands
       of minor units — so a fully relieved payable reports the bill's own total
       rather than an approximation of it. The same reasoning as listInvoices. */
    const isFullySettled = baseTotal > 0 && Number(basePaid) >= baseTotal;
    return {
      ...bill,
      amountPaidMinor: isFullySettled
        ? Number(bill.totalMinor)
        : billRate === 1
          ? Number(basePaid)
          : Math.round(Number(basePaid) / billRate),
      baseAmountPaidMinor: Number(basePaid),
    };
  });

  return withPayments.map(mapBill as any);
}

/**
 * Collapse the tax rate list to one entry per code.
 *
 * `code` carries no unique constraint, so the same code exists twice whenever an
 * organization overrides a system rate — and `getTaxRate` resolves that by
 * preferring the organization's own row. The options handed to a document form
 * have to collapse the same way: left as two entries, a form previewing VAT
 * looks its rate up by code and can pick the system row while the ledger posts
 * the organization's, so the total on screen disagrees with the total stored.
 */
function dedupeTaxRatesByCode<T extends { code: string; organizationId: string | null }>(
  taxRates: T[]
): T[] {
  const byCode = new Map<string, T>();
  for (const taxRate of taxRates) {
    const seen = byCode.get(taxRate.code);
    // Insertion order is the query's `code asc`, and replacing a value keeps
    // its original slot, so the list stays sorted.
    if (!seen || (seen.organizationId === null && taxRate.organizationId !== null)) {
      byCode.set(taxRate.code, taxRate);
    }
  }
  return [...byCode.values()];
}

export async function getDocumentOptions(prisma: ExtendedPrismaClient, organizationId: string) {
  const [contacts, accounts, taxRates, organization] = await Promise.all([
    prisma.contact.findMany({
      where: { organizationId, isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        ...CONTACT_NAME_SELECT,
        email: true,
        contactType: true,
        paymentTermsDays: true,
        paymentScheduleType: true,
        paymentScheduleDay: true,
        billingAddress: true,
        registration_number: true,
        // Drives the default currency on a new document for this contact —
        // an American client is normally billed in dollars.
        defaultCurrency: true,
      },
    }),
    prisma.chartAccount.findMany({
      where: { organizationId, isActive: true },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        accountType: true,
        reportCategory: true,
        taxCode: true,
      },
    }),
    prisma.taxRate.findMany({
      // System rates plus this organization's custom rates
      where: {
        isActive: true,
        OR: [{ organizationId: null }, { organizationId }],
      },
      orderBy: { code: "asc" },
      select: { code: true, name: true, rate: true, organizationId: true },
    }),
    prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { vatRegistered: true },
    }),
  ]);

  return {
    contacts: contacts.map((contact): ContactSummary => ({
      id: contact.id,
      name: contactDisplayName(contact),
      email: contact.email ?? null,
      contactType: enumToLower(contact.contactType),
      paymentTermsDays: contact.paymentTermsDays,
      paymentScheduleType: contact.paymentScheduleType as ContactSummary["paymentScheduleType"],
      paymentScheduleDay: contact.paymentScheduleDay,
      billingAddress: contact.billingAddress ?? null,
      registrationNumber: contact.registration_number ?? null,
      defaultCurrency: String(contact.defaultCurrency),
    })),
    accounts: accounts.map((account): ChartAccountOption => ({
      id: account.id,
      code: account.code,
      name: account.name,
      accountType: enumToLower(account.accountType),
      reportCategory: enumToLower(account.reportCategory),
      taxCode: account.taxCode,
    })),
    taxRates: dedupeTaxRatesByCode(taxRates).map((taxRate): TaxRateOption => ({
      code: taxRate.code,
      name: taxRate.name,
      rate: decimalToNumber(taxRate.rate),
    })),
    vatRegistered: organization.vatRegistered,
  };
}

export async function saveInvoiceDraft(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  input: DocumentDraftInput
) {
  const lines = await withAdditionalChargeLines(
    prisma,
    organizationId,
    input,
    await withShippingLine(prisma, organizationId, input, "income")
  );
  const attachments = validateInvoiceAttachmentInput(input.attachments ?? [], actorUserId);
  return withDocNumberRetry(() => prisma.$transaction(async (tx) => {
    const contactId = await resolveContact(tx, organizationId, {
      contactId: input.contactId,
      contactName: input.contactName,
      contactType: ContactType.CUSTOMER,
    });
    const amountsAre: VatTreatment = (["exclusive", "inclusive", "no_vat"] as const).includes(input.amountsAre as any)
      ? (input.amountsAre as VatTreatment)
      : "exclusive";
    const paymentTermsDays =
      typeof input.paymentTermsDays === "number" && Number.isFinite(input.paymentTermsDays)
        ? Math.max(0, Math.round(input.paymentTermsDays))
        : null;
    const normalized = await normalizeLines(
      tx,
      organizationId,
      lines,
      {
        accountTypes: ["REVENUE"],
        reportCategories: ["SALES", "OTHER_INCOME"],
      },
      amountsAre
    );

    let invoiceNo: string;
    if (input.documentNo.trim()) {
      const existing = await tx.invoice.findFirst({
        where: {
          organizationId,
          invoiceNo: input.documentNo.trim(),
          ...(input.id ? { NOT: { id: input.id } } : {}),
        },
        select: { id: true },
      });
      invoiceNo = existing
        ? await nextInvoiceNumber(tx, organizationId)
        : input.documentNo.trim();
    } else {
      invoiceNo = await nextInvoiceNumber(tx, organizationId);
    }

    const totalMinor = normalized.subtotalMinor - normalized.discountMinor + normalized.taxMinor;
    const issueDateStr = toDate(input.issueDate);
    const dueDateStr = optionalDate(input.dueDate);
    // When editing, the stored currency wins — a document never changes the
    // currency it was raised in.
    const priorInvoice = input.id
      ? await tx.invoice.findFirst({
          where: { id: input.id, organizationId },
          select: { currency: true, status: true },
        })
      : null;
    // Drafts may still be re-denominated; anything posted may not.
    const lockedInvoiceCurrency =
      priorInvoice && priorInvoice.status !== InvoiceStatus.DRAFT ? priorInvoice.currency : null;
    const currencyStr = await normalizeCurrency(
      tx,
      organizationId,
      input.currency,
      lockedInvoiceCurrency
    );
    const exchangeRate = await resolveDocumentRate(tx, organizationId, currencyStr, issueDateStr, input.exchangeRate);
    const baseTotalMinor = convertMinor(totalMinor, exchangeRate);
    const billingAddressStr = input.billingAddress?.trim() || null;
    const poNumberStr = input.poNumber?.trim() || null;
    const referenceStr = input.reference?.trim() || null;
    const servicePeriod = normalizeServicePeriod(input);

    // A document may only be edited while it is a draft. If the caller passes an id
    // that resolves to a non-draft invoice, the historic code silently fell through
    // to the INSERT branch and created a duplicate draft. Reject instead.
    if (input.id) {
      const current = await tx.invoice.findFirst({
        where: { id: input.id, organizationId },
        select: { status: true },
      });
      if (current && current.status !== InvoiceStatus.DRAFT) {
        throw new Error(
          `Invoice cannot be edited once it is ${current.status?.toLowerCase() ?? "an unknown state"}. Revert it to draft first.`
        );
      }
    }

    const existingInvoice = input.id
      ? await tx.invoice.findFirst({
          where: { id: input.id, organizationId, status: InvoiceStatus.DRAFT },
          select: { id: true },
        })
      : null;

    let targetInvoiceId: string;

    if (existingInvoice) {
      targetInvoiceId = existingInvoice.id;
      
      // 1. Manually update the invoice table via raw SQL to hide missing columns
      // tenancy:safe: targetInvoiceId is from existingInvoice obtained via organizationId-scoped findFirst above; UPDATE only changes non-identity columns
      await tx.$executeRaw`
        UPDATE invoices
        SET
          contact_id = ${contactId}::uuid,
          invoice_no = ${invoiceNo},
          issue_date = ${issueDateStr}::date,
          due_date = ${dueDateStr}::date,
          currency = ${currencyStr}::text::"currency_code",
          exchange_rate = ${exchangeRate}::numeric,
          base_total_minor = ${baseTotalMinor},
          subtotal_minor = ${normalized.subtotalMinor},
          discount_minor = ${normalized.discountMinor},
          tax_minor = ${normalized.taxMinor},
          total_minor = ${totalMinor},
          billing_address = ${billingAddressStr},
          po_number = ${poNumberStr},
          reference = ${referenceStr},
          amounts_are = ${amountsAre},
          payment_terms_days = ${paymentTermsDays},
          service_period_unit = ${servicePeriod.unit},
          service_period_count = ${servicePeriod.count},
          service_period_start = ${servicePeriod.start}::date,
          service_period_end = ${servicePeriod.end}::date,
          updated_at = NOW()
        WHERE id = ${targetInvoiceId}::uuid
      `;
      
      // 2. Clear old lines
      await tx.$executeRaw`DELETE FROM invoice_lines WHERE invoice_id = ${targetInvoiceId}::uuid`;
    } else {
      // 1. Manually create the invoice row via raw SQL if it's a new draft
      const result = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO invoices (id, org_id, contact_id, invoice_no, issue_date, due_date, status, currency, exchange_rate, base_total_minor, subtotal_minor, discount_minor, tax_minor, total_minor, billing_address, po_number, reference, amounts_are, payment_terms_days, service_period_unit, service_period_count, service_period_start, service_period_end, created_at, updated_at)
        VALUES (
          gen_random_uuid(),
          ${organizationId}::uuid,
          ${contactId}::uuid,
          ${invoiceNo},
          ${issueDateStr}::date,
          ${dueDateStr}::date,
          'draft'::"invoice_status",
          ${currencyStr}::text::"currency_code",
          ${exchangeRate}::numeric,
          ${baseTotalMinor},
          ${normalized.subtotalMinor},
          ${normalized.discountMinor},
          ${normalized.taxMinor},
          ${totalMinor},
          ${billingAddressStr},
          ${poNumberStr},
          ${referenceStr},
          ${amountsAre},
          ${paymentTermsDays},
          ${servicePeriod.unit},
          ${servicePeriod.count},
          ${servicePeriod.start}::date,
          ${servicePeriod.end}::date,
          NOW(),
          NOW()
        )
        RETURNING id
      `;
      targetInvoiceId = result[0].id;
    }

    // Supporting files do not affect invoice totals or ledger posting. Replace
    // the draft's list atomically so removed files cannot be sent later.
    await tx.invoiceAttachment.deleteMany({
      where: { organizationId, invoiceId: targetInvoiceId },
    });
    if (attachments.length > 0) {
      await tx.invoiceAttachment.createMany({
        data: attachments.map((attachment) => ({
          organizationId,
          invoiceId: targetInvoiceId,
          ...attachment,
        })),
      });
    }

    // Batch defaults stop existing once creation finishes. Persist independent
    // assignments on this invoice; older/single-invoice editors omit the field
    // and therefore cannot accidentally clear already-saved tracking.
    if (input.trackingAssignments !== undefined) {
      const trackingAssignments = await validateTrackingAssignments(
        tx,
        organizationId,
        input.trackingAssignments
      );
      await tx.invoiceTrackingAssignment.deleteMany({
        where: { organizationId, invoiceId: targetInvoiceId },
      });
      if (trackingAssignments.length > 0) {
        await tx.invoiceTrackingAssignment.createMany({
          data: trackingAssignments.map((assignment) => ({
            organizationId,
            invoiceId: targetInvoiceId,
            dimensionId: assignment.dimensionId,
            optionId: assignment.optionId,
          })),
        });
      }
    }

    // 3. Manually insert line items one by one completely bypassing Prisma's hidden defaults
    for (const line of normalized.lines) {
      await tx.$executeRaw`
        INSERT INTO invoice_lines (id, org_id, invoice_id, account_id, description, location, quantity, unit_amount_minor, subtotal_minor, discount_minor, tax_code, tax_rate, tax_minor, total_minor, charge_item_id, created_at)
        VALUES (
          gen_random_uuid(),
          ${organizationId}::uuid,
          ${targetInvoiceId}::uuid,
          ${line.accountId}::uuid,
          ${line.description},
          ${line.location},
          ${line.quantity}::numeric,
          ${line.unitAmountMinor},
          ${line.subtotalMinor},
          ${line.discountMinor},
          ${line.taxCode},
          ${line.taxRate}::numeric,
          ${line.taxMinor},
          ${line.totalMinor},
          ${line.chargeItemId ?? null}::uuid,
          NOW()
        )
      `;
    }

    // Standard structured object for the audit log sequence down below
    const invoice = {
      id: targetInvoiceId,
      invoiceNo,
      totalMinor,
    };

    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "invoice",
        entityId: invoice.id,
        action: input.id ? AuditAction.UPDATE : AuditAction.CREATE,
        after: { invoiceNo: invoice.invoiceNo, totalMinor: invoice.totalMinor.toString() },
      },
    });

    return invoice.id;
  }));
}

/**
 * One request, many independently-owned drafts. Separate transactions allow
 * valid rows to succeed while returning a precise error beside any bad row.
 */
export async function saveInvoiceDraftBatch(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  rows: Array<{ rowId: string; input: DocumentDraftInput }>
): Promise<InvoiceBatchCreateResult[]> {
  if (rows.length === 0) throw new Error("Add at least one invoice.");
  if (rows.length > 50) throw new Error("Create at most 50 invoices at a time.");
  const contactKeys = new Set(
    rows.map(({ input }) => input.contactId?.trim() || input.contactName.trim().toLowerCase())
  );
  if (contactKeys.size !== 1) {
    throw new Error("Every invoice in a batch must belong to the same customer.");
  }

  const results: InvoiceBatchCreateResult[] = [];
  for (const row of rows) {
    try {
      const sanitized = { ...row.input };
      delete sanitized.id;
      const invoiceId = await saveInvoiceDraft(
        prisma,
        organizationId,
        actorUserId,
        sanitized
      );
      results.push({ rowId: row.rowId, invoiceId, status: "created" });
    } catch (error) {
      results.push({
        rowId: row.rowId,
        status: "failed",
        reason: error instanceof Error ? error.message : "Invoice could not be created.",
      });
    }
  }
  return results;
}

export async function saveBillDraft(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  input: DocumentDraftInput
) {
  const lines = await withShippingLine(prisma, organizationId, input, "expense");
  const receiptAttachment = validateBillAttachmentInput(input.receiptAttachment, actorUserId);
  return withDocNumberRetry(() => prisma.$transaction(async (tx) => {
    if (!input.contactId) {
      throw new Error("Select a supplier before saving this bill.");
    }

    const contactId = await resolveContact(tx, organizationId, {
      contactId: input.contactId,
      contactName: input.contactName,
      // A claimant is a person owed money, not a supplier, so they stay out of
      // supplier pickers and purchase reports.
      contactType: input.isExpenseClaim ? ContactType.EMPLOYEE : ContactType.SUPPLIER,
    });
    const amountsAre: VatTreatment = (["exclusive", "inclusive", "no_vat"] as const).includes(input.amountsAre as any)
      ? (input.amountsAre as VatTreatment)
      : "exclusive";
    const paymentTermsDays =
      typeof input.paymentTermsDays === "number" && Number.isFinite(input.paymentTermsDays)
        ? Math.max(0, Math.round(input.paymentTermsDays))
        : null;
    const normalized = await normalizeLines(
      tx,
      organizationId,
      lines,
      {
        accountTypes: ["EXPENSE", "ASSET"],
        reportCategories: [
          "COST_OF_SALES",
          "EXPENSE",
          "DEPRECIATION",
          "CURRENT_ASSET",
          "FIXED_ASSET",
          "NON_CURRENT_ASSET",
        ],
      },
      amountsAre
    );

    const linkedPurchaseOrderLineIds = Array.from(
      new Set(
        normalized.lines
          .map((line) => line.purchaseOrderLineId)
          .filter((value): value is string => Boolean(value))
      )
    );
    const linkedPurchaseOrderLines = linkedPurchaseOrderLineIds.length > 0
      ? await tx.purchaseOrderLine.findMany({
          where: { organizationId, id: { in: linkedPurchaseOrderLineIds } },
          select: { id: true, purchaseOrderId: true, quantity: true },
        })
      : [];
    const purchaseOrderLineMap = new Map(
      linkedPurchaseOrderLines.map((line) => [line.id, line] as const)
    );
    const existingPurchaseOrderUsageRows = linkedPurchaseOrderLineIds.length > 0
      ? await tx.billLine.findMany({
          where: {
            organizationId,
            purchaseOrderLineId: { in: linkedPurchaseOrderLineIds },
            bill: {
              status: { not: BillStatus.VOID },
              ...(input.id ? { id: { not: input.id } } : {}),
            },
          },
          select: { purchaseOrderLineId: true, quantity: true },
        })
      : [];
    const existingUsageMap = new Map<string, bigint>();
    for (const row of existingPurchaseOrderUsageRows) {
      if (!row.purchaseOrderLineId) continue;
      const current = existingUsageMap.get(row.purchaseOrderLineId) ?? BigInt(0);
      existingUsageMap.set(
        row.purchaseOrderLineId,
        current + quantityToHundredths(row.quantity.toString())
      );
    }
    const currentUsageMap = new Map<string, bigint>();
    for (const line of normalized.lines) {
      if (!line.purchaseOrderLineId) continue;
      const linked = purchaseOrderLineMap.get(line.purchaseOrderLineId);
      if (!linked) {
        throw new Error("Selected purchase order line is not available.");
      }
      const current = currentUsageMap.get(line.purchaseOrderLineId) ?? BigInt(0);
      currentUsageMap.set(
        line.purchaseOrderLineId,
        current + quantityToHundredths(line.quantity)
      );
    }
    for (const [purchaseOrderLineId, currentUsage] of currentUsageMap) {
      const linked = purchaseOrderLineMap.get(purchaseOrderLineId);
      if (!linked) continue;
      const ordered = quantityToHundredths(linked.quantity.toString());
      const alreadyUsed = existingUsageMap.get(purchaseOrderLineId) ?? BigInt(0);
      if (alreadyUsed + currentUsage > ordered) {
        throw new Error("Purchase order line quantity has already been fully allocated.");
      }
    }
    const touchedPurchaseOrderIds = Array.from(
      new Set(linkedPurchaseOrderLines.map((line) => line.purchaseOrderId))
    );

    let invoiceNo: string;
    if (input.documentNo.trim()) {
      const existing = await tx.bill.findFirst({
        where: {
          organizationId,
          invoiceNo: input.documentNo.trim(),
          ...(input.id ? { NOT: { id: input.id } } : {}),
        },
        select: { id: true },
      });
      invoiceNo = existing
        ? await nextBillNumber(tx, organizationId, input.isExpenseClaim === true)
        : input.documentNo.trim();
    } else {
      invoiceNo = await nextBillNumber(tx, organizationId, input.isExpenseClaim === true);
    }

    const issueDateStr = toDate(input.issueDate);
    const dueDateStr = optionalDate(input.dueDate);
    const priorBill = input.id
      ? await tx.bill.findFirst({
          where: { id: input.id, organizationId },
          select: { currency: true, status: true },
        })
      : null;
    const lockedBillCurrency =
      priorBill && priorBill.status !== BillStatus.DRAFT ? priorBill.currency : null;
    const currencyStr = await normalizeCurrency(
      tx,
      organizationId,
      input.currency,
      lockedBillCurrency
    );
    const exchangeRate = await resolveDocumentRate(tx, organizationId, currencyStr, issueDateStr, input.exchangeRate);
    const baseTotalMinor = convertMinor(normalized.totalMinor, exchangeRate);
    const billingAddressStr = input.billingAddress?.trim() || null;
    const paymentMethodStr = input.paymentMethod?.trim() || null;
    const locationStr = input.location?.trim() || null;
    const notesStr = input.notes?.trim() || null;

    // A document may only be edited while it is a draft. If the caller passes an id
    // that resolves to a non-draft bill, the historic code silently fell through
    // to the INSERT branch and created a duplicate draft. Reject instead.
    if (input.id) {
      const current = await tx.bill.findFirst({
        where: { id: input.id, organizationId },
        select: { status: true },
      });
      if (current && current.status !== BillStatus.DRAFT) {
        throw new Error(
          `Bill cannot be edited once it is ${current.status?.toLowerCase() ?? "an unknown state"}. Revert it to draft first.`
        );
      }
    }

    const existingBill = input.id
      ? await tx.bill.findFirst({
          where: { id: input.id, organizationId, status: BillStatus.DRAFT },
          select: { id: true },
        })
      : null;
    const hadReceiptAttachment = existingBill
      ? await tx.billAttachment.findFirst({
          where: { organizationId, billId: existingBill.id },
          select: { id: true },
        })
      : null;

    let targetBillId: string;

    if (existingBill) {
      targetBillId = existingBill.id;
      // tenancy:safe: targetBillId is from existingBill obtained via organizationId-scoped findFirst above; UPDATE only changes non-identity columns
      await tx.$executeRaw`
        UPDATE bills
        SET
          contact_id = ${contactId}::uuid,
          invoice_no = ${invoiceNo},
          issue_date = ${issueDateStr}::date,
          due_date = ${dueDateStr}::date,
          currency = ${currencyStr}::text::"currency_code",
          exchange_rate = ${exchangeRate}::numeric,
          base_total_minor = ${baseTotalMinor},
          subtotal_minor = ${normalized.subtotalMinor},
          discount_minor = ${normalized.discountMinor},
          tax_minor = ${normalized.taxMinor},
          total_minor = ${normalized.totalMinor},
          billing_address = ${billingAddressStr},
          payment_method = ${paymentMethodStr},
          location = ${locationStr},
          notes = ${notesStr},
          amounts_are = ${amountsAre},
          payment_terms_days = ${paymentTermsDays},
          is_expense_claim = ${input.isExpenseClaim === true},
          updated_at = NOW()
        WHERE id = ${targetBillId}::uuid
      `;
      await tx.$executeRaw`DELETE FROM bill_lines WHERE bill_id = ${targetBillId}::uuid`;
    } else {
      const result = await tx.$queryRaw<{ id: string }[]>`
        INSERT INTO bills (id, org_id, contact_id, invoice_no, issue_date, due_date, status, currency, exchange_rate, base_total_minor, subtotal_minor, discount_minor, tax_minor, total_minor, billing_address, payment_method, location, notes, amounts_are, payment_terms_days, is_expense_claim, created_at, updated_at)
        VALUES (
          gen_random_uuid(),
          ${organizationId}::uuid,
          ${contactId}::uuid,
          ${invoiceNo},
          ${issueDateStr}::date,
          ${dueDateStr}::date,
          'draft'::"bill_status",
          ${currencyStr}::text::"currency_code",
          ${exchangeRate}::numeric,
          ${baseTotalMinor},
          ${normalized.subtotalMinor},
          ${normalized.discountMinor},
          ${normalized.taxMinor},
          ${normalized.totalMinor},
          ${billingAddressStr},
          ${paymentMethodStr},
          ${locationStr},
          ${notesStr},
          ${amountsAre},
          ${paymentTermsDays},
          ${input.isExpenseClaim === true},
          NOW(),
          NOW()
        )
        RETURNING id
      `;
      targetBillId = result[0].id;
    }

    if (receiptAttachment) {
      if (hadReceiptAttachment) {
        await tx.billAttachment.deleteMany({
          where: { organizationId, billId: targetBillId },
        });
      }
      await tx.billAttachment.create({
        data: {
          organizationId,
          billId: targetBillId,
          ...receiptAttachment,
        },
      });
    }

    for (const line of normalized.lines) {
      await tx.$executeRaw`
        INSERT INTO bill_lines (id, org_id, bill_id, purchase_order_line_id, account_id, description, quantity, unit_amount_minor, subtotal_minor, discount_minor, tax_code, tax_rate, tax_minor, total_minor, created_at)
        VALUES (
          gen_random_uuid(),
          ${organizationId}::uuid,
          ${targetBillId}::uuid,
          ${line.purchaseOrderLineId ?? null}::uuid,
          ${line.accountId}::uuid,
          ${line.description},
          ${line.quantity}::numeric,
          ${line.unitAmountMinor},
          ${line.subtotalMinor},
          ${line.discountMinor},
          ${line.taxCode},
          ${line.taxRate}::numeric,
          ${line.taxMinor},
          ${line.totalMinor},
          NOW()
        )
      `;
    }

    if (touchedPurchaseOrderIds.length > 0) {
      await recalculatePurchaseOrderStatuses(tx, organizationId, touchedPurchaseOrderIds);
    }

    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "bill",
        entityId: targetBillId,
        action: input.id ? AuditAction.UPDATE : AuditAction.CREATE,
        after: { invoiceNo, totalMinor: normalized.totalMinor.toString() },
      },
    });

    return targetBillId;
  }));
}

export async function approveInvoice(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  invoiceId: string,
  isCashSale: boolean = false, // <-- NEW
  depositAccountId?: string | null // <-- NEW
): Promise<PostingResult> {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirstOrThrow({
      where: { id: invoiceId, organizationId, status: InvoiceStatus.DRAFT },
      select: {
        id: true,
        invoiceNo: true,
        subtotalMinor: true,
        discountMinor: true,
        totalMinor: true,
        taxMinor: true,
        exchangeRate: true,
        baseTotalMinor: true,
        contactId: true,
        issueDate: true,
        contact: { select: CONTACT_NAME_SELECT },
        trackingAssignments: {
          select: { dimensionId: true, optionId: true },
        },
        lines: {
          select: {
            id: true,
            accountId: true,
            subtotalMinor: true,
            discountMinor: true,
            description: true,
          },
        },
      },
    });

    assertPostableDocument(
      "invoice",
      invoice.invoiceNo,
      invoice.totalMinor,
      invoice.lines
    );

    await assertPeriodOpen(tx, organizationId, invoice.issueDate);

    const arAccountId = await resolveSystemAccount(tx, organizationId, receivableAccount);
    const vatAccountId = invoice.taxMinor > BigInt(0)
      ? await resolveSystemAccount(tx, organizationId, outputVatAccount)
      : null;
    const discountAccountId = invoice.discountMinor > BigInt(0)
      ? await resolveSystemAccount(tx, organizationId, salesDiscountAccount)
      : null;

    const journalLines = [
      {
        organizationId,
        accountId: arAccountId,
        contactId: invoice.contactId,
        debitMinor: invoice.totalMinor,
        creditMinor: BigInt(0),
        memo: `Invoice ${invoice.invoiceNo}`,
      },
      ...invoice.lines.map((line) => ({
        organizationId,
        accountId: line.accountId,
        contactId: invoice.contactId,
        debitMinor: BigInt(0),
        creditMinor: line.subtotalMinor,
        memo: line.description,
      })),
      ...(vatAccountId
        ? [
            {
              organizationId,
              accountId: vatAccountId,
              contactId: invoice.contactId,
              debitMinor: BigInt(0),
              creditMinor: invoice.taxMinor,
              memo: `VAT on invoice ${invoice.invoiceNo}`,
            },
          ]
        : []),
      ...(discountAccountId && invoice.discountMinor > BigInt(0)
        ? [
            {
              organizationId,
              accountId: discountAccountId,
              contactId: invoice.contactId,
              debitMinor: invoice.discountMinor,
              creditMinor: BigInt(0),
              memo: `Discount on invoice ${invoice.invoiceNo}`,
            },
          ]
        : []),
    ];

    // The ledger is single-currency, so a foreign invoice posts its
    // base-currency value. Line 0 is the receivable, which carries the total.
    const invoiceRate = Number(invoice.exchangeRate ?? 1);

    // An amount worth less than one minor unit of the base currency converts to
    // nothing, and a journal with no value is rejected. Saying so plainly beats
    // the bare "journal has zero total" the posting guard would otherwise raise,
    // which gives no hint that the currency is the reason.
    if (invoiceRate !== 1 && (invoice.baseTotalMinor ?? BigInt(0)) === BigInt(0)) {
      throw new Error(
        `Invoice ${invoice.invoiceNo} is too small to post: ` +
          `${(Number(invoice.totalMinor) / 100).toFixed(2)} is worth less than 0.01 in ` +
          `the workspace currency at the rate on this invoice.`
      );
    }
    const postedLines = convertJournalLines(
      journalLines,
      invoiceRate,
      invoice.baseTotalMinor ?? invoice.totalMinor,
      0
    );

    // Safety net: confirm debits == credits before posting (guards against drift
    // between the stored header totals and the line amounts above).
    assertJournalBalances("Invoice", invoice.invoiceNo, postedLines);

    const journal = await tx.journal.create({
      data: {
        organizationId,
        status: JournalStatus.DRAFT,
        journalDate: invoice.issueDate,
        memo: `Invoice ${invoice.invoiceNo} - ${contactDisplayName(invoice.contact)}`,
        sourceType: "invoice",
        sourceId: invoice.id,
        createdByUserId: actorUserId,
        lines: {
          create: postedLines,
        },
      },
    });

    if (invoice.trackingAssignments.length > 0) {
      await tx.journalTrackingAssignment.createMany({
        data: invoice.trackingAssignments.map((assignment) => ({
          organizationId,
          journalId: journal.id,
          dimensionId: assignment.dimensionId,
          optionId: assignment.optionId,
        })),
      });
    }

    await tx.journal.update({
      where: { id: journal.id },
      data: { status: JournalStatus.POSTED, postedByUserId: actorUserId, postedAt: new Date() },
    });
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.APPROVED, postedJournalId: journal.id },
    });
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "invoice",
        entityId: invoice.id,
        action: AuditAction.POST,
        after: { journalId: journal.id, totalMinor: invoice.totalMinor.toString() },
      },
    });

   // ✨ NEW: If it's a Cash Sale, instantly pay it off! ✨
    if (isCashSale) {
      const targetBankId = depositAccountId
        ? await resolveDepositAccount(tx, organizationId, depositAccountId)
        : await resolveSystemAccount(tx, organizationId, bankAccount);

      // 1. Create as DRAFT first to bypass the database immutability trigger!
      const paymentJournal = await tx.journal.create({
        data: {
          organizationId,
          status: JournalStatus.DRAFT, 
          postedAt: new Date(),
          journalDate: invoice.issueDate,
          memo: `Cash Sale payment for ${invoice.invoiceNo}`,
          sourceType: "invoice_payment",
          sourceId: invoice.id,
          createdByUserId: actorUserId,
          lines: {
            create: [
              {
                organizationId,
                accountId: targetBankId,
                contactId: invoice.contactId,
                debitMinor: invoice.totalMinor,
                creditMinor: BigInt(0),
                memo: `Cash received for ${invoice.invoiceNo}`,
              },
              {
                organizationId,
                accountId: arAccountId,
                contactId: invoice.contactId,
                debitMinor: BigInt(0),
                creditMinor: invoice.totalMinor,
                memo: `Clear AR for Cash Sale ${invoice.invoiceNo}`,
              },
            ],
          },
        },
      });

      // 2. Now instantly update it to POSTED!
      await tx.journal.update({
        where: { id: paymentJournal.id },
        data: { status: JournalStatus.POSTED, postedByUserId: actorUserId },
      });

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId,
          entityType: "invoice",
          entityId: invoice.id,
          action: AuditAction.POST,
          after: { action: "cash_sale_payment", journalId: paymentJournal.id },
        },
      });
    }

    return { documentId: invoice.id, journalId: journal.id };
  });
}

export async function approveBill(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  billId: string
): Promise<PostingResult> {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findFirstOrThrow({
      where: { id: billId, organizationId, status: BillStatus.DRAFT },
      select: {
        id: true,
        invoiceNo: true,
        discountMinor: true,
        totalMinor: true,
        taxMinor: true,
        exchangeRate: true,
        baseTotalMinor: true,
        contactId: true,
        issueDate: true,
        contact: { select: CONTACT_NAME_SELECT },
        lines: {
          select: {
            id: true,
            accountId: true,
            subtotalMinor: true,
            description: true,
          },
        },
      },
    });

    assertPostableDocument("bill", bill.invoiceNo, bill.totalMinor, bill.lines);

    await assertPeriodOpen(tx, organizationId, bill.issueDate);

    const apAccountId = await resolveSystemAccount(tx, organizationId, payableAccount);
    const vatAccountId = bill.taxMinor > BigInt(0)
      ? await resolveSystemAccount(tx, organizationId, inputVatAccount)
      : null;
    const discountAccountId = bill.discountMinor > BigInt(0)
      ? await resolveSystemAccount(tx, organizationId, purchaseDiscountAccount)
      : null;

    const journalLines = [
      ...bill.lines.map((line) => ({
        organizationId,
        accountId: line.accountId,
        contactId: bill.contactId,
        debitMinor: line.subtotalMinor,
        creditMinor: BigInt(0),
        memo: line.description,
      })),
      ...(vatAccountId
        ? [
            {
              organizationId,
              accountId: vatAccountId,
              contactId: bill.contactId,
              debitMinor: bill.taxMinor,
              creditMinor: BigInt(0),
              memo: `VAT on bill ${bill.invoiceNo}`,
            },
          ]
        : []),
      ...(discountAccountId
        ? [
            {
              organizationId,
              accountId: discountAccountId,
              contactId: bill.contactId,
              debitMinor: BigInt(0),
              creditMinor: bill.discountMinor,
              memo: `Discount on bill ${bill.invoiceNo}`,
            },
          ]
        : []),
      {
        organizationId,
        accountId: apAccountId,
        contactId: bill.contactId,
        debitMinor: BigInt(0),
        creditMinor: bill.totalMinor,
        memo: `Bill ${bill.invoiceNo}`,
      },
    ];

    // The ledger is single-currency, so a foreign bill posts its base-currency
    // value. The payable line carries the total.
    const billRate = Number(bill.exchangeRate ?? 1);
    const payableIndex = journalLines.findIndex((line) => line.creditMinor === bill.totalMinor);
    const postedBillLines = convertJournalLines(
      journalLines,
      billRate,
      bill.baseTotalMinor ?? bill.totalMinor,
      payableIndex >= 0 ? payableIndex : journalLines.length - 1
    );

    // Safety net: confirm debits == credits before posting (guards against drift
    // between the stored header totals and the line amounts above).
    assertJournalBalances("Bill", bill.invoiceNo, postedBillLines);

    const journal = await tx.journal.create({
      data: {
        organizationId,
        status: JournalStatus.DRAFT,
        journalDate: bill.issueDate,
        memo: `Bill ${bill.invoiceNo} - ${contactDisplayName(bill.contact)}`,
        sourceType: "bill",
        sourceId: bill.id,
        createdByUserId: actorUserId,
        lines: {
          create: postedBillLines,
        },
      },
    });

    await tx.journal.update({
      where: { id: journal.id },
      data: { status: JournalStatus.POSTED, postedByUserId: actorUserId, postedAt: new Date() },
    });

    await tx.$executeRaw`
      UPDATE bills 
      SET 
        status = 'approved'::"bill_status", 
        posted_journal_id = ${journal.id}::uuid,
        updated_at = NOW() 
      WHERE id = ${bill.id}::uuid
    `;

    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "bill",
        entityId: bill.id,
        action: AuditAction.POST,
        after: { journalId: journal.id, totalMinor: bill.totalMinor.toString() },
      },
    });

    return { documentId: bill.id, journalId: journal.id };
  });
}

export async function payBill(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  billId: string,
  paymentAccountId?: string,
  paymentMethod?: PaymentMethod
): Promise<PostingResult> {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findFirstOrThrow({
      where: { id: billId, organizationId, status: BillStatus.APPROVED },
      select: {
        id: true,
        invoiceNo: true,
        totalMinor: true,
        contactId: true,
        currency: true,
        exchangeRate: true,
        contact: { select: CONTACT_NAME_SELECT },
      },
    });

    const apAccountId = await resolveSystemAccount(tx, organizationId, payableAccount);
    const bankAccountId = paymentAccountId
      ? await resolveDepositAccount(tx, organizationId, paymentAccountId)
      : await resolveSystemAccount(tx, organizationId, bankAccount);

    const paymentDate = new Date();
    await assertPeriodOpen(tx, organizationId, paymentDate);

    // A foreign bill is settled at today's rate, but the payable was booked at
    // the rate on the day the bill was raised. The gap is a realised exchange
    // difference: paying a USD bill after the pound weakens genuinely costs more
    // pounds than the bill said, and that extra cost belongs in the P&L.
    const billOrgRow = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    const billBaseCurrency = billOrgRow?.baseCurrency ?? "GBP"; // currency:allow last-resort default
    const billFx = await computeFxSettlement(
      String(bill.currency),
      billBaseCurrency,
      Number(bill.exchangeRate ?? 1),
      bill.totalMinor,
      paymentDate
    );

    const billPaymentLines = [
      {
        organizationId,
        accountId: apAccountId,
        contactId: bill.contactId,
        // Relieve the payable at the rate it was booked at.
        debitMinor: billFx ? billFx.baseDocument : bill.totalMinor,
        creditMinor: BigInt(0),
        memo: `Clear AP for bill ${bill.invoiceNo}`,
      },
      {
        organizationId,
        accountId: bankAccountId,
        contactId: bill.contactId,
        // Cash actually leaves at today's rate.
        debitMinor: BigInt(0),
        creditMinor: billFx ? billFx.baseCash : bill.totalMinor,
        memo: `Payment made for bill ${bill.invoiceNo}`,
      },
    ];

    if (billFx && billFx.differenceMinor !== BigInt(0)) {
      // More base currency leaving than the payable carried is a loss.
      const isLoss = billFx.differenceMinor > BigInt(0);
      const magnitude = isLoss ? billFx.differenceMinor : -billFx.differenceMinor;
      const fxAccountId = await resolveSystemAccount(
        tx,
        organizationId,
        isLoss ? fxLossAccount : fxGainAccount
      );
      billPaymentLines.push({
        organizationId,
        accountId: fxAccountId,
        contactId: bill.contactId,
        debitMinor: isLoss ? magnitude : BigInt(0),
        creditMinor: isLoss ? BigInt(0) : magnitude,
        memo: `Exchange ${isLoss ? "loss" : "gain"} on bill ${bill.invoiceNo}`,
      });
    }

    assertJournalBalances("Bill payment", bill.invoiceNo, billPaymentLines);

    // Create entry as a DRAFT first to bypass the database trigger lock
    const journal = await tx.journal.create({
      data: {
        organizationId,
        status: JournalStatus.DRAFT,
        journalDate: paymentDate,
        memo: `Payment for bill ${bill.invoiceNo} - ${contactDisplayName(bill.contact)}`,
        sourceType: "bill_payment",
        sourceId: bill.id,
        paymentMethod: paymentMethod ?? null,
        createdByUserId: actorUserId,
        lines: {
          create: billPaymentLines,
        },
      },
    });

    // Finalize the journal status directly to POSTED
    await tx.journal.update({
      where: { id: journal.id },
      data: { status: JournalStatus.POSTED, postedByUserId: actorUserId, postedAt: new Date() },
    });

    // tenancy:safe: bill.id is from findFirstOrThrow with organizationId in WHERE; status-only update scoped by that pre-validated id
    await tx.$executeRaw`
      UPDATE bills
      SET
        status = 'paid'::"bill_status",
        paid_journal_id = ${journal.id}::uuid,
        paid_at = NOW(),
        updated_at = NOW()
      WHERE id = ${bill.id}::uuid
    `;

    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "bill",
        entityId: bill.id,
        action: AuditAction.POST,
        after: {
          action: "pay",
          journalId: journal.id,
          totalMinor: bill.totalMinor.toString(),
        },
      },
    });

    return { documentId: bill.id, journalId: journal.id };
  });
}

export async function createReversalJournal(
  tx: Tx,
  organizationId: string,
  actorUserId: string,
  originalJournalId: string,
  memo: string,
  sourceType: string,
  sourceId: string
) {
  const original = await tx.journal.findFirstOrThrow({
    where: {
      id: originalJournalId,
      organizationId,
      status: JournalStatus.POSTED,
    },
    include: { lines: true, trackingAssignments: true },
  });

  const existingReversal = await tx.journal.findFirst({
    where: {
      organizationId,
      reversedJournalId: original.id,
    },
    select: { id: true },
  });
  if (existingReversal) return existingReversal.id;

  /*
   * Today, unless the journal being reversed is dated later than today.
   *
   * A reversal belongs on the day it is made, which is why this is not simply
   * the original's date — reversing a months-old invoice must not reopen a
   * closed period. But it must never land *before* what it reverses, and
   * new Date() did exactly that for any document dated ahead: a credit note
   * dated the 22nd, voided on the 19th, put the reversal three days before the
   * entry it cancels.
   *
   * Between those two dates the books then hold half a transaction. Every
   * report bounded by a date shows the reversal with nothing to offset it — a
   * receivable that grows when a credit is cancelled, and a contra-revenue
   * account appearing as turnover.
   */
  const now = new Date();
  const reversalDate = original.journalDate > now ? original.journalDate : now;
  await assertPeriodOpen(tx, organizationId, reversalDate);

  // When the original journal is dated in a different period than the reversal
  // (e.g. voiding a months-old invoice after the period has been closed),
  // record the original date in the memo so the books explain themselves.
  const originalDate = original.journalDate.toISOString().slice(0, 10);
  const reversalDateLabel = reversalDate.toISOString().slice(0, 10);
  const annotatedMemo =
    originalDate !== reversalDateLabel
      ? `${memo} (original journal dated ${originalDate})`
      : memo;

  let reversalId: string;
  try {
    const reversal = await tx.journal.create({
      data: {
        organizationId,
        status: JournalStatus.DRAFT,
        journalDate: reversalDate,
        memo: annotatedMemo,
        sourceType,
        sourceId,
        reversedJournalId: original.id,
        createdByUserId: actorUserId,
        lines: {
          create: original.lines.map((line) => ({
            organizationId,
            accountId: line.accountId,
            contactId: line.contactId,
            debitMinor: line.creditMinor,
            creditMinor: line.debitMinor,
            memo: line.memo ? `Reversal: ${line.memo}` : "Reversal",
          })),
        },
      },
    });
    reversalId = reversal.id;
    if (original.trackingAssignments.length > 0) {
      await tx.journalTrackingAssignment.createMany({
        data: original.trackingAssignments.map((assignment) => ({
          organizationId,
          journalId: reversal.id,
          dimensionId: assignment.dimensionId,
          optionId: assignment.optionId,
        })),
      });
    }
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;

    const existing = await tx.journal.findFirstOrThrow({
      where: {
        organizationId,
        reversedJournalId: original.id,
      },
      select: { id: true },
    });
    return existing.id;
  }

  await tx.journal.update({
    where: { id: reversalId },
    data: { status: JournalStatus.POSTED, postedByUserId: actorUserId, postedAt: new Date() },
  });

  return reversalId;
}

export async function voidInvoice(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  invoiceId: string
): Promise<PostingResult> {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirstOrThrow({
      where: { id: invoiceId, organizationId },
    });

    const paymentJournals = await tx.journal.findMany({
      where: {
        organizationId,
        sourceType: "invoice_payment",
        sourceId: invoice.id,
        status: JournalStatus.POSTED,
        reversedJournalId: null,
      },
      select: { id: true },
    });
    for (const pj of paymentJournals) {
      await createReversalJournal(
        tx,
        organizationId,
        actorUserId,
        pj.id,
        `Reverse payment for void invoice ${invoice.invoiceNo}`,
        "invoice_payment_void",
        invoice.id
      );
    }

    let journalId: string | null = null;

    if (
      (invoice.status === InvoiceStatus.APPROVED || invoice.status === InvoiceStatus.SENT) &&
      invoice.postedJournalId
    ) {
      journalId = await createReversalJournal(
        tx,
        organizationId,
        actorUserId,
        invoice.postedJournalId,
        `Void invoice ${invoice.invoiceNo}`,
        "invoice_void",
        invoice.id
      );
    }

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.VOID },
    });
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "invoice",
        entityId: invoice.id,
        action: AuditAction.VOID,
        after: { reversalJournalId: journalId },
      },
    });

    return { documentId: invoice.id, journalId };
  });
}

/**
 * Flip an approved invoice to SENT and record an audit event. Historically
 * the "Approve & email" action flipped the status with a bare updateMany and no
 * audit trail (and sent no email). This keeps the status change but records it.
 *
 * AuditAction has no dedicated SEND value (CREATE | UPDATE | POST | VOID |
 * REVERSE | DELETE — see prisma/schema.prisma); marking an invoice sent is
 * recorded as UPDATE.
 */
export async function markInvoiceSent(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  invoiceId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirstOrThrow({
      where: { id: invoiceId, organizationId },
      select: { id: true, status: true },
    });
    if (invoice.status === InvoiceStatus.VOID || invoice.status === InvoiceStatus.DRAFT) {
      throw new Error("Only an approved invoice can be marked as sent.");
    }
    if (invoice.status === InvoiceStatus.SENT) {
      // Idempotent no-op: already sent, nothing to update and no audit noise to add.
      return;
    }
    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.SENT },
    });
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "invoice",
        entityId: invoice.id,
        action: AuditAction.UPDATE,
        after: { status: "SENT" },
      },
    });
  });
}

export async function voidBill(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  billId: string
): Promise<PostingResult> {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findFirstOrThrow({
      where: { id: billId, organizationId },
    });

    const paymentJournals = await tx.journal.findMany({
      where: {
        organizationId,
        sourceType: "bill_payment",
        sourceId: bill.id,
        status: JournalStatus.POSTED,
        reversedJournalId: null,
      },
      select: { id: true },
    });
    for (const pj of paymentJournals) {
      await createReversalJournal(
        tx,
        organizationId,
        actorUserId,
        pj.id,
        `Reverse payment for void bill ${bill.invoiceNo}`,
        "bill_payment_void",
        bill.id
      );
    }

    let journalId: string | null = null;

    if (
      (bill.status === BillStatus.APPROVED || bill.status === BillStatus.PAID) &&
      bill.postedJournalId
    ) {
      journalId = await createReversalJournal(
        tx,
        organizationId,
        actorUserId,
        bill.postedJournalId,
        `Void bill ${bill.invoiceNo}`,
        "bill_void",
        bill.id
      );
    }

    await tx.bill.update({
      where: { id: bill.id },
      data: { status: BillStatus.VOID, paidJournalId: null, paidAt: null },
    });
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "bill",
        entityId: bill.id,
        action: AuditAction.VOID,
        after: { reversalJournalId: journalId },
      },
    });

    return { documentId: bill.id, journalId };
  });
}

export async function revertBillToDraft(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  billId: string
): Promise<PostingResult> {
  return prisma.$transaction(async (tx) => {
    const bill = await tx.bill.findFirstOrThrow({
      where: { id: billId, organizationId },
    });

    if (bill.status !== BillStatus.APPROVED) {
      throw new Error("Only approved bills can be reverted to draft.");
    }

    const paymentJournals = await tx.journal.findMany({
      where: {
        organizationId,
        sourceType: "bill_payment",
        sourceId: bill.id,
        status: JournalStatus.POSTED,
        reversedJournalId: null,
      },
      select: { id: true },
    });
    for (const pj of paymentJournals) {
      await createReversalJournal(
        tx,
        organizationId,
        actorUserId,
        pj.id,
        `Reverse payment for revert bill ${bill.invoiceNo}`,
        "bill_payment_revert",
        bill.id
      );
    }

    let journalId: string | null = null;
    if (bill.postedJournalId) {
      journalId = await createReversalJournal(
        tx,
        organizationId,
        actorUserId,
        bill.postedJournalId,
        `Revert bill ${bill.invoiceNo} to draft`,
        "bill_revert",
        bill.id
      );
    }

    await tx.bill.update({
      where: { id: bill.id },
      data: {
        status: BillStatus.DRAFT,
        postedJournalId: null,
      },
    });

    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "bill",
        entityId: bill.id,
        action: AuditAction.REVERSE,
        after: { reversalJournalId: journalId },
      },
    });

    return { documentId: bill.id, journalId };
  });
}

export async function revertInvoiceToDraft(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  invoiceId: string
): Promise<PostingResult> {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirstOrThrow({
      where: { id: invoiceId, organizationId },
    });

    if (invoice.status !== InvoiceStatus.APPROVED && invoice.status !== InvoiceStatus.SENT) {
      throw new Error("Only approved or sent invoices can be reverted to draft.");
    }

    // Reverse any posted payment journals first so the bank/AR effects unwind cleanly
    const paymentJournals = await tx.journal.findMany({
      where: {
        organizationId,
        sourceType: "invoice_payment",
        sourceId: invoice.id,
        status: JournalStatus.POSTED,
        reversedJournalId: null,
      },
      select: { id: true },
    });
    for (const pj of paymentJournals) {
      await createReversalJournal(
        tx,
        organizationId,
        actorUserId,
        pj.id,
        `Reverse payment for revert invoice ${invoice.invoiceNo}`,
        "invoice_payment_revert",
        invoice.id
      );
    }

    // 1. If it was posted to the ledger, we must reverse the journal entry
    let journalId: string | null = null;
    if (invoice.postedJournalId) {
      journalId = await createReversalJournal(
        tx,
        organizationId,
        actorUserId,
        invoice.postedJournalId,
        `Revert invoice ${invoice.invoiceNo} to draft`,
        "invoice_revert",
        invoice.id
      );
    }

    // 2. Set the invoice back to draft and detach the journal
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: InvoiceStatus.DRAFT,
        postedJournalId: null,
      },
    });

    // 3. Log the audit event
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "invoice",
        entityId: invoice.id,
        action: AuditAction.REVERSE,
        after: { reversalJournalId: journalId },
      },
    });

    return { documentId: invoice.id, journalId };
  });
}

export async function payInvoice(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  invoiceId: string,
  paymentAmountMinor?: bigint,
  depositAccountId?: string,
  paymentMethod?: PaymentMethod
): Promise<PostingResult> {
  return prisma.$transaction(async (tx) => {
    // 1. Find the approved or sent invoice
    // Looked up without the status filter so an unpayable invoice can be
    // explained. findFirstOrThrow on a filtered query surfaced a raw Prisma
    // stack trace to the user — including server file paths — whenever an
    // invoice had already been settled, which is exactly what a double-submit
    // produces.
    const payable = await tx.invoice.findFirst({
      where: { id: invoiceId, organizationId },
      select: { status: true, invoiceNo: true },
    });
    if (!payable) {
      throw new Error("That invoice no longer exists.");
    }
    // There is no PAID status: a settled invoice stays APPROVED or SENT and the
    // "paid" badge is derived from its payment total. So the only unpayable
    // states here are draft and void.
    if (payable.status !== InvoiceStatus.APPROVED && payable.status !== InvoiceStatus.SENT) {
      throw new Error(
        `Invoice ${payable.invoiceNo} cannot take a payment while it is ${String(payable.status).toLowerCase()}.`
      );
    }

    const invoice = await tx.invoice.findFirstOrThrow({
      where: { 
        id: invoiceId, 
        organizationId, 
        status: { in: [InvoiceStatus.APPROVED, InvoiceStatus.SENT] } 
      },
      select: {
        id: true,
        invoiceNo: true,
        issueDate: true,
        totalMinor: true,
        baseTotalMinor: true,
        currency: true,
        exchangeRate: true,
        contactId: true,
        contact: { select: CONTACT_NAME_SELECT },
      },
    });

    const arAccountId = await resolveSystemAccount(tx, organizationId, receivableAccount);

    // Nothing stopped an already-settled invoice being paid a second time. The
    // second payment credited the receivable again and drove it negative, so
    // the customer appeared to be owed money and the aged report disagreed with
    // the trial balance. Compared in base currency, which is the only measure
    // that holds when the invoice is foreign and the two payments settled at
    // different rates.
    const invoiceBaseTotal = invoice.baseTotalMinor ?? invoice.totalMinor;
    if (invoiceBaseTotal > BigInt(0)) {
      const paidSoFar =
        (await getAmountPaidMap(tx as any, organizationId, "invoice_payment", arAccountId)).get(
          invoice.id
        ) ?? BigInt(0);
      if (paidSoFar >= invoiceBaseTotal) {
        throw new Error(
          `Invoice ${invoice.invoiceNo} is already paid in full. Void or revert the existing ` +
            `payment first if it needs correcting.`
        );
      }
    }

    const bankAccountId = depositAccountId
      ? await resolveDepositAccount(tx, organizationId, depositAccountId)
      : await resolveSystemAccount(tx, organizationId, bankAccount);

    // If no custom amount was sent, default to paying off the full total
    const amountToPay = paymentAmountMinor ?? invoice.totalMinor;

    // A payment may not be dated before the invoice it settles. The invoice is
    // dated on the user's own calendar while this runs on the server's, so a
    // customer paying on the day of issue could post a payment dated the day
    // before — which relieved a receivable the books had not yet raised, and
    // left "as at today" reports showing a negative receivable and no revenue.
    const serverToday = new Date();
    const paymentDate =
      invoice.issueDate > serverToday ? new Date(invoice.issueDate) : serverToday;
    await assertPeriodOpen(tx, organizationId, paymentDate);

    // A foreign invoice is settled at today's rate, but the receivable was
    // booked at the rate on the day it was raised. The gap is a realised
    // exchange difference: the business genuinely has more or fewer pounds than
    // the invoice said. Leaving it in the receivable would misstate what
    // customers still owe, so it goes to the P&L.
    const invoiceOrgRow = await tx.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    const invoiceBaseCurrency = invoiceOrgRow?.baseCurrency ?? "GBP"; // currency:allow last-resort default
    const invoiceFx = await computeFxSettlement(
      String(invoice.currency),
      invoiceBaseCurrency,
      Number(invoice.exchangeRate ?? 1),
      amountToPay,
      paymentDate
    );

    // A payment smaller than one minor unit of the base currency cannot be
    // recorded: it converts to zero, and a journal with no value is rejected.
    // Refusing it with an explanation beats "journal has zero total", which
    // says nothing about why. At 3,547 shillings to the pound this is any
    // amount under about TSh 18.
    if (invoiceFx && invoiceFx.baseDocument === BigInt(0)) {
      throw new Error(
        `That amount is too small to record: it is worth less than 0.01 ${invoiceBaseCurrency}. ` +
          `Either the invoice is already settled, or the remaining balance is a rounding difference.`
      );
    }

    const paymentLines = [
      {
        organizationId,
        accountId: bankAccountId,
        contactId: invoice.contactId,
        // Cash actually arrives at today's rate.
        debitMinor: invoiceFx ? invoiceFx.baseCash : amountToPay,
        creditMinor: BigInt(0),
        memo: `Payment received for invoice ${invoice.invoiceNo}`,
      },
      {
        organizationId,
        accountId: arAccountId,
        contactId: invoice.contactId,
        // Relieve the receivable at the rate it was booked at.
        debitMinor: BigInt(0),
        creditMinor: invoiceFx ? invoiceFx.baseDocument : amountToPay,
        memo: `Clear AR for invoice ${invoice.invoiceNo}`,
      },
    ];

    if (invoiceFx && invoiceFx.differenceMinor !== BigInt(0)) {
      // More base currency arriving than the receivable carried is a gain.
      const isGain = invoiceFx.differenceMinor > BigInt(0);
      const magnitude = isGain ? invoiceFx.differenceMinor : -invoiceFx.differenceMinor;
      const fxAccountId = await resolveSystemAccount(
        tx,
        organizationId,
        isGain ? fxGainAccount : fxLossAccount
      );
      paymentLines.push({
        organizationId,
        accountId: fxAccountId,
        contactId: invoice.contactId,
        debitMinor: isGain ? BigInt(0) : magnitude,
        creditMinor: isGain ? magnitude : BigInt(0),
        memo: `Exchange ${isGain ? "gain" : "loss"} on invoice ${invoice.invoiceNo}`,
      });
    }

    assertJournalBalances("Invoice payment", invoice.invoiceNo, paymentLines);

    // 2. Draft the payment ledger to bring cash in and clear Accounts Receivable
    const journal = await tx.journal.create({
      data: {
        organizationId,
        status: JournalStatus.DRAFT,
        journalDate: paymentDate,
        memo: `Payment received for invoice ${invoice.invoiceNo} - ${contactDisplayName(invoice.contact)}`,
        sourceType: "invoice_payment",
        sourceId: invoice.id,
        paymentMethod: paymentMethod ?? null,
        createdByUserId: actorUserId,
        lines: {
          create: paymentLines,
        },
      },
    });

    // 3. Post it cleanly to avoid trigger constraints
    await tx.journal.update({
      where: { id: journal.id },
      data: { status: JournalStatus.POSTED, postedByUserId: actorUserId, postedAt: new Date() },
    });

    // 4. Log the audit event
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorUserId,
        entityType: "invoice",
        entityId: invoice.id,
        action: AuditAction.POST,
        after: {
          action: "pay",
          journalId: journal.id,
          totalMinor: invoice.totalMinor.toString(),
        },
      },
    });

    return { documentId: invoice.id, journalId: journal.id };
  });
}

export type BulkPayResult = {
  invoiceId: string;
  status: "paid" | "skipped" | "failed";
  /**
   * True when this payment cleared the invoice's whole outstanding balance.
   * `status: "paid"` alone only means a payment was recorded — partial payments
   * are also "paid" — so callers that care about settlement must check this.
   */
  settled?: boolean;
  reason?: string;
  journalId?: string;
};

export type BulkPayItem = {
  invoiceId: string;
  amountMinor: number;
  depositAccountId?: string;
};

/**
 * Record payment for many invoices in one pass. Each invoice is settled
 * independently via `payInvoice` (its own transaction) — one failure never
 * aborts the others. Non-payable invoices (not APPROVED/SENT, or zero balance)
 * are skipped; a non-finite amount, amount <= 0, or amount above the
 * outstanding balance fails that item only. The paid snapshot is refreshed as
 * we go, so a repeated invoiceId within one batch cannot double-pay. Auth and
 * org-scoping are the caller's responsibility (the server action passes an
 * already-resolved organizationId/actorUserId).
 */
export async function runBulkInvoicePayments(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  items: BulkPayItem[],
  paymentMethod?: PaymentMethod
): Promise<BulkPayResult[]> {
  const method =
    paymentMethod && (["cash", "cheque", "bank_transfer"] as const).includes(paymentMethod)
      ? paymentMethod
      : undefined;

  const ids = items.map((i) => i.invoiceId);
  const invoices = await prisma.invoice.findMany({
    where: { id: { in: ids }, organizationId },
    select: { id: true, status: true, totalMinor: true },
  });
  const byId = new Map(invoices.map((inv) => [inv.id, inv]));
  const paidMap = await getAmountPaidMap(prisma, organizationId, "invoice_payment");

  const results: BulkPayResult[] = [];
  for (const item of items) {
    const inv = byId.get(item.invoiceId);
    if (!inv) {
      results.push({ invoiceId: item.invoiceId, status: "skipped", reason: "not found" });
      continue;
    }
    if (inv.status !== InvoiceStatus.APPROVED && inv.status !== InvoiceStatus.SENT) {
      results.push({
        invoiceId: item.invoiceId,
        status: "skipped",
        reason: `not payable (${String(inv.status).toLowerCase()})`,
      });
      continue;
    }
    const paid = paidMap.get(inv.id) ?? BigInt(0);
    const outstanding = inv.totalMinor - paid;
    if (outstanding <= BigInt(0)) {
      results.push({ invoiceId: item.invoiceId, status: "skipped", reason: "already paid" });
      continue;
    }
    if (!Number.isFinite(item.amountMinor)) {
      results.push({ invoiceId: item.invoiceId, status: "failed", reason: "invalid amount" });
      continue;
    }
    const amount = BigInt(Math.round(item.amountMinor));
    if (amount <= BigInt(0) || amount > outstanding) {
      results.push({ invoiceId: item.invoiceId, status: "failed", reason: "amount exceeds balance" });
      continue;
    }
    try {
      const r = await payInvoice(
        prisma,
        organizationId,
        actorUserId,
        item.invoiceId,
        amount,
        item.depositAccountId,
        method
      );
      paidMap.set(inv.id, paid + amount); // keep the snapshot fresh for repeated ids in this batch
      results.push({
        invoiceId: item.invoiceId,
        status: "paid",
        settled: amount === outstanding,
        journalId: r.journalId ?? undefined,
      });
    } catch (e) {
      results.push({
        invoiceId: item.invoiceId,
        status: "failed",
        reason: e instanceof Error ? e.message : "payment failed",
      });
    }
  }

  return results;
}
