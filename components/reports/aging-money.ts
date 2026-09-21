/**
 * Money as an aged report has to print it, negatives included.
 *
 * The aging tables assumed every figure was positive: amounts were rendered as
 * symbol-then-number and any bucket at or below zero collapsed to a dash. Once
 * credit notes and payments on account entered the report that stopped holding
 * — a customer in credit produced "£-10.00", and a negative bucket showed a
 * dash beside a negative total, which reads as a bug rather than a credit.
 *
 * The minus goes before the symbol, and it is U+2212 rather than a hyphen so it
 * lines up with the digits in a proportional font.
 */
export function agingMoney(value: number, symbol: string): string {
  const rounded = Math.round(value * 100) / 100;
  const sign = rounded < 0 ? "−" : "";
  return `${sign}${symbol}${Math.abs(rounded).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** The same, but an exact zero prints as a dash — for the ageing buckets. */
export function agingBucket(value: number, symbol: string): string {
  return Math.round(value * 100) === 0 ? "—" : agingMoney(value, symbol);
}
