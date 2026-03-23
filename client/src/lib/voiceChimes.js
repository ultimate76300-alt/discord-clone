/**
 * Petits bips « mignons » via Web Audio (pas de fichier externe).
 * Les navigateurs exigent souvent une interaction utilisateur avant d’activer l’audio.
 */

let sharedCtx = null;

function getCtx() {
  if (typeof window === "undefined" || !window.AudioContext) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AudioContext();
  }
  return sharedCtx;
}

async function resumeIfNeeded(ctx) {
  if (ctx?.state === "suspended") {
    await ctx.resume().catch(() => {});
  }
}

/**
 * Son bref ascendant (quelqu’un arrive en vocal).
 */
export async function playVoiceJoinChime() {
  const ctx = getCtx();
  if (!ctx) return;
  await resumeIfNeeded(ctx);
  const t0 = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
  master.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(523.25, t0);
  osc.frequency.exponentialRampToValueAtTime(783.99, t0 + 0.08);
  osc.frequency.exponentialRampToValueAtTime(1046.5, t0 + 0.16);
  osc.connect(master);
  osc.start(t0);
  osc.stop(t0 + 0.2);

  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.setValueAtTime(1318.5, t0 + 0.05);
  osc2.connect(master);
  osc2.start(t0 + 0.05);
  osc2.stop(t0 + 0.14);
}

/**
 * Son bref descendant doux (quelqu’un quitte le vocal).
 */
export async function playVoiceLeaveChime() {
  const ctx = getCtx();
  if (!ctx) return;
  await resumeIfNeeded(ctx);
  const t0 = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(0.09, t0 + 0.025);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
  master.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, t0);
  osc.frequency.exponentialRampToValueAtTime(440, t0 + 0.14);
  osc.connect(master);
  osc.start(t0);
  osc.stop(t0 + 0.18);
}

/**
 * Très court « plop » quand tu entres toi-même dans le salon vocal.
 */
export async function playVoiceSelfJoinChime() {
  const ctx = getCtx();
  if (!ctx) return;
  await resumeIfNeeded(ctx);
  const t0 = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
  g.connect(ctx.destination);
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(659.25, t0);
  o.frequency.exponentialRampToValueAtTime(880, t0 + 0.1);
  o.connect(g);
  o.start(t0);
  o.stop(t0 + 0.12);
}
