import { createClient } from "@/lib/supabase/client";

/**
 * Convert a base64 data-URL logo to a real file in the workspace_assets bucket
 * and return its public URL. Non-base64 input (already a URL, or null) is passed
 * through unchanged. Returns the original input on upload failure (non-fatal).
 */
export async function uploadTemplateLogo(
  base64Data: string | null,
  orgId: string,
  prefix: string
): Promise<string | null> {
  if (!base64Data || !base64Data.startsWith("data:image")) return base64Data;

  try {
    const supabase = createClient();
    const response = await fetch(base64Data);
    const blob = await response.blob();
    const fileExt = blob.type.split("/")[1] || "png";
    const filePath = `logos/workspace-${orgId}-${prefix}-${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage
      .from("workspace_assets")
      .upload(filePath, blob, { cacheControl: "3600", upsert: true });
    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from("workspace_assets").getPublicUrl(filePath);
    return publicUrl;
  } catch (err) {
    console.error(`Failed to upload ${prefix} logo:`, err);
    return base64Data;
  }
}
