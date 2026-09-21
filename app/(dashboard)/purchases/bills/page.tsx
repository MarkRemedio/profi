import { Purchases } from "@/components/purchases/purchases";
import { requireAccountingWorkspace } from "@/lib/accounting/dal";

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; poId?: string }>;
}) {
  const { action, poId } = await searchParams;
  // The bill form previews against this workspace's own bill branding, which is
  // read by organisation id.
  const workspace = await requireAccountingWorkspace();
  return (
    <Purchases
      initialCreate={action === "create"}
      initialPurchaseOrderId={poId ?? null}
      activeOrgId={workspace.organizationId}
    />
  );
}
