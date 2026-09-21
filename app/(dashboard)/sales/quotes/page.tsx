import { Quotes } from "@/components/sales/quotes";
import { readImpersonation } from "@/lib/admin/impersonation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string }>;
}) {
  const { action } = await searchParams;
  // 🚀 1. Fetch user & impersonation data from the server session
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const impersonation = await readImpersonation();

  // 🕵️‍♂️ 2. Dynamic Workspace Lookup (handles Impersonation Mode)
  let activeOrgId = impersonation?.orgId;

  if (!activeOrgId && user) {
    const userOrg = await prisma.organization.findFirst({
      where: { members: { some: { userId: user.id } } },
      select: { id: true },
    });
    activeOrgId = userOrg?.id;
  }

  // Fallback if somehow they don't have an active workspace
  if (!activeOrgId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-slate-500">Error: No active workspace found.</p>
      </div>
    );
  }

  // 🚀 3. Pass the ID down to the Quotes component!
  return <Quotes activeOrgId={activeOrgId} initialCreate={action === "create"} />;
}
