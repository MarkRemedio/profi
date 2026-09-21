"use server";

import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

import { requireAccountingWorkspace } from "@/lib/accounting/dal";

const BUCKET = "workspace_assets";

/**
 * Object paths inside the bucket that this action is willing to delete.
 *
 * Only the two prefixes the product writes logos to, and only after the URL has
 * been confirmed to be on our own storage origin. Everything else returns null
 * and is skipped. The callers pass URLs read back from their own template rows,
 * but "the caller is trustworthy" is not a property a server action can rely
 * on — it is callable directly by anyone signed in.
 */
function logoObjectPath(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.origin !== new URL(base).origin) return null;
  } catch {
    return null;
  }

  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const at = url.indexOf(marker);
  if (at === -1) return null;

  const path = decodeURIComponent(url.slice(at + marker.length).split("?")[0]);
  // No traversal, and only where logos actually live.
  if (path.includes("..")) return null;
  return path.startsWith("logos/") || path.startsWith("org-logos/") ? path : null;
}

/**
 * Delete logo files that nothing points at any more.
 *
 * Every upload writes a new timestamped object, so replacing a template logo
 * five times used to leave five files behind, all of them unreachable and none
 * of them ever cleaned up. Removing one left it there too — the column went
 * null and the file stayed.
 *
 * Called after the new value has been written, never before: an orphaned object
 * costs a few kilobytes, while deleting one that is still referenced puts a
 * broken image on somebody's invoice.
 *
 * Never throws. This is tidy-up running behind a save that has already
 * succeeded, and failing it would tell the user their settings did not save.
 */
export async function deleteWorkspaceLogos(urls: (string | null | undefined)[]): Promise<void> {
  try {
    // Any signed-in member of a workspace, deliberately: the narrower check
    // belongs on the setting itself, and by the time this runs that check has
    // already passed. What matters here is that the path is one of ours.
    await requireAccountingWorkspace();

    const paths = Array.from(
      new Set(urls.slice(0, 12).map(logoObjectPath).filter((path): path is string => path !== null))
    );
    if (paths.length === 0) return;

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceKey || !base) return;

    // Service role because the browser never needs delete rights on this
    // bucket — granting them would let any member wipe any workspace's artwork.
    const admin = createSupabaseAdmin(base, serviceKey);
    const { error } = await admin.storage.from(BUCKET).remove(paths);
    if (error) console.error("[assets] stale logos not removed:", error);
  } catch (error) {
    console.error("[assets] logo cleanup failed:", error);
  }
}
