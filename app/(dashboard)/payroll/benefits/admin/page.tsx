import { BenefitsAdmin } from "@/components/payroll/benefits-admin";
import { Suspense } from "react";

export default function BenefitsAdminPage() {
  return (
    <Suspense fallback={null}>
      <BenefitsAdmin />
    </Suspense>
  );
}
