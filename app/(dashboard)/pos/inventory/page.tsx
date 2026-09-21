import { InventoryManager } from "@/components/pos/inventory-manager";
import { Suspense } from "react";

export default function InventoryPage() {
  return (
    <Suspense fallback={null}>
      <InventoryManager />
    </Suspense>
  );
}
