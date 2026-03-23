import { useEffect, useRef } from "react";
import { formatMessageTime } from "../lib/time";
import { AvatarBubble } from "./AvatarBubble";
import { EmojiPicker } from "./EmojiPicker";

export function ChatView({
  channelId,
  messages,
  connected,
  connectionError,
  onSend,
  headerTrailing,
}) {
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, channelId]);

  function handleSubmit(e) {
    e.preventDefault();
    const el = inputRef.current;
    if (!el || !connected) return;
    const text = el.value.trim();
    if (!text) return;
    onSend(text);
    el.value = "";
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-discord-bg">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-discord-border bg-discord-elevated px-4">
        <span className="shrink-0 text-lg text-discord-muted">#</span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold text-discord-text">{channelId}</h2>
        {headerTrailing ? <div className="shrink-0">{headerTrailing}</div> : null}
      </header>

      <div className="scroll-discord flex-1 overflow-y-auto px-4 py-4">
        {!connected && connectionError && (
          <div className="mb-4 rounded-lg border border-red-500/35 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            <p className="font-medium">Impossible de joindre le serveur</p>
            <p className="mt-1 text-red-200/85">{connectionError}</p>
            <p className="mt-2 text-xs text-discord-muted">
              Sur Railway : ne mets pas{" "}
              <code className="rounded bg-discord-hover px-1 text-discord-text">VITE_SOCKET_URL=http://localhost…</code>{" "}
              dans les variables de <strong>build</strong>. Laisse-la vide pour utiliser la même
              URL que le site.
            </p>
          </div>
        )}
        {!connected && !connectionError && (
          <p className="text-sm text-discord-muted">Connecting to chat…</p>
        )}
        <ul className="space-y-4">
          {messages.map((m) => (
            <li key={m.id} className="group flex gap-3">
              <AvatarBubble
                avatarUrl={m.avatarUrl}
                avatarColor={m.avatarColor}
                avatarEmoji={m.avatarEmoji}
                className="h-10 w-10"
                textClassName="text-lg"
                title={m.displayName}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-discord-text">{m.displayName}</span>
                  <time
                    className="text-xs text-discord-muted"
                    dateTime={new Date(m.ts).toISOString()}
                  >
                    {formatMessageTime(m.ts)}
                  </time>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] text-discord-text">
                  {m.text}
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-discord-border bg-discord-bg p-4"
      >
        <div className="flex items-center gap-1 rounded-lg bg-discord-input px-1 py-1 ring-1 ring-discord-border/80 sm:px-2">
          <EmojiPicker inputRef={inputRef} disabled={!connected} />
          <input
            ref={inputRef}
            disabled={!connected}
            placeholder={`Message #${channelId}`}
            className="min-w-0 flex-1 bg-transparent py-1 pl-1 pr-2 text-[15px] text-discord-text outline-none placeholder:text-discord-muted"
          />
        </div>
      </form>
    </div>
  );
}
