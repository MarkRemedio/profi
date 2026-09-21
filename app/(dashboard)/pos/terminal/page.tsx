import { POSTerminal } from "@/components/pos/terminal";
import { Suspense } from "react";

export default function TerminalPage() {
  return (
    <Suspense fallback={null}>
      <POSTerminal />
    </Suspense>
  );
}
