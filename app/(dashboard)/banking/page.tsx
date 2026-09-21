/**
 * Governs every Server Action invoked from this page, importStatement above
 * all: OCR, layout analysis and a 40s direct-extraction fallback ran against a
 * 60s ceiling, so a long multi-page statement was killed mid-parse and
 * surfaced to the browser as an opaque "unexpected response" error.
 *
 * Requires a Vercel Pro plan — Hobby caps functions at 60s and fails the build
 * above it.
 */
export const maxDuration = 300;

import { BankingDashboard } from "@/components/banking/banking-dashboard";

export default function BankingPage() {
  return (
    <div className="w-full">
      <BankingDashboard />
    </div>
  );
}