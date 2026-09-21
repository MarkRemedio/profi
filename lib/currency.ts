/**
 * The currencies a workspace can keep its books in.
 *
 * This is the single source of truth. Before it existed, nineteen components
 * each defined their own formatCurrency hardcoded to GBP, so an organisation
 * that chose USD at signup still saw pounds everywhere.
 *
 * ## Why these hundred and one, and not the whole catalogue
 *
 * Amounts are stored as integers in minor units and divided by 100 to display
 * — in this file, in roughly a hundred call sites elsewhere, and implicitly in
 * fifty-nine *Minor columns. Every currency listed here has two decimal places
 * under ISO 4217, so that assumption holds for all of them.
 *
 * It does not hold for the rest. Twenty-nine currencies have no minor unit at
 * all (JPY, KRW, VND, ISK, HUF, IDR, UGX, XAF, XOF and others) and five have
 * three (BHD, JOD, KWD, OMR, TND). A workspace on yen would read ¥1,234.50 where
 * the real figure is ¥123,450 — every total, VAT return and balance wrong by a
 * hundredfold, with nothing to warn anybody. Those stay in the picker's
 * catalogue marked unavailable until the stored amounts carry their own scale.
 *
 * assertTwoDecimalCurrencies() below enforces that, so adding one by mistake
 * fails loudly rather than quietly mis-stating somebody's books.
 */

type CurrencyMeta = {
  code: string;
  name: string;
  /** The symbol on its own, for compact contexts like input prefixes. */
  symbol: string;
  /**
   * Locale used for formatting. Chosen per currency because it decides the
   * symbol and its placement: TZS renders as "TSh" under en-TZ but falls back
   * to the bare code "TZS" under en-GB, and EUR trails the symbol under de-DE.
   *
   * A currency whose own locale renders an ambiguous symbol is formatted under
   * en-GB instead. Sixteen of these are a bare "$" at home and a lone latin
   * letter serves both the Kina and the Kwacha; ICU disambiguates them as A$,
   * CA$, NZ$ or the plain code, which is the more useful answer in a product
   * that shows several currencies on one screen.
   */
  locale: string;
};

