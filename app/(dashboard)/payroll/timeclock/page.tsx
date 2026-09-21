import { PayrollTimeClock } from "@/components/payroll/timeclock";
import { Suspense } from "react";

export default function TimeClockPage() {
  return (
    <Suspense fallback={null}>
      <PayrollTimeClock />
    </Suspense>
  );
}
