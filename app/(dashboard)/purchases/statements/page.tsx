import { SupplierStatementsUI } from "@/components/purchases/supplier-statements";
import { readImpersonation } from "@/lib/admin/impersonation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export default async function SupplierStatementsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const impersonation = await readImpersonation();
  
  let activeOrgId = impersonation?.orgId;

  if (!activeOrgId && user) {
    const userOrg = await prisma.organization.findFirst({
      where: { members: { some: { userId: user.id } } },
      select: { id: true }
    });
    activeOrgId = userOrg?.id;
  }

  if (!activeOrgId) return <div>Error: No active workspace found.</div>;

  return <SupplierStatementsUI activeOrgId={activeOrgId} />;
}