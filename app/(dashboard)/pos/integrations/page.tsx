import { POSIntegrations } from "@/components/pos/integrations";
import { Suspense } from "react";

export default function IntegrationsPage() {
  return (
    <Suspense fallback={null}>
      <POSIntegrations />
    </Suspense>
  );
}
