"use server";

import { requireAdminPermission } from "@/lib/admin/auth";
import { runHealthChecks } from "@/lib/admin/health";
import type { HealthSnapshot } from "@/lib/admin/health-types";

export type RefreshHealthResult = { ok: true; data: HealthSnapshot } | { ok: false; error: string };

export async function refreshHealthAction(): Promise<RefreshHealthResult> {
  try {
    await requireAdminPermission("health");
    return { ok: true, data: await runHealthChecks() };
  } catch (error) {
    console.error("Health refresh failed", error);
    return { ok: false, error: "System checks could not be completed. Please try again." };
  }
}
