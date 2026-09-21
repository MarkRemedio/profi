"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import {
  normaliseBusinessStructure,
  type BusinessStructure,
} from "@/lib/accounting/financial-year";

/**
 * The facts that decide which taxes a business has at all.
 *
 * A limited company owes corporation tax nine months after its year end; a sole
 * trader files a self assessment the following 31 January; a contractor files
 * CIS300 every month. None of that can be worked out from the ledger, and until
 * now none of it could be changed after signup either — the onboarding wizard
 * asked, then discarded the answers.
 */

export type TaxProfile = {
  structure: BusinessStructure | null;
  /** yyyy-mm-dd, or null when never recorded. */
  financialYearEnd: string | null;
  isCisContractor: boolean;
  /** Companies House registration number. */
  companyNumber: string | null;
  /** HMRC Unique Taxpayer Reference. */
  taxReference: string | null;
  /** Employer PAYE reference. Read by payroll, which lives in another repo. */
  payeReference: string | null;
  /** What the business does — "Nature of business" at signup. */
  industry: string | null;
};

export async function getTaxProfile(): Promise<TaxProfile> {
  const workspace = await requireAccountingWorkspace();

  const org = await prisma.organization.findUnique({
    where: { id: workspace.organizationId },
    select: {
      businessStructure: true,
      accountingPeriodEnd: true,
      cisStatus: true,
      companyNumber: true,
      taxReference: true,
      payeReference: true,
      industry: true,
    },
  });

  return {
    structure: normaliseBusinessStructure(org?.businessStructure),
    financialYearEnd: org?.accountingPeriodEnd?.toISOString().slice(0, 10) ?? null,
    isCisContractor: org?.cisStatus === "contractor",
    companyNumber: org?.companyNumber ?? null,
    taxReference: org?.taxReference ?? null,
    payeReference: org?.payeReference ?? null,
    industry: org?.industry ?? null,
  };
}

const STRUCTURES: BusinessStructure[] = [
  "limited_company",
  "plc",
  "cic",
  "sole_trader",
  "partnership",
  "charity",
  "other",
];

export type SaveTaxProfileResult = { ok: true } | { ok: false; error: string };

export async function saveTaxProfile(input: {
  structure?: string | null;
  financialYearEnd?: string | null;
  isCisContractor?: boolean;
  companyNumber?: string | null;
  taxReference?: string | null;
  payeReference?: string | null;
  industry?: string | null;
}): Promise<SaveTaxProfileResult> {
  const workspace = await requireAccountingWorkspace();

  const data: {
    businessStructure?: string;
    accountingPeriodStart?: Date | null;
    accountingPeriodEnd?: Date | null;
    cisStatus?: string;
    companyNumber?: string | null;
    taxReference?: string | null;
    payeReference?: string | null;
    industry?: string | null;
  } = {};

  // Stored as typed, minus surrounding space. Neither has a checkable format —
  // a UTR is ten digits but HMRC prints it with a space, and a company number
  // can carry a country prefix like SC or NI — so validating either would
  // reject numbers that are perfectly real.
  if (input.companyNumber !== undefined) {
    data.companyNumber = input.companyNumber?.trim() || null;
  }
  if (input.taxReference !== undefined) {
    data.taxReference = input.taxReference?.trim() || null;
  }
  if (input.payeReference !== undefined) {
    data.payeReference = input.payeReference?.trim() || null;
  }
  if (input.industry !== undefined) {
    data.industry = input.industry?.trim() || null;
  }

  if (input.structure) {
    if (!STRUCTURES.includes(input.structure as BusinessStructure)) {
      return { ok: false, error: "Unknown business structure." };
    }
    // Written in the long form. The wizard's short forms ("ltd", "sole") are
    // still read, but nothing new should add to that split.
    data.businessStructure = input.structure;
  }

  if (input.financialYearEnd !== undefined) {
    if (input.financialYearEnd === null || input.financialYearEnd === "") {
      data.accountingPeriodStart = null;
      data.accountingPeriodEnd = null;
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.financialYearEnd)) {
        return { ok: false, error: "Enter the year end as a date." };
      }
      const end = new Date(`${input.financialYearEnd}T00:00:00.000Z`);
      if (Number.isNaN(end.getTime())) {
        return { ok: false, error: "That is not a real date." };
      }

      const start = new Date(end);
      start.setUTCFullYear(start.getUTCFullYear() - 1);
      start.setUTCDate(start.getUTCDate() + 1);

      data.accountingPeriodStart = start;
      data.accountingPeriodEnd = end;
    }
  }

  if (input.isCisContractor !== undefined) {
    data.cisStatus = input.isCisContractor ? "contractor" : "none";
  }

  if (Object.keys(data).length === 0) return { ok: true };

  await prisma.organization.update({
    where: { id: workspace.organizationId },
    data,
  });

  // The year end also sets the VAT stagger, so the VAT page's periods move too.
  revalidatePath("/taxes");
  revalidatePath("/taxes/vat");
  return { ok: true };
}
