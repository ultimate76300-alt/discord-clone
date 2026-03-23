import { useState } from "react";
import { AVATAR_COLORS, AVATAR_EMOJIS, saveIdentity } from "../lib/identity";

export function IdentityModal({ onComplete }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [emoji, setEmoji] = useState(AVATAR_EMOJIS[0]);

  function submit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const identity = saveIdentity({
      clientId: crypto.randomUUID(),
      displayName: trimmed,
      avatarColor: color,
      avatarEmoji: emoji,
    });
    onComplete(identity);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-xl border border-discord-border bg-discord-sidebar p-6 shadow-2xl shadow-black/50"
        role="dialog"
        aria-labelledby="identity-title"
      >
        <h1 id="identity-title" className="text-xl font-semibold text-discord-text">
          Choose your identity
        </h1>
        <p className="mt-1 text-sm text-discord-muted">
          No account needed — stored only on this device.
        </p>
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-discord-muted">
              Display name
            </label>
            <input
              autoFocus
              maxLength={32}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What should everyone call you?"
              className="w-full rounded bg-discord-input px-3 py-2 text-discord-text outline-none ring-discord-accent focus:ring-2"
            />
          </div>
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-discord-muted">
              Avatar color
            </span>
            <div className="flex flex-wrap gap-2">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => setColor(c)}
                  className={`h-9 w-9 rounded-full ring-2 ring-offset-2 ring-offset-discord-sidebar transition ${
                    color === c ? "ring-discord-accent" : "ring-transparent hover:ring-discord-border"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-discord-muted">
              Emoji badge
            </span>
            <div className="flex flex-wrap gap-2">
              {AVATAR_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => setEmoji(em)}
                  className={`rounded-lg border px-2 py-1 text-xl transition ${
                    emoji === em
                      ? "border-discord-accent bg-discord-hover"
                      : "border-transparent bg-discord-input hover:bg-discord-hover"
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full rounded bg-discord-accent py-2.5 text-sm font-medium text-white transition hover:bg-discord-accent/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue
          </button>
        </form>
      </div>
    </div>
  );
}
