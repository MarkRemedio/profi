import { requireAdminPermission } from "@/lib/admin/auth";
import { MasterHealth } from "@/components/admin/health";
import { runHealthChecks } from "@/lib/admin/health";

export const metadata = { title: "System Health | Admin" };

export default async function AdminHealthPage() {
  await requireAdminPermission("health");
  const initialSnapshot = await runHealthChecks();

  return <MasterHealth initialSnapshot={initialSnapshot} />;
}
