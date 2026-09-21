"use server";

import { askAurelius, buildSetupPlan, fallbackSetupPlan, type SetupPlan } from "@/lib/onboarding/setup-plan";

/**
 * Ask Aurelius for a first-week plan, from the answers given on step 4.
 *
 * Takes only the handful of fields the plan is written from rather than the
 * whole wizard bag — there is no organisation yet, so nothing here can be read
 * from the database, and the client is the only source. Everything is clamped
 * before it reaches the model.
 *
 * Never throws. The step this runs from is one screen before the card form,
 * and an error there costs a signup while buying the reader nothing they could
 * act on. Every failure returns the deterministic plan instead.
 */
export async function generateSetupPlan(input: {
  businessName?: string;
  businessStructure?: string;
  focusAreas?: string[];
  booksToday?: string;
  notes?: string;
  vatRegistered?: boolean;
  currency?: string;
}): Promise<SetupPlan> {
  const safe = {
    businessName: String(input.businessName ?? "").slice(0, 120),
    businessStructure: String(input.businessStructure ?? "").slice(0, 40),
    focusAreas: (input.focusAreas ?? []).slice(0, 6).map((area) => String(area).slice(0, 32)),
    booksToday: String(input.booksToday ?? "new").slice(0, 32),
    notes: String(input.notes ?? "").slice(0, 400),
    vatRegistered: Boolean(input.vatRegistered),
    currency: String(input.currency ?? "GBP").slice(0, 8), // currency:allow display only
  };

  try {
    return await buildSetupPlan(safe);
  } catch (error) {
    console.error("Setup plan action failed:", error);
    return fallbackSetupPlan(safe);
  }
}

/**
 * Answer a question asked from the setup sidebar.
 *
 * Never throws, for the same reason the plan never throws: this sits beside a
 * form somebody is part-way through, and an error thrown from a sidebar is a
 * broken page rather than an unanswered question.
 */
export async function askAureliusAction(step: number, question: string): Promise<string> {
  const trimmed = String(question ?? "").trim().slice(0, 300);
  if (trimmed.length < 3) return "Ask me anything about this step and I will explain it.";
  try {
    return await askAurelius(Number(step) || 1, trimmed);
  } catch (error) {
    console.error("Aurelius action failed:", error);
    return "I could not answer that just now. Everything on this screen can be changed later in Settings.";
  }
}
