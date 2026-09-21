"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { isVatFrequency } from "@/lib/accounting/vat-periods";
import {
  checkVatNumber,
  isHmrcSandbox,
  normaliseVatNumber,
  prewarmVatCheck,
  type VatCheckResult,
} from "@/lib/tax/hmrc-vat";

/**
 * Verify a VAT number without saving anything.
 *
 * Used by the onboarding wizard and the settings form to show the registered
 * business name back to the user before they commit. Never throws: a failed
 * lookup returns a result the form explains, because HMRC being unreachable
 * must not stop somebody recording their own VAT number.
 */
export async function verifyVatNumber(raw: string): Promise<VatCheckResult> {
  // Guarded: a server action is reachable by anyone who can reach the app, and
  // an unguarded one here is a free HMRC lookup proxy spending our rate limit.
  await requireAccountingWorkspace();
  return checkVatNumber(raw);
}

/**
 * Fetch the HMRC token ahead of the first check.
 *
 * Called when the VAT form appears so the token round trip overlaps with the
 * user typing rather than adding to their wait. Returns nothing and never
 * throws — it is an optimisation, not a step anything depends on.
 */
export async function warmVatCheck(): Promise<void> {
  await requireAccountingWorkspace();
  await prewarmVatCheck();
}

export type SaveVatSettingsResult =
  | { ok: true; vatRegistered: boolean; vatNumber: string | null; check: VatCheckResult | null }
  | { ok: false; error: string };

/**
 * Record whether this workspace is VAT registered, and its number.
 *
 * A business crosses the registration threshold mid-year and deregisters when it
 * shrinks, so this is deliberately editable rather than fixed at signup.
 *
 * The number is verified with HMRC where possible, but a failed or unavailable
 * check does not stop the save: the flag drives whether VAT appears on invoices
 * and bills, and a business that has just registered must be able to start
 * charging VAT immediately, not when a third-party service comes back up. Only
 * a definitive "not registered" from HMRC is refused.
 */
export async function saveVatSettings(input: {
  vatRegistered: boolean;
  vatNumber?: string;
}): Promise<SaveVatSettingsResult> {
  const workspace = await requireAccountingWorkspace();

  if (!input.vatRegistered) {
    await prisma.organization.update({
      where: { id: workspace.organizationId },
      data: { vatRegistered: false },
    });
    revalidateVatSurfaces();
    // The number itself is kept. A business that deregisters may register again,
    // and its old number is history worth not destroying on a checkbox.
    return { ok: true, vatRegistered: false, vatNumber: null, check: null };
  }

  const raw = input.vatNumber?.trim() ?? "";
  if (!raw) {
    return { ok: false, error: "Enter your VAT registration number." };
  }

  const check = await checkVatNumber(raw);

  if (check.status === "invalid_format") {
    return { ok: false, error: check.reason };
  }

  // The one case worth refusing. Everything else — unavailable, timed out, not
  // configured — saves and can be rechecked.
  //
  // Except against the sandbox, where the refusal is simply wrong: the
  // VAT-lookup sandbox and the Making Tax Digital sandbox hold different test
  // data, so a VRN issued by HMRC's own test-user generator answers 404 here.
  // Refusing it would make the MTD connection impossible to test at all, while
  // saying nothing about whether a real registration exists.
  if (check.status === "not_registered" && !isHmrcSandbox()) {
    return {
      ok: false,
      error: `HMRC does not hold a registration for ${normaliseVatNumber(raw)}. Check the number and try again.`,
    };
  }

  const vatNumber = normaliseVatNumber(raw);
  await prisma.organization.update({
    where: { id: workspace.organizationId },
    data: { vatRegistered: true, vatRegistrationNo: vatNumber },
  });

  revalidateVatSurfaces();
  return { ok: true, vatRegistered: true, vatNumber, check };
}

/**
 * Drop the server-rendered caches for every screen that offers VAT. The client
 * query cache is invalidated separately; this covers the server components,
 * which that cannot reach.
 */
function revalidateVatSurfaces() {
  for (const path of [
    "/sales/invoices",
    "/sales/receipts",
    "/sales/refund-receipts",
    "/purchases",
    "/purchases/settings",
    "/taxes",
  ]) {
    revalidatePath(path);
  }
}

/** Accounting schemes a UK business can be on for VAT. */
const VAT_SCHEMES = ["standard", "cash", "flat_rate", "retail"] as const;
export type VatScheme = (typeof VAT_SCHEMES)[number];

/**
 * Record how this workspace accounts for VAT and how often it files.
 *
 * Both change over the life of a business — crossing the cash accounting
 * turnover limit, or asking HMRC to move from quarterly to monthly to get
 * repayments faster — so neither is fixed at signup.
 *
 * The frequency is what decides which periods the VAT page shows, so getting it
 * wrong misdates every return on screen. It is stored only when the user tells
 * us; until then the page says it is assuming quarterly.
 */
export async function saveVatFilingSettings(input: {
  scheme?: string | null;
  frequency?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const workspace = await requireAccountingWorkspace();

  const data: { vatScheme?: string; vatReturnFrequency?: string } = {};

  if (input.scheme != null) {
    if (!VAT_SCHEMES.includes(input.scheme as VatScheme)) {
      return { ok: false, error: "Unknown VAT scheme." };
    }
    data.vatScheme = input.scheme;
  }

  if (input.frequency != null) {
    if (!isVatFrequency(input.frequency)) {
      return { ok: false, error: "VAT returns are filed monthly, quarterly or annually." };
    }
    data.vatReturnFrequency = input.frequency;
  }

  if (Object.keys(data).length === 0) return { ok: true };

  await prisma.organization.update({
    where: { id: workspace.organizationId },
    data,
  });

  revalidatePath("/taxes/vat");
  revalidatePath("/taxes");
  return { ok: true };
}

/** Current VAT settings for this workspace. */
export async function getVatSettings(): Promise<{
  vatRegistered: boolean;
  vatNumber: string | null;
}> {
  const workspace = await requireAccountingWorkspace();
  const org = await prisma.organization.findUnique({
    where: { id: workspace.organizationId },
    select: { vatRegistered: true, vatRegistrationNo: true },
  });
  return {
    vatRegistered: org?.vatRegistered ?? false,
    vatNumber: org?.vatRegistrationNo ?? null,
  };
}
