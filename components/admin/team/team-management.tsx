"use client";

import { useState, useTransition } from "react";
import {
  Plus,
  MoreHorizontal,
  Shield,
  Mail,
  ArrowLeft,
  Edit,
  Trash2,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
  removeAdminAction,
  setAdminStatusAction,
  type AdminUserItem,
} from "@/app/(admin)/admin/(protected)/team/actions";
import { ADMIN_ROLE_LABELS, adminPermissionLabel } from "@/lib/admin/permissions";
import { AddAdminForm } from "./add-admin-form";
import { EditAdminForm } from "./edit-admin-form";

interface TeamManagementProps {
  initialAdmins?: AdminUserItem[];
  currentUserId?: string;
  /** Only Super Admins may change who administers the platform. */
  canManage?: boolean;
}

export function TeamManagement({
  initialAdmins = [],
  currentUserId,
  canManage = false,
}: TeamManagementProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editing, setEditing] = useState<AdminUserItem | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const runAction = (action: () => Promise<{ error?: string; message?: string } | null>) => {
    setOpenMenuId(null);
    startTransition(async () => {
      const result = await action();
      if (result?.error) toast.error(result.error);
      else toast.success(result?.message ?? "Done.");
    });
  };

  if (isAdding) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setIsAdding(false)}
          className="flex items-center text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 mb-2 border-none bg-transparent cursor-pointer"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Team List
        </button>

        <AddAdminForm onSuccess={() => setIsAdding(false)} />
      </div>
    );
  }

  if (editing) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => setEditing(null)}
          className="flex items-center text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 mb-2 border-none bg-transparent cursor-pointer"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Team List
        </button>

        <EditAdminForm admin={editing} onSuccess={() => setEditing(null)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold tracking-tight">Admin Users</h2>

        {canManage && (
          <button
            onClick={() => setIsAdding(true)}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2 bg-black text-white hover:bg-slate-800 cursor-pointer border-none"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Admin
          </button>
        )}
      </div>

      {!canManage && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          You have read-only visibility here. Only a Super Admin can add or change
          administrators.
        </p>
      )}

      <div className="rounded-md border bg-white shadow-sm overflow-visible">
        <table className="w-full text-sm text-left relative">
          <thead className="border-b bg-slate-50/50">
            <tr>
              <th className="h-12 px-4 align-middle font-medium text-slate-500">User</th>
              <th className="h-12 px-4 align-middle font-medium text-slate-500">Email</th>
              <th className="h-12 px-4 align-middle font-medium text-slate-500">Role</th>
              <th className="h-12 px-4 align-middle font-medium text-slate-500">Access</th>
              <th className="h-12 px-4 align-middle font-medium text-slate-500">Status</th>
              <th className="h-12 px-4 align-middle font-medium text-right text-slate-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {initialAdmins.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-500">
                  No admin profiles found. Click &quot;Add Admin&quot; to create one.
                </td>
              </tr>
            ) : (
              initialAdmins.map((admin) => {
                const isYou = admin.userId === currentUserId;
                const isActive = admin.status === "Active";

                return (
                  <tr
                    key={admin.id}
                    className="border-b transition-colors hover:bg-slate-50/50"
                  >
                    <td className="p-4 align-middle font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        {admin.name}
                        {isYou && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            You
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 align-middle text-slate-500">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        {admin.email}
                      </div>
                    </td>
                    <td className="p-4 align-middle">
                      <div className="flex items-center gap-2 text-slate-600">
                        <Shield className="h-4 w-4 text-blue-600" />
                        {ADMIN_ROLE_LABELS[admin.role] ?? admin.role}
                      </div>
                    </td>
                    <td className="p-4 align-middle text-slate-500">
                      {admin.role === "SUPER_ADMIN" ? (
                        <span className="text-xs font-medium text-slate-600">All modules</span>
                      ) : (
                        <span
                          className="text-xs"
                          title={admin.permissions.map(adminPermissionLabel).join(", ")}
                        >
                          {admin.permissions.length} module
                          {admin.permissions.length === 1 ? "" : "s"}
                        </span>
                      )}
                    </td>
                    <td className="p-4 align-middle">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                          isActive
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {admin.status}
                      </span>
                    </td>
                    <td className="p-4 align-middle text-right">
                      <div className="relative inline-block text-left">
                        <button
                          onClick={() =>
                            setOpenMenuId(openMenuId === admin.id ? null : admin.id)
                          }
                          disabled={!canManage || pending}
                          className="p-2 hover:bg-slate-200 rounded-md transition-colors cursor-pointer border-none bg-transparent text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>

                        {openMenuId === admin.id && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setOpenMenuId(null)}
                            />
                            <div className="absolute right-0 top-10 z-50 w-48 rounded-md border border-slate-200 bg-white p-1 shadow-lg text-left">
                              <button
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm text-slate-700 hover:bg-slate-100 cursor-pointer border-none bg-transparent"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  setEditing(admin);
                                }}
                              >
                                <Edit className="h-4 w-4" />
                                Edit Access
                              </button>

                              <button
                                disabled={isYou}
                                onClick={() =>
                                  runAction(() =>
                                    setAdminStatusAction(
                                      admin.id,
                                      isActive ? "Suspended" : "Active"
                                    )
                                  )
                                }
                                className={`flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm border-none bg-transparent text-left ${
                                  isYou
                                    ? "text-slate-300 cursor-not-allowed"
                                    : "text-slate-700 hover:bg-slate-100 cursor-pointer"
                                }`}
                              >
                                {isActive ? (
                                  <PauseCircle className="h-4 w-4" />
                                ) : (
                                  <PlayCircle className="h-4 w-4" />
                                )}
                                {isActive ? "Suspend" : "Reactivate"}
                              </button>

                              <button
                                disabled={isYou}
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `Revoke admin access for ${admin.name}? Their portal account stays, but they lose all access to the master control panel.`
                                    )
                                  ) {
                                    setOpenMenuId(null);
                                    return;
                                  }
                                  runAction(() => removeAdminAction(admin.id));
                                }}
                                className={`flex w-full items-center gap-2 rounded-sm px-2 py-2 text-sm border-none bg-transparent text-left ${
                                  isYou
                                    ? "text-slate-300 cursor-not-allowed"
                                    : "text-red-600 hover:bg-red-50 cursor-pointer"
                                }`}
                              >
                                <Trash2 className="h-4 w-4" />
                                {isYou ? "Cannot remove self" : "Remove Admin"}
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}