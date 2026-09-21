import { POSHardware } from "@/components/pos/hardware";
import { Suspense } from "react";

export default function HardwarePage() {
  return (
    <Suspense fallback={null}>
      <POSHardware />
    </Suspense>
  );
}
