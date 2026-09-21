import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { toCurrencyCode } from "@/lib/currency";
import { accountingToday } from "@/lib/accounting/accounting-today";
import { currentFinancialYear } from "@/lib/accounting/financial-year";
import { getAmountPaidMap } from "@/lib/accounting/payments";
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
import {
  fetchExchangeRate,
  fxGainAccount,
  fxLossAccount,
} from "@/lib/accounting/exchange-rates";

/** Receivable and payable control accounts, which payments are measured against. */
const AR_CODE = "1100";
const AP_CODE = "2000";

/**
 * Foreign exchange gains and losses.
 *
 * Two different things, and the page keeps them apart because only one of them
 * is in the books.
 *
 * Realised differences are already posted. When a euro invoice is settled at a
 * rate other than the one it was raised at, the shortfall or surplus goes to
 * Foreign Exchange Gain or Loss at the moment of payment — so these figures are
 * read straight from the ledger and are exact.
 *
 * Unrealised differences are not posted at all. An invoice still outstanding
 * has moved in value since it was raised, but nothing is recorded until it is
 * paid. Those are calculated here by revaluing what is still owed at today's
 * rate, which is what a period-end revaluation would post. They are an
 * indication, not an entry.
 */

export type FxRealisedRow = {
  id: string;
  journalId: string;
  journalDate: string;
  label: string;
  reference: string | null;
  /** Signed: positive is a gain, negative a loss. */
  amountMinor: number;
};

export type FxOpenItemRow = {
  id: string;
  kind: "invoice" | "bill";
  reference: string;
  contactName: string;
  currency: string;
  /** Still outstanding, in the document's own currency. */
  outstandingDocMinor: number;
  /** The rate the document was raised at. */
  documentRate: number;
  /** Today's rate, or null when it could not be fetched. */
  currentRate: number | null;
  /** What the outstanding amount is carried at in the books. */
  bookedBaseMinor: number;
  /** What it would be worth at today's rate. */
  revaluedBaseMinor: number | null;
  /** Signed: positive is a gain if settled today, negative a loss. */
  unrealisedMinor: number | null;
};

export type ForexData = {
  today: string;
  baseCurrency: string;
  multicurrencyEnabled: boolean;
  period: { fromDate: string; toDate: string; label: string };
  realised: {
    gainMinor: number;
    lossMinor: number;
    netMinor: number;
    rows: FxRealisedRow[];
  };
  unrealised: {
    netMinor: number;
    rows: FxOpenItemRow[];
    /** Currencies whose rate could not be fetched, so nothing was revalued. */
    unavailableCurrencies: string[];
  };
  rates: Array<{ code: string; rate: number; rateDate: string }>;
  /** Whether the chart has the accounts settlement differences post to. */
  fxAccounts: Array<{ code: string; name: string }>;
};

export async function getForex(organizationId: string): Promise<ForexData> {
  const today = accountingToday();

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrency: true, multicurrencyEnabled: true, accountingPeriodEnd: true },
  });

  const baseCurrency = org?.baseCurrency ?? "GBP"; // currency:allow falls back to the column default
  const financialYear = currentFinancialYear(org?.accountingPeriodEnd ?? null, today);
  const fromDate = financialYear?.startDate ?? `${today.slice(0, 4)}-01-01`;
  const toDate = financialYear?.endDate ?? `${today.slice(0, 4)}-12-31`;

  const [fxAccounts, realisedRows, openItems] = await Promise.all([
    prisma.chartAccount.findMany({
      where: {
        organizationId,
        code: { in: [fxGainAccount.code, fxLossAccount.code] },
        isActive: true,
      },
      select: { code: true, name: true },
      orderBy: { code: "asc" },
    }),
    fetchRealised(organizationId, fromDate, toDate),
    fetchOpenForeignItems(organizationId, baseCurrency),
  ]);

  const gainMinor = realisedRows
    .filter((row) => row.amountMinor > 0)
    .reduce((total, row) => total + row.amountMinor, 0);
  const lossMinor = realisedRows
    .filter((row) => row.amountMinor < 0)
    .reduce((total, row) => total + Math.abs(row.amountMinor), 0);

  const revalued = await revalueOpenItems(openItems, baseCurrency);

  return {
    today,
    baseCurrency,
    multicurrencyEnabled: org?.multicurrencyEnabled ?? false,
    period: {
      fromDate,
      toDate,
      label: financialYear ? "financial year" : "calendar year",
    },
    realised: {
      gainMinor,
      lossMinor,
      netMinor: gainMinor - lossMinor,
      rows: realisedRows,
    },
    unrealised: revalued,
    rates: revalued.rates,
    fxAccounts,
  };
}

