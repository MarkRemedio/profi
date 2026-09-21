import { AccountSettings } from "@/components/admin/settings/account-settings";
import { getAdminContext } from "@/lib/admin/auth";

export const metadata = {
  title: "Account Settings | Admin Portal",
  description: "Manage your admin account and password.",
};

/**
 * Every admin's own account page. Deliberately NOT permission-gated — this is
 * where an admin changes their password, so it must stay reachable regardless
 * of which modules they were granted.
 */
export default async function AdminSettingsPage() {
  const { user, role, permissions } = await getAdminContext();

  const name =
    (user.user_metadata?.name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    "";

  return (
    <div className="flex w-full flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Account Settings</h1>
        <p className="text-muted-foreground">
          Update your display name and password. Your email is read-only.
        </p>
      </div>

      <AccountSettings
        email={user.email ?? ""}
        name={name}
        role={role}
        permissions={permissions}
      />
    </div>
  );
}