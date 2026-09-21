import { createClient as createSupabaseAdmin } from "@supabase/supabase-js";

import { prisma } from "@/lib/prisma";
import { STATEMENT_BUCKET } from "@/lib/banking/statement-storage";
import { purgeExpiredPendingConnections } from "@/lib/tax/hmrc-pending";

/**
 * Deletes bank_statements objects the normal request-scoped cleanup in
 * importStatement never got to run for — a closed tab, a network drop between
 * the browser upload and the Server Action call, or a crash mid-request.
 * Those objects are otherwise invisible: the bucket has no read policy, so
 * nothing in the app ever lists it.
 *
 * Anything older than an hour is stale — no real import takes that long — so
 * age alone is a safe signal, no per-object bookkeeping required.
 */
const STALE_AFTER_HOURS = 1;
const BATCH_SIZE = 100;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CLEANUP_STATEMENTS skipped: CRON_SECRET is not set.");
    return Response.json({ error: "Not configured." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  // storage.objects is Supabase's own metadata table, in the same Postgres
  // instance as everything else — reading it directly is far cheaper than
  // walking the bucket's folder tree (userId/accountId/file) one list() call
  // at a time.
  // storage.objects has no org column; it is Supabase's own bucket metadata.
  // tenancy:safe: not tenant data, scoped by bucket instead
  const stale = await prisma.$queryRaw<{ name: string }[]>`
    select name from storage.objects
    where bucket_id = ${STATEMENT_BUCKET}
      and created_at < now() - (${STALE_AFTER_HOURS}::text || ' hours')::interval
  `;

  if (stale.length === 0) {
    return Response.json({ deleted: 0 });
  }

  const admin = createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string
  );

  let deleted = 0;
  const errors: string[] = [];
  for (let i = 0; i < stale.length; i += BATCH_SIZE) {
    const batch = stale.slice(i, i + BATCH_SIZE).map((o) => o.name);
    const { data, error } = await admin.storage.from(STATEMENT_BUCKET).remove(batch);
    if (error) errors.push(error.message);
    deleted += data?.length ?? 0;
  }

  if (errors.length > 0) {
    console.error("[cron] cleanup-statements had failures:", errors);
  }

  /*
   * Swept on the same schedule, for the same reason: something left behind by a
   * journey that was never finished.
   *
   * An HMRC grant taken during onboarding waits against the person who gave it
   * until their workspace exists. When somebody abandons checkout, nobody ever
   * claims it — and it is a credential that can file VAT returns, so it must not
   * simply sit there. Failure is logged rather than thrown: this is the tail of
   * a cleanup job, and it must not stop the statement sweep from reporting.
   */
  let pendingHmrcDeleted = 0;
  try {
    pendingHmrcDeleted = await purgeExpiredPendingConnections();
  } catch (error) {
    console.error("[cron] could not purge expired HMRC grants:", error);
    errors.push("hmrc_pending_purge_failed");
  }

  return Response.json({ found: stale.length, deleted, errors, pendingHmrcDeleted });
}
