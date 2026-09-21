import { CisView } from "@/components/taxes/cis-view";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { getCis } from "@/lib/accounting/tax-modules";

export const dynamic = "force-dynamic";

export default async function CisPage() {
  const workspace = await requireAccountingWorkspace();

  const data = await getCis(workspace.organizationId);

  return <CisView data={data} />;
}
