/**
 * Rule-based feed↔journal matching. Pure port of backend/banking/matching.py.
 * Score out of 100: amount (0-50) + date (0-30) + description (0-20).
 */

const NOISE = new Set([
  "THE", "LTD", "LIMITED", "PLC", "AND", "FOR", "REF",
  "PAY", "PAYMENT", "TRF", "TRANSFER",
]);

function tokenize(text: string): Set<string> {
  const words = (text.toUpperCase().match(/[A-Z]{3,}/g) ?? []);
  return new Set(words.filter((w) => !NOISE.has(w)));
}

export function scoreAmount(feedMinor: number, journalMinor: number): number {
  if (feedMinor === 0 && journalMinor === 0) return 0;
  if (feedMinor === journalMinor) return 50;
  const larger = Math.max(Math.abs(feedMinor), Math.abs(journalMinor));
  if (larger === 0) return 0;
  const diffPct = Math.abs(feedMinor - journalMinor) / larger;
  if (diffPct <= 0.05) return 30;
  if (diffPct <= 0.1) return 15;
  if (diffPct <= 0.2) return 5;
  return 0;
}

export function scoreDate(feedDate: Date, journalDate: Date): number {
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.abs(Math.round((feedDate.getTime() - journalDate.getTime()) / dayMs));
  if (diff === 0) return 30;
  if (diff <= 1) return 20;
  if (diff <= 3) return 10;
  if (diff <= 7) return 5;
  return 0;
}

export function scoreDescription(feedDesc: string, journalMemo: string | null): number {
  if (!journalMemo) return 0;
  const feed = tokenize(feedDesc);
  const memo = tokenize(journalMemo);
  if (feed.size === 0 || memo.size === 0) return 0;
  const overlap = [...feed].filter((t) => memo.has(t)).length;
  const union = new Set([...feed, ...memo]).size;
  return Math.round((overlap / union) * 20);
}

export function matchScore(args: {
  feedAmountMinor: number;
  feedDate: Date;
  feedDescription: string;
  journalAmountMinor: number;
  journalDate: Date;
  journalMemo: string | null;
}): number {
  return (
    scoreAmount(args.feedAmountMinor, args.journalAmountMinor) +
    scoreDate(args.feedDate, args.journalDate) +
    scoreDescription(args.feedDescription, args.journalMemo)
  );
}
