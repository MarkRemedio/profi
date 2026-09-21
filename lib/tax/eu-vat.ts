/**
 * EU VAT number prefixes.
 *
 * A VAT number carries the country that issued it in its first two letters, so
 * a customer's number tells you where they are registered without needing a
 * country field on the contact — which this product does not have.
 *
 * Greece is the odd one out: its ISO code is GR but its VAT numbers use EL.
 * Northern Ireland is XI, introduced after Brexit so NI businesses could keep
 * trading goods with the EU under the Windsor Framework.
 */

export const EU_VAT_COUNTRIES: Record<string, string> = {
  AT: "Austria",
  BE: "Belgium",
  BG: "Bulgaria",
  CY: "Cyprus",
  CZ: "Czechia",
  DE: "Germany",
  DK: "Denmark",
  EE: "Estonia",
  EL: "Greece",
  ES: "Spain",
  FI: "Finland",
  FR: "France",
  HR: "Croatia",
  HU: "Hungary",
  IE: "Ireland",
  IT: "Italy",
  LT: "Lithuania",
  LU: "Luxembourg",
  LV: "Latvia",
  MT: "Malta",
  NL: "Netherlands",
  PL: "Poland",
  PT: "Portugal",
  RO: "Romania",
  SE: "Sweden",
  SI: "Slovenia",
  SK: "Slovakia",
};

/** Northern Ireland, which trades goods with the EU under EU VAT rules. */
export const NORTHERN_IRELAND_PREFIX = "XI";

/**
 * The EU country a VAT number belongs to, or null if it is not an EU number.
 *
 * Returns null for GB and for anything unrecognised — including the junk that
 * ends up in a free-text field, which must not be guessed at.
 */
export function euCountryFromVatNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const prefix = raw.trim().toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
  return EU_VAT_COUNTRIES[prefix] ?? null;
}
