import { ForexView } from "@/components/taxes/forex-view";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";
import { getForex } from "@/lib/accounting/forex";

export const dynamic = "force-dynamic";

export default async function ForexPage() {
  const workspace = await requireAccountingWorkspace();

  const data = await getForex(workspace.organizationId);

  return <ForexView data={data} />;
}
