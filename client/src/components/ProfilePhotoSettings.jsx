import { useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { uploadProfileAvatarFile, clearProfileAvatar } from "../lib/avatarStorage";
import { AvatarBubble } from "./AvatarBubble";

export function ProfilePhotoSettings({ userId, avatarUrl, avatarColor, avatarEmoji }) {
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!supabase || !userId) return null;

  async function onPick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setLoading(true);
    try {
      await uploadProfileAvatarFile(userId, file);
    } catch (err) {
      setError(err?.message || "Échec de l’envoi");
    } finally {
      setLoading(false);
    }
  }

  async function onRemove() {
    setError("");
    setLoading(true);
    try {
      await clearProfileAvatar();
    } catch (err) {
      setError(err?.message || "Échec");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-discord-muted">
        Photo de profil
      </h3>
      <p className="mb-3 text-xs text-discord-muted">
        Stockée dans Supabase Storage. Crée un bucket public{" "}
        <code className="rounded bg-discord-hover px-1">avatars</code> et applique les politiques du fichier{" "}
        <code className="rounded bg-discord-hover px-1">supabase/storage-avatars.sql</code>.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <AvatarBubble
          avatarUrl={avatarUrl}
          avatarColor={avatarColor}
          avatarEmoji={avatarEmoji}
          className="h-14 w-14"
          textClassName="text-2xl"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={onPick}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={() => inputRef.current?.click()}
              className="rounded bg-discord-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-discord-accent/90 disabled:opacity-40"
            >
              {loading ? "…" : "Choisir une image"}
            </button>
            {avatarUrl ? (
              <button
                type="button"
                disabled={loading}
                onClick={onRemove}
                className="rounded px-3 py-1.5 text-sm text-discord-muted hover:bg-discord-hover hover:text-discord-text disabled:opacity-40"
              >
                Retirer la photo
              </button>
            ) : null}
          </div>
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
        </div>
      </div>
      <div className="mt-6 border-t border-discord-border pt-4">
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-discord-muted">
          Ton ID (amis)
        </h3>
        <p className="mb-2 text-xs text-discord-muted">
          Partage cet identifiant pour qu’on t’envoie une demande d’ami.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="max-w-full truncate rounded bg-discord-hover px-2 py-1 text-[11px] text-discord-text">
            {userId}
          </code>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(userId)}
            className="rounded border border-discord-border bg-discord-input px-2 py-1 text-xs text-discord-text hover:bg-discord-hover"
          >
            Copier
          </button>
        </div>
      </div>
    </section>
  );
}
