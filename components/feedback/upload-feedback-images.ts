import { createClient } from "@/lib/supabase/client";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB per image

/**
 * Upload feedback screenshots to the public workspace_assets bucket under
 * feedback/<userId>/. Per-file failures are non-fatal: the report is still
 * submitted without the failed images and the caller reports failedCount.
 */
export async function uploadFeedbackImages(
  files: File[],
  userId: string
): Promise<{ urls: string[]; failedCount: number }> {
  const supabase = createClient();
  const urls: string[] = [];
  let failedCount = 0;

  for (const [index, file] of files.entries()) {
    try {
      const ext = file.type.split("/")[1] || "png";
      const path = `feedback/${userId}/${Date.now()}-${index}.${ext}`;

      const { error } = await supabase.storage
        .from("workspace_assets")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("workspace_assets").getPublicUrl(path);
      urls.push(publicUrl);
    } catch (err) {
      console.error("Feedback image upload failed:", err);
      failedCount += 1;
    }
  }

  return { urls, failedCount };
}
