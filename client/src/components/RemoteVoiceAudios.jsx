import { useEffect, useRef } from "react";

function RemoteAudio({ stream, deafened }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.volume = deafened ? 0 : 1;
    el.play().catch(() => {});
    return () => {
      el.srcObject = null;
    };
  }, [stream, deafened]);

  useEffect(() => {
    if (ref.current) ref.current.volume = deafened ? 0 : 1;
  }, [deafened]);

  return <audio ref={ref} autoPlay playsInline className="hidden" />;
}

export function RemoteVoiceAudios({ remoteStreams, deafened }) {
  return (
    <div aria-hidden className="hidden">
      {[...remoteStreams.entries()].map(([peerId, stream]) => (
        <RemoteAudio key={peerId} stream={stream} deafened={deafened} />
      ))}
    </div>
  );
}
