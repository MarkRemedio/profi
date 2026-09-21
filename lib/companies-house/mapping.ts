import type { BusinessStructure } from "@/lib/accounting/financial-year";

/**
 * Turning a Companies House record into the answers this application asks for.
 *
 * Kept apart from the HTTP client so it can be tested without a key or a
 * network: every function here is pure, and `today` is passed in rather than
 * read, so a year-end that depends on the date can be asserted.
 */

/**
 * How Companies House describes a company, mapped to how we do.
 *
 * Their `type` is a long enum covering things this application has no separate
 * treatment for — royal charters, overseas companies, industrial and provident
 * societies — and all of those land on "other" rather than being forced into a
 * structure whose tax treatment they do not share.
 *
 * A community interest company is the awkward one. It is registered as a
 * company limited by shares or guarantee and can come back with `type: "ltd"`,
 * with the CIC status carried on `subtype` instead. Reading only `type` would
 * file most CICs as ordinary limited companies, so both are checked.
 */
const TYPE_TO_STRUCTURE: Record<string, BusinessStructure> = {
  ltd: "limited_company",
  plc: "plc",
  "old-public-company": "plc",
  "community-interest-company": "cic",
  llp: "partnership",
  "limited-partnership": "partnership",
  "scottish-partnership": "partnership",
  "charitable-incorporated-organisation": "charity",
  "scottish-charitable-incorporated-organisation": "charity",
};

export function mapCompanyStructure(
  type: string | null | undefined,
  subtype?: string | null,
): BusinessStructure {
  if (subtype === "community-interest-company") return "cic";
  if (!type) return "other";
  return TYPE_TO_STRUCTURE[type] ?? "other";
}

/**
 * SIC 2007 sections, by the divisions they cover.
 *
 * Companies House returns bare SIC codes and no description — the descriptions
 * on their own website come from a list they publish separately, not from the
 * API. Rather than ship a table of every one of the several hundred codes, the
 * first two digits are matched to the section they belong to, which is the
 * breadth "nature of business" is asking for anyway: a plumber registered under
 * 43220 wants to read "Construction", not "Plumbing, heat and air-conditioning
 * installation".
 */
const SIC_SECTIONS: Array<{ from: number; to: number; label: string }> = [
  { from: 1, to: 3, label: "Agriculture, forestry and fishing" },
  { from: 5, to: 9, label: "Mining and quarrying" },
  { from: 10, to: 33, label: "Manufacturing" },
  { from: 35, to: 35, label: "Electricity and gas supply" },
  { from: 36, to: 39, label: "Water, sewerage and waste" },
  { from: 41, to: 43, label: "Construction" },
  { from: 45, to: 47, label: "Wholesale and retail trade" },
  { from: 49, to: 53, label: "Transport and storage" },
  { from: 55, to: 56, label: "Accommodation and food service" },
  { from: 58, to: 63, label: "Information and communication" },
  { from: 64, to: 66, label: "Financial and insurance" },
  { from: 68, to: 68, label: "Real estate" },
  { from: 69, to: 75, label: "Professional, scientific and technical" },
  { from: 77, to: 82, label: "Administrative and support services" },
  { from: 84, to: 84, label: "Public administration and defence" },
  { from: 85, to: 85, label: "Education" },
  { from: 86, to: 88, label: "Health and social work" },
  { from: 90, to: 93, label: "Arts, entertainment and recreation" },
  { from: 94, to: 96, label: "Other service activities" },
  { from: 97, to: 98, label: "Households as employers" },
  { from: 99, to: 99, label: "Extraterritorial organisations" },
];

/**
 * A readable nature of business from the SIC codes on the record.
 *
 * Only the first code is used. A company may register up to four, and joining
 * them produces a line nobody wants in a settings field — the first is the
 * principal activity, which is the one being asked for.
 *
 * 74990 and 82990 are both "non-trading" or "other" catch-alls that many
 * dormant companies carry; they still map to their section, which is honest,
 * and the field stays editable either way.
 */
/**
 * Groups worth naming more precisely than the section they sit in.
 *
 * A section is usually the right breadth, but division 69 is "legal and
 * accounting" as one lump — which reads as Professional Services for a firm of
 * accountants, losing the one fact about them that matters most here. The 692
 * group is accounting, bookkeeping, auditing and tax consultancy specifically.
 *
 * Shared rather than applied per screen, so the settings page records the same
 * precision the wizard does.
 */
const SIC_GROUPS: Array<{ prefix: string; label: string }> = [
  { prefix: "692", label: "Accounting and bookkeeping" },
];

export function mapNatureOfBusiness(sicCodes: string[] | null | undefined): string | null {
  const first = sicCodes?.find((code) => /^\d{4,5}$/.test(code.trim()));
  if (!first) return null;

  const group = SIC_GROUPS.find((entry) => first.trim().startsWith(entry.prefix));
  if (group) return group.label;

  const division = Number(first.trim().slice(0, 2));
  const section = SIC_SECTIONS.find(({ from, to }) => division >= from && division <= to);
  return section?.label ?? null;
}

/** Companies House gives the day and month as zero-padded strings. */
export type AccountingReferenceDate = { day?: string; month?: string };

/**
 * The financial year end to record, as an ISO date.
 *
 * Companies House holds this two ways. `next_accounts.period_end_on` is an
 * actual date and is preferred wherever it exists, because it already accounts
 * for a shortened or extended first period — a company incorporated in March
 * with a 31 December reference date has a first period that does not run twelve
 * months, and deriving the date from the reference alone would state the wrong
 * year end for it.
 *
 * Where that is absent, the day and month are projected onto the next occurrence
 * on or after today, matching what the field asks for: this year's date, which
 * then rolls forward on its own.
 *
 * A day that does not exist in the target month — 31 in a 30-day month, or 29
 * February in a common year — is pulled back to the last day of that month,
 * which is how Companies House treats it too.
 */
export function mapFinancialYearEnd(
  accounts: { next_accounts?: { period_end_on?: string }; accounting_reference_date?: AccountingReferenceDate } | null | undefined,
  today: Date,
): string | null {
  const periodEnd = accounts?.next_accounts?.period_end_on;
  if (periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return periodEnd;

  const day = Number(accounts?.accounting_reference_date?.day);
  const month = Number(accounts?.accounting_reference_date?.month);
  if (!Number.isInteger(day) || !Number.isInteger(month)) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  const clampToMonth = (year: number): string => {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const safeDay = Math.min(day, lastDay);
    return `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
  };

  const thisYear = clampToMonth(today.getUTCFullYear());
  const todayIso = today.toISOString().slice(0, 10);
  return thisYear >= todayIso ? thisYear : clampToMonth(today.getUTCFullYear() + 1);
}
