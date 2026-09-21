"use server";

import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";
import { createClient } from "@/lib/supabase/server";

/**
 * Where this person keeps their menu, on whatever device they sign in from.
 *
 * Menu layout lived only in localStorage, which is per browser by definition —
 * somebody who chose the bottom menu at signup on a laptop met the sidebar
 * again on their phone and had no way to tell whether the setting had failed
 * or had never been meant to follow them.
 *
 * Keyed on the user, not on (user, organisation) like notification preferences.
 * Somebody who belongs to two workspaces wants the menu in the same place in
 * both: the choice is about them, not about the books they are looking at.
 *
 * That is also why these run through runAsSystem rather than
 * requireAccountingWorkspace. The row has no organisation column for the
 * tenancy extension to scope by, and the identity that matters is the signed-in
 * user — which is read from the session here and never taken from an argument.
 */

export type NavPreferences = {
  navPosition: "side" | "bottom";
  navCompact: boolean;
};

const DEFAULTS: NavPreferences = {
  navPosition: "side",
  navCompact: false,
};

/** Narrow whatever is stored, so a value we stop supporting degrades quietly. */
function toPosition(value: string | null | undefined): NavPreferences["navPosition"] {
  return value === "bottom" ? "bottom" : "side";
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * This person's saved layout, or the defaults when they have never chosen.
 *
 * An absent row means "has never expressed a preference" rather than "wants the
 * defaults", so a default changed later still reaches them.
 */
export async function getNavPreferences(): Promise<NavPreferences> {
  const userId = await currentUserId();
  if (!userId) return DEFAULTS;

  const row = await runAsSystem(() =>
    prisma.userPreference.findUnique({
      where: { userId },
      select: { navPosition: true, navCompact: true },
    })
  );

  if (!row) return DEFAULTS;
  return { navPosition: toPosition(row.navPosition), navCompact: row.navCompact };
}

/**
 * Save a change. Partial, because the two are set from different places — the
 * settings card moves the menu, the bar itself minimises.
 *
 * Never throws. This is a display preference: it is already applied locally by
 * the time this runs, and failing to reach the database should not put an error
 * in front of somebody for successfully moving their menu. It simply will not
 * follow them to the next device.
 */
export async function saveNavPreferences(input: Partial<NavPreferences>): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;

  const navPosition = input.navPosition ? toPosition(input.navPosition) : undefined;
  const navCompact = typeof input.navCompact === "boolean" ? input.navCompact : undefined;
  if (navPosition === undefined && navCompact === undefined) return;

  try {
    await runAsSystem(() =>
      prisma.userPreference.upsert({
        where: { userId },
        // Only what changed, so minimising the bar cannot reset the layout.
        update: {
          ...(navPosition !== undefined ? { navPosition } : {}),
          ...(navCompact !== undefined ? { navCompact } : {}),
        },
        create: {
          userId,
          navPosition: navPosition ?? DEFAULTS.navPosition,
          navCompact: navCompact ?? DEFAULTS.navCompact,
        },
      })
    );
  } catch (error) {
    console.error("Could not save nav preferences:", error);
  }
}
