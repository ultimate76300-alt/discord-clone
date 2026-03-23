import { AVATAR_COLORS, AVATAR_EMOJIS } from "./identity";

function metaAvatarUrl(raw) {
  if (typeof raw !== "string") return undefined;
  const t = raw.trim();
  if (!t.startsWith("https://") || t.length > 600) return undefined;
  return t;
}

/** Map Supabase user → in-app identity (clientId = user id). */
export function userToIdentity(user) {
  if (!user?.id) return null;
  const m = user.user_metadata || {};
  const rawName = typeof m.display_name === "string" ? m.display_name.trim() : "";
  const displayName = String(
    rawName || (user.email && user.email.split("@")[0]) || "Utilisateur"
  ).slice(0, 32);
  const avatarUrl = metaAvatarUrl(m.avatar_url);
  return {
    clientId: user.id,
    displayName,
    avatarColor:
      typeof m.avatar_color === "string" && m.avatar_color ? m.avatar_color : "#5865f2",
    avatarEmoji:
      typeof m.avatar_emoji === "string" && m.avatar_emoji
        ? m.avatar_emoji.slice(0, 4)
        : "👤",
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

export function randomAvatarMeta() {
  return {
    avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    avatar_emoji: AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)],
  };
}
