"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getAdminContext } from "@/lib/admin/auth";
import { createClient } from "@/lib/supabase/server";

export type SettingsActionState = {
  error?: string;
  success?: boolean;
  message?: string;
} | null;

const MIN_PASSWORD_LENGTH = 8;

/**
 * Change the signed-in admin's own password.
 *
 * Acts only on the caller's session — there is no user id parameter, so this
 * cannot be pointed at another account.
 */
export async function changeAdminPasswordAction(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const { user } = await getAdminContext();

    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (!currentPassword) return { error: "Enter your current password." };
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
    }
    if (newPassword !== confirmPassword) {
      return { error: "The new passwords do not match." };
    }
    if (newPassword === currentPassword) {
      return { error: "The new password must be different from your current one." };
    }

    const supabase = await createClient();

    // Supabase exposes no "verify password" call, so re-authenticating with the
    // current password is the way to prove the session owner typed it. A failed
    // attempt leaves the existing session untouched.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: user.email ?? "",
      password: currentPassword,
    });

    if (reauthError) {
      return { error: "Your current password is incorrect." };
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      return { error: updateError.message };
    }

    return { success: true, message: "Password updated." };
  } catch (error) {
    console.error("Failed to change admin password:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to update the password.",
    };
  }
}

/**
 * Update the caller's own display name. Email is intentionally not editable —
 * it is the admin's login identity and is shown read-only in the UI.
 */
export async function updateAdminNameAction(
  _prevState: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  try {
    const { user } = await getAdminContext();

    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "Display name cannot be empty." };

    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({
      data: { name, display_name: name },
    });

    if (error) return { error: error.message };

    // Keep the Prisma-side mirror in step so the team list shows the new name
    // without waiting for the next auth token refresh.
    await prisma.users
      .update({
        where: { id: user.id },
        data: {
          raw_user_meta_data: {
            ...((user.user_metadata as Record<string, unknown> | null) ?? {}),
            name,
            display_name: name,
          },
        },
      })
      .catch(() => {
        // Non-fatal: Supabase is the source of truth and already has the change.
      });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/team");
    return { success: true, message: "Profile updated." };
  } catch (error) {
    console.error("Failed to update admin profile:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to update your profile.",
    };
  }
}