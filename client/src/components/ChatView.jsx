import { useEffect, useRef } from "react";
import { formatMessageTime } from "../lib/time";

export function ChatView({ channelId, messages, connected, onSend }) {
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
      <header className="flex h-12 shrink-0 items-center border-b border-black/20 px-4 shadow-sm">
        <span className="text-lg text-discord-muted">#</span>
        <h2 className="ml-1 text-sm font-bold text-white">{channelId}</h2>
      </header>

      <div className="scroll-discord flex-1 overflow-y-auto px-4 py-4">
        {!connected && (
          <p className="text-sm text-discord-muted">Connecting to chat…</p>
        )}
        <ul className="space-y-4">
          {messages.map((m) => (
            <li key={m.id} className="group flex gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg"
                style={{ backgroundColor: m.avatarColor }}
                title={m.displayName}
              >
                {m.avatarEmoji}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-white">{m.displayName}</span>
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
        className="shrink-0 border-t border-black/10 bg-discord-bg p-4"
      >
        <div className="rounded-lg bg-discord-input px-4 py-2">
          <input
            ref={inputRef}
            disabled={!connected}
            placeholder={`Message #${channelId}`}
            className="w-full bg-transparent text-[15px] text-discord-text outline-none placeholder:text-discord-muted"
          />
        </div>
      </form>
    </div>
  );
}
