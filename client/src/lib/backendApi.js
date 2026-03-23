import { supabase } from "./supabase";

async function authHeaders() {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet(path) {
  const headers = await authHeaders();
  const res = await fetch(path, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
  return body;
}

export async function apiPost(path, payload = {}) {
  const headers = await authHeaders();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
  return body;
}
