import { SalesReceipts } from "@/components/sales/receipts/sales-receipts";

export default async function SalesReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ receiptId?: string }>;
}) {
  const { receiptId } = await searchParams;
  return <SalesReceipts initialReceiptId={receiptId} />;
}
