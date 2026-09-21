/**
 * UK VAT number shape rules.
 *
 * Deliberately free of `server-only` so the onboarding wizard and settings form
 * can apply the same rule the server does. Duplicating "what a VAT number looks
 * like" in a client component is how the two drift apart — one accepting what
 * the other rejects.
 *
 * Format only. Whether a number is actually registered is a question for HMRC,
 * answered in lib/tax/hmrc-vat.ts.
 */

/**
 * Strip everything HMRC does not want: spaces, punctuation and the GB prefix
 * people habitually type.
 */
export function normaliseVatNumber(raw: string): string {
  return raw.toUpperCase().replace(/^GB/, "").replace(/[^0-9]/g, "");
}

/**
 * A UK VAT number is 9 digits, or 12 for a branch registration.
 *
 * Says nothing about whether it is registered — 123456789 is well-formed and
 * belongs to nobody.
 */
export function isPlausibleVatNumber(raw: string): boolean {
  const digits = normaliseVatNumber(raw);
  return digits.length === 9 || digits.length === 12;
}
