import { Suspense } from "react";

import { ChartOfAccountsShell } from "@/components/chart-of-accounts/chart-of-accounts-shell";

export default function ChartOfAccountsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#f8f9ff] px-6 py-10 text-sm font-semibold text-slate-500">
          Loading chart of accounts...
        </div>
      }
    >
      <ChartOfAccountsShell />
    </Suspense>
  );
}
