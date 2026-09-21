import { PurchaseOrderEditor } from "@/components/purchases/purchase-order-editor";

export const dynamic = "force-dynamic";

export default async function EditPurchaseOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <PurchaseOrderEditor orderId={orderId} />;
}
