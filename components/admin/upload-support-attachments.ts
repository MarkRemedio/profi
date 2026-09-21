"use client";

import { createClient } from "@/lib/supabase/client";
import { MAX_SUPPORT_ATTACHMENTS, MAX_SUPPORT_ATTACHMENT_BYTES } from "@/lib/support/support";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
]);

async function uploadFile(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  file: File,
  ticketId: string,
): Promise<string> {
  if (file.size > MAX_SUPPORT_ATTACHMENT_BYTES) {
    throw new Error(`${file.name} is larger than 10 MB.`);
  }
  if (!ALLOWED_TYPES.has(file.type)) throw new Error(`${file.name} is not a supported file type.`);

  const ext = file.name.toLowerCase().split(".").pop() || "bin";
  const path = `support/${userId}/${ticketId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("workspace_assets").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);
  const { data } = supabase.storage.from("workspace_assets").getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadSupportAttachment(file: File, ticketId: string): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has expired. Please sign in again.");
  return uploadFile(supabase, user.id, file, ticketId);
}

export async function uploadSupportAttachments(files: File[], ticketId: string): Promise<string[]> {
  if (files.length > MAX_SUPPORT_ATTACHMENTS) {
    throw new Error(`Choose no more than ${MAX_SUPPORT_ATTACHMENTS} files.`);
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has expired. Please sign in again.");
  return Promise.all(files.map((file) => uploadFile(supabase, user.id, file, ticketId)));
}
