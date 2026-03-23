/** Protocole texte : lobby public vs serveur privé (jamais mélangés). */

export const PUBLIC_TEXT_SLUGS = ["general", "random", "dev", "off-topic"];
export const PUBLIC_TEXT_SET = new Set(
  PUBLIC_TEXT_SLUGS.map((s) => s.toLowerCase())
);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeUuid(raw) {
  if (raw == null || raw === "") return null;
  return String(raw).trim().toLowerCase();
}

/** Slug lobby public canonique, ou "" si invalide. */
export function canonicalPublicTextChannelId(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  return PUBLIC_TEXT_SET.has(s) ? s : "";
}

/** id salon texte privé (UUID) prêt à émettre. */
export function canonicalGuildTextChannelId(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return UUID_RE.test(s) ? s.toLowerCase() : "";
}

export function buildTextChatTarget(activeGuildId, selectedTextId) {
  if (activeGuildId) {
    const gid = normalizeUuid(activeGuildId);
    const ch = canonicalGuildTextChannelId(selectedTextId);
    if (!gid || !ch) return null;
    return { scope: "guild", guildId: gid, channelId: ch };
  }
  const ch = canonicalPublicTextChannelId(selectedTextId);
  if (!ch) return null;
  return { scope: "public", guildId: null, channelId: ch };
}

export function textChatTargetKey(t) {
  if (!t) return "";
  if (t.scope === "public") return `p:${t.channelId}`;
  return `g:${t.guildId}:${t.channelId}`;
}

/** Payload serveur text:history / text:message (avec scope explicite). */
export function unwrapSocketData(raw) {
  if (Array.isArray(raw) && raw.length > 0) return unwrapSocketData(raw[0]);
  return raw;
}

export function eventMatchesChatTarget(target, pkt) {
  if (!target || !pkt || typeof pkt !== "object") return false;
  if (pkt.scope !== target.scope) return false;
  const evtCh =
    pkt.scope === "public"
      ? canonicalPublicTextChannelId(pkt.channelId)
      : canonicalGuildTextChannelId(pkt.channelId);
  if (!evtCh || evtCh !== target.channelId) return false;
  if (target.scope === "public") {
    return (pkt.guildId ?? null) === null && target.guildId === null;
  }
  return normalizeUuid(pkt.guildId) === target.guildId;
}
