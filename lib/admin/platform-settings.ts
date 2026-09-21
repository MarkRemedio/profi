import "server-only";

import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";

/**
 * Platform-wide switches, stored one row per key in `platform_settings`.
 *
 * Read by both sides of the app: the admin portal edits them, and the customer
 * onboarding wizard reads them to decide which steps to show.
 */
export const PLATFORM_SETTING_KEYS = {
  /**
   * Whether the customer onboarding wizard shows the chart-of-accounts step.
   *
   * true  → the client picks their own chart during onboarding.
   * false → the step is hidden and the starter chart is seeded automatically,
   *         so the accounts simply exist when they first sign in.
   */
  onboardingChartOfAccounts: "onboarding.chart_of_accounts",
  /**
   * Whether workspaces get multicurrency switched on.
   *
   * Turning it on is additive — it makes foreign invoices and bills available
   * and changes no existing figure — so it is applied to every workspace at
   * once as well as becoming the default for new ones.
   *
   * Turning it off deliberately does NOT reach back into existing workspaces. A
   * business already raising documents in dollars would otherwise lose that
   * ability from a switch it never saw, while its posted foreign documents
   * stayed in the ledger. It only stops being the default for new workspaces;
   * an individual workspace can still turn it off for itself in Settings.
   */
  multicurrencyDefault: "multicurrency.enabled_by_default",
} as const;

export type OnboardingVisibilitySettings = {
  chartOfAccounts: boolean;
};

export type PlatformFeatureDefaults = {
  multicurrency: boolean;
};

/** Shown when a key has never been written — matches today's behaviour. */
const DEFAULTS: OnboardingVisibilitySettings = {
  chartOfAccounts: true,
};

/** Off unless an admin turns it on — most workspaces bill in one currency. */
const FEATURE_DEFAULTS: PlatformFeatureDefaults = {
  multicurrency: false,
};

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  // Json columns round-trip primitives, but be forgiving about shape.
  if (value && typeof value === "object" && "enabled" in value) {
    const nested = (value as Record<string, unknown>).enabled;
    if (typeof nested === "boolean") return nested;
  }
  return fallback;
}

/**
 * Which onboarding steps are enabled platform-wide.
 *
 * Falls back to the defaults on any read failure rather than throwing: a
 * settings table hiccup must not block a paying customer from onboarding.
 */
export async function getOnboardingVisibility(): Promise<OnboardingVisibilitySettings> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key: PLATFORM_SETTING_KEYS.onboardingChartOfAccounts },
      select: { value: true },
    });

    return {
      chartOfAccounts: asBoolean(row?.value, DEFAULTS.chartOfAccounts),
    };
  } catch (error) {
    console.error("Failed to read onboarding visibility settings:", error);
    return DEFAULTS;
  }
}

export async function setOnboardingChartOfAccounts(enabled: boolean, adminProfileId?: string | null) {
  await prisma.platformSetting.upsert({
    where: { key: PLATFORM_SETTING_KEYS.onboardingChartOfAccounts },
    create: {
      key: PLATFORM_SETTING_KEYS.onboardingChartOfAccounts,
      value: enabled,
      updatedBy: adminProfileId ?? null,
    },
    update: { value: enabled, updatedBy: adminProfileId ?? null },
  });
}

/**
 * Whether new workspaces should start with multicurrency enabled.
 *
 * Falls back to off on any read failure: a settings hiccup must not silently
 * switch a feature on across the platform.
 */
export async function getMulticurrencyDefault(): Promise<boolean> {
  try {
    const row = await prisma.platformSetting.findUnique({
      where: { key: PLATFORM_SETTING_KEYS.multicurrencyDefault },
      select: { value: true },
    });
    return asBoolean(row?.value, FEATURE_DEFAULTS.multicurrency);
  } catch (error) {
    console.error("Failed to read the multicurrency default:", error);
    return FEATURE_DEFAULTS.multicurrency;
  }
}

/**
 * Set the platform-wide multicurrency default.
 *
 * Returns how many existing workspaces were switched on, so the admin sees the
 * reach of what they just did rather than a bare "Saved".
 */
export async function setMulticurrencyDefault(
  enabled: boolean,
  adminProfileId?: string | null
): Promise<{ workspacesUpdated: number }> {
  await prisma.platformSetting.upsert({
    where: { key: PLATFORM_SETTING_KEYS.multicurrencyDefault },
    create: {
      key: PLATFORM_SETTING_KEYS.multicurrencyDefault,
      value: enabled,
      updatedBy: adminProfileId ?? null,
    },
    update: { value: enabled, updatedBy: adminProfileId ?? null },
  });

  // Enabling reaches every workspace; disabling only stops it being the default
  // for new ones. See the note on the setting key for why the two directions
  // are deliberately asymmetric.
  if (!enabled) return { workspacesUpdated: 0 };

  // Deliberately every tenant at once. Organization is excluded from the
  // tenancy firewall as the root entity, so this would run either way — the
  // system context states the intent rather than leaving it to be inferred.
  const result = await runAsSystem(() =>
    prisma.organization.updateMany({
      where: { multicurrencyEnabled: false },
      data: { multicurrencyEnabled: true },
    })
  );
  return { workspacesUpdated: result.count };
}
