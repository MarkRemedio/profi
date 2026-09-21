import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { loadCustomerStatementBundles } from "@/lib/accounting/customer-statement-loader";
import { computeCustomerStatement } from "@/lib/accounting/customer-statement";
import { fetchDocumentBrandingDB } from "@/app/(dashboard)/sales/document-templates/actions";
import { mergeStatementDefaults } from "@/components/sales/document-templates/statement/statement-config";
import { accountingToday } from "@/lib/accounting/accounting-today";
import { StatementPrintClient } from "./statement-print-client";

export const dynamic = "force-dynamic";

export default async function PrintStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ from?: string; to?: string; asOf?: string }>;
}) {
  const { customerId } = await params;
  const { from, to, asOf } = await searchParams;

  // Auth + org resolution + onboarding gate (read-only view).
  const workspace = await requireAccountingWorkspace();

  // Org-scoped load. Missing customer → notFound(), which also blocks cross-org
  // access because the loader only returns the caller's own customers.
  const bundles = await loadCustomerStatementBundles(prisma, workspace.organizationId);
  const bundle = bundles.find((b) => b.customer.id === customerId);
  if (!bundle) return notFound();

  const branding = await fetchDocumentBrandingDB(workspace.organizationId, "statement");
  const config = mergeStatementDefaults(branding);

  const orgRow = await prisma.organization.findUnique({
    where: { id: workspace.organizationId },
    select: { baseCurrency: true, vatRegistered: true },
  });
  const workspaceBaseCurrency = orgRow?.baseCurrency ?? "GBP"; // currency:allow last-resort default

  const asOfDate = asOf ?? accountingToday();
  const statement = computeCustomerStatement({
    invoices: bundle.invoices,
    documents: bundle.documents,
    // The print route renders outside the workspace shell, so the currency
    // has to be read here rather than taken from the CurrencyProvider.
    params: { fromDate: from ?? null, toDate: to ?? null, asOfDate, currency: workspaceBaseCurrency },
  });

  return (
    <StatementPrintClient
      config={config}
      data={{
        customer: bundle.customer,
        statement,
        period: { from: from ?? null, to: to ?? null, asOf: asOfDate },
        // A business that is not VAT registered must not show VAT to a
        // customer, and a column of zeros is still showing it.
        vatRegistered: orgRow?.vatRegistered ?? true,
      }}
    />
  );
}
