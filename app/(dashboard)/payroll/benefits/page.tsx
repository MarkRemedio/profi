import { Benefits } from "@/components/payroll/benefits";
import { Suspense } from "react";

export default function BenefitsPage() {
  return (
    <Suspense fallback={null}>
      <Benefits />
    </Suspense>
  );
}
