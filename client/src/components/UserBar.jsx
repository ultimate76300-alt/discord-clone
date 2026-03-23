export function UserBar({
  profile,
  muted,
  deafened,
  onToggleMute,
  onToggleDeafen,
  connectedVoiceId,
  onOpenSettings,
  onSignOut,
}) {
  return (
    <footer className="flex h-14 shrink-0 items-center gap-2 border-t border-black/20 bg-discord-elevated px-2">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
        style={{ backgroundColor: profile.avatarColor }}
      >
        {profile.avatarEmoji}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-white">{profile.displayName}</div>
        {connectedVoiceId ? (
          <div className="truncate text-xs text-discord-green">Voice · {connectedVoiceId}</div>
        ) : (
          <div className="truncate text-xs text-discord-muted">Not in voice</div>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={onToggleMute}
          title={muted ? "Unmute" : "Mute"}
          className={`rounded p-2 transition hover:bg-discord-hover ${
            muted ? "text-discord-muted line-through" : "text-discord-text"
          }`}
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onToggleDeafen}
          title={deafened ? "Undeafen" : "Deafen"}
          className={`rounded p-2 transition hover:bg-discord-hover ${
            deafened ? "text-discord-muted" : "text-discord-text"
          }`}
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M12 1c-4.97 0-9 4.03-9 9v7c0 1.66 1.34 3 3 3h3v-8H5v-2c0-3.87 3.13-7 7-7s7 3.13 7 7v2h-4v8h3c1.66 0 3-1.34 3-3v-7c0-4.97-4.03-9-9-9z" />
          </svg>
        </button>
        <button
          type="button"
          title="Paramètres"
          onClick={() => onOpenSettings?.()}
          className="rounded p-2 text-discord-muted transition hover:bg-discord-hover hover:text-discord-text"
        >
          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </button>
        {onSignOut ? (
          <button
            type="button"
            title="Déconnexion"
            onClick={() => onSignOut()}
            className="rounded p-2 text-discord-muted transition hover:bg-discord-hover hover:text-discord-text"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
            </svg>
          </button>
        ) : null}
      </div>
    </footer>
  );
}
