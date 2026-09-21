"use server";

import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { canManageWorkspaceSettings } from "@/lib/accounting/workspace-permissions";
import {
  companiesHouseConfigured,
  fetchCompanyRecord,
  isCompaniesHouseSandbox,
  searchCompanies,
  type CompanyMatch,
} from "@/lib/companies-house/client";
import {
  mapCompanyStructure,
  mapFinancialYearEnd,
  mapNatureOfBusiness,
} from "@/lib/companies-house/mapping";

/**
 * Looking a business up on the register, so its details are not typed twice.
 *
 * Behind the same permission as the settings dialog these fill in. The register
 * is public, so nothing here is confidential — but our API key is not, and an
 * open action is a free proxy onto it that anyone could call from a console and
 * exhaust the rate limit with. Signed-in members who may edit the profile, and
 * nobody else.
 *
 * Nothing found and nothing available are told apart deliberately. "No company
 * of that name" is an answer, "the register is not responding" is a fault, and
 * a form that reports the first when it means the second sends somebody looking
 * for a company they know perfectly well exists.
 */

export type CompanySearchResponse =
  /** `sandbox` so an empty result can say why rather than just "no matches". */
  | { status: "ok"; matches: CompanyMatch[]; sandbox: boolean }
  | { status: "not_configured" }
  | { status: "unavailable" };

export type CompanyFill = {
  companyNumber: string;
  name: string;
  /** Null where the record does not say, so the caller leaves the field alone. */
  structure: string | null;
  financialYearEnd: string | null;
  industry: string | null;
  /** Dissolved and liquidated companies are worth a word before they are used. */
  status: string | null;
};

export type CompanyFillResponse =
  | { status: "ok"; company: CompanyFill }
  | { status: "not_found" }
  | { status: "not_configured" }
  | { status: "unavailable" };

async function assertMayLookUp(): Promise<void> {
  const workspace = await requireAccountingWorkspace();
  if (!canManageWorkspaceSettings(workspace.role, workspace.customFeatures)) {
    throw new Error("You do not have permission to change workspace settings.");
  }
}

export async function searchCompaniesHouse(query: string): Promise<CompanySearchResponse> {
  await assertMayLookUp();
  if (!companiesHouseConfigured()) return { status: "not_configured" };

  const matches = await searchCompanies(query);
  return { status: "ok", matches, sandbox: isCompaniesHouseSandbox() };
}

export async function fillFromCompaniesHouse(companyNumber: string): Promise<CompanyFillResponse> {
  await assertMayLookUp();
  if (!companiesHouseConfigured()) return { status: "not_configured" };

  const record = await fetchCompanyRecord(companyNumber);
  if (!record) return { status: "not_found" };

  return {
    status: "ok",
    company: {
      companyNumber: record.companyNumber,
      name: record.name,
      structure: mapCompanyStructure(record.type, record.subtype),
      // Read here rather than inside the mapper so the result is a pure
      // function of its arguments and can be tested against a fixed date.
      financialYearEnd: mapFinancialYearEnd(record.accounts, new Date()),
      industry: mapNatureOfBusiness(record.sicCodes),
      status: record.status,
    },
  };
}
