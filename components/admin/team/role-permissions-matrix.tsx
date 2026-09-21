"use client";

import { Check } from "lucide-react";

import {
  ADMIN_MODULE_GROUPS,
  type AdminPermissionKey,
  type AdminRoleValue,
} from "@/lib/admin/permissions";

interface RolePermissionsMatrixProps {
  role: AdminRoleValue;
  /** Selected permission keys. Ignored for Super Admin, which is always all-on. */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/**
 * Module access checkboxes, rendered from the shared registry so this can never
 * drift out of sync with the sidebar or the server-side guards.
 *
 * The inputs carry `name="permissions"`, so the selection is submitted as part
 * of the enclosing form's FormData (read server-side with `getAll`).
 */
export function RolePermissionsMatrix({
  role,
  value,
  onChange,
  disabled = false,
}: RolePermissionsMatrixProps) {
  const isSuperAdmin = role === "SUPER_ADMIN";
  const locked = isSuperAdmin || disabled;

  const toggle = (key: AdminPermissionKey) => {
    if (locked) return;
    onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Module Access Matrix</h3>
        <p className="text-xs text-slate-500 mt-1">
          {isSuperAdmin
            ? "Super Admins automatically have access to all modules, including any added later."
            : "Select which specific areas of the master control panel this user can access."}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ADMIN_MODULE_GROUPS.map((group) => (
          <div
            key={group.group}
            className="rounded-lg border border-slate-200 p-4 bg-slate-50/50"
          >
            <div className="font-semibold text-sm text-slate-900 mb-3">{group.group}</div>

            <div className="space-y-2.5">
              {group.items.map((module) => {
                const checked = isSuperAdmin || value.includes(module.key);

                return (
                  <label
                    key={module.key}
                    className={`flex items-center gap-2 text-sm ${
                      locked ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                    }`}
                  >
                    {/* The native input is the source of truth for both keyboard
                        interaction and FormData; the div below is its visual skin. */}
                    <input
                      type="checkbox"
                      name="permissions"
                      value={module.key}
                      checked={checked}
                      disabled={locked}
                      onChange={() => toggle(module.key)}
                      className="peer sr-only"
                    />
                    <div
                      className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-1 ${
                        checked ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"
                      }`}
                    >
                      {checked && <Check className="size-3 text-white" strokeWidth={3} />}
                    </div>
                    <span className="text-slate-600 font-medium">{module.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}