export const CURRENCIES = {
  GBP:  { code: "GBP", name: "British Pound",                     locale: "en-GB",   symbol: "£" },
  USD:  { code: "USD", name: "US Dollar",                         locale: "en-US",   symbol: "$" },
  EUR:  { code: "EUR", name: "Euro",                              locale: "en-IE",   symbol: "€" },
  PHP:  { code: "PHP", name: "Philippine Peso",                   locale: "en-PH",   symbol: "₱" },
  TZS:  { code: "TZS", name: "Tanzanian Shilling",                locale: "en-TZ",   symbol: "TSh" },

  AED:  { code: "AED", name: "UAE Dirham",                        locale: "en-GB",   symbol: "AED" },
  AMD:  { code: "AMD", name: "Armenian Dram",                     locale: "en-GB",   symbol: "AMD" },
  ANG:  { code: "ANG", name: "Netherlands Antillean Guilder",     locale: "en-GB",   symbol: "ANG" },
  AOA:  { code: "AOA", name: "Angolan Kwanza",                    locale: "en-GB",   symbol: "AOA" },
  ARS:  { code: "ARS", name: "Argentine Peso",                    locale: "en-GB",   symbol: "ARS" },
  AUD:  { code: "AUD", name: "Australian Dollar",                 locale: "en-GB",   symbol: "A$" },
  AWG:  { code: "AWG", name: "Aruban Florin",                     locale: "en-GB",   symbol: "AWG" },
  AZN:  { code: "AZN", name: "Azerbaijani Manat",                 locale: "en-GB",   symbol: "AZN" },
  BAM:  { code: "BAM", name: "Bosnia-Herzegovina Convertible Mark", locale: "en-GB",   symbol: "BAM" },
  BBD:  { code: "BBD", name: "Barbadian Dollar",                  locale: "en-GB",   symbol: "BBD" },
  BDT:  { code: "BDT", name: "Bangladeshi Taka",                  locale: "en-GB",   symbol: "BDT" },
  BGN:  { code: "BGN", name: "Bulgarian Lev",                     locale: "en-GB",   symbol: "BGN" },
  BMD:  { code: "BMD", name: "Bermudian Dollar",                  locale: "en-GB",   symbol: "BMD" },
  BND:  { code: "BND", name: "Brunei Dollar",                     locale: "en-GB",   symbol: "BND" },
  BOB:  { code: "BOB", name: "Bolivian Boliviano",                locale: "en-GB",   symbol: "BOB" },
  BRL:  { code: "BRL", name: "Brazilian Real",                    locale: "en-BR",   symbol: "R$" },
  BSD:  { code: "BSD", name: "Bahamian Dollar",                   locale: "en-GB",   symbol: "BSD" },
  BWP:  { code: "BWP", name: "Botswanan Pula",                    locale: "en-GB",   symbol: "BWP" },
  BYN:  { code: "BYN", name: "Belarusian Ruble",                  locale: "en-GB",   symbol: "BYN" },
  BZD:  { code: "BZD", name: "Belize Dollar",                     locale: "en-GB",   symbol: "BZD" },
  CAD:  { code: "CAD", name: "Canadian Dollar",                   locale: "en-GB",   symbol: "CA$" },
  CDF:  { code: "CDF", name: "Congolese Franc",                   locale: "en-GB",   symbol: "CDF" },
  CHF:  { code: "CHF", name: "Swiss Franc",                       locale: "en-GB",   symbol: "CHF" },
  CNY:  { code: "CNY", name: "Chinese Yuan",                      locale: "en-CN",   symbol: "CN¥" },
  CRC:  { code: "CRC", name: "Costa Rican Colón",                 locale: "en-GB",   symbol: "CRC" },
  CVE:  { code: "CVE", name: "Cape Verdean Escudo",               locale: "en-GB",   symbol: "CVE" },
  CZK:  { code: "CZK", name: "Czech Koruna",                      locale: "en-GB",   symbol: "CZK" },
  DKK:  { code: "DKK", name: "Danish Krone",                      locale: "en-GB",   symbol: "DKK" },
  DOP:  { code: "DOP", name: "Dominican Peso",                    locale: "en-GB",   symbol: "DOP" },
  DZD:  { code: "DZD", name: "Algerian Dinar",                    locale: "en-GB",   symbol: "DZD" },
  EGP:  { code: "EGP", name: "Egyptian Pound",                    locale: "en-GB",   symbol: "EGP" },
  ETB:  { code: "ETB", name: "Ethiopian Birr",                    locale: "en-GB",   symbol: "ETB" },
  FJD:  { code: "FJD", name: "Fijian Dollar",                     locale: "en-GB",   symbol: "FJD" },
  GEL:  { code: "GEL", name: "Georgian Lari",                     locale: "en-GE",   symbol: "₾" },
  GHS:  { code: "GHS", name: "Ghanaian Cedi",                     locale: "en-GH",   symbol: "GH₵" },
  GMD:  { code: "GMD", name: "Gambian Dalasi",                    locale: "en-GB",   symbol: "GMD" },
  GTQ:  { code: "GTQ", name: "Guatemalan Quetzal",                locale: "en-GB",   symbol: "GTQ" },
  GYD:  { code: "GYD", name: "Guyanaese Dollar",                  locale: "en-GB",   symbol: "GYD" },
  HKD:  { code: "HKD", name: "Hong Kong Dollar",                  locale: "en-HK",   symbol: "HK$" },
  HNL:  { code: "HNL", name: "Honduran Lempira",                  locale: "en-GB",   symbol: "HNL" },
  HTG:  { code: "HTG", name: "Haitian Gourde",                    locale: "en-GB",   symbol: "HTG" },
  ILS:  { code: "ILS", name: "Israeli New Shekel",                locale: "en-IL",   symbol: "₪" },
  INR:  { code: "INR", name: "Indian Rupee",                      locale: "en-IN",   symbol: "₹" },
  JMD:  { code: "JMD", name: "Jamaican Dollar",                   locale: "en-GB",   symbol: "JMD" },
  KES:  { code: "KES", name: "Kenyan Shilling",                   locale: "en-KE",   symbol: "Ksh" },
  KGS:  { code: "KGS", name: "Kyrgyzstani Som",                    locale: "en-GB",   symbol: "KGS" },
  KHR:  { code: "KHR", name: "Cambodian Riel",                    locale: "en-GB",   symbol: "KHR" },
  KYD:  { code: "KYD", name: "Cayman Islands Dollar",             locale: "en-GB",   symbol: "KYD" },
  KZT:  { code: "KZT", name: "Kazakhstani Tenge",                 locale: "en-GB",   symbol: "KZT" },
  LKR:  { code: "LKR", name: "Sri Lankan Rupee",                  locale: "en-GB",   symbol: "LKR" },
  LRD:  { code: "LRD", name: "Liberian Dollar",                   locale: "en-GB",   symbol: "LRD" },
  LSL:  { code: "LSL", name: "Lesotho Loti",                      locale: "en-GB",   symbol: "LSL" },
  MAD:  { code: "MAD", name: "Moroccan Dirham",                   locale: "en-GB",   symbol: "MAD" },
  MDL:  { code: "MDL", name: "Moldovan Leu",                      locale: "en-GB",   symbol: "MDL" },
  MKD:  { code: "MKD", name: "Macedonian Denar",                  locale: "en-GB",   symbol: "MKD" },
  MNT:  { code: "MNT", name: "Mongolian Tugrik",                  locale: "en-GB",   symbol: "MNT" },
  MOP:  { code: "MOP", name: "Macanese Pataca",                   locale: "en-MO",   symbol: "MOP$" },
  MUR:  { code: "MUR", name: "Mauritian Rupee",                   locale: "en-MU",   symbol: "Rs" },
  MVR:  { code: "MVR", name: "Maldivian Rufiyaa",                 locale: "en-MV",   symbol: "Rf" },
  MWK:  { code: "MWK", name: "Malawian Kwacha",                   locale: "en-MW",   symbol: "MK" },
  MXN:  { code: "MXN", name: "Mexican Peso",                      locale: "en-MX",   symbol: "MX$" },
  MYR:  { code: "MYR", name: "Malaysian Ringgit",                 locale: "en-MY",   symbol: "RM" },
  MZN:  { code: "MZN", name: "Mozambican Metical",                locale: "en-GB",   symbol: "MZN" },
  NAD:  { code: "NAD", name: "Namibian Dollar",                   locale: "en-GB",   symbol: "NAD" },
  NGN:  { code: "NGN", name: "Nigerian Naira",                    locale: "en-NG",   symbol: "₦" },
  NIO:  { code: "NIO", name: "Nicaraguan Córdoba",                locale: "en-GB",   symbol: "NIO" },
  NOK:  { code: "NOK", name: "Norwegian Krone",                   locale: "en-GB",   symbol: "NOK" },
  NPR:  { code: "NPR", name: "Nepalese Rupee",                    locale: "en-GB",   symbol: "NPR" },
  NZD:  { code: "NZD", name: "New Zealand Dollar",                locale: "en-GB",   symbol: "NZ$" },
  PAB:  { code: "PAB", name: "Panamanian Balboa",                 locale: "en-GB",   symbol: "PAB" },
  PEN:  { code: "PEN", name: "Peruvian Sol",                      locale: "en-GB",   symbol: "PEN" },
  PGK:  { code: "PGK", name: "Papua New Guinean Kina",            locale: "en-GB",   symbol: "PGK" },
  PLN:  { code: "PLN", name: "Polish Zloty",                      locale: "en-GB",   symbol: "PLN" },
  QAR:  { code: "QAR", name: "Qatari Rial",                       locale: "en-GB",   symbol: "QAR" },
  RON:  { code: "RON", name: "Romanian Leu",                      locale: "en-GB",   symbol: "RON" },
  RSD:  { code: "RSD", name: "Serbian Dinar",                     locale: "en-GB",   symbol: "RSD" },
  SAR:  { code: "SAR", name: "Saudi Riyal",                       locale: "en-GB",   symbol: "SAR" },
  SBD:  { code: "SBD", name: "Solomon Islands Dollar",            locale: "en-GB",   symbol: "SBD" },
  SCR:  { code: "SCR", name: "Seychellois Rupee",                 locale: "en-SC",   symbol: "SR" },
  SEK:  { code: "SEK", name: "Swedish Krona",                     locale: "en-GB",   symbol: "SEK" },
  SGD:  { code: "SGD", name: "Singapore Dollar",                  locale: "en-GB",   symbol: "SGD" },
  SLE:  { code: "SLE", name: "Sierra Leonean Leone",              locale: "en-SL",   symbol: "Le" },
  SRD:  { code: "SRD", name: "Surinamese Dollar",                 locale: "en-GB",   symbol: "SRD" },
  SZL:  { code: "SZL", name: "Swazi Lilangeni",                   locale: "en-GB",   symbol: "SZL" },
  THB:  { code: "THB", name: "Thai Baht",                         locale: "en-GB",   symbol: "THB" },
  TOP:  { code: "TOP", name: "Tongan Paʻanga",                    locale: "en-TO",   symbol: "T$" },
  TRY:  { code: "TRY", name: "Turkish Lira",                      locale: "en-GB",   symbol: "TRY" },
  TTD:  { code: "TTD", name: "Trinidad and Tobago Dollar",        locale: "en-GB",   symbol: "TTD" },
  TWD:  { code: "TWD", name: "New Taiwan Dollar",                 locale: "en-TW",   symbol: "NT$" },
  UAH:  { code: "UAH", name: "Ukrainian Hryvnia",                 locale: "en-GB",   symbol: "UAH" },
  UYU:  { code: "UYU", name: "Uruguayan Peso",                    locale: "en-GB",   symbol: "UYU" },
  UZS:  { code: "UZS", name: "Uzbekistani Som",                   locale: "en-GB",   symbol: "UZS" },
  WST:  { code: "WST", name: "Samoan Tala",                       locale: "en-WS",   symbol: "WS$" },
  XCD:  { code: "XCD", name: "East Caribbean Dollar",             locale: "en-XC",   symbol: "EC$" },
  ZAR:  { code: "ZAR", name: "South African Rand",                locale: "en-GB",   symbol: "ZAR" },
  ZMW:  { code: "ZMW", name: "Zambian Kwacha",                    locale: "en-GB",   symbol: "ZMW" },
} as const satisfies Record<string, CurrencyMeta>;

