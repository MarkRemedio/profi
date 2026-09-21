"use server";

import { prisma } from "@/lib/prisma";
import { requireAccountantRole } from "@/lib/accounting/dal";
import { CurrencyCode } from "@prisma/client"; // 🚀 Added to properly cast the enum
import { PURCHASE_SETTINGS_DEFAULTS } from "@/lib/accounting/purchase-defaults";

// ─── TYPES ───────────────────────────────────────────────────────────

interface SaveSettingsInput {
  billPrefix: string;
  nextBillNumber: string;
  claimPrefix: string;
  nextClaimNumber: string;
  defaultTerms: string;
  defaultAmountType: string; // 🚀 Matches the new UI field
  defaultCurrency: string;
  requireApproval: boolean;
  lockClosedPeriods: boolean;
}

// ─── READ ACTION ─────────────────────────────────────────────────────

/**
 * Read this workspace's purchase settings.
 *
 * Throws if the read fails. It used to swallow every error and return null,
 * which the form read as "no settings yet" and answered with its hardcoded
 * defaults — so a failure was indistinguishable from a fresh workspace, and
 * pressing Save then wrote those defaults over whatever was really stored.
 */
export async function getPurchaseSettingsAction() {
  const workspace = await requireAccountantRole();

  const [settings, org] = await Promise.all([
    // findFirst, not findUnique. PurchaseSettings is org-scoped, and the
    // tenancy extension refuses findUnique on a scoped model: its `where`
    // accepts only unique selectors, so organizationId cannot be injected and
    // the query cannot be proven safe. Every call threw, the catch above hid
    // it, and the page showed defaults over the saved row for good.
    prisma.purchaseSettings.findFirst({
      where: { organizationId: workspace.organizationId },
    }),
    // Organization is the tenant root rather than a tenant-scoped table, so
    // findUnique is correct here.
    prisma.organization.findUnique({
      where: { id: workspace.organizationId },
      select: { baseCurrency: true },
    }),
  ]);

  if (!settings) return null;

  return {
    billPrefix: settings.billPrefix || PURCHASE_SETTINGS_DEFAULTS.billPrefix,
    nextBillNumber: settings.nextBillNumber || PURCHASE_SETTINGS_DEFAULTS.nextBillNumber,
    claimPrefix: settings.claimPrefix || PURCHASE_SETTINGS_DEFAULTS.claimPrefix,
    nextClaimNumber: settings.nextClaimNumber || PURCHASE_SETTINGS_DEFAULTS.nextClaimNumber,
    defaultTerms: settings.defaultTerms || "30",
    // 🚀 Maps the DB's tax rate column to the "Amounts Are" state
    defaultAmountType: settings.defaultTaxRate || "exclusive",
    defaultCurrency: settings.defaultCurrency || org?.baseCurrency || "GBP", // currency:allow final safety net
    requireApproval: settings.requireApproval ?? true,
    lockClosedPeriods: settings.lockClosedPeriods ?? false,
  };
}

// ─── WRITE ACTION ────────────────────────────────────────────────────

export async function savePurchaseSettingsAction(data: SaveSettingsInput) {
  try {
    const workspace = await requireAccountantRole();

    // 🚀 Removed the parseInt() functions! We keep them as strings to match your database.
    await prisma.purchaseSettings.upsert({
          where: { organizationId: workspace.organizationId },
          update: {
            billPrefix: data.billPrefix,
            nextBillNumber: data.nextBillNumber || "1001",
            claimPrefix: data.claimPrefix,
            nextClaimNumber: data.nextClaimNumber || "5001",
            defaultTerms: data.defaultTerms || "30",
            defaultTaxRate: data.defaultAmountType, // 🚀 Saves the new UI state secretly into the existing DB column
            defaultCurrency: data.defaultCurrency as CurrencyCode,
            requireApproval: data.requireApproval,
            lockClosedPeriods: data.lockClosedPeriods,
          },
          create: {
            organizationId: workspace.organizationId,
            billPrefix: data.billPrefix,
            nextBillNumber: data.nextBillNumber || "1001",
            claimPrefix: data.claimPrefix,
            nextClaimNumber: data.nextClaimNumber || "5001",
            defaultTerms: data.defaultTerms || "30",
            defaultTaxRate: data.defaultAmountType, // 🚀 Saves the new UI state secretly into the existing DB column
            defaultCurrency: data.defaultCurrency as CurrencyCode,
            requireApproval: data.requireApproval,
            lockClosedPeriods: data.lockClosedPeriods,
          },
        });

    return { success: true };
  } catch (error) {
    console.error("Error saving purchase settings:", error);
    return { success: false, error: "Database transaction failed." };
  }
}