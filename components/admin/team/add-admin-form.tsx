"use client";

import { useActionState, useEffect, useState } from "react";
import { User, Mail, Shield, AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { createAdminAction, type TeamActionState } from "@/app/(admin)/admin/(protected)/team/actions";
import {
  ADMIN_ROLE_LABELS,
  ADMIN_ROLE_PRESETS,
  type AdminRoleValue,
} from "@/lib/admin/permissions";
import { PasswordInput } from "../password-input";
import { RolePermissionsMatrix } from "./role-permissions-matrix";

interface AddAdminFormProps {
  onSuccess?: () => void;
}

const initialState: TeamActionState = null;

export function AddAdminForm({ onSuccess }: AddAdminFormProps) {
  const [role, setRole] = useState<AdminRoleValue>("SUPPORT");
  const [permissions, setPermissions] = useState<string[]>([...ADMIN_ROLE_PRESETS.SUPPORT]);
  const [state, formAction, pending] = useActionState(createAdminAction, initialState);

  // Switching role reseeds the checkboxes with that role's preset, which the
  // operator can then tick/untick freely (except for Super Admin, which is all-on).
  const handleRoleChange = (next: AdminRoleValue) => {
    setRole(next);
    setPermissions([...ADMIN_ROLE_PRESETS[next]]);
  };

  useEffect(() => {
    if (state?.success) {
      toast.success(state.message ?? "Administrator created.");
      onSuccess?.();
    }
  }, [state, onSuccess]);

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold">Add New Administrator</h2>
        <p className="text-sm text-slate-500">
          Create a new portal user and define their access level.
        </p>
      </div>

      <form action={formAction} className="p-6 space-y-6">
        {state?.error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="admin-name" className="text-sm font-medium">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                id="admin-name"
                name="name"
                type="text"
                placeholder="John Doe"
                className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="admin-email" className="text-sm font-medium">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                id="admin-email"
                name="email"
                type="email"
                placeholder="john@waw-profi.com"
                className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="admin-password" className="text-sm font-medium">
              Initial Password
            </label>
            <PasswordInput
              id="admin-password"
              name="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <p className="text-[10px] text-slate-500">
              Share this with the user — they can change it themselves under Settings.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="admin-role" className="text-sm font-medium">
              Primary Role
            </label>
            <div className="relative">
              <Shield className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <select
                id="admin-role"
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
            {pending ? "Creating…" : "Create Admin"}
          </button>
        </div>
      </form>
    </div>
  );
}