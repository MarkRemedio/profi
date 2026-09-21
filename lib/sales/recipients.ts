import { isValidEmail } from "./contact-persons";

/**
 * Who an invoice email or payment reminder goes to.
 *
 * Pure so the CC rules — flag per variant, active people only, case-insensitive
 * dedupe against the primary address — are unit-testable without SMTP.
 */

export type RecipientPerson = {
  email: string | null;
  isActive: boolean;
  receivesInvoices: boolean;
  receivesReminders: boolean;
};

export function resolveInvoiceRecipients(
  primaryEmail: string,
  persons: RecipientPerson[],
  variant: "invoice" | "reminder"
): { to: string; cc: string[] } {
  const to = primaryEmail.trim();
  const seen = new Set([to.toLowerCase()]);
  const cc: string[] = [];

  for (const person of persons) {
    if (!person.isActive) continue;
    if (variant === "invoice" ? !person.receivesInvoices : !person.receivesReminders) continue;
    const email = person.email?.trim();
    if (!email || !isValidEmail(email)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cc.push(email);
  }

  return { to, cc };
}
