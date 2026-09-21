import { Customers } from "@/components/sales/customers";
import { readImpersonation } from "@/lib/admin/impersonation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { action } = await searchParams;
  // 🚀 1. Fetch the real logged-in user from Supabase
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 🚀 2. Read the Impersonation session
  const impersonation = await readImpersonation();

  // 🕵️‍♂️ 3. DYNAMIC WORKSPACE LOOKUP (Exactly like your layout.tsx!)
  let activeOrgId = impersonation?.orgId;

  if (!activeOrgId && user) {
    const userOrg = await prisma.organization.findFirst({
      where: {
        members: {
          some: { userId: user.id },
        },
      },
      select: { id: true },
    });
    activeOrgId = userOrg?.id;
  }

  // Fallback if somehow they have NO workspace
  if (!activeOrgId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-slate-500">Error: No active workspace found.</p>
      </div>
    );
  }

  // 🚀 4. Pass the verified ID straight into the Client Component!
  return <Customers activeOrgId={activeOrgId} initialCreate={action === "create"} />;
}
