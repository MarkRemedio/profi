import { POSReports } from "@/components/pos/reports";
import { Suspense } from "react";

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <POSReports />
    </Suspense>
  );
}
