import { TimeOff } from "@/components/payroll/timeoff";
import { Suspense } from "react";

export default function TimeOffPage() {
  return (
    <Suspense fallback={null}>
      <TimeOff />
    </Suspense>
  );
}
