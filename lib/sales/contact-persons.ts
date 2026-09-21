/**
 * Validation for secondary contact people on a customer/supplier.
 *
 * Pure so the dialog can validate inline with exactly the rules the server
 * enforces, and so the rules are unit-testable without a database.
 */

export type ContactPersonInput = {
  name: string;
  relationship?: string | null;
  email?: string | null;
  phone?: string | null;
  receivesInvoices?: boolean;
  receivesReminders?: boolean;
  isActive?: boolean;
};

export type NormalizedContactPerson = {
  name: string;
  relationship: string | null;
  email: string | null;
  phone: string | null;
  receivesInvoices: boolean;
  receivesReminders: boolean;
  isActive: boolean;
};

const MAX_TEXT_LENGTH = 200;

/** Deliberately loose: reject obvious typos, accept anything mail-shaped. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/**
 * The first problem with the input, or null when it is acceptable.
 * One message at a time keeps the dialog's inline error readable.
 */
export function contactPersonInputError(input: ContactPersonInput): string | null {
  const name = input.name?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  const phone = input.phone?.trim() ?? "";

  if (!name) return "Give this person a name.";
  if (name.length > MAX_TEXT_LENGTH) return "That name is too long.";
  if ((input.relationship?.trim().length ?? 0) > MAX_TEXT_LENGTH) return "That relationship is too long.";
  if (!email && !phone) return "Add an email address or a phone number so this person can be reached.";
  if (email && !isValidEmail(email)) return "That email address doesn't look right.";
  if (email.length > MAX_TEXT_LENGTH) return "That email address is too long.";
  if (phone.length > 50) return "That phone number is too long.";
  if ((input.receivesInvoices || input.receivesReminders) && !email) {
    return "An email address is needed before this person can receive invoices or reminders.";
  }
  return null;
}

/** Validates and trims; throws the inline-error message on bad input. */
export function normalizeContactPersonInput(input: ContactPersonInput): NormalizedContactPerson {
  const error = contactPersonInputError(input);
  if (error) throw new Error(error);
  return {
    name: input.name.trim(),
    relationship: input.relationship?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    receivesInvoices: Boolean(input.receivesInvoices),
    receivesReminders: Boolean(input.receivesReminders),
    isActive: input.isActive ?? true,
  };
}
