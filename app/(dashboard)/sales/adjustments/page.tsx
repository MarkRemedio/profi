import { Adjustments } from "@/components/sales/adjustments";
import { readImpersonation } from "@/lib/admin/impersonation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export default async function AdjustmentsPage() {
  // 🔍 1. Fetch user & impersonation session context data
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const impersonation = await readImpersonation();
  
  // 🏢 2. Dynamic Workspace Lookup
  let activeOrgId = impersonation?.orgId;

  if (!activeOrgId && user) {
    const userOrg = await prisma.organization.findFirst({
      where: { members: { some: { userId: user.id } } },
      select: { id: true }
    });
    activeOrgId = userOrg?.id;
  }

  // Fallback guard if session context is completely dropped
  if (!activeOrgId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-slate-500">Error: No active workspace found.</p>
      </div>
    );
  }

  /* Whether this business charges VAT at all, and the rates it has actually
     configured. Read here rather than hardcoded in the dialog: a business that
     is not registered must not be asked which VAT rate it is reversing, and one
     that is should be offered its own rates rather than a guess at the UK
     defaults. */
  const [organization, taxRates] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: activeOrgId },
      select: { vatRegistered: true },
    }),
    prisma.taxRate.findMany({
      /* Both, exactly as listDocumentOptions does for invoices and bills.
         The standard rates are global rows with a null organizationId — they
         are the same 20%, 5% and zero-rated everywhere — and only a rate a
         workspace has added itself carries an org id. Filtering on the org id
         alone returned nothing but the "No VAT" fallback, on a workspace that
         is VAT registered. */
      where: {
        isActive: true,
        OR: [{ organizationId: null }, { organizationId: activeOrgId }],
      },
      select: { code: true, name: true, rate: true },
      orderBy: { rate: "desc" },
    }),
  ]);

  // 🚀 3. Pass the true active organization down to the ledger timeline grid!
  return (
    <Adjustments
      activeOrgId={activeOrgId}
      vatRegistered={organization?.vatRegistered ?? false}
      taxRates={taxRates.map((rate) => ({
        code: rate.code,
        name: rate.name,
        // Decimal cannot cross into a client component.
        rate: Number(rate.rate),
      }))}
    />
  );
}