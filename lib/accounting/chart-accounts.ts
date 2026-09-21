import "server-only";

import {
  AuditAction,
  type AccountReportCategory,
  type AccountType,
} from "@prisma/client";

import type { ExtendedPrismaClient } from "@/lib/prisma";
import {
  isUniqueViolation,
  resolveOrCreateSystemAccount,
} from "@/lib/accounting/documents";

export type CreateChartAccountInput = {
  code: string;
  name: string;
  description?: string;
  accountType: AccountType;
  reportCategory: AccountReportCategory;
  taxCode?: string;
  taxRate?: number;
};

export async function createChartAccountRecord(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  actorUserId: string,
  input: CreateChartAccountInput
) {
  const code = input.code.trim();
  const name = input.name.trim();

  if (!/^\d+$/.test(code)) {
    throw new Error("Account code must contain numbers only.");
  }
  if (!name) {
    throw new Error("Account name is required.");
  }

  const existing = await prisma.chartAccount.findFirst({
    where: { organizationId, code },
    select: { id: true },
  });
  if (existing) {
    throw new Error("This account code already exists.");
  }

  let account;
  try {
    account = await prisma.$transaction(async (tx) => {
      const created = await tx.chartAccount.create({
        data: {
          organizationId,
          code,
          name,
          description: input.description?.trim() || null,
          accountType: input.accountType,
          reportCategory: input.reportCategory,
          taxCode: input.taxCode ?? "no_vat",
          taxRate: (input.taxRate ?? 0).toFixed(2),
          isSystem: false,
          isActive: true,
        },
        select: {
          id: true,
          code: true,
          name: true,
          accountType: true,
          reportCategory: true,
          taxCode: true,
        },
      });

      await tx.auditEvent.create({
        data: {
          organizationId,
          actorUserId,
          entityType: "chart_account",
          entityId: created.id,
          action: AuditAction.CREATE,
          after: { code: created.code, name: created.name },
        },
      });

      return created;
    });
  } catch (error) {
    // Handle race condition: if a concurrent request created the same account code,
    // the database unique constraint @@unique([organizationId, code]) will throw P2002.
    // Convert this to the same friendly message as the pre-check above.
    if (isUniqueViolation(error)) {
      throw new Error("This account code already exists.");
    }
    // Rethrow any other error unchanged
    throw error;
  }

  return account;
}

// Shipping and ad-hoc charges are modelled as ordinary document lines against
// these accounts so VAT, posting, and reports need no special cases. Codes
// 4900/5900/4910 verified free against lib/accounting/account-templates.ts and
// the account_templates seed (prisma/migrations/20260511100000_account_templates)
// — do not reuse without re-checking.
const SHIPPING_ACCOUNTS = {
  income: {
    code: "4900",
    name: "Shipping Income",
    accountType: "REVENUE",
    reportCategory: "OTHER_INCOME",
  },
  expense: {
    code: "5900",
    name: "Shipping & Delivery",
    accountType: "EXPENSE",
    reportCategory: "EXPENSE",
  },
} as const;

// Custom invoice charges typed straight onto the form (no catalogue item, so
// no per-charge account) post here — the exact mechanism shipping uses.
const OTHER_CHARGES_ACCOUNT = {
  code: "4910",
  name: "Other Charges",
  accountType: "REVENUE",
  reportCategory: "OTHER_INCOME",
} as const;

type SystemLineAccountTarget = {
  code: string;
  name: string;
  accountType: AccountType;
  reportCategory: AccountReportCategory;
};

async function ensureSystemLineAccount(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  target: SystemLineAccountTarget,
  featureLabel: string
) {
  let id: string;
  try {
    id = await resolveOrCreateSystemAccount(prisma, organizationId, {
      code: target.code,
      name: target.name,
      accountType: target.accountType,
      reportCategory: target.reportCategory,
    });
  } catch (error) {
    // resolveOrCreateSystemAccount's existence-check filters on accountType
    // AND isActive, but the DB unique constraint @@unique([organizationId, code])
    // is code-only. So a unique violation here can mean several things:
    //   (a) a concurrent double-click already created/resolved the correct
    //       account in the other call (raced request), or
    //   (b) an archived (isActive: false) account already sits at this code, or
    //   (c) a genuinely different, manually-created account (different
    //       accountType) occupies the code.
    // Re-check by code alone (no accountType/isActive filter) to tell these
    // apart instead of always surfacing the "already in use" error.
    if (!isUniqueViolation(error)) {
      throw error;
    }

    const existing = await prisma.chartAccount.findFirst({
      where: { organizationId, code: target.code },
      select: { id: true, accountType: true, isActive: true },
    });

    if (!existing || existing.accountType !== target.accountType) {
      throw new Error(
        `Account code ${target.code} is already in use by another account. Rename or remove it, then try adding ${featureLabel} again.`
      );
    }

    if (!existing.isActive) {
      await prisma.chartAccount.update({
        where: { id: existing.id },
        data: { isActive: true },
      });
    }

    id = existing.id;
  }
  return { id, code: target.code, name: target.name };
}

export async function ensureShippingAccount(
  prisma: ExtendedPrismaClient,
  organizationId: string,
  kind: keyof typeof SHIPPING_ACCOUNTS
) {
  const target = SHIPPING_ACCOUNTS[kind];
  return ensureSystemLineAccount(
    prisma,
    organizationId,
    {
      code: target.code,
      name: target.name,
      accountType: target.accountType as AccountType,
      reportCategory: target.reportCategory as AccountReportCategory,
    },
    "shipping"
  );
}

export async function ensureOtherChargesAccount(
  prisma: ExtendedPrismaClient,
  organizationId: string
) {
  return ensureSystemLineAccount(
    prisma,
    organizationId,
    {
      code: OTHER_CHARGES_ACCOUNT.code,
      name: OTHER_CHARGES_ACCOUNT.name,
      accountType: OTHER_CHARGES_ACCOUNT.accountType as AccountType,
      reportCategory: OTHER_CHARGES_ACCOUNT.reportCategory as AccountReportCategory,
    },
    "the charge"
  );
}
