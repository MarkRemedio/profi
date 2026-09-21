import { TeamManagement } from "@/components/admin/team/team-management";
import { requireAdminPermission } from "@/lib/admin/auth";
import { getAdminUsers } from "./actions";

export const metadata = {
  title: "Team Management | Admin Portal",
  description: "Manage admin users, roles, and portal access.",
};

export default async function TeamPage() {
  const context = await requireAdminPermission("team");
  const admins = await getAdminUsers();

  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team Management</h1>
        <p className="text-muted-foreground">
          Add new admins, assign roles, and manage portal access.
        </p>
      </div>
      <TeamManagement
        initialAdmins={admins}
        currentUserId={context.user.id}
        canManage={context.isSuperAdmin}
      />
    </div>
  );
}