/** Derived from the table, so the two can never disagree. */
export type CurrencyCode = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export const DEFAULT_CURRENCY: CurrencyCode = "GBP";

/**
 * Every listed currency must have exactly two decimal places.
 *
 * The whole file rests on that; see the note at the top. Exported rather than
 * run on import so it costs nothing in production — a test calls it, and it
 * throws with the offenders named.
 */
export function assertTwoDecimalCurrencies(): void {
  const wrong = CURRENCY_CODES.filter(
    (code) =>
      new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions()
        .maximumFractionDigits !== 2
  );

  if (wrong.length > 0) {
    throw new Error(
      `CURRENCIES contains ${wrong.join(", ")}, which do not have two decimal places. ` +
        `Amounts are stored in minor units and divided by 100, so these would be mis-stated. ` +
        `Rework the stored scale before listing them.`
    );
  }
}

/** Narrow an arbitrary stored string to a supported code, falling back safely. */
export function toCurrencyCode(value: string | null | undefined): CurrencyCode {
  return value && value in CURRENCIES ? (value as CurrencyCode) : DEFAULT_CURRENCY;
}

export function currencySymbol(currency: string | null | undefined): string {
  return CURRENCIES[toCurrencyCode(currency)].symbol;
}

/**
 * The left padding an amount input needs to clear the currency symbol sitting
 * inside it.
 *
 * Every symbol here is a single glyph — £ $ € ₱ — except the Tanzanian
 * shilling, which renders as "TSh". Inputs were padded with a fixed `pl-7`,
 * sized for one character, so a TZS amount began underneath its own symbol and
 * read as "TS2000.00".
 *
 * Measured in `ch`, the width of a "0" in the input's own font, so it tracks
 * the symbol and the type size instead of being guessed per field.
 *
 * @param symbol     the prefix being rendered, e.g. "TSh"
 * @param offsetRem  where that prefix is positioned from the left edge
 */
export function currencyInputInset(symbol: string, offsetRem = 0.75): string {
  const width = Math.max(1, symbol.length);
  return `calc(${offsetRem}rem + ${width}ch + 0.35rem)`;
}

/**
 * Format an amount held in minor units (pence, cents, centavos).
 *
 * @param minor  e.g. 123450 for 1,234.50
 */
export function formatMoney(
  minor: number | bigint | null | undefined,
  currency: string | null | undefined,
  options: { hideSymbol?: boolean } = {}
): string {
  const code = toCurrencyCode(currency);
  const meta = CURRENCIES[code];
  const value = Number(minor ?? 0) / 100;

  return new Intl.NumberFormat(meta.locale, {
    style: options.hideSymbol ? "decimal" : "currency",
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Format a major-unit amount (1234.5), for values already divided down. */
export function formatMoneyMajor(
  major: number | null | undefined,
  currency: string | null | undefined
): string {
  return formatMoney(Math.round((major ?? 0) * 100), currency);
}
