import { PurchaseOrders } from "@/components/purchases/purchase-orders";

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { action } = await searchParams;
  return <PurchaseOrders initialCreate={action === "create"} />;
}
