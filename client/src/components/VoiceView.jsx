import { useCallback, useEffect, useRef, useState } from "react";
import { isLikelyScreenCaptureTrack } from "../lib/mediaHints";
import { SCREEN_PRESET_LABELS } from "../lib/voiceSettings";
import { AvatarBubble } from "./AvatarBubble";

function FocusModal({ stream, title, subtitle, onClose }) {
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
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-slate-950/92 p-4 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 pb-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-slate-100">{title}</h2>
          {subtitle ? <p className="text-sm text-slate-400">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded-lg bg-slate-700/80 px-4 py-2 text-sm font-medium text-white hover:bg-slate-600"
        >
          Fermer
        </button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg bg-slate-900">
        {hasVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-500">
            Pas de flux vidéo
          </div>
        )}
      </div>
    </div>
  );
}

function VideoTile({
  label,
  color,
  emoji,
  avatarUrl,
  stream,
  mutedAudio,
  isScreen,
  onExpand,
  remoteControls,
}) {
  const videoRef = useRef(null);
  const [avatarBroken, setAvatarBroken] = useState(false);

  useEffect(() => {
    setAvatarBroken(false);
  }, [avatarUrl]);

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
    <div className="flex min-h-[140px] min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-discord-border bg-discord-card shadow-sm sm:min-h-[180px]">
      <div className="relative aspect-video w-full bg-discord-elevated">
        {hasVideo ? (
          <button
            type="button"
            onClick={() => onExpand?.()}
            className="group relative block h-full w-full cursor-zoom-in text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-discord-accent"
            title="Agrandir la vidéo"
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-contain transition group-hover:brightness-110"
            />
            <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-slate-900/80 px-2 py-0.5 text-[10px] text-slate-100 opacity-0 transition group-hover:opacity-100">
              Cliquer pour agrandir
            </span>
          </button>
        ) : avatarUrl && !avatarBroken ? (
          <div className="relative flex h-full w-full items-center justify-center bg-discord-elevated">
            <img
              src={avatarUrl}
              alt=""
              className="h-full w-full object-cover"
              onError={() => setAvatarBroken(true)}
            />
          </div>
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-5xl"
            style={{ backgroundColor: color }}
          >
            {emoji}
          </div>
        )}
        {isScreen && (
          <span className="pointer-events-none absolute left-2 top-2 rounded bg-slate-900/80 px-2 py-0.5 text-xs text-slate-100">
            Écran
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-discord-border bg-discord-sidebar px-2 py-2">
        <div className="flex items-center gap-2">
          <AvatarBubble
            avatarUrl={avatarUrl}
            avatarColor={color}
            avatarEmoji={emoji}
            className="h-8 w-8 shrink-0"
            textClassName="text-sm"
          />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-discord-text">{label}</span>
          {mutedAudio && (
            <span className="text-xs text-discord-muted" title="Muet">
              🔇
            </span>
          )}
        </div>
        {remoteControls ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-discord-border pt-2">
            <button
              type="button"
              onClick={remoteControls.onToggleMute}
              className={`rounded px-2 py-1 text-xs font-medium ${
                remoteControls.mixMuted
                  ? "bg-red-950/60 text-red-200 ring-1 ring-red-500/30"
                  : "bg-discord-elevated text-discord-text ring-1 ring-discord-border hover:bg-discord-hover"
              }`}
              title={remoteControls.mixMuted ? "Réactiver le son de ce participant" : "Couper le son de ce participant"}
            >
              {remoteControls.mixMuted ? "Son coupé" : "Couper son son"}
            </button>
            <label className="flex min-w-[120px] flex-1 items-center gap-2 text-xs text-discord-muted">
              Vol.
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((remoteControls.volume ?? 1) * 100)}
                onChange={(e) => remoteControls.onVolume(Number(e.target.value) / 100)}
                className="h-1 flex-1 accent-discord-accent"
              />
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function VoiceView({
  channelId,
  channelTitle,
  profile,
  localStreamRef,
  localRenderTick,
  remoteStreams,
  peerMeta,
  cameraOn,
  screenOn,
  onToggleCamera,
  onToggleScreen,
  screenPreset,
  onScreenPresetChange,
  peerMix,
  onPeerVolume,
  onPeerMuteToggle,
  headerTrailing,
}) {
  const [focus, setFocus] = useState(null);
  const local = localStreamRef.current;
  const localLabel = `${profile.displayName} (vous)`;
  const localHasVideo =
    local?.getVideoTracks().some((t) => t.readyState === "live") ?? false;

  const remoteEntries = [...remoteStreams.entries()];
  const remoteScreenPeerIds = remoteEntries
    .filter(([, stream]) => {
      const t = stream.getVideoTracks()[0];
      return t?.readyState === "live" && isLikelyScreenCaptureTrack(t);
    })
    .map(([peerId]) => peerId);
  const screenShareVolumePercent =
    remoteScreenPeerIds.length > 0
      ? Math.round(((peerMix.get(remoteScreenPeerIds[0])?.volume ?? 1) * 100))
      : 100;

  const anyoneScreenSharing =
    (screenOn && localHasVideo) ||
    remoteEntries.some(([, stream]) => {
      const t = stream.getVideoTracks()[0];
      return t?.readyState === "live" && isLikelyScreenCaptureTrack(t);
    });

  const openFocus = useCallback((kind, peerId, stream, title, subtitle) => {
    if (!stream?.getVideoTracks().some((t) => t.readyState === "live")) return;
    setFocus({ kind, peerId, stream, title, subtitle });
  }, []);

  const closeFocus = useCallback(() => setFocus(null), []);

  const focusStream = focus?.stream ?? null;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-discord-bg">
      {anyoneScreenSharing ? (
        <div
          className="pointer-events-none fixed bottom-20 left-1/2 z-[70] -translate-x-1/2 sm:bottom-6"
          role="status"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/35 bg-amber-950/50 px-4 py-2 text-sm font-medium text-amber-100 shadow-lg backdrop-blur-sm">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400" aria-hidden />
            Partage d&apos;écran activé
          </span>
        </div>
      ) : null}
      {remoteScreenPeerIds.length > 0 ? (
        <div className="fixed bottom-3 left-1/2 z-[72] w-[min(92vw,460px)] -translate-x-1/2 rounded-xl border border-discord-border bg-discord-elevated/95 px-3 py-2 shadow-xl backdrop-blur">
          <label className="flex items-center gap-3 text-xs text-discord-muted">
            <span className="shrink-0 text-discord-text">Volume partage</span>
            <input
              type="range"
              min={0}
              max={100}
              value={screenShareVolumePercent}
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                remoteScreenPeerIds.forEach((peerId) => onPeerVolume(peerId, v));
              }}
              className="h-1 flex-1 accent-discord-accent"
            />
            <span className="w-10 shrink-0 text-right text-discord-text">{screenShareVolumePercent}%</span>
          </label>
        </div>
      ) : null}
      {focus ? (
        <FocusModal
          stream={focusStream}
          title={focus.title}
          subtitle={focus.subtitle}
          onClose={closeFocus}
        />
      ) : null}

      <header className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-discord-border bg-discord-elevated px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔊</span>
          <h2 className="text-sm font-bold text-discord-text">{channelTitle ?? channelId}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-discord-muted">
            Qualité partage
            <select
              value={screenPreset}
              disabled={screenOn}
              onChange={(e) => onScreenPresetChange(e.target.value)}
              className="max-w-[140px] rounded bg-discord-input px-2 py-1 text-xs text-discord-text outline-none disabled:opacity-50"
              title="Résolution cible du partage d’écran"
            >
              {Object.entries(SCREEN_PRESET_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => onToggleCamera(!cameraOn)}
            className={`rounded p-2 transition hover:bg-discord-hover ${
              cameraOn ? "text-discord-green" : "text-discord-muted"
            }`}
            title="Caméra"
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
            title="Partager l’écran"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
            </svg>
          </button>
          {headerTrailing ? <div className="flex shrink-0 items-center">{headerTrailing}</div> : null}
        </div>
      </header>

      <div className="scroll-discord flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <VideoTile
            key={`local-${localRenderTick}`}
            label={localLabel}
            color={profile.avatarColor}
            emoji={profile.avatarEmoji}
            avatarUrl={profile.avatarUrl}
            stream={local}
            mutedAudio
            isScreen={screenOn && localHasVideo}
            onExpand={() =>
              openFocus("local", null, local, localLabel, screenOn ? "Partage d’écran" : "Caméra")
            }
          />
          {remoteEntries.map(([peerId, stream]) => {
            const meta = peerMeta.get(peerId) || {
              displayName: "Invité",
              avatarColor: "#5865f2",
              avatarEmoji: "👤",
              avatarUrl: undefined,
            };
            const vt = stream.getVideoTracks()[0];
            const isScreen = vt ? isLikelyScreenCaptureTrack(vt) : false;
            const mix = peerMix.get(peerId) || { volume: 1, muted: false };
            return (
              <VideoTile
                key={peerId}
                label={meta.displayName}
                color={meta.avatarColor}
                emoji={meta.avatarEmoji}
                avatarUrl={meta.avatarUrl}
                stream={stream}
                mutedAudio={false}
                isScreen={isScreen}
                onExpand={() =>
                  openFocus(
                    "remote",
                    peerId,
                    stream,
                    meta.displayName,
                    isScreen ? "Partage d’écran" : "Caméra"
                  )
                }
                remoteControls={{
                  volume: mix.volume,
                  mixMuted: mix.muted,
                  onVolume: (v) => onPeerVolume(peerId, v),
                  onToggleMute: () => onPeerMuteToggle(peerId),
                }}
              />
            );
          })}
        </div>
        {remoteEntries.length === 0 && (
          <p className="mt-4 text-center text-sm text-discord-muted">
            Vous êtes seul sur ce salon. Partagez le lien pour appeler du monde.
          </p>
        )}
      </div>
    </div>
  );
}
