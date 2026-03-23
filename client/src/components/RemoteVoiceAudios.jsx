import { useEffect, useRef } from "react";

const defaultMix = () => ({ volume: 1, muted: false });

function RemoteAudio({ stream, deafened, volume, userMuted }) {
  const ref = useRef(null);

  const effective = deafened || userMuted ? 0 : Math.max(0, Math.min(1, volume));

  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.volume = effective;
    el.play().catch(() => {});
    return () => {
      el.srcObject = null;
    };
  }, [stream, effective]);

  useEffect(() => {
    if (ref.current) ref.current.volume = effective;
  }, [effective]);

  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

export function RemoteVoiceAudios({ remoteStreams, deafened, peerMix }) {
  return (
    <div aria-hidden className="hidden">
      {[...remoteStreams.entries()].map(([peerId, stream]) => {
        const mix = peerMix?.get?.(peerId) ?? defaultMix();
        return (
          <RemoteAudio
            key={peerId}
            stream={stream}
            deafened={deafened}
            volume={mix.volume ?? 1}
            userMuted={!!mix.muted}
          />
        );
      })}
    </div>
  );
}
