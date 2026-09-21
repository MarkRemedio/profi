import { prisma } from "@/lib/prisma"; 
import { runAsSystem } from "@/lib/tenancy/context"; 
import { ProfileAccessView } from "@/components/settings/profile-access-view";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ProfileAccessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // A. Resolve what workspace/organization this user role belongs to
  const userWorkspaceMapping = await runAsSystem(async () => {
    return await prisma.userRole.findFirst({
      where: { userId: user.id },
      select: { organizationId: true }
    });
  });

  if (!userWorkspaceMapping) {
    redirect("/onboarding");
  }

  // B. Pull full core data records for this workspace environment
  const organizationData = await runAsSystem(async () => {
    return await prisma.organization.findUnique({
      where: { id: userWorkspaceMapping.organizationId },
      include: {
        subscriptionPlan: true,
        invitations: true, // 🚀 ADDED: Pull pending invitations from the database
        members: {
          include: {
            users: {
              select: {
                id: true,
                email: true,
                raw_user_meta_data: true
              }
            }
          }
        }
      }
    });
  });

  if (!organizationData) return <div>Failed to resolve subscription parameters.</div>;

  // Find the database record for the logged-in user profile view
  const currentUserMember = organizationData.members.find(m => m.users.id === user.id);
  const currentDbUser = currentUserMember?.users;
  const currentUserRole = currentUserMember?.role || "EMPLOYEE"; // 🚀 NEW: Grabs your real database role
  const userMeta = (currentDbUser?.raw_user_meta_data as Record<string, any>) || {};

  const formattedMembers = organizationData.members.map((m) => ({
    id: m.id,
    role: m.role,
    customFeatures: m.customFeatures || [], // 🚀 NEW: Grab the checkboxes from the DB!
    user: {
      id: m.users.id,
      email: m.users.email,
      raw_user_meta_data: m.users.raw_user_meta_data
    }
  }));

  return (
    <ProfileAccessView
      role={currentUserRole} // 🚀 NEW: Passes your live role prop down to the component
      organizationId={organizationData.id}
      currentPlanName={organizationData.subscriptionPlan?.name || "Trialing Tier"}
      allowedSeats={organizationData.subscriptionPlan?.seats ?? 3}
      members={formattedMembers}
      pendingInvites={organizationData.invitations} // 🚀 ADDED: Pass the invites to your client component
      currentUserId={user.id}
      currentUserEmail={currentDbUser?.email || user.email || ""}
      initialFirstName={userMeta.first_name || ""}
      initialLastName={userMeta.last_name || ""}
    />
  );
}