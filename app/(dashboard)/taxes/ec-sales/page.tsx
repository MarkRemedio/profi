import { ECSalesView } from "@/components/taxes/ec-sales-view";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { getEcSales } from "@/lib/accounting/tax-modules";

export const dynamic = "force-dynamic";

export default async function ECSalesPage() {
  const workspace = await requireAccountingWorkspace();

  const data = await getEcSales(workspace.organizationId);

  return <ECSalesView data={data} />;
}
