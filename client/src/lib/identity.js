const KEY = "discord-clone-identity";

export function loadIdentity() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.displayName) return null;
    return {
      clientId: data.clientId || crypto.randomUUID(),
      displayName: String(data.displayName).slice(0, 32),
      avatarColor: data.avatarColor || "#5865f2",
      avatarEmoji: data.avatarEmoji || "👤",
    };
  } catch {
    return null;
  }
}

export function saveIdentity(identity) {
  const payload = {
    clientId: identity.clientId || crypto.randomUUID(),
    displayName: identity.displayName.slice(0, 32),
    avatarColor: identity.avatarColor,
    avatarEmoji: identity.avatarEmoji,
  };
  localStorage.setItem(KEY, JSON.stringify(payload));
  return payload;
}

export const AVATAR_COLORS = [
  "#5865f2",
  "#57f287",
  "#fee75c",
  "#eb459e",
  "#ed4245",
  "#9b59b6",
  "#3498db",
  "#e67e22",
];

export const AVATAR_EMOJIS = ["👤", "🎮", "🎧", "🐱", "🚀", "⭐", "🔥", "💜", "🌙", "🍕"];