/**
 * Settlement differences already posted to the ledger.
 *
 * The gain account is revenue and the loss account an expense, so the sign is
 * taken from each rather than from the raw debit and credit — a credit to the
 * gain account and a debit to the loss account both increase their balance.
 */
async function fetchRealised(
  organizationId: string,
  fromDate: string,
  toDate: string
): Promise<FxRealisedRow[]> {
  // tenancy:safe: SQL filters by gle.org_id = organizationId in the WHERE clause; the type block pushes it beyond the 12-line lint window
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      journal_id: string;
      journal_date: Date;
      account_code: string;
      journal_memo: string | null;
      line_memo: string | null;
      invoice_no: string | null;
      bill_no: string | null;
      debit_minor: bigint;
      credit_minor: bigint;
    }>
  >`
    select
      gle.id, gle.journal_id, gle.journal_date, gle.account_code,
      gle.journal_memo, gle.line_memo,
      i.invoice_no, b.invoice_no as bill_no,
      gle.debit_minor, gle.credit_minor
    from general_ledger_entries gle
    left join invoices i on gle.source_id = i.id and gle.org_id = i.org_id
    left join bills b on gle.source_id = b.id and gle.org_id = b.org_id
    where gle.org_id = ${organizationId}::uuid
      and gle.account_code in (${fxGainAccount.code}, ${fxLossAccount.code})
      and gle.journal_date >= ${fromDate}::date
      and gle.journal_date <= ${toDate}::date
    order by gle.journal_date desc, gle.id desc
  `;

  return rows.map((row) => {
    const debit = Number(row.debit_minor);
    const credit = Number(row.credit_minor);
    const isGain = row.account_code === fxGainAccount.code;

    return {
      id: row.id,
      journalId: row.journal_id,
      journalDate: row.journal_date.toISOString().slice(0, 10),
      label: row.line_memo ?? row.journal_memo ?? (isGain ? "Exchange gain" : "Exchange loss"),
      reference: row.invoice_no ?? row.bill_no ?? null,
      amountMinor: isGain ? credit - debit : -(debit - credit),
    };
  });
}

type OpenItem = {
  id: string;
  kind: "invoice" | "bill";
  reference: string;
  contactName: string;
  currency: string;
  documentRate: number;
  outstandingBaseMinor: number;
};

/**
 * Foreign-currency invoices and bills that are still outstanding.
 *
 * Only these can still move: once a document is settled its difference is
 * realised and already in the ledger.
 *
 * How much is left comes from getAmountPaidMap rather than from a query of my
 * own. That helper measures against the receivable or payable relieved — not
 * the cash moved, which differs on a foreign document — and it drops payments
 * that have been reversed. Recomputing either rule here would be a second
 * definition of "paid" to keep in step with the first.
 */
