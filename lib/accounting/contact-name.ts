// Single source of truth for which name a contact displays.
//
// A contact's `name` is its business name ("Acme Ltd"); `first_name` /
// `last_name` describe the primary person at that contact ("Jane Smith").
// `display_name_preference` chooses between them.
//
// NOTE: the rule is duplicated as a SQL CASE expression in
// lib/accounting/reports.ts and
// app/(dashboard)/accounting/chart-of-accounts/actions.ts (their
// general-ledger raw queries cannot call this function). Change all three
// together.

export type ContactNameParts = {
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  display_name_preference?: string | null;
};

/**
 * Resolve the name to display for a contact.
 *
 * Anything other than the exact string "primary" resolves to the business
 * name, so a null/unknown preference degrades to the pre-feature behaviour
 * rather than throwing.
 *
 * Falls back to the business name when the preference is "primary" but no
 * primary person has been entered — a contact never renders blank.
 */
export function contactDisplayName(c: ContactNameParts): string {
  if (c.display_name_preference !== "primary") return c.name;
  const primary = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return primary || c.name;
}

/**
 * Prisma select fragment for every field contactDisplayName() reads.
 *
 * Spread this into any `contact: { select: ... }` whose result is passed to
 * contactDisplayName(). Omitting a field does not fail loudly — the resolver
 * just silently returns the business name — so always use this constant
 * instead of listing the fields by hand.
 */
export const CONTACT_NAME_SELECT = {
  name: true,
  first_name: true,
  last_name: true,
  display_name_preference: true,
} as const;
