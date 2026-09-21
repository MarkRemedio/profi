"use client";

import { useActionState, useEffect, useRef } from "react";
import { AlertCircle, Mail, Shield, User } from "lucide-react";
import { toast } from "sonner";

import {
  changeAdminPasswordAction,
  updateAdminNameAction,
  type SettingsActionState,
} from "@/app/(admin)/admin/(protected)/settings/actions";
import { ADMIN_ROLE_LABELS, adminPermissionLabel, type AdminRoleValue } from "@/lib/admin/permissions";
import { PasswordInput } from "../password-input";

interface AccountSettingsProps {
  email: string;
  name: string;
  role: AdminRoleValue;
  permissions: string[];
}

const initialState: SettingsActionState = null;

function FormError({ state }: { state: SettingsActionState }) {
  if (!state?.error) return null;

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{state.error}</span>
    </div>
  );
}

export function AccountSettings({ email, name, role, permissions }: AccountSettingsProps) {
  const [profileState, profileAction, profilePending] = useActionState(
    updateAdminNameAction,
    initialState
  );
  const [passwordState, passwordAction, passwordPending] = useActionState(
    changeAdminPasswordAction,
    initialState
  );
  const passwordFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (profileState?.success) toast.success(profileState.message ?? "Profile updated.");
  }, [profileState]);

  useEffect(() => {
    if (passwordState?.success) {
      toast.success(passwordState.message ?? "Password updated.");
      passwordFormRef.current?.reset();
    }
  }, [passwordState]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ---------- Identity ---------- */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Your Account</h2>
          <p className="text-sm text-slate-500">
            Your sign-in email is managed by the platform and cannot be changed here.
          </p>
        </div>

        <form action={profileAction} className="p-6 space-y-5">
          <FormError state={profileState} />

          <div className="space-y-2">
            <label className="text-sm font-medium">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="email"
                value={email}
                readOnly
                disabled
                aria-describedby="email-note"
                className="w-full cursor-not-allowed rounded-md border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm text-slate-500 outline-none"
              />
            </div>
            <p id="email-note" className="text-[11px] text-slate-500">
              Contact a Super Admin if this address needs to change.
            </p>
          </div>

          <div className="space-y-2">
            <label htmlFor="settings-name" className="text-sm font-medium">
              Display Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                id="settings-name"
                name="name"
                type="text"
                defaultValue={name}
                required
                className="w-full rounded-md border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button
              type="submit"
              disabled={profilePending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 cursor-pointer border-none disabled:opacity-60"
            >
              {profilePending ? "Saving…" : "Save Profile"}
            </button>
          </div>
        </form>
      </div>

      {/* ---------- Password ---------- */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Change Password</h2>
          <p className="text-sm text-slate-500">
            Use at least 8 characters. You will stay signed in on this device.
          </p>
        </div>

        <form ref={passwordFormRef} action={passwordAction} className="p-6 space-y-5">
          <FormError state={passwordState} />

          <div className="space-y-2">
            <label htmlFor="current-password" className="text-sm font-medium">
              Current Password
            </label>
            <PasswordInput
              id="current-password"
              name="currentPassword"
              autoComplete="current-password"
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="new-password" className="text-sm font-medium">
              New Password
            </label>
            <PasswordInput
              id="new-password"
              name="newPassword"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="confirm-password" className="text-sm font-medium">
              Confirm New Password
            </label>
            <PasswordInput
              id="confirm-password"
              name="confirmPassword"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className="flex justify-end border-t border-slate-100 pt-4">
            <button
              type="submit"
              disabled={passwordPending}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 cursor-pointer border-none disabled:opacity-60"
            >
              {passwordPending ? "Updating…" : "Update Password"}
            </button>
          </div>
        </form>
      </div>

      {/* ---------- Access summary ---------- */}
      <div className="rounded-xl border bg-white shadow-sm lg:col-span-2">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Your Access</h2>
          <p className="text-sm text-slate-500">
            Assigned by a Super Admin under Team Management.
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Shield className="h-4 w-4 text-blue-600" />
            <span className="font-medium">{ADMIN_ROLE_LABELS[role] ?? role}</span>
          </div>

          <div className="flex flex-wrap gap-2">
            {permissions.map((key) => (
              <span
                key={key}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600"
              >
                {adminPermissionLabel(key)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}