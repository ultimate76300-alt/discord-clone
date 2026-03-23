import { supabase } from "./supabase";

/** Met à jour la ligne public.profiles (affichage amis / DM). */
export async function syncProfileToSupabase(userId, identity) {
  if (!supabase || !userId || !identity?.displayName) return;
  const avatar_url =
    typeof identity.avatarUrl === "string" && identity.avatarUrl.startsWith("https://")
      ? identity.avatarUrl
      : null;

  const base = String(identity.displayName || "")
    .trim()
    .slice(0, 32);

  // Le RPC génère un handle unique "base@XYZ" et met display_name à jour.
  const { error: nameErr } = await supabase.rpc("profiles_set_username", {
    p_username_base: base,
  });
  if (nameErr) {
    // Fallback : au minimum, on met à jour l’avatar (si le RPC n’est pas encore installé).
    await supabase.from("profiles").upsert(
      {
        id: userId,
        avatar_url,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    return;
  }

  await supabase.from("profiles").upsert(
    {
      id: userId,
      avatar_url,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );

  // Note: le RPC `profiles_set_username` met aussi `display_name` à jour.
}
