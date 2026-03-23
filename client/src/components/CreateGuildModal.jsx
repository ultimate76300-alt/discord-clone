import { useRef, useState } from "react";
import { BrandMark } from "./BrandMark";
import { GUILD_BRAND_PRESET_KEYS, GUILD_BRAND_PRESETS } from "../lib/guildBrandPresets";
import { fileToGuildIconDataUrl } from "../lib/guildIconImage";

export function CreateGuildModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  /** letter | brand | image */
  const [iconMode, setIconMode] = useState("letter");
  const [brandKey, setBrandKey] = useState("site");
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const fileRef = useRef(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        iconUrl: iconMode === "image" ? imageDataUrl : null,
        iconBrandKey: iconMode === "brand" ? brandKey : null,
      };
      const r = await onCreate?.(payload);
      if (r?.ok) {
        if (r.warn) console.warn("Icône serveur", r.warn);
      } else {
        setErr(r?.message || "Échec");
      }
    } finally {
      setBusy(false);
    }
  }

  async function onPickFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(null);
    try {
      const url = await fileToGuildIconDataUrl(f);
      setImageDataUrl(url);
      setIconMode("image");
    } catch (ex) {
      setErr(ex?.message || "Image refusée");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-guild-title"
    >
      <div className="w-full max-w-md rounded-xl border border-discord-border bg-discord-sidebar p-5 shadow-2xl">
        <h2 id="create-guild-title" className="text-lg font-semibold text-discord-text">
          Créer un serveur privé
        </h2>
        <p className="mt-1 text-sm text-discord-muted">
          Choisis une icône (lettre, logo AtomVoice coloré ou ta propre image), puis le nom du serveur.
        </p>

        <div className="mt-4 flex flex-col items-center">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-discord-bg ring-2 ring-discord-border">
            {iconMode === "image" && imageDataUrl ? (
              <img src={imageDataUrl} alt="" className="h-full w-full object-cover" />
            ) : iconMode === "brand" ? (
              <BrandMark variant={brandKey} className="h-14 w-14" title="Aperçu" />
            ) : (
              <span className="text-2xl font-bold text-discord-text">
                {(name.trim()[0] || "?").toLocaleUpperCase(undefined)}
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {[
              { id: "letter", label: "Lettre" },
              { id: "brand", label: "Logo" },
              { id: "image", label: "Photo" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setIconMode(t.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  iconMode === t.id
                    ? "bg-discord-accent text-white"
                    : "bg-discord-input text-discord-muted hover:text-discord-text"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {iconMode === "brand" ? (
            <div className="mt-3 grid w-full max-w-[280px] grid-cols-4 gap-2">
              {GUILD_BRAND_PRESET_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  title={GUILD_BRAND_PRESETS[key].label}
                  onClick={() => setBrandKey(key)}
                  className={`flex aspect-square items-center justify-center rounded-xl bg-discord-bg p-1 ring-1 transition hover:ring-discord-accent/50 ${
                    brandKey === key ? "ring-2 ring-discord-accent" : "ring-discord-border"
                  }`}
                >
                  <BrandMark variant={key} className="h-9 w-9" title={GUILD_BRAND_PRESETS[key].label} />
                </button>
              ))}
            </div>
          ) : null}

          {iconMode === "image" ? (
            <div className="mt-3 flex w-full flex-col items-center gap-2">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickFile} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-dashed border-discord-border px-4 py-2 text-sm text-discord-text hover:border-discord-accent/60 hover:bg-discord-hover"
              >
                {imageDataUrl ? "Changer l’image" : "Choisir une image"}
              </button>
              {imageDataUrl ? (
                <button
                  type="button"
                  onClick={() => setImageDataUrl(null)}
                  className="text-xs text-discord-muted hover:text-discord-text"
                >
                  Retirer la photo
                </button>
              ) : (
                <p className="text-center text-[11px] text-discord-muted">JPG, PNG ou WebP — redimensionnée automatiquement.</p>
              )}
            </div>
          ) : null}
        </div>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <label className="block text-xs font-medium uppercase tracking-wide text-discord-muted">
            Nom du serveur
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              className="mt-1 w-full rounded-lg border border-discord-border bg-discord-input px-3 py-2 text-sm text-discord-text outline-none placeholder:text-discord-muted/60"
              placeholder="Ma team"
              autoFocus
            />
          </label>
          {err ? <p className="text-sm text-red-400">{err}</p> : null}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-discord-border px-4 py-2 text-sm text-discord-text hover:bg-discord-hover"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim() || (iconMode === "image" && !imageDataUrl)}
              className="rounded-lg bg-discord-accent px-4 py-2 text-sm font-medium text-white hover:bg-discord-accent/90 disabled:opacity-40"
            >
              {busy ? "Création…" : "Créer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
