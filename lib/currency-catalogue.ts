import { CURRENCIES } from "./currency";

/**
 * Every currency the picker offers, whether or not the books can keep them yet.
 *
 * Deliberately separate from CURRENCIES in `lib/currency.ts`, which is the list
 * the system actually supports — used by toCurrencyCode, formatMoney and every
 * ledger path. The two are not the same size and should not be: this catalogue
 * carries thirty-four currencies whose minor unit is not a hundredth, and
 * listing those as supported would make them silently valid on a journal line
 * while every amount came out by a factor of ten or a hundred.
 *
 * This list is for the picker alone. Everything outside CURRENCIES is shown,
 * searchable and clearly marked as not available yet — because "we do not have
 * your currency" is a useful answer, and an empty search result is not. Someone
 * looking for Kenyan Shilling should find it and learn it is coming, rather
 * than conclude the search is broken.
 *
 * `countries` exists so a search matches the way people actually think: nobody
 * types "AUD", they type "Australia".
 */

export type CatalogueCurrency = {
  code: string;
  name: string;
  /** Searchable country names, most recognisable first. */
  countries: string;
  /** Whether the books can be kept in it today. */
  available: boolean;
};

const CATALOGUE: Array<Omit<CatalogueCurrency, "available">> = [
  { code: "GBP", name: "British Pound", countries: "United Kingdom, England, Scotland, Wales, Northern Ireland" },
  { code: "USD", name: "US Dollar", countries: "United States of America, USA" },
  { code: "EUR", name: "Euro", countries: "Ireland, Germany, France, Spain, Italy, Netherlands, Portugal, Belgium, Austria, Eurozone" },
  { code: "PHP", name: "Philippine Peso", countries: "Philippines" },
  { code: "TZS", name: "Tanzanian Shilling", countries: "Tanzania" },

  { code: "AED", name: "UAE Dirham", countries: "United Arab Emirates, Dubai, Abu Dhabi" },
  { code: "AFN", name: "Afghan Afghani", countries: "Afghanistan" },
  { code: "ALL", name: "Albanian Lek", countries: "Albania" },
  { code: "AMD", name: "Armenian Dram", countries: "Armenia" },
  { code: "ANG", name: "Netherlands Antillean Guilder", countries: "Curaçao, Sint Maarten" },
  { code: "AOA", name: "Angolan Kwanza", countries: "Angola" },
  { code: "ARS", name: "Argentine Peso", countries: "Argentina" },
  { code: "AUD", name: "Australian Dollar", countries: "Australia" },
  { code: "AWG", name: "Aruban Florin", countries: "Aruba" },
  { code: "AZN", name: "Azerbaijani Manat", countries: "Azerbaijan" },
  { code: "BAM", name: "Bosnia-Herzegovina Convertible Mark", countries: "Bosnia and Herzegovina" },
  { code: "BBD", name: "Barbadian Dollar", countries: "Barbados" },
  { code: "BDT", name: "Bangladeshi Taka", countries: "Bangladesh" },
  { code: "BGN", name: "Bulgarian Lev", countries: "Bulgaria" },
  { code: "BHD", name: "Bahraini Dinar", countries: "Bahrain" },
  { code: "BIF", name: "Burundian Franc", countries: "Burundi" },
  { code: "BMD", name: "Bermudian Dollar", countries: "Bermuda" },
  { code: "BND", name: "Brunei Dollar", countries: "Brunei" },
  { code: "BOB", name: "Bolivian Boliviano", countries: "Bolivia" },
  { code: "BRL", name: "Brazilian Real", countries: "Brazil" },
  { code: "BSD", name: "Bahamian Dollar", countries: "Bahamas" },
  { code: "BWP", name: "Botswanan Pula", countries: "Botswana" },
  { code: "BYN", name: "Belarusian Ruble", countries: "Belarus" },
  { code: "BZD", name: "Belize Dollar", countries: "Belize" },
  { code: "CAD", name: "Canadian Dollar", countries: "Canada" },
  { code: "CDF", name: "Congolese Franc", countries: "Democratic Republic of the Congo" },
  { code: "CHF", name: "Swiss Franc", countries: "Switzerland, Liechtenstein" },
  { code: "CLP", name: "Chilean Peso", countries: "Chile" },
  { code: "CNY", name: "Chinese Yuan", countries: "China" },
  { code: "COP", name: "Colombian Peso", countries: "Colombia" },
  { code: "CRC", name: "Costa Rican Colón", countries: "Costa Rica" },
  { code: "CVE", name: "Cape Verdean Escudo", countries: "Cape Verde" },
  { code: "CZK", name: "Czech Koruna", countries: "Czech Republic, Czechia" },
  { code: "DJF", name: "Djiboutian Franc", countries: "Djibouti" },
  { code: "DKK", name: "Danish Krone", countries: "Denmark" },
  { code: "DOP", name: "Dominican Peso", countries: "Dominican Republic" },
  { code: "DZD", name: "Algerian Dinar", countries: "Algeria" },
  { code: "EGP", name: "Egyptian Pound", countries: "Egypt" },
  { code: "ETB", name: "Ethiopian Birr", countries: "Ethiopia" },
  { code: "FJD", name: "Fijian Dollar", countries: "Fiji" },
  { code: "GEL", name: "Georgian Lari", countries: "Georgia" },
  { code: "GHS", name: "Ghanaian Cedi", countries: "Ghana" },
  { code: "GMD", name: "Gambian Dalasi", countries: "Gambia" },
  { code: "GNF", name: "Guinean Franc", countries: "Guinea" },
  { code: "GTQ", name: "Guatemalan Quetzal", countries: "Guatemala" },
  { code: "GYD", name: "Guyanaese Dollar", countries: "Guyana" },
  { code: "HKD", name: "Hong Kong Dollar", countries: "Hong Kong" },
  { code: "HNL", name: "Honduran Lempira", countries: "Honduras" },
  { code: "HTG", name: "Haitian Gourde", countries: "Haiti" },
  { code: "HUF", name: "Hungarian Forint", countries: "Hungary" },
  { code: "IDR", name: "Indonesian Rupiah", countries: "Indonesia" },
  { code: "ILS", name: "Israeli New Shekel", countries: "Israel" },
  { code: "INR", name: "Indian Rupee", countries: "India" },
  { code: "IQD", name: "Iraqi Dinar", countries: "Iraq" },
  { code: "ISK", name: "Icelandic Króna", countries: "Iceland" },
  { code: "JMD", name: "Jamaican Dollar", countries: "Jamaica" },
  { code: "JOD", name: "Jordanian Dinar", countries: "Jordan" },
  { code: "JPY", name: "Japanese Yen", countries: "Japan" },
  { code: "KES", name: "Kenyan Shilling", countries: "Kenya" },
  { code: "KGS", name: "Kyrgyzstani Som", countries: "Kyrgyzstan" },
  { code: "KHR", name: "Cambodian Riel", countries: "Cambodia" },
  { code: "KMF", name: "Comorian Franc", countries: "Comoros" },
  { code: "KRW", name: "South Korean Won", countries: "South Korea" },
  { code: "KWD", name: "Kuwaiti Dinar", countries: "Kuwait" },
  { code: "KYD", name: "Cayman Islands Dollar", countries: "Cayman Islands" },
  { code: "KZT", name: "Kazakhstani Tenge", countries: "Kazakhstan" },
  { code: "LAK", name: "Laotian Kip", countries: "Laos" },
  { code: "LBP", name: "Lebanese Pound", countries: "Lebanon" },
  { code: "LKR", name: "Sri Lankan Rupee", countries: "Sri Lanka" },
  { code: "LRD", name: "Liberian Dollar", countries: "Liberia" },
  { code: "LSL", name: "Lesotho Loti", countries: "Lesotho" },
  { code: "MAD", name: "Moroccan Dirham", countries: "Morocco" },
  { code: "MDL", name: "Moldovan Leu", countries: "Moldova" },
  { code: "MGA", name: "Malagasy Ariary", countries: "Madagascar" },
  { code: "MKD", name: "Macedonian Denar", countries: "North Macedonia" },
  { code: "MMK", name: "Myanmar Kyat", countries: "Myanmar, Burma" },
  { code: "MNT", name: "Mongolian Tugrik", countries: "Mongolia" },
  { code: "MOP", name: "Macanese Pataca", countries: "Macau" },
  { code: "MUR", name: "Mauritian Rupee", countries: "Mauritius" },
  { code: "MVR", name: "Maldivian Rufiyaa", countries: "Maldives" },
  { code: "MWK", name: "Malawian Kwacha", countries: "Malawi" },
  { code: "MXN", name: "Mexican Peso", countries: "Mexico" },
  { code: "MYR", name: "Malaysian Ringgit", countries: "Malaysia" },
  { code: "MZN", name: "Mozambican Metical", countries: "Mozambique" },
  { code: "NAD", name: "Namibian Dollar", countries: "Namibia" },
  { code: "NGN", name: "Nigerian Naira", countries: "Nigeria" },
  { code: "NIO", name: "Nicaraguan Córdoba", countries: "Nicaragua" },
  { code: "NOK", name: "Norwegian Krone", countries: "Norway" },
  { code: "NPR", name: "Nepalese Rupee", countries: "Nepal" },
  { code: "NZD", name: "New Zealand Dollar", countries: "New Zealand" },
  { code: "OMR", name: "Omani Rial", countries: "Oman" },
  { code: "PAB", name: "Panamanian Balboa", countries: "Panama" },
  { code: "PEN", name: "Peruvian Sol", countries: "Peru" },
  { code: "PGK", name: "Papua New Guinean Kina", countries: "Papua New Guinea" },
  { code: "PKR", name: "Pakistani Rupee", countries: "Pakistan" },
  { code: "PLN", name: "Polish Zloty", countries: "Poland" },
  { code: "PYG", name: "Paraguayan Guarani", countries: "Paraguay" },
  { code: "QAR", name: "Qatari Rial", countries: "Qatar" },
  { code: "RON", name: "Romanian Leu", countries: "Romania" },
  { code: "RSD", name: "Serbian Dinar", countries: "Serbia" },
  { code: "RWF", name: "Rwandan Franc", countries: "Rwanda" },
  { code: "SAR", name: "Saudi Riyal", countries: "Saudi Arabia" },
  { code: "SBD", name: "Solomon Islands Dollar", countries: "Solomon Islands" },
  { code: "SCR", name: "Seychellois Rupee", countries: "Seychelles" },
  { code: "SEK", name: "Swedish Krona", countries: "Sweden" },
  { code: "SGD", name: "Singapore Dollar", countries: "Singapore" },
  { code: "SLE", name: "Sierra Leonean Leone", countries: "Sierra Leone" },
  { code: "SOS", name: "Somali Shilling", countries: "Somalia" },
  { code: "SRD", name: "Surinamese Dollar", countries: "Suriname" },
  { code: "SZL", name: "Swazi Lilangeni", countries: "Eswatini, Swaziland" },
  { code: "THB", name: "Thai Baht", countries: "Thailand" },
  { code: "TND", name: "Tunisian Dinar", countries: "Tunisia" },
  { code: "TOP", name: "Tongan Paʻanga", countries: "Tonga" },
  { code: "TRY", name: "Turkish Lira", countries: "Turkey, Türkiye" },
  { code: "TTD", name: "Trinidad and Tobago Dollar", countries: "Trinidad and Tobago" },
  { code: "TWD", name: "New Taiwan Dollar", countries: "Taiwan" },
  { code: "UAH", name: "Ukrainian Hryvnia", countries: "Ukraine" },
  { code: "UGX", name: "Ugandan Shilling", countries: "Uganda" },
  { code: "UYU", name: "Uruguayan Peso", countries: "Uruguay" },
  { code: "UZS", name: "Uzbekistani Som", countries: "Uzbekistan" },
  { code: "VND", name: "Vietnamese Dong", countries: "Vietnam" },
  { code: "VUV", name: "Vanuatu Vatu", countries: "Vanuatu" },
  { code: "WST", name: "Samoan Tala", countries: "Samoa" },
  { code: "XAF", name: "Central African CFA Franc", countries: "Cameroon, Chad, Gabon, Congo" },
  { code: "XCD", name: "East Caribbean Dollar", countries: "Antigua, Grenada, Saint Lucia, Dominica" },
  { code: "XOF", name: "West African CFA Franc", countries: "Senegal, Ivory Coast, Mali, Benin, Burkina Faso" },
  { code: "XPF", name: "CFP Franc", countries: "French Polynesia, New Caledonia" },
  { code: "YER", name: "Yemeni Rial", countries: "Yemen" },
  { code: "ZAR", name: "South African Rand", countries: "South Africa" },
  { code: "ZMW", name: "Zambian Kwacha", countries: "Zambia" },
];

/** The full picker list: supported currencies first, then everything else. */
export const CURRENCY_CATALOGUE: CatalogueCurrency[] = CATALOGUE.map((entry) => ({
  ...entry,
  available: entry.code in CURRENCIES,
})).sort((a, b) => {
  if (a.available !== b.available) return a.available ? -1 : 1;
  return a.code.localeCompare(b.code);
});

export const AVAILABLE_CURRENCIES = CURRENCY_CATALOGUE.filter((entry) => entry.available);
export const UPCOMING_CURRENCIES = CURRENCY_CATALOGUE.filter((entry) => !entry.available);
