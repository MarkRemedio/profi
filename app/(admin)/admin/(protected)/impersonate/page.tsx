import { Building2, Eye } from "lucide-react";

import { prisma } from "@/lib/prisma";
import { requireAdminPermission } from "@/lib/admin/auth";
import { Button } from "@/components/ui/button";
import { startImpersonation } from "./actions";

export const metadata = { title: "Impersonate Client | Admin" };

export default async function AdminImpersonatePage() {
  // Also asserts the platform_admin session — no separate guard needed.
  await requireAdminPermission("impersonate");

  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, subscription_status: true },
  });

  async function viewAs(formData: FormData) {
    "use server";
    await startImpersonation(formData.get("orgId") as string);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-950">Impersonate Client</h1>
        <p className="mt-1 text-sm text-slate-500">
          View a client&apos;s workspace as an admin. Your session is audit-logged. Full access.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {orgs.map((org) => (
          <div
            key={org.id}
            className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                <Building2 className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-slate-900">{org.name}</p>
                <p className="truncate text-[10px] text-slate-400">{org.subscription_status ?? "—"}</p>
              </div>
            </div>
            <form action={viewAs}>
              <input type="hidden" name="orgId" value={org.id} />
              <Button
                size="sm"
                type="submit"
                className="w-full gap-1.5 bg-teal-600 text-white hover:bg-teal-700"
              >
                <Eye className="size-3.5" /> View as Client
              </Button>
            </form>
          </div>
        ))}
      </div>

      {orgs.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-500">
          No client organizations found.
        </div>
      )}
    </div>
  );
}
