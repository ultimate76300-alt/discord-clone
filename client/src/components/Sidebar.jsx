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
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col bg-discord-sidebar md:w-64">
      <div className="flex h-12 items-center border-b border-black/20 px-4 shadow-sm">
        <div className="flex h-9 w-9 items-center justify-center rounded-[15px] bg-discord-accent text-lg font-bold text-white">
          V
        </div>
        <div className="ml-2 min-w-0">
          <div className="truncate text-sm font-semibold text-white">Voice & Chat</div>
          <div className="truncate text-xs text-discord-muted">Public lobby</div>
        </div>
      </div>

      <nav className="scroll-discord flex-1 overflow-y-auto px-2 py-3">
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
                    ? "bg-discord-hover text-white"
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
                    ? "bg-discord-hover text-white"
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
        <div className="border-t border-black/20 p-2">
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
