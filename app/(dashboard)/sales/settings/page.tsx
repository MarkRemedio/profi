import { DocumentTemplateWorkspace } from "@/components/sales/document-templates/workspace";
import { readImpersonation } from "@/lib/admin/impersonation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
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

  // 📦 3. Pass the true active organization down to your inputs!
  return <DocumentTemplateWorkspace activeOrgId={activeOrgId} />;
}