import { POSRefunds } from "@/components/pos/refunds";
import { Suspense } from "react";

export default function RefundsPage() {
  return (
    <Suspense fallback={null}>
      <POSRefunds />
    </Suspense>
  );
}
