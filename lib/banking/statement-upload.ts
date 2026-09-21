"use client";

import { createClient } from "@/lib/supabase/client";
import { STATEMENT_BUCKET } from "@/lib/banking/statement-storage";

/**
 * Upload a statement straight from the browser to the private statements
 * bucket, bypassing the Vercel function — and its 4.5 MB request-body cap —
 * entirely. Returns the object path; the server downloads it with the service
 * role and deletes it once parsed.
 *
 * The path is namespaced by user id: the server pins any caller-supplied path
 * to that same prefix before touching it with the service role.
 */
export async function uploadStatementToStorage(
  file: File,
  bankAccountId: string
): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has expired. Please sign in again.");

  const ext = file.name.toLowerCase().split(".").pop() || "pdf";
  const path = `${user.id}/${bankAccountId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(STATEMENT_BUCKET)
    .upload(path, file, {
      cacheControl: "0",
      upsert: false,
      contentType: file.type || undefined,
    });

  if (error) {
    // A missing bucket is a deployment gap, not something the user can fix by
    // retrying — say so plainly rather than blaming their file.
    if (/bucket not found/i.test(error.message)) {
      throw new Error(
        `Statement uploads aren't configured on this environment (missing "${STATEMENT_BUCKET}" storage bucket).`
      );
    }
    throw new Error(`Upload failed: ${error.message}`);
  }

  return path;
}
