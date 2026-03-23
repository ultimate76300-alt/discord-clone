import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

/**
 * Bouton « Gestion du serveur » + menu (ajout / suppression salons, invitation, fenêtre membres).
 */
export function GuildServerManageMenu({
  guildId = null,
  isGuildOwner = false,
  textChannels = [],
  voiceChannels = [],
  friends = [],
  onCreateGuildChannel,
  onDeleteGuildChannel,
  onInviteToGuild,
  onOpenMembersManage,
  onDeleteServer,
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("main");
  const [name, setName] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteMsg, setInviteMsg] = useState(null);
  const [inviteErr, setInviteErr] = useState(null);
  const [inviteLoadingMembers, setInviteLoadingMembers] = useState(false);
  const [inviteLoadErr, setInviteLoadErr] = useState(null);
  const [guildMemberIds, setGuildMemberIds] = useState([]);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        resetAll();
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (view !== "invite" || !guildId || !supabase || !isSupabaseConfigured) return;
    let cancelled = false;
    setInviteLoadingMembers(true);
    setInviteLoadErr(null);
    void (async () => {
      const { data, error } = await supabase
        .from("guild_members")
        .select("user_id")
        .eq("guild_id", guildId);
      if (cancelled) return;
      if (error) {
        setInviteLoadErr(error.message);
        setGuildMemberIds([]);
      } else {
        setGuildMemberIds((data || []).map((r) => r.user_id).filter(Boolean));
      }
      setInviteLoadingMembers(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [view, guildId]);

  function resetPanel() {
    setView("main");
    setName("");
    setErr(null);
  }

  function resetInviteFields() {
    setInviteUserId("");
    setInviteMsg(null);
    setInviteErr(null);
    setInviteLoadErr(null);
  }

  function resetAll() {
    resetPanel();
    resetInviteFields();
    setGuildMemberIds([]);
  }

  async function submitCreate(kind) {
    setErr(null);
    setBusy(true);
    try {
      const r = await onCreateGuildChannel?.(kind, name);
      if (r?.ok) {
        setOpen(false);
        resetAll();
      } else {
        setErr(r?.message || "Impossible de créer le salon.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitInvite() {
    setInviteMsg(null);
    setInviteErr(null);
    if (!inviteUserId) return;
    setBusy(true);
    try {
      const r = await onInviteToGuild?.(inviteUserId);
      if (r?.ok) {
        setInviteMsg("Invitation envoyée.");
        setInviteUserId("");
        setGuildMemberIds((prev) => [...prev, inviteUserId]);
      } else {
        setInviteErr(r?.message || "Invitation refusée.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteChannel(channelId, label) {
    if (!window.confirm(`Supprimer le salon « ${label} » ? Cette action est définitive.`)) return;
    setErr(null);
    setBusy(true);
    try {
      const r = await onDeleteGuildChannel?.(channelId);
      if (!r?.ok) {
        setErr(r?.message || "Suppression impossible.");
      } else if (view === "del-text" || view === "del-voice") {
        const list = view === "del-text" ? textChannels : voiceChannels;
        const rest = list.filter((c) => c.id !== channelId);
        if (rest.length === 0) {
          setView("main");
          setErr(null);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  const friendsNotInGuild = friends.filter((f) => f?.id && !guildMemberIds.includes(f.id));

  return (
    <div className="relative z-40" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => {
            if (o) resetAll();
            return !o;
          });
        }}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-discord-border bg-discord-card/80 px-3 py-2 text-left text-xs font-semibold text-discord-text shadow-sm hover:bg-discord-hover"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span>Gestion du serveur</span>
        <span className="text-[10px] text-discord-muted" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open ? (
        <div className="absolute left-0 right-0 mt-1 max-h-[min(70vh,24rem)] overflow-y-auto rounded-lg border border-discord-border bg-discord-sidebar py-1 shadow-2xl ring-1 ring-black/25">
          {view === "main" ? (
            <div className="flex flex-col">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-discord-text hover:bg-discord-hover"
                onClick={() => {
                  resetPanel();
                  setView("text");
                }}
              >
                Ajouter un salon texte
                <span className="text-discord-muted">›</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-discord-text hover:bg-discord-hover"
                onClick={() => {
                  resetPanel();
                  setView("voice");
                }}
              >
                Ajouter un salon vocal
                <span className="text-discord-muted">›</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-discord-text hover:bg-discord-hover"
                onClick={() => {
                  resetPanel();
                  setView("del-text");
                }}
              >
                Supprimer un salon texte
                <span className="text-discord-muted">›</span>
              </button>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-discord-text hover:bg-discord-hover"
                onClick={() => {
                  resetPanel();
                  setView("del-voice");
                }}
              >
                Supprimer un salon vocal
                <span className="text-discord-muted">›</span>
              </button>
              <div className="my-1 border-t border-discord-border/80" />
              <button
                type="button"
                className="w-full px-3 py-2.5 text-left text-sm text-discord-text hover:bg-discord-hover"
                onClick={() => {
                  resetPanel();
                  resetInviteFields();
                  setView("invite");
                }}
              >
                Inviter un ami sur le serveur
              </button>
              <button
                type="button"
                className="w-full px-3 py-2.5 text-left text-sm text-discord-text hover:bg-discord-hover"
                onClick={() => {
                  onOpenMembersManage?.();
                  setOpen(false);
                  resetAll();
                }}
              >
                Membres &amp; salons (fenêtre complète)
              </button>
              {isGuildOwner ? (
                <>
                  <div className="my-1 border-t border-discord-border/80" />
                  <button
                    type="button"
                    className="w-full px-3 py-2.5 text-left text-sm font-medium text-red-300 hover:bg-red-950/35"
                    onClick={() => void onDeleteServer?.()}
                  >
                    Supprimer le serveur…
                  </button>
                </>
              ) : null}
            </div>
          ) : null}

          {view === "text" || view === "voice" ? (
            <div className="px-2 py-2">
              <button
                type="button"
                className="mb-2 text-[11px] text-discord-muted hover:text-discord-text"
                onClick={() => resetPanel()}
              >
                ← Retour
              </button>
              <p className="mb-2 text-xs font-medium text-discord-text">
                {view === "text" ? "Nouveau salon texte" : "Nouveau salon vocal"}
              </p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={64}
                placeholder="Nom du salon (1–64 car.)"
                className="mb-2 w-full rounded-md border border-discord-border bg-discord-input px-2 py-2 text-sm text-discord-text outline-none placeholder:text-discord-muted/60"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim() && !busy) void submitCreate(view);
                }}
              />
              {err ? <p className="mb-2 text-[11px] text-red-400">{err}</p> : null}
              <button
                type="button"
                disabled={busy || !name.trim()}
                onClick={() => void submitCreate(view)}
                className="w-full rounded-md bg-discord-green py-2 text-sm font-medium text-white hover:bg-discord-green/90 disabled:opacity-40"
              >
                {busy ? "Création…" : "Créer le salon"}
              </button>
            </div>
          ) : null}

          {view === "invite" ? (
            <div className="px-2 py-2">
              <button
                type="button"
                className="mb-2 text-[11px] text-discord-muted hover:text-discord-text"
                onClick={() => {
                  resetInviteFields();
                  resetPanel();
                }}
              >
                ← Retour
              </button>
              <p className="mb-2 text-xs font-medium text-discord-text">Inviter un ami</p>
              <p className="mb-2 text-[11px] leading-snug text-discord-muted">
                Seuls tes amis acceptés peuvent être invités (comme dans la fenêtre de gestion).
              </p>
              {inviteLoadingMembers ? (
                <p className="text-xs text-discord-muted">Chargement…</p>
              ) : inviteLoadErr ? (
                <p className="text-xs text-red-400">{inviteLoadErr}</p>
              ) : friendsNotInGuild.length === 0 ? (
                <p className="text-xs text-discord-muted">
                  Aucun ami éligible (déjà membre ou pas d’amis).
                </p>
              ) : (
                <>
                  <div className="mb-2 flex gap-1">
                    <select
                      value={inviteUserId}
                      onChange={(e) => setInviteUserId(e.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-discord-border bg-discord-input px-2 py-2 text-sm text-discord-text outline-none"
                    >
                      <option value="">Choisir…</option>
                      {friendsNotInGuild.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.displayName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy || !inviteUserId}
                      onClick={() => void submitInvite()}
                      className="shrink-0 rounded-md bg-discord-accent px-3 py-2 text-sm font-medium text-white hover:bg-discord-accent/90 disabled:opacity-40"
                    >
                      Envoyer
                    </button>
                  </div>
                </>
              )}
              {inviteErr ? <p className="text-[11px] text-red-400">{inviteErr}</p> : null}
              {inviteMsg ? <p className="text-[11px] text-discord-green">{inviteMsg}</p> : null}
            </div>
          ) : null}

          {view === "del-text" || view === "del-voice" ? (
            <div className="px-2 py-2">
              <button
                type="button"
                className="mb-2 text-[11px] text-discord-muted hover:text-discord-text"
                onClick={() => resetPanel()}
              >
                ← Retour
              </button>
              <p className="mb-2 text-xs font-medium text-discord-text">
                {view === "del-text" ? "Salons texte" : "Salons vocaux"}
              </p>
              {err ? <p className="mb-2 text-[11px] text-red-400">{err}</p> : null}
              {(() => {
                const list = view === "del-text" ? textChannels : voiceChannels;
                if (!list.length) {
                  return <p className="text-xs text-discord-muted">Aucun salon à supprimer.</p>;
                }
                return (
                  <ul className="space-y-1">
                    {list.map((c) => {
                      const id = typeof c === "string" ? c : c.id;
                      const label = typeof c === "string" ? c : c.name;
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void confirmDeleteChannel(id, label)}
                            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm text-discord-text hover:bg-discord-hover disabled:opacity-50"
                          >
                            <span className="truncate">
                              {view === "del-text" ? "# " : "🔊 "}
                              {label}
                            </span>
                            <span className="shrink-0 text-[11px] font-medium text-red-300">Supprimer</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
