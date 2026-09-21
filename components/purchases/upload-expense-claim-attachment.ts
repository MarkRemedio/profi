"use client";

import { createClient } from "@/lib/supabase/client";
import { canAttachBillFile, type BillAttachmentInput } from "@/lib/accounting/bill-attachments";

export async function uploadExpenseClaimAttachment(file: File): Promise<BillAttachmentInput> {
  const validationError = canAttachBillFile(file);
  if (validationError) throw new Error(validationError);

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Your session has expired. Please sign in again.");

  const ext = file.name.toLowerCase().split(".").pop() || "bin";
  const storagePath = `expense-claims/${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("bill_attachments").upload(storagePath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "application/octet-stream",
  });
  if (error) throw new Error(`Could not upload ${file.name}: ${error.message}`);

  return {
    storagePath,
    filename: file.name,
    contentType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  };
}
