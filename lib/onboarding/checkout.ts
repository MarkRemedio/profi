// Pure helpers for the paid-plan onboarding checkout flow.
//
// S5: the Supabase auth user is created BEFORE Stripe checkout, so we pass only
// the (non-sensitive) onboarding fields plus the pre-created `userId` into Stripe
// metadata. The user's password is deliberately NOT included — Stripe metadata is
// plaintext and visible in the dashboard, API responses, and logs.

export type OnboardingFormData = {
  email: string;
  password?: string;
  fullName?: string;
  businessName: string;
  currency?: string;
  dateFormat?: string; // 🚀 ADDED
  businessStructure?: string;
  vatScheme?: string;
  vatRegistered?: string; // "yes" | "no"
  cisStatus?: string;
  migrationSource?: string;
  topPriority?: string;
};

export type CheckoutMetadata = {
  userId: string;
  email: string;
  fullName: string;
  businessName: string;
  currency: string;
  dateFormat: string; // 🚀 ADDED
  businessStructure: string;
  vatScheme: string;
  vatRegistered: string;
  cisStatus: string;
  migrationSource: string;
  topPriority: string;
  planCode: string;
};

/**
 * Build the Stripe checkout `metadata` for a paid signup. Never emits `password`.
 * `userId` is the id of the already-created Supabase auth user, which the webhook
 * and success page use to link the workspace after payment.
 */
export function buildCheckoutMetadata(
  formData: OnboardingFormData,
  planCode: string,
  userId: string
): CheckoutMetadata {
  return {
    userId,
    email: formData.email,
    fullName: formData.fullName ?? "",
    businessName: formData.businessName,
    currency: formData.currency ?? "GBP",
    dateFormat: formData.dateFormat ?? "YYYY-MM-DD", // 🚀 ADDED: Defaults to ISO if missing
    businessStructure: formData.businessStructure ?? "",
    vatScheme: formData.vatScheme ?? "",
    vatRegistered: formData.vatRegistered ?? "no",
    cisStatus: formData.cisStatus ?? "",
    migrationSource: formData.migrationSource ?? "",
    topPriority: formData.topPriority ?? "",
    planCode,
  };
}
