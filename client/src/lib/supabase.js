import { createClient } from "@supabase/supabase-js";

const SB_GLOBAL = "__DISCORD_CLONE_SB__";

function resolveSupabaseConfig() {
  if (import.meta.env.DEV) {
    return {
      url: (import.meta.env.VITE_SUPABASE_URL || "").trim(),
      key: (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim(),
    };
  }
  const injected = globalThis[SB_GLOBAL];
  if (injected?.url && injected?.key) {
    return { url: String(injected.url).trim(), key: String(injected.key).trim() };
  }
  return {
    url: (import.meta.env.VITE_SUPABASE_URL || "").trim(),
    key: (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim(),
  };
}

const { url, key } = resolveSupabaseConfig();

export const isSupabaseConfigured = Boolean(url && key);

export const supabase = isSupabaseConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
