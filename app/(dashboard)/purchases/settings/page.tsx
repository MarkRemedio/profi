import { PurchaseSettingsUI } from "@/components/purchases/purchase-settings";
import { prisma } from "@/lib/prisma";
import { requireAccountantRole } from "@/lib/accounting/dal";

export default async function PurchaseSettingsPage() {
  // 🚀 Step 1: Fetch the active accountant/workspace context on the server
  const workspace = await requireAccountantRole();

  // 🚀 Step 2: Grab the live onboarding VAT flag from the organization record
  const organization = await prisma.organization.findUnique({
    where: { id: workspace.organizationId },
    select: { vatRegistered: true },
  });

  return (
    <main className="flex w-full flex-col">
      {/* 🚀 Step 3: Pass both the VAT flag AND the Organization ID! */}
      <PurchaseSettingsUI 
        vatRegistered={organization?.vatRegistered ?? false} 
        activeOrgId={workspace.organizationId} 
      />
    </main>
  );
}