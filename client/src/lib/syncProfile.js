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
    // #region agent log
    fetch('http://127.0.0.1:7417/ingest/f928b117-4eb1-4e9d-bfda-60aee881559e', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '4bd8e4' }, body: JSON.stringify({ sessionId: '4bd8e4', runId: 'pre-icon-refresh', hypothesisId: 'H4_pseudo_rpc_error', location: 'client/src/lib/syncProfile.js:profiles_set_username', message: 'profiles_set_username failed', data: { userId, base, errorMessage: nameErr?.message || null }, timestamp: Date.now() }) }).catch(() => {});
    // #endregion
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

  // #region agent log
  try {
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();
    fetch('http://127.0.0.1:7417/ingest/f928b117-4eb1-4e9d-bfda-60aee881559e', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '4bd8e4' }, body: JSON.stringify({ sessionId: '4bd8e4', runId: 'pre-icon-refresh', hypothesisId: 'H4_pseudo_stored_handle', location: 'client/src/lib/syncProfile.js:after_rpc', message: 'Stored display_name after RPC', data: { userId, base, storedDisplayName: prof?.display_name ?? null }, timestamp: Date.now() }) }).catch(() => {});
  } catch {
    // ignore
  }
  // #endregion
}
