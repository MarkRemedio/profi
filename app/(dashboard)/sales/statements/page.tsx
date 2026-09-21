import { CustomerStatements } from "@/components/sales/customer-statements";
import { prisma } from "@/lib/prisma";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { loadCustomerStatementBundles } from "@/lib/accounting/customer-statement-loader";
import { accountingToday } from "@/lib/accounting/accounting-today";

// Queries the DB per request; opt out of static prerender at build time.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Customer Statements | Waw Profi",
  description: "Generate and view statements of accounts for your clients.",
};

export default async function StatementsPage() {
  // Resolve the caller's real org from their session (and enter the scoped
  // context). Previously this used prisma.organization.findFirst(), which
  // served the first organization in the entire database to any caller —
  // an org-isolation hole. requireAccountingWorkspace redirects unauthenticated
  // users and unonboarded users just like every other accounting route.
  const workspace = await requireAccountingWorkspace();

  const bundles = await loadCustomerStatementBundles(prisma, workspace.organizationId);

  /* Whether this business charges VAT at all. An unregistered one must not put
     VAT figures in front of a customer, and a column of zeros still does. */
  const org = await prisma.organization.findUnique({
    where: { id: workspace.organizationId },
    select: { vatRegistered: true },
  });

  // The "as at" date drives overdue/aging. Computed once on the server (per
  // request, since the page is force-dynamic) so it's stable and deterministic
  // rather than depending on the viewer's clock.
  const todayIso = accountingToday();

  return (
    <CustomerStatements
      bundles={bundles}
      todayIso={todayIso}
      vatRegistered={org?.vatRegistered ?? true}
    />
  );
}