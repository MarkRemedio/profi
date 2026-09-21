import { SuppliersUI } from "@/components/purchases/suppliers";
import { readImpersonation } from "@/lib/admin/impersonation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Suppliers | WAWPROFI",
  description: "Manage your supplier directory and vendor accounts.",
};

// 🚀 Make sure it says 'async function' here!
export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { action } = await searchParams;
  // 1. Fetch user & impersonation data
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const impersonation = await readImpersonation();

  // 2. Dynamic Workspace Lookup
  let activeOrgId = impersonation?.orgId;

  if (!activeOrgId && user) {
    const userOrg = await prisma.organization.findFirst({
      where: { members: { some: { userId: user.id } } },
      select: { id: true },
    });
    activeOrgId = userOrg?.id;
  }

  if (!activeOrgId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-slate-500">Error: No active workspace found.</p>
      </div>
    );
  }

  // 🚀 3. Pass the ID straight into your updated UI component!
  return <SuppliersUI activeOrgId={activeOrgId} initialCreate={action === "create"} />;
}
