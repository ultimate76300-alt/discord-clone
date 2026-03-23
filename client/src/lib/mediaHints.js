/** Heuristic: display capture vs webcam (labels vary by browser/OS). */
export function isLikelyScreenCaptureTrack(track) {
  if (!track || track.kind !== "video") return false;
  const l = (track.label || "").toLowerCase();
  if (
    l.includes("screen") ||
    l.includes("display") ||
    l.includes("monitor") ||
    l.includes("window") ||
    l.includes("présentation") ||
    l.includes("tab")
  ) {
    return true;
  }
  try {
    const s = track.getSettings?.();
    if (s?.displaySurface) return true;
  } catch {
    /* ignore */
  }
  return false;
}
