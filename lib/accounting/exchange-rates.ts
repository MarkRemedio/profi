import "server-only";

import { prisma } from "@/lib/prisma";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/currency";

/**
 * Exchange rates for foreign-currency documents.
 *
 * Rates come from Frankfurter (api.frankfurter.dev), which aggregates published
 * central bank rates — Bank of England for GBP, Bank of Tanzania for TZS, and so
 * on. Domestic central bank sources matter here: a tax authority expects the
 * rate its own central bank published, not a third party's cross-rate.
 *
 * Deliberately v2. The v1 endpoint serves only the 30-currency ECB reference
 * set, which has no TZS — half the reason this project exists.
 *
 * Rates are published once per business day, not intraday. That is the correct
 * granularity for books: two invoices raised minutes apart must use the same
 * rate, or nothing reconciles against a bank statement and no figure can be
 * reproduced at audit. The API rolls weekends back to the last published day,
 * which is also what accounting standards expect.
 *
 * Nothing here is allowed to block a user. Every failure returns null so the
 * caller falls back to a typed rate — a free service with no SLA must never
 * stand between someone and raising an invoice.
 */

const API_BASE = "https://api.frankfurter.dev/v2";

/** Give up rather than hang a form waiting on a third party. */
const FETCH_TIMEOUT_MS = 4000;

export type RateLookup = {
  /** Units of the workspace's currency per 1 unit of the document currency. */
  rate: number;
  /** The date the rate was actually published, which may predate the request. */
  rateDate: string;
  source: "api" | "cache";
};

/** yyyy-mm-dd in local time; the accounting date, not a UTC instant. */
function isoDate(value: Date) {
  return [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-");
}

function isSupported(code: string): code is CurrencyCode {
  return (CURRENCY_CODES as readonly string[]).includes(code);
}

/**
 * Look up the rate to convert `from` into `to` on a given date.
 *
 * The result is expressed so that `baseAmount = documentAmount * rate`, which
 * keeps every call site to a single multiplication and removes any chance of
 * inverting the conversion by accident.
 *
 * Returns null when the pair is unsupported, the service is unreachable, or the
 * response is malformed. Callers must handle null by asking for a rate.
 */
export async function fetchExchangeRate(
  from: string,
  to: string,
  onDate: Date = new Date()
): Promise<RateLookup | null> {
  if (from === to) return { rate: 1, rateDate: isoDate(onDate), source: "cache" };
  if (!isSupported(from) || !isSupported(to)) return null;

  const requestedDate = isoDate(onDate);

  const cached = await prisma.exchangeRate.findFirst({
    where: { baseCurrency: from, quoteCurrency: to, rateDate: new Date(requestedDate) },
    select: { rate: true, rateDate: true },
  });
  if (cached) {
    return {
      rate: Number(cached.rate),
      rateDate: isoDate(cached.rateDate),
      source: "cache",
    };
  }

  const direct = await requestRate(requestedDate, from, to);

  // Rates are published to a fixed number of significant figures, so the
  // direction matters for weak currencies. TZS->GBP comes back as 0.00028 —
  // five figures — while GBP->TZS is 3547.83, which inverts to 0.000281862.
  // On TSh 1,000,000 that is the difference between GBP 280.00 and GBP 281.86.
  // Whenever the direct rate is below 1, ask the other way round and invert.
  let parsed = direct;
  if (!parsed || parsed.rate < 1) {
    const inverse = await requestRate(requestedDate, to, from);
    if (inverse && inverse.rate > 0) {
      const derived = { rate: 1 / inverse.rate, rateDate: inverse.rateDate };
      if (!parsed || derived.rate > 0) parsed = derived;
    }
  }
  if (!parsed) return null;

  // Cached against the date requested, not the date returned: asking for the
  // same Sunday twice should not re-hit the API just because it answers Friday.
  await prisma.exchangeRate
    .create({
      data: {
        baseCurrency: from,
        quoteCurrency: to,
        rateDate: new Date(requestedDate),
        publishedDate: new Date(parsed.rateDate),
        rate: parsed.rate,
      },
    })
    .catch(() => {
      // A concurrent request won the unique constraint. Harmless.
    });

  return { rate: parsed.rate, rateDate: parsed.rateDate, source: "api" };
}


/** One request/parse round trip. Returns null on any failure, never throws. */
async function requestRate(
  date: string,
  base: string,
  quote: string
): Promise<{ rate: number; rateDate: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const response = await fetch(
      `${API_BASE}/rates?date=${date}&base=${base}&quotes=${quote}`,
      { signal: controller.signal, headers: { accept: "application/json" } }
    );
    clearTimeout(timer);
    if (!response.ok) return null;
    return parseRatePayload(await response.json(), quote);
  } catch {
    // Offline, timed out, or the service is down — the caller asks for a rate.
    return null;
  }
}

/**
 * Frankfurter v2 returns a list of {date, base, quote, rate} rows. Parsed
 * defensively: a third-party shape change must degrade to manual entry rather
 * than write a wrong number into the ledger.
 */
function parseRatePayload(payload: unknown, quote: string): { rate: number; rateDate: string } | null {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { rates?: unknown })?.rates)
      ? ((payload as { rates: unknown[] }).rates)
      : null;
  if (!rows) return null;

  const match = rows.find(
    (row) => typeof row === "object" && row !== null && (row as { quote?: string }).quote === quote
  ) as { rate?: unknown; date?: unknown } | undefined;
  if (!match) return null;

  const rate = Number(match.rate);
  if (!Number.isFinite(rate) || rate <= 0) return null;

  const rateDate = typeof match.date === "string" ? match.date : null;
  if (!rateDate) return null;

  return { rate, rateDate };
}

