import { POSTransactions } from "@/components/pos/transactions";
import { Suspense } from "react";

export default function TransactionsPage() {
  return (
    <Suspense fallback={null}>
      <POSTransactions />
    </Suspense>
  );
}
