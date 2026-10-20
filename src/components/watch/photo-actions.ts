"use client";
import { supabaseBrowser } from "@/lib/supabase/client";
import { PHOTO_BUCKET } from "@/lib/core/queries";
import { compressImage } from "@/lib/image";

export async function uploadPhotos(userId: string, watchId: string, files: File[], startOrder: number, makeFirstPrimary: boolean) {
  const sb = supabaseBrowser();
  for (let i = 0; i < files.length; i++) {
    const blob = await compressImage(files[i]);
    const path = `${userId}/${watchId}/${crypto.randomUUID()}.jpg`;
    const up = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (up.error) throw new Error(`Upload failed: ${up.error.message}`);
    const ins = await sb.from("watch_photos").insert({
      watch_id: watchId,
      storage_path: path,
      sort_order: startOrder + i,
      is_primary: makeFirstPrimary && i === 0,
    });
    if (ins.error) throw new Error(ins.error.message);
  }
}

export async function setPrimaryPhoto(watchId: string, photoId: string) {
  const sb = supabaseBrowser();
  await sb.from("watch_photos").update({ is_primary: false }).eq("watch_id", watchId).eq("is_primary", true);
  const { error } = await sb.from("watch_photos").update({ is_primary: true }).eq("id", photoId);
  if (error) throw new Error(error.message);
}

export async function deletePhoto(photo: { id: string; storage_path: string }) {
  const sb = supabaseBrowser();
  await sb.storage.from(PHOTO_BUCKET).remove([photo.storage_path]);
  const { error } = await sb.from("watch_photos").delete().eq("id", photo.id);
  if (error) throw new Error(error.message);
}
