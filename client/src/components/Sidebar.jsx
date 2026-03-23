import { useState } from "react";
import { BrandMark } from "./BrandMark";

function ChannelIcon({ hash }) {
  return (
    <span className="mr-2 text-lg leading-none text-discord-muted" aria-hidden>
      {hash ? "#" : "🔊"}
    </span>
  );
}

export function Sidebar({
  textChannels,
  voiceChannels,
  selectedTextId,
  connectedVoiceId,
  mainPane,
  onSelectText,
  onSelectVoice,
  onDisconnectVoice,
  friendsEnabled = false,
  friends = [],
  incoming = [],
  outgoing = [],
  selectedDmPeerId = null,
  onSelectDmPeer,
  friendAddError,
  onClearFriendAddError,
  onSendFriendRequest,
  onAcceptRequest,
  onDeclineRequest,
  onCancelOutgoing,
}) {
  const [friendInput, setFriendInput] = useState("");

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-discord-sidebar md:w-64">
      <div className="flex h-12 items-center border-b border-discord-border px-4 shadow-sm">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-discord-bg ring-1 ring-discord-border">
          <BrandMark className="h-7 w-7" />
        </div>
        <div className="ml-2 min-w-0">
          <div className="truncate text-sm font-semibold text-discord-text">AtomVoice</div>
          <div className="truncate text-xs text-discord-muted">Public lobby</div>
        </div>
      </div>

      <nav className="scroll-discord flex-1 overflow-y-auto px-2 py-3">
        {friendsEnabled ? (
          <>
            <div className="mb-1 px-2 text-xs font-bold uppercase tracking-wide text-discord-muted">
              Amis & MP
            </div>
            <div className="mb-3 space-y-2 rounded-md bg-discord-card px-2 py-2 ring-1 ring-discord-border/80">
              <p className="px-0.5 text-[11px] text-discord-muted">
                Collez l’UUID du compte (Paramètres → ton ID) puis envoyez une demande.
              </p>
              <div className="flex gap-1">
                <input
                  value={friendInput}
                  onChange={(e) => {
                    setFriendInput(e.target.value);
                    onClearFriendAddError?.();
                  }}
                  placeholder="UUID…"
                  className="min-w-0 flex-1 rounded bg-discord-input px-2 py-1 text-xs text-discord-text outline-none placeholder:text-discord-muted/70"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const res = await onSendFriendRequest?.(friendInput.trim());
                    if (res?.ok) setFriendInput("");
                  }}
                  className="shrink-0 rounded bg-discord-accent px-2 py-1 text-xs font-medium text-white hover:bg-discord-accent/90"
                >
                  Ajouter
                </button>
              </div>
              {friendAddError ? (
                <p className="text-[11px] text-red-400">{friendAddError}</p>
              ) : null}

              {incoming.length > 0 ? (
                <div className="mt-2 border-t border-discord-border pt-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase text-discord-muted">
                    Demandes reçues
                  </p>
                  <ul className="space-y-1">
                    {incoming.map((u) => (
                      <li
                        key={u.requestId}
                        className="flex flex-col gap-1 rounded bg-discord-input/50 px-2 py-1.5"
                      >
                        <span className="truncate text-xs text-discord-text">{u.displayName}</span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => onAcceptRequest?.(u.requestId)}
                            className="flex-1 rounded bg-discord-green/90 py-0.5 text-[11px] font-medium text-white"
                          >
                            Accepter
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeclineRequest?.(u.requestId)}
                            className="flex-1 rounded border border-discord-border bg-discord-elevated py-0.5 text-[11px] text-discord-text hover:bg-discord-hover"
                          >
                            Refuser
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {outgoing.length > 0 ? (
                <div className="mt-2 border-t border-discord-border pt-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase text-discord-muted">
                    En attente
                  </p>
                  <ul className="space-y-1">
                    {outgoing.map((u) => (
                      <li
                        key={u.requestId}
                        className="flex items-center justify-between gap-1 rounded px-1 py-0.5"
                      >
                        <span className="truncate text-xs text-discord-muted">{u.displayName}</span>
                        <button
                          type="button"
                          onClick={() => onCancelOutgoing?.(u.requestId)}
                          className="shrink-0 text-[10px] text-discord-muted hover:text-discord-text"
                        >
                          Annuler
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="mb-1 px-2 text-xs font-bold uppercase tracking-wide text-discord-muted">
              Conversations
            </div>
            <ul className="mb-4 space-y-0.5">
              {friends.length === 0 ? (
                <li className="px-2 py-2 text-xs text-discord-muted">Aucun ami pour l’instant</li>
              ) : (
                friends.map((f) => (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => onSelectDmPeer?.(f.id)}
                      className={`flex w-full items-center rounded px-2 py-1.5 text-left text-sm transition ${
                        mainPane === "dm" && selectedDmPeerId === f.id
                          ? "bg-discord-hover text-discord-text"
                          : "text-discord-muted hover:bg-discord-hover/80 hover:text-discord-text"
                      }`}
                    >
                      <span className="mr-2 text-base" aria-hidden>
                        @
                      </span>
                      <span className="truncate">{f.displayName}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </>
        ) : null}

        <div className="mb-1 px-2 text-xs font-bold uppercase tracking-wide text-discord-muted">
          Text channels
        </div>
        <ul className="space-y-0.5">
          {textChannels.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelectText(id)}
                className={`flex w-full items-center rounded px-2 py-1.5 text-left text-sm transition ${
                  mainPane === "text" && selectedTextId === id
                    ? "bg-discord-hover text-discord-text"
                    : "text-discord-muted hover:bg-discord-hover/80 hover:text-discord-text"
                }`}
              >
                <ChannelIcon hash />
                <span className="truncate">{id}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mb-1 mt-4 px-2 text-xs font-bold uppercase tracking-wide text-discord-muted">
          Voice channels
        </div>
        <ul className="space-y-0.5">
          {voiceChannels.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => onSelectVoice(id)}
                className={`flex w-full items-center rounded px-2 py-1.5 text-left text-sm transition ${
                  mainPane === "voice" && connectedVoiceId === id
                    ? "bg-discord-hover text-discord-text"
                    : "text-discord-muted hover:bg-discord-hover/80 hover:text-discord-text"
                }`}
              >
                <ChannelIcon />
                <span className="truncate">{id}</span>
                {connectedVoiceId === id && (
                  <span className="ml-auto text-[10px] font-semibold uppercase text-discord-green">
                    Live
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {connectedVoiceId && (
        <div className="border-t border-discord-border p-2">
          <button
            type="button"
            onClick={onDisconnectVoice}
            className="w-full rounded bg-discord-input px-2 py-1.5 text-xs font-medium text-discord-text hover:bg-discord-hover"
          >
            Disconnect voice
          </button>
        </div>
      )}
    </aside>
  );
}