async function fetchOpenForeignItems(
  organizationId: string,
  baseCurrency: string
): Promise<OpenItem[]> {
  const [arAccount, apAccount] = await Promise.all([
    prisma.chartAccount.findFirst({
      where: { organizationId, code: AR_CODE },
      select: { id: true },
    }),
    prisma.chartAccount.findFirst({
      where: { organizationId, code: AP_CODE },
      select: { id: true },
    }),
  ]);

  // organizations.base_currency is a plain text column, so it can in principle
  // hold something the CurrencyCode enum does not know. Passing that straight
  // into an enum filter makes Prisma throw and takes the page down; normalising
  // first means the worst case is filtering against the default.
  const baseCode = toCurrencyCode(baseCurrency);

  const [invoices, bills, invoicePaid, billPaid] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        organizationId,
        status: { in: ["APPROVED", "SENT"] },
        NOT: { currency: baseCode },
      },
      select: {
        id: true,
        invoiceNo: true,
        currency: true,
        exchangeRate: true,
        baseTotalMinor: true,
        contact: { select: CONTACT_NAME_SELECT },
      },
    }),
    prisma.bill.findMany({
      where: {
        organizationId,
        status: "APPROVED",
        NOT: { currency: baseCode },
      },
      select: {
        id: true,
        invoiceNo: true,
        currency: true,
        exchangeRate: true,
        baseTotalMinor: true,
        contact: { select: CONTACT_NAME_SELECT },
      },
    }),
    getAmountPaidMap(prisma, organizationId, "invoice_payment", arAccount?.id),
    getAmountPaidMap(prisma, organizationId, "bill_payment", apAccount?.id),
  ]);

  const items: OpenItem[] = [];

  const add = (
    kind: "invoice" | "bill",
    document: {
      id: string;
      invoiceNo: string;
      currency: string;
      exchangeRate: Prisma.Decimal;
      baseTotalMinor: bigint;
      contact: Parameters<typeof contactDisplayName>[0];
    },
    paid: bigint
  ) => {
    const outstandingBaseMinor = Number(document.baseTotalMinor) - Number(paid);
    // A settled document has nothing left to revalue, and an overpaid one is a
    // data problem for the payments screen rather than an exchange difference.
    if (outstandingBaseMinor <= 0) return;

    items.push({
      id: document.id,
      kind,
      reference: document.invoiceNo,
      contactName: contactDisplayName(document.contact),
      currency: document.currency,
      documentRate: Number(document.exchangeRate),
      outstandingBaseMinor,
    });
  };

  for (const invoice of invoices) {
    add("invoice", invoice, invoicePaid.get(invoice.id) ?? BigInt(0));
  }
  for (const bill of bills) {
    add("bill", bill, billPaid.get(bill.id) ?? BigInt(0));
  }

  return items;
}

/**
 * Revalue what is still outstanding at today's rate.
 *
 * The outstanding amount is held in base currency, so it is converted back at
 * the document's own rate to recover what is owed in the original currency,
 * then forward again at today's. A document whose rate is missing or zero is
 * skipped rather than divided by, which would produce an infinity.
 */
async function revalueOpenItems(
  items: OpenItem[],
  baseCurrency: string
): Promise<ForexData["unrealised"] & { rates: ForexData["rates"] }> {
  const currencies = [...new Set(items.map((item) => item.currency))];

  const lookups = await Promise.all(
    currencies.map(async (currency) => ({
      currency,
      lookup: await fetchExchangeRate(currency, baseCurrency).catch(() => null),
    }))
  );

  const rateByCurrency = new Map(lookups.map((entry) => [entry.currency, entry.lookup]));
  const unavailableCurrencies = lookups
    .filter((entry) => !entry.lookup)
    .map((entry) => entry.currency);

  const rows: FxOpenItemRow[] = items.map((item) => {
    const lookup = rateByCurrency.get(item.currency) ?? null;
    const usable = item.documentRate > 0;

    const outstandingDocMinor = usable
      ? Math.round(item.outstandingBaseMinor / item.documentRate)
      : 0;
    const revaluedBaseMinor =
      usable && lookup ? Math.round(outstandingDocMinor * lookup.rate) : null;

    return {
      id: item.id,
      kind: item.kind,
      reference: item.reference,
      contactName: item.contactName,
      currency: item.currency,
      outstandingDocMinor,
      documentRate: item.documentRate,
      currentRate: lookup?.rate ?? null,
      bookedBaseMinor: item.outstandingBaseMinor,
      revaluedBaseMinor,
      // A receivable worth more is a gain; a payable worth more is a loss,
      // because the amount owed has grown.
      unrealisedMinor:
        revaluedBaseMinor === null
          ? null
          : item.kind === "invoice"
            ? revaluedBaseMinor - item.outstandingBaseMinor
            : item.outstandingBaseMinor - revaluedBaseMinor,
    };
  });

  return {
    netMinor: rows.reduce((total, row) => total + (row.unrealisedMinor ?? 0), 0),
    rows,
    unavailableCurrencies,
    rates: lookups
      .filter((entry) => entry.lookup)
      .map((entry) => ({
        code: entry.currency,
        rate: entry.lookup!.rate,
        rateDate: entry.lookup!.rateDate,
      })),
  };
}