/**
 * Convert an amount in minor units to the workspace's currency.
 *
 * Rounded half-up to whole minor units. Rounding must happen once, at the
 * document total, rather than per line — rounding each line and summing drifts
 * from the true converted total and leaves journals a penny out of balance.
 */
export function convertMinor(minor: number | bigint, rate: number): bigint {
  return BigInt(Math.round(Number(minor) * rate));
}

type ConvertibleLine = { debitMinor: bigint; creditMinor: bigint };

/**
 * Convert a set of journal lines into the workspace's currency.
 *
 * Converting each line independently and rounding each one almost always leaves
 * the journal a minor unit or two out of balance, because the rounding errors do
 * not cancel. assertJournalBalances would then reject a posting that is
 * arithmetically correct.
 *
 * So the control line — receivable or payable — is anchored to the converted
 * document total, which is the amount actually owed and is what gets stored on
 * the document. Every other line is converted individually, and whatever
 * residual remains is absorbed by the largest of them, where a sub-unit
 * adjustment is least material.
 *
 * @param lines        Journal lines in document currency; `anchorIndex` is the control line.
 * @param rate         Units of base currency per 1 unit of document currency.
 * @param baseTotal    The converted document total, computed once by convertMinor.
 * @param anchorIndex  Which line carries the document total.
 */
export function convertJournalLines<T extends ConvertibleLine>(
  lines: T[],
  rate: number,
  baseTotal: bigint,
  anchorIndex = 0
): T[] {
  if (rate === 1) return lines;

  const converted = lines.map((line, index) => {
    if (index === anchorIndex) {
      // The control side is the total, so it takes the already-rounded figure
      // rather than being re-derived.
      return {
        ...line,
        debitMinor: line.debitMinor > BigInt(0) ? baseTotal : BigInt(0),
        creditMinor: line.creditMinor > BigInt(0) ? baseTotal : BigInt(0),
      };
    }
    return {
      ...line,
      debitMinor: convertMinor(line.debitMinor, rate),
      creditMinor: convertMinor(line.creditMinor, rate),
    };
  });

  // A small amount at a small rate converts to nothing: a TZS 12.00 discount at
  // 0.000282 is 0.0034 base minor units, which rounds to zero on both sides.
  // The ledger rejects such a line outright — journal_lines_one_sided_amount_chk
  // requires exactly one side to carry a value — so it is dropped instead. The
  // amount it represented is picked up by the residual adjustment below, which
  // keeps the journal balanced.
  const meaningful = converted.filter(
    (line, index) =>
      index === anchorIndex || line.debitMinor !== BigInt(0) || line.creditMinor !== BigInt(0)
  );

  const sum = (pick: (line: T) => bigint) =>
    meaningful.reduce((total, line) => total + pick(line), BigInt(0));
  const residual = sum((l) => l.debitMinor) - sum((l) => l.creditMinor);
  if (residual === BigInt(0)) return meaningful;

  // Absorb the residual into the largest non-anchor line, on whichever side it
  // already carries an amount, so the correction never flips a debit to a credit.
  let target = -1;
  let largest = BigInt(-1);
  meaningful.forEach((line, index) => {
    if (index === anchorIndex) return;
    const magnitude = line.debitMinor > line.creditMinor ? line.debitMinor : line.creditMinor;
    if (magnitude > largest) {
      largest = magnitude;
      target = index;
    }
  });
  if (target === -1) return meaningful;

  const line = meaningful[target];
  if (line.creditMinor > BigInt(0)) {
    meaningful[target] = { ...line, creditMinor: line.creditMinor + residual };
  } else {
    meaningful[target] = { ...line, debitMinor: line.debitMinor - residual };
  }

  return meaningful;
}

/** Account codes for the two sides of a realised exchange difference. */
export const fxGainAccount = { code: "4950", accountType: "REVENUE" as const };
export const fxLossAccount = { code: "6200", accountType: "EXPENSE" as const };

export type FxSettlement = {
  /** Cash actually received or paid, in base currency, at today's rate. */
  baseCash: bigint;
  /** Receivable or payable relieved, in base currency, at the document's rate. */
  baseDocument: bigint;
  /** Positive means a gain, negative a loss, zero means no FX line is needed. */
  differenceMinor: bigint;
  settlementRate: number;
};

/**
 * Work out the realised exchange difference on settling a foreign document.
 *
 * A receivable is booked at the rate on the day the invoice was raised. When it
 * is paid weeks later the rate has usually moved, so the cash arriving is worth
 * a different amount in base currency than the receivable being cleared. That
 * gap is real money — the business genuinely has more or fewer pounds than the
 * invoice said — and it belongs in the P&L rather than being buried in the
 * receivable, where it would quietly misstate what customers still owe.
 *
 * Returns null when the document is already in the workspace's currency, or when
 * no rate can be found — in which case the caller settles at the document's own
 * rate and no difference arises.
 */
export async function computeFxSettlement(
  documentCurrency: string,
  baseCurrency: string,
  documentRate: number,
  amountMinor: bigint,
  onDate: Date = new Date()
): Promise<FxSettlement | null> {
  if (documentCurrency === baseCurrency) return null;

  const today = await fetchExchangeRate(documentCurrency, baseCurrency, onDate);
  // Without a settlement rate there is no basis for a difference. Settling at
  // the document's own rate is the conservative choice: it books no gain or
  // loss rather than inventing one from a guessed rate.
  if (!today) return null;

  const baseCash = convertMinor(amountMinor, today.rate);
  const baseDocument = convertMinor(amountMinor, documentRate);

  return {
    baseCash,
    baseDocument,
    differenceMinor: baseCash - baseDocument,
    settlementRate: today.rate,
  };
}
