import { useState } from "react";

/**
 * Bulle ronde : photo si `avatarUrl` valide, sinon fond coloré + emoji.
 */
export function AvatarBubble({
  avatarUrl,
  avatarColor = "#5865f2",
  avatarEmoji = "👤",
  className = "h-8 w-8",
  textClassName = "text-base",
  title,
}) {
  const [broken, setBroken] = useState(false);
  const showImg = Boolean(avatarUrl) && !broken;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full shadow-[0_0_0_1px_rgba(255,255,255,0.14),0_0_0_2px_#4a4a50,0_0_0_3px_#2a2a2e,0_2px_5px_rgba(0,0,0,0.42),inset_0_1px_0_rgba(255,255,255,0.2),inset_0_-2px_3px_rgba(0,0,0,0.28)] ${className} flex items-center justify-center ${
        showImg ? "bg-discord-input" : ""
      }`}
      style={showImg ? undefined : { backgroundColor: avatarColor }}
      title={title}
    >
      {showImg ? (
        <img
          src={avatarUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className={`relative z-10 select-none leading-none ${textClassName}`}>{avatarEmoji}</span>
      )}
    </div>
  );
}
