import { supabase } from "./supabase";

/** Bucket Storage ; créer un bucket public « avatars » (ou la valeur de cette env) dans Supabase. */
export const AVATAR_BUCKET = (import.meta.env.VITE_SUPABASE_AVATAR_BUCKET || "avatars").trim();

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Envoie le fichier dans Storage puis enregistre l’URL publique dans user_metadata.avatar_url.
 * Politiques SQL : voir `supabase/storage-avatars.sql` à la racine du dépôt.
 */
export async function uploadProfileAvatarFile(userId, file) {
  if (!supabase) throw new Error("Supabase non configuré");
  if (!ALLOWED.has(file.type)) {
    throw new Error("Format accepté : JPEG, PNG, WebP, GIF.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Fichier trop volumineux (max 2 Mo).");
  }

  const path = `${userId}/avatar`;
  const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    upsert: true,
    cacheControl: "3600",
    contentType: file.type,
  });
  if (upErr) throw new Error(upErr.message);

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("URL publique introuvable.");

  const { error: metaErr } = await supabase.auth.updateUser({
    data: { avatar_url: data.publicUrl },
  });
  if (metaErr) throw new Error(metaErr.message);
  return data.publicUrl;
}

export async function clearProfileAvatar() {
  if (!supabase) throw new Error("Supabase non configuré");
  const { error } = await supabase.auth.updateUser({ data: { avatar_url: "" } });
  if (error) throw new Error(error.message);
}
