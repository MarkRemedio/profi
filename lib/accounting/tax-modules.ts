import "server-only";

import { prisma } from "@/lib/prisma";
import { accountingToday } from "@/lib/accounting/accounting-today";
import {
  currentFinancialYear,
  nextCisReturnDue,
  normaliseBusinessStructure,
  type BusinessStructure,
} from "@/lib/accounting/financial-year";
import { contactDisplayName, CONTACT_NAME_SELECT } from "@/lib/accounting/contact-name";
import { euCountryFromVatNumber } from "@/lib/tax/eu-vat";

/**
 * EC Sales, CIS and Capital Gains.
 *
 * These three are grouped because they share a problem the others do not: the
 * product records almost nothing they need. There is no fixed asset register,
 * nothing marks a payment as being under the Construction Industry Scheme, and
 * a contact has no country — only a free-text tax number.
 *
 * So each one derives what it honestly can, and states what is missing. A page
 * that shows nothing is a worse answer than one that explains why, but both are
 * far better than the invented subcontractors and property disposals these
 * screens used to display.
 *
 * None of this is a placeholder: the queries are real, and each page fills in
 * the moment the underlying data exists.
 */

export type ModuleRequirement = {
  key: string;
  label: string;
  detail: string;
  /** Where the user would go to provide it, when there is somewhere. */
  href?: string;
  /** True once the thing exists, so progress is visible. */
  satisfied: boolean;
};

/* -------------------------------------------------------------------------- */
/* EC Sales List                                                              */
/* -------------------------------------------------------------------------- */

export type EcSalesCustomer = {
  id: string;
  name: string;
  vatNumber: string;
  country: string;
  salesBaseMinor: number;
  invoiceCount: number;
};

export type EcSalesData = {
  today: string;
  baseCurrency: string;
  vatRegistered: boolean;
  period: { fromDate: string; toDate: string };
  customers: EcSalesCustomer[];
  totalSalesBaseMinor: number;
  /** Customers invoiced in the period with no VAT number recorded at all. */
  customersWithoutVatNumber: number;
  requirements: ModuleRequirement[];
};

