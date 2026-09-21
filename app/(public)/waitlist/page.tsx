import { Suspense } from "react";

import { WaitlistShell } from "@/components/marketing/waitlist/waitlist-shell";
import { FaqSection } from "@/components/marketing/waitlist/faq-section";

export default function WaitlistPage() {
  return (
    <div className="min-h-screen bg-white flex flex-col justify-between font-sans selection:bg-blue-500/10">

      {/* Form Grid Workspace & FAQ Layout Pipeline */}
      <main className="flex-1 flex flex-col justify-center pt-8">
        <div className="w-full">
          {/* WaitlistShell calls useSearchParams(); Suspense lets the page prerender. */}
          <Suspense fallback={null}>
            <WaitlistShell />
          </Suspense>
        </div>
        
        {/* Cream FAQ Section leading directly into the pure white footer bar */}
        <FaqSection />
      </main>

    </div>
  );
}