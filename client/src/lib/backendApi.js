import { supabase } from "./supabase";

/** Même logique que le socket : en dev, backend sur 3001 sauf si VITE_SOCKET_URL est défini. */
function apiOrigin() {
  const raw = (import.meta.env.VITE_SOCKET_URL || "").trim();
  if (import.meta.env.DEV) {
    return raw ? raw.replace(/\/$/, "") : "http://localhost:3001";
  }
  const isLocal = /^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(raw);
  if (raw && !isLocal) return raw.replace(/\/$/, "");
  return typeof window !== "undefined" ? window.location.origin : "";
}

function apiUrl(path) {
  const origin = apiOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return origin ? `${origin}${p}` : p;
}

async function authHeaders() {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet(path) {
  const headers = await authHeaders();
  const res = await fetch(apiUrl(path), { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
  return body;
}

export async function apiPost(path, payload = {}) {
  const headers = await authHeaders();
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
  return body;
}

/** Inscription / endpoints publics (sans Bearer). */
export async function apiPostPublic(path, payload = {}) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
  return body;
}

/** Upload pièce jointe chat (Bearer). Retourne url, storagePath, fileName, mimeType. */
export async function apiUploadChatFile(file) {
  const headers = await authHeaders();
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(apiUrl("/api/chat/upload"), {
    method: "POST",
    headers,
    body: fd,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `HTTP ${res.status}`);
  return {
    url: body.url,
    storagePath: body.storagePath,
    fileName: body.fileName,
    mimeType: body.mimeType,
  };
}
