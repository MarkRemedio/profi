import type { BusinessStructure } from "@/lib/accounting/financial-year";

/**
 * The signup wizard's vocabulary for the same things.
 *
 * Workspace settings stores "limited_company" and "sole_trader"; the wizard's
 * radio cards are "ltd" and "sole". Both have been in the schema since before
 * either screen existed, and normaliseBusinessStructure reconciles them on the
 * way in, so neither is wrong — but a value mapped for one screen cannot be
 * dropped straight into the other, which is what this is for.
 */
const TO_ONBOARDING: Record<BusinessStructure, string> = {
  limited_company: "ltd",
  plc: "plc",
  cic: "cic",
  sole_trader: "sole",
  partnership: "llp",
  // The wizard has no charity card. "Other" is captioned "Charity or unlisted",
  // which is exactly where a charitable incorporated organisation belongs.
  charity: "other",
  other: "other",
};

export function onboardingStructure(structure: BusinessStructure): string {
  return TO_ONBOARDING[structure] ?? "other";
}
