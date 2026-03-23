import { useState } from "react";

export function CreateGuildModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await onCreate?.(name);
      if (r?.ok) {
        onClose?.();
      } else {
        setErr(r?.message || "Échec");
      }
    } finally {
      setBusy(false);
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
          Un salon texte « général » et un salon vocal seront créés. Tu pourras inviter des amis et
          nommer des admins ensuite.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
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
              disabled={busy || !name.trim()}
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
