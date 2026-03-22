import { useEffect, useRef } from "react";

function VideoTile({ label, color, emoji, stream, mutedAudio, isScreen }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    return () => {
      el.srcObject = null;
    };
  }, [stream]);

  const hasVideo = stream?.getVideoTracks().some((t) => t.readyState === "live");

  return (
    <div className="flex min-h-[140px] min-w-0 flex-1 flex-col overflow-hidden rounded-lg bg-black/40 sm:min-h-[180px]">
      <div className="relative aspect-video w-full bg-discord-elevated">
        {hasVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-contain"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-5xl"
            style={{ backgroundColor: color }}
          >
            {emoji}
          </div>
        )}
        {isScreen && (
          <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
            Screen
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 border-t border-white/5 bg-discord-sidebar px-2 py-1.5">
        <span className="truncate text-sm font-medium text-white">{label}</span>
        {mutedAudio && (
          <span className="text-xs text-discord-muted" title="Muted">
            🔇
          </span>
        )}
      </div>
    </div>
  );
}

export function VoiceView({
  channelId,
  profile,
  localStreamRef,
  localRenderTick,
  remoteStreams,
  peerMeta,
  cameraOn,
  screenOn,
  onToggleCamera,
  onToggleScreen,
}) {
  const local = localStreamRef.current;
  const localLabel = `${profile.displayName} (you)`;
  const localHasVideo =
    local?.getVideoTracks().some((t) => t.readyState === "live") ?? false;

  const remoteEntries = [...remoteStreams.entries()];

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-discord-bg">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-black/20 px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔊</span>
          <h2 className="text-sm font-bold text-white">{channelId}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleCamera(!cameraOn)}
            className={`rounded p-2 transition hover:bg-discord-hover ${
              cameraOn ? "text-discord-green" : "text-discord-muted"
            }`}
            title="Camera"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onToggleScreen(!screenOn)}
            className={`rounded p-2 transition hover:bg-discord-hover ${
              screenOn ? "text-discord-green" : "text-discord-muted"
            }`}
            title="Share screen"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
            </svg>
          </button>
        </div>
      </header>

      <div className="scroll-discord flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <VideoTile
            key={`local-${localRenderTick}`}
            label={localLabel}
            color={profile.avatarColor}
            emoji={profile.avatarEmoji}
            stream={local}
            mutedAudio
            isScreen={screenOn && localHasVideo}
          />
          {remoteEntries.map(([peerId, stream]) => {
            const meta = peerMeta.get(peerId) || {
              displayName: "Guest",
              avatarColor: "#5865f2",
              avatarEmoji: "👤",
            };
            const vt = stream.getVideoTracks()[0];
            const isScreen =
              vt?.label?.toLowerCase().includes("screen") ||
              vt?.label?.toLowerCase().includes("display");
            return (
              <VideoTile
                key={peerId}
                label={meta.displayName}
                color={meta.avatarColor}
                emoji={meta.avatarEmoji}
                stream={stream}
                mutedAudio={false}
                isScreen={isScreen}
              />
            );
          })}
        </div>
        {remoteEntries.length === 0 && (
          <p className="mt-4 text-center text-sm text-discord-muted">
            You&apos;re alone in this channel. Invite others to this page to start a call.
          </p>
        )}
      </div>
    </div>
  );
}
