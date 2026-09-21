import { CapitalGainsView } from "@/components/taxes/capital-gains-view";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { getCapitalGains } from "@/lib/accounting/tax-modules";

export const dynamic = "force-dynamic";

export default async function CapitalGainsPage() {
  const workspace = await requireAccountingWorkspace();

  const data = await getCapitalGains(workspace.organizationId);

  return <CapitalGainsView data={data} />;
}
