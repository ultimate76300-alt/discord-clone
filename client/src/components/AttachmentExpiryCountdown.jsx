import { useEffect, useState } from "react";

/** Décompte temps restant jusqu’à expiresAtMs (ms). Rouge sous 10 minutes. */
export function AttachmentExpiryCountdown({ expiresAtMs }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const left = Number(expiresAtMs) - now;
  if (!Number.isFinite(left) || left <= 0) {
    return <span className="text-xs font-medium text-red-400">Expiré</span>;
  }

  const totalSec = Math.floor(left / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  const urgent = left < 10 * 60 * 1000;

  return (
    <span
      className={`font-mono text-xs tabular-nums ${
        urgent ? "font-semibold text-red-400" : "text-discord-muted"
      }`}
    >
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}
