import { Payslips } from "@/components/payroll/payslips";
import { Suspense } from "react";

export default function PayslipsPage() {
  return (
    <Suspense fallback={null}>
      <Payslips />
    </Suspense>
  );
}
