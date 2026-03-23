import { useEffect, useState } from "react";
import {
  DEFAULT_VOICE_SETTINGS,
  SCREEN_PRESET_LABELS,
  loadVoiceSettings,
  saveVoiceSettings,
} from "../lib/voiceSettings";

export function SettingsModal({ onClose, onSaved, profileSection }) {
  const [form, setForm] = useState(() => loadVoiceSettings());
  const [devices, setDevices] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } catch {
        /* labels may stay empty */
      }
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          setDevices(list.filter((d) => d.kind === "audioinput"));
        }
      } catch {
        if (!cancelled) setDevices([]);
      }
    })();
    const onDeviceChange = () => {
      void navigator.mediaDevices.enumerateDevices().then((list) => {
        setDevices(list.filter((d) => d.kind === "audioinput"));
      });
    };
    navigator.mediaDevices.addEventListener("devicechange", onDeviceChange);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener("devicechange", onDeviceChange);
    };
  }, []);

  function submit(e) {
    e.preventDefault();
    const saved = saveVoiceSettings(form);
    onSaved(saved);
    onClose();
  }

  function reset() {
    setForm({ ...DEFAULT_VOICE_SETTINGS });
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-discord-border bg-discord-sidebar shadow-2xl shadow-black/50"
        role="dialog"
        aria-labelledby="settings-title"
      >
        <div className="border-b border-discord-border px-5 py-4">
          <h2 id="settings-title" className="text-lg font-semibold text-discord-text">
            Paramètres audio & vidéo
          </h2>
          <p className="mt-1 text-sm text-discord-muted">
            Stockés sur cet appareil uniquement. Ajustez avant ou pendant un vocal.
          </p>
        </div>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="scroll-discord flex-1 overflow-y-auto px-5 py-4 space-y-6">
            {profileSection ? (
              <>
                {profileSection}
                <div className="border-b border-discord-border" />
              </>
            ) : null}
            <section>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-discord-muted">
                Microphone
              </h3>
              <label className="mb-2 block text-sm text-discord-text">
                Périphérique
                <select
                  value={form.micDeviceId}
                  onChange={(e) => setForm((f) => ({ ...f, micDeviceId: e.target.value }))}
                  className="mt-1 w-full rounded bg-discord-input px-3 py-2 text-sm text-discord-text outline-none"
                >
                  <option value="">Par défaut du système</option>
                  {devices.map((d) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Micro ${d.deviceId.slice(0, 8)}…`}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-4 block text-sm text-discord-text">
                Volume d&apos;entrée (gain) : {Math.round(form.inputGain * 100)}%
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={5}
                  value={form.inputGain * 100}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, inputGain: Number(e.target.value) / 100 }))
                  }
                  className="mt-2 w-full accent-discord-accent"
                />
                <span className="mt-1 block text-xs text-discord-muted">
                  Au-delà de 100 %, le son peut saturer selon le micro.
                </span>
              </label>

              <div className="mt-4 space-y-2">
                {[
                  ["echoCancellation", "Annulation d’écho"],
                  ["noiseSuppression", "Réduction de bruit"],
                  ["autoGainControl", "Contrôle automatique du gain (AGC)"],
                  ["voiceIsolation", "Isolation de la voix (navigateurs récents)"],
                ].map(([key, label]) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 text-sm text-discord-text"
                  >
                    <input
                      type="checkbox"
                      checked={!!form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                      className="rounded border-discord-muted"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-discord-muted">
                Partage d&apos;écran (qualité par défaut)
              </h3>
              <p className="mb-2 text-xs text-discord-muted">
                Le navigateur peut ne pas respecter exactement la résolution choisie.
              </p>
              <select
                value={form.screenPreset}
                onChange={(e) => setForm((f) => ({ ...f, screenPreset: e.target.value }))}
                className="w-full rounded bg-discord-input px-3 py-2 text-sm text-discord-text outline-none"
              >
                {Object.entries(SCREEN_PRESET_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-discord-border bg-discord-elevated px-5 py-3">
            <button
              type="button"
              onClick={reset}
              className="text-sm text-discord-muted hover:text-discord-text"
            >
              Réinitialiser
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-4 py-2 text-sm text-discord-text hover:bg-discord-hover"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded bg-discord-accent px-4 py-2 text-sm font-medium text-white hover:bg-discord-accent/90"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
