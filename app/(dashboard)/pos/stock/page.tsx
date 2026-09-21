import { POSStock } from "@/components/pos/stock";
import { Suspense } from "react";

export default function StockPage() {
  return (
    <Suspense fallback={null}>
      <POSStock />
    </Suspense>
  );
}
