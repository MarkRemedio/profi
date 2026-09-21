import { POSReconciliation } from "@/components/pos/reconciliation";
import { Suspense } from "react";

export default function ReconciliationPage() {
  return (
    <Suspense fallback={null}>
      <POSReconciliation />
    </Suspense>
  );
}
