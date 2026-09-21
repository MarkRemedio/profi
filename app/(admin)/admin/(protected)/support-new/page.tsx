import { requireAdminPermission } from "@/lib/admin/auth";
import { MasterSupport } from "@/components/admin/support-new"; 
// 👆 Changed to match the exact name your manager used!

export const metadata = { title: "Incoming Tickets | Admin" };

export default async function AdminSupportNewPage() {
  await requireAdminPermission("support");

  return <MasterSupport />;
}