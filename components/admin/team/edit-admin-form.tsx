"use client";

import { useActionState, useEffect, useState } from "react";
import { Shield, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import {
  updateAdminAction,
  type AdminUserItem,
  type TeamActionState,
} from "@/app/(admin)/admin/(protected)/team/actions";
import {
  ADMIN_ROLE_LABELS,
  ADMIN_ROLE_PRESETS,
  type AdminRoleValue,
} from "@/lib/admin/permissions";
import { RolePermissionsMatrix } from "./role-permissions-matrix";

interface EditAdminFormProps {
  admin: AdminUserItem;
  onSuccess?: () => void;
}

const initialState: TeamActionState = null;

export function EditAdminForm({ admin, onSuccess }: EditAdminFormProps) {
  const [role, setRole] = useState<AdminRoleValue>(admin.role);
  const [permissions, setPermissions] = useState<string[]>(admin.permissions);
  const [state, formAction, pending] = useActionState(updateAdminAction, initialState);

  // Only reseed from the preset when the role actually changes, so reopening
  // the form doesn't wipe the grants this admin already has.
  const handleRoleChange = (next: AdminRoleValue) => {
    setRole(next);
    setPermissions(next === admin.role ? admin.permissions : [...ADMIN_ROLE_PRESETS[next]]);
  };

  useEffect(() => {
    if (state?.success) {
      toast.success(state.message ?? "Access updated.");
      onSuccess?.();
    }
  }, [state, onSuccess]);

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold">Edit Access</h2>
        <p className="text-sm text-slate-500">
          {admin.name} · {admin.email}
        </p>
      </div>

      <form action={formAction} className="p-6 space-y-6">
        <input type="hidden" name="profileId" value={admin.id} />

        {state?.error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        )}

        <div className="space-y-2 md:max-w-xs">
          <label htmlFor="edit-admin-role" className="text-sm font-medium">
            Primary Role
          </label>
          <div className="relative">
            <Shield className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <select
              id="edit-admin-role"
              name="role"
              value={role}
              onChange={(e) => handleRoleChange(e.target.value as AdminRoleValue)}
              className="w-full appearance-none rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="SUPER_ADMIN">{ADMIN_ROLE_LABELS.SUPER_ADMIN} (Full Access)</option>
              <option value="SUPPORT">{ADMIN_ROLE_LABELS.SUPPORT}</option>
              <option value="CUSTOM">{ADMIN_ROLE_LABELS.CUSTOM}</option>
            </select>
          </div>
        </div>

        <hr className="border-slate-100" />

        <RolePermissionsMatrix
          role={role}
          value={permissions}
          onChange={setPermissions}
          disabled={pending}
        />

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onSuccess}
            disabled={pending}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer border-none bg-transparent disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 cursor-pointer border-none disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}