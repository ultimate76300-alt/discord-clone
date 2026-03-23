import { useEffect, useRef } from "react";
import { formatMessageTime } from "../lib/time";
import { AvatarBubble } from "./AvatarBubble";
import { EmojiPicker } from "./EmojiPicker";

export function DmChatView({
  peerDisplayName,
  peerAvatarUrl,
  selfUserId,
  selfDisplayName,
  selfAvatarUrl,
  selfAvatarColor,
  selfAvatarEmoji,
  messages,
  loading,
  error,
  ready,
  onSend,
  headerTrailing,
}) {
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e) {
    e.preventDefault();
    const el = inputRef.current;
    if (!el || !ready) return;
    const text = el.value.trim();
    if (!text) return;
    void onSend(text).then(() => {
      el.value = "";
    });
  }

  function senderLabel(senderId) {
    if (senderId === selfUserId) return selfDisplayName || "Vous";
    return peerDisplayName || "Ami";
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-discord-bg">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-discord-border bg-discord-elevated px-4">
        <span className="shrink-0 text-lg text-discord-muted" aria-hidden>
          @
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="min-w-0 truncate text-sm font-bold text-discord-text">{peerDisplayName}</h2>
          <span className="shrink-0 text-xs text-discord-muted">Message privé</span>
        </div>
        {headerTrailing ? <div className="shrink-0">{headerTrailing}</div> : null}
      </header>

      <div className="scroll-discord flex-1 overflow-y-auto px-4 py-4">
        {error ? (
          <div className="mb-4 rounded-lg border border-red-500/35 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}
        {loading && !ready ? (
          <p className="text-sm text-discord-muted">Ouverture de la conversation…</p>
        ) : null}
        <ul className="space-y-4">
          {messages.map((m) => {
            const mine = m.sender_id === selfUserId;
            return (
              <li key={m.id} className="group flex gap-3">
                <AvatarBubble
                  avatarUrl={mine ? selfAvatarUrl : peerAvatarUrl}
                  avatarColor={mine ? selfAvatarColor : "#5865f2"}
                  avatarEmoji={mine ? selfAvatarEmoji : "👤"}
                  className="h-10 w-10"
                  textClassName="text-lg"
                  title={senderLabel(m.sender_id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-discord-text">{senderLabel(m.sender_id)}</span>
                    <time
                      className="text-xs text-discord-muted"
                      dateTime={new Date(m.created_at).toISOString()}
                    >
                      {formatMessageTime(new Date(m.created_at).getTime())}
                    </time>
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] text-discord-text">
                    {m.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-discord-border bg-discord-bg p-4"
      >
        <div className="flex items-center gap-1 rounded-lg bg-discord-input px-1 py-1 ring-1 ring-discord-border/80 sm:px-2">
          <EmojiPicker inputRef={inputRef} disabled={!ready} />
          <input
            ref={inputRef}
            disabled={!ready}
            placeholder={ready ? `Message à ${peerDisplayName}` : "Connexion…"}
            className="min-w-0 flex-1 bg-transparent py-1 pl-1 pr-2 text-[15px] text-discord-text outline-none placeholder:text-discord-muted"
          />
        </div>
      </form>
    </div>
  );
}