export async function getEcSales(organizationId: string): Promise<EcSalesData> {
  const today = accountingToday();

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrency: true, vatRegistered: true, accountingPeriodEnd: true },
  });

  const financialYear = currentFinancialYear(org?.accountingPeriodEnd ?? null, today);
  const fromDate = financialYear?.startDate ?? `${today.slice(0, 4)}-01-01`;
  const toDate = financialYear?.endDate ?? `${today.slice(0, 4)}-12-31`;

  const invoices = await prisma.invoice.findMany({
    where: {
      organizationId,
      status: { in: ["APPROVED", "SENT"] },
      issueDate: { gte: new Date(`${fromDate}T00:00:00.000Z`), lte: new Date(`${toDate}T00:00:00.000Z`) },
    },
    select: {
      id: true,
      baseTotalMinor: true,
      totalMinor: true,
      contactId: true,
      contact: { select: { id: true, taxNumber: true, ...CONTACT_NAME_SELECT } },
    },
  });

  const byCustomer = new Map<string, EcSalesCustomer>();
  let customersWithoutVatNumber = 0;
  const seenWithoutNumber = new Set<string>();

  for (const invoice of invoices) {
    const vatNumber = invoice.contact.taxNumber?.trim() ?? "";
    const country = euCountryFromVatNumber(vatNumber);

    if (!country) {
      if (!vatNumber && !seenWithoutNumber.has(invoice.contactId)) {
        seenWithoutNumber.add(invoice.contactId);
        customersWithoutVatNumber += 1;
      }
      continue;
    }

    const existing = byCustomer.get(invoice.contactId) ?? {
      id: invoice.contactId,
      name: contactDisplayName(invoice.contact),
      vatNumber,
      country,
      salesBaseMinor: 0,
      invoiceCount: 0,
    };

    // Base currency: an ESL is reported in sterling whatever the customer was
    // invoiced in.
    existing.salesBaseMinor += Number(invoice.baseTotalMinor || invoice.totalMinor || 0);
    existing.invoiceCount += 1;
    byCustomer.set(invoice.contactId, existing);
  }

  const customers = [...byCustomer.values()].sort(
    (a, b) => b.salesBaseMinor - a.salesBaseMinor
  );

  return {
    today,
    baseCurrency: org?.baseCurrency ?? "GBP", // currency:allow falls back to the column default
    vatRegistered: org?.vatRegistered ?? false,
    period: { fromDate, toDate },
    customers,
    totalSalesBaseMinor: customers.reduce((total, row) => total + row.salesBaseMinor, 0),
    customersWithoutVatNumber,
    requirements: [
      {
        key: "vat_registered",
        label: "VAT registration",
        detail: "An EC Sales List is a VAT return; only a registered business files one.",
        href: "/settings/workspace#vat",
        satisfied: org?.vatRegistered ?? false,
      },
      {
        key: "eu_vat_numbers",
        label: "Customer VAT numbers",
        detail:
          "A customer's VAT number identifies the country that registered them, and every ESL line needs it. Record it on the contact.",
        href: "/sales/customers",
        satisfied: customers.length > 0,
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Construction Industry Scheme                                               */
/* -------------------------------------------------------------------------- */

export type CisData = {
  today: string;
  baseCurrency: string;
  isContractor: boolean;
  structure: BusinessStructure | null;
  nextReturn: { periodEnd: string; dueDate: string };
  /** Chart accounts that look like they hold CIS deductions. */
  cisAccounts: Array<{ code: string; name: string; balanceMinor: number }>;
  supplierCount: number;
  requirements: ModuleRequirement[];
};

export async function getCis(organizationId: string): Promise<CisData> {
  const today = accountingToday();

  const [org, cisAccounts, supplierCount] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true, businessStructure: true, cisStatus: true },
    }),
    prisma.$queryRaw<Array<{ code: string; name: string; balance_minor: bigint }>>`
      select
        a.code, a.name,
        coalesce(sum(gle.credit_minor - gle.debit_minor), 0)::bigint as balance_minor
      from chart_of_accounts a
      left join general_ledger_entries gle on gle.account_id = a.id
      where a.org_id = ${organizationId}::uuid
        and a.is_active = true
        and a.name ilike '%cis%'
      group by a.code, a.name
      order by a.code
    `,
    prisma.contact.count({
      where: { organizationId, contactType: { in: ["SUPPLIER", "BOTH"] }, isActive: true },
    }),
  ]);

  const isContractor = org?.cisStatus === "contractor";

  return {
    today,
    baseCurrency: org?.baseCurrency ?? "GBP", // currency:allow falls back to the column default
    isContractor,
    structure: normaliseBusinessStructure(org?.businessStructure),
    nextReturn: nextCisReturnDue(today),
    cisAccounts: cisAccounts.map((row) => ({
      code: row.code,
      name: row.name,
      balanceMinor: Number(row.balance_minor),
    })),
    supplierCount,
    requirements: [
      {
        key: "contractor",
        label: "Registered as a contractor",
        detail:
          "Tick 'We pay CIS subcontractors' in your tax profile. A contractor files a CIS300 every month even when no payments were made.",
        href: "/settings/workspace#tax-profile",
        satisfied: isContractor,
      },
      {
        key: "deduction_account",
        label: "A CIS deductions account",
        detail:
          "Deductions withheld from a subcontractor are owed to HMRC, so they need a liability account of their own rather than sitting in accounts payable.",
        href: "/accounting/chart-of-accounts",
        satisfied: cisAccounts.length > 0,
      },
      {
        key: "subcontractor_marking",
        label: "Marking bills as CIS",
        detail:
          "Nothing on a bill records that it is a subcontractor payment, what the labour and materials split is, or which deduction rate applies. Without that, deductions cannot be totalled and no return can be produced.",
        satisfied: false,
      },
      {
        key: "verification",
        label: "Subcontractor verification",
        detail:
          "HMRC sets each subcontractor's rate at 0%, 20% or 30% when they are verified. That needs their UTR and an authorised HMRC connection, neither of which is recorded.",
        satisfied: false,
      },
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Capital gains                                                              */
/* -------------------------------------------------------------------------- */

export type CapitalDisposalRow = {
  id: string;
  journalDate: string;
  accountCode: string;
  accountName: string;
  memo: string;
  proceedsMinor: number;
};

export type CapitalGainsData = {
  today: string;
  baseCurrency: string;
  structure: BusinessStructure | null;
  period: { fromDate: string; toDate: string };
  assetAccounts: Array<{ code: string; name: string; balanceMinor: number }>;
  disposals: CapitalDisposalRow[];
  requirements: ModuleRequirement[];
};

export async function getCapitalGains(organizationId: string): Promise<CapitalGainsData> {
  const today = accountingToday();

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { baseCurrency: true, businessStructure: true, accountingPeriodEnd: true },
  });

  const financialYear = currentFinancialYear(org?.accountingPeriodEnd ?? null, today);
  const fromDate = financialYear?.startDate ?? `${today.slice(0, 4)}-01-01`;
  const toDate = financialYear?.endDate ?? `${today.slice(0, 4)}-12-31`;

  // tenancy:safe: SQL filters by a.org_id = organizationId in the WHERE clause; the type block pushes it beyond the 12-line lint window
  const assetAccounts = await prisma.$queryRaw<
    Array<{ code: string; name: string; balance_minor: bigint }>
  >`
    select
      a.code, a.name,
      coalesce(sum(gle.debit_minor - gle.credit_minor), 0)::bigint as balance_minor
    from chart_of_accounts a
    left join general_ledger_entries gle on gle.account_id = a.id
    where a.org_id = ${organizationId}::uuid
      and a.is_active = true
      and a.report_category in (
        'fixed_asset'::account_report_category,
        'non_current_asset'::account_report_category
      )
    group by a.code, a.name
    order by a.code
  `;

  // A disposal shows up as a credit to a fixed asset account: the asset leaves
  // the books. Anything else on those accounts is an acquisition.
  // tenancy:safe: SQL filters by gle.org_id = organizationId in the WHERE clause; the type block pushes it beyond the 12-line lint window
  const disposals = await prisma.$queryRaw<
    Array<{
      id: string;
      journal_date: Date;
      account_code: string;
      account_name: string;
      journal_memo: string | null;
      line_memo: string | null;
      credit_minor: bigint;
    }>
  >`
    select
      gle.id, gle.journal_date, gle.account_code, gle.account_name,
      gle.journal_memo, gle.line_memo, gle.credit_minor
    from general_ledger_entries gle
    where gle.org_id = ${organizationId}::uuid
      and gle.report_category in (
        'fixed_asset'::account_report_category,
        'non_current_asset'::account_report_category
      )
      and gle.credit_minor > 0
      and gle.journal_date >= ${fromDate}::date
      and gle.journal_date <= ${toDate}::date
    order by gle.journal_date desc
  `;

  return {
    today,
    baseCurrency: org?.baseCurrency ?? "GBP", // currency:allow falls back to the column default
    structure: normaliseBusinessStructure(org?.businessStructure),
    period: { fromDate, toDate },
    assetAccounts: assetAccounts.map((row) => ({
      code: row.code,
      name: row.name,
      balanceMinor: Number(row.balance_minor),
    })),
    disposals: disposals.map((row) => ({
      id: row.id,
      journalDate: row.journal_date.toISOString().slice(0, 10),
      accountCode: row.account_code,
      accountName: row.account_name,
      memo: row.line_memo ?? row.journal_memo ?? "Disposal",
      proceedsMinor: Number(row.credit_minor),
    })),
    requirements: [
      {
        key: "fixed_asset_accounts",
        label: "Fixed asset accounts",
        detail:
          "A chargeable gain arises when an asset is sold, so the asset has to be on the balance sheet first. Add accounts under Fixed assets for property, equipment or investments.",
        href: "/accounting/chart-of-accounts",
        satisfied: assetAccounts.length > 0,
      },
      {
        key: "asset_register",
        label: "An asset register",
        detail:
          "A gain is proceeds less what the asset cost, plus improvements and the costs of selling it. That needs each asset tracked individually with its purchase date — the chart of accounts holds only a total.",
        satisfied: false,
      },
      {
        key: "reliefs",
        label: "Reliefs and reporting",
        detail:
          "Business Asset Disposal Relief, the annual exempt amount and the 60-day residential property deadline all depend on facts about the seller, not the books.",
        satisfied: false,
      },
    ],
  };
}
