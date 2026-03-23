import { supabase } from "./supabase";

/** Met à jour la ligne public.profiles (affichage amis / DM). */
export async function syncProfileToSupabase(userId, identity) {
  if (!supabase || !userId || !identity?.displayName) return;
  const avatar_url =
    typeof identity.avatarUrl === "string" && identity.avatarUrl.startsWith("https://")
      ? identity.avatarUrl
      : null;
  await supabase.from("profiles").upsert(
    {
      id: userId,
      display_name: identity.displayName.slice(0, 64),
      avatar_url,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
}
