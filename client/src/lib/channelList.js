/** Normalise la config serveur (public = strings, serveur privé = { id, name }[]). */
export function normalizeChannelList(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === "string") {
    return raw.map((id) => ({ id, name: id }));
  }
  return raw
    .filter((x) => x && typeof x.id === "string")
    .map((x) => ({ id: x.id, name: typeof x.name === "string" ? x.name : x.id }));
}
