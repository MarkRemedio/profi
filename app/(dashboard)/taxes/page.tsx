import { TaxesDashboard } from "@/components/taxes/taxes-dashboard";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { getTaxOverview } from "@/lib/accounting/tax-overview";

export const dynamic = "force-dynamic";

export default async function TaxesPage() {
  const workspace = await requireAccountingWorkspace();

  // Deadlines and liability estimates derived from this workspace's structure,
  // year end and ledger. Everything on the page comes from here, so the figures
  // cannot disagree with each other over which dates they cover.
  const overview = await getTaxOverview(workspace.organizationId);

  return <TaxesDashboard overview={overview} />;
}
