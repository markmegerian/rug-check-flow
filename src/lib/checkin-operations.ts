import { supabase } from "@/integrations/supabase/client";

/** Upload a single check-in photo to storage. Returns storage metadata for workflow submission or null on failure. */
export async function uploadCheckinPhotoFile(
  rugId: string,
  file: File,
): Promise<{ storage_path: string; public_url: string } | null> {
  const path = `rugs/${rugId}/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
  const { error: uploadError } = await supabase.storage
    .from("checkin-photos")
    .upload(path, file, { upsert: false });
  if (uploadError) return null;

  const { data: publicUrl } = supabase.storage.from("checkin-photos").getPublicUrl(path);
  return { storage_path: path, public_url: publicUrl.publicUrl };
}
