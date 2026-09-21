import { getAdminContext } from "@/lib/admin/auth";
import { getAdminNotifications } from "@/lib/admin/notifications";
import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";
import { MasterShell } from "@/components/admin/shell";

export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, permissions, profileId } = await getAdminContext();

  // 🚀 Check for 'name' or 'full_name' in metadata.
  // Fall back to a premium title instead of doubling up the email!
  const name =
    (user.user_metadata?.name as string | undefined) ??
    (user.user_metadata?.full_name as string | undefined) ??
    "Platform Admin";

  // Cross-org by design: the feedback queue spans all organizations.
  // Prisma queries are lazy — they must be awaited INSIDE runAsSystem, or the
  // tenant context is gone by the time the query actually executes.
  // Independent reads — run them together so the shell isn't waiting on a
  // serial round trip before anything can render.
  const [feedbackNewCount, dismissed] = await Promise.all([
    runAsSystem(async () => {
      return await prisma.feedbackReport.count({ where: { status: "NEW" } });
    }),
    profileId
      ? prisma.adminProfile
          .findUnique({
            where: { id: profileId },
            select: { dismissedNotifications: true },
          })
          .then((p) => p?.dismissedNotifications ?? [])
      : Promise.resolve<string[]>([]),
  ]);

  const notifications = await getAdminNotifications({ permissions, dismissed });

  return (
    <MasterShell
      identity={{ email: user.email ?? "", name }}
      feedbackNewCount={feedbackNewCount}
      permissions={permissions}
      notifications={notifications}
    >
      {children}
    </MasterShell>
  );
}