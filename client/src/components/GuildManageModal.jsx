import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { AvatarBubble } from "./AvatarBubble";

export function GuildManageModal({
  guildId,
  guildName,
  myRole,
  myUserId,
  friends,
  onClose,
  onChanged,
  onInvite,
  onDeleteChannel,
  onRefreshChannels,
  onDeleteGuild,
}) {
  const [members, setMembers] = useState([]);
  const [channels, setChannels] = useState({ text: [], voice: [] });
  const [loading, setLoading] = useState(true);
  const [inviteUserId, setInviteUserId] = useState("");
  const [newTextName, setNewTextName] = useState("");
  const [newVoiceName, setNewVoiceName] = useState("");
  const [purgeName, setPurgeName] = useState("");
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [channelBusy, setChannelBusy] = useState(false);

  const resolvedRole = useMemo(() => {
    const self = members.find((m) => m.userId === myUserId);
    return self?.role ?? myRole;
  }, [members, myUserId, myRole]);

  const canModerate = resolvedRole === "owner" || resolvedRole === "admin";
  const isOwner = resolvedRole === "owner";

  const loadMembers = useCallback(async () => {
    if (!guildId || !supabase) return;
    setErr(null);
    try {
      const { data: mems, error: qErr } = await supabase
        .from("guild_members")
        .select("user_id, role")
        .eq("guild_id", guildId);
      if (qErr) throw qErr;
      const ids = [...new Set((mems || []).map((m) => m.user_id))];
      let profMap = new Map();
      if (ids.length) {
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", ids);
        if (pErr) throw pErr;
        profMap = new Map((profs || []).map((p) => [p.id, p]));
      }
      const rows = (mems || [])
        .map((r) => {
          const p = profMap.get(r.user_id);
          return {
            userId: r.user_id,
            role: r.role,
            displayName: p?.display_name || "Utilisateur",
            avatarUrl: p?.avatar_url || undefined,
          };
        })
        .sort((a, b) => {
          const rank = { owner: 0, admin: 1, member: 2 };
          const d = (rank[a.role] ?? 9) - (rank[b.role] ?? 9);
          if (d !== 0) return d;
          return a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
        });
      setMembers(rows);
    } catch (e) {
      setErr(e?.message || "Chargement impossible");
      setMembers([]);
    }
  }, [guildId]);

  const loadChannels = useCallback(async () => {
    if (!guildId || !supabase) return;
    try {
      const { data, error: qErr } = await supabase
        .from("guild_channels")
        .select("id, name, kind, position")
        .eq("guild_id", guildId)
        .order("position", { ascending: true });
      if (qErr) throw qErr;
      const rows = data || [];
      setChannels({
        text: rows.filter((c) => c.kind === "text"),
        voice: rows.filter((c) => c.kind === "voice"),
      });
    } catch (e) {
      setChannels({ text: [], voice: [] });
    }
  }, [guildId]);

  useEffect(() => {
    if (!guildId || !supabase) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadMembers();
      await loadChannels();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [guildId, loadMembers, loadChannels]);

  const friendsNotInGuild = friends.filter((f) => !members.some((m) => m.userId === f.id));

  async function handleInvite() {
    setMsg(null);
    setErr(null);
    if (!inviteUserId) return;
    const r = await onInvite?.(guildId, inviteUserId);
    if (r?.ok) {
      setMsg("Invitation envoyée.");
      setInviteUserId("");
    } else {
      setErr(r?.message || "Invitation refusée");
    }
  }

  async function addChannel(kind) {
    const raw = kind === "text" ? newTextName : newVoiceName;
    const t = raw.trim();
    if (t.length < 1 || t.length > 64) {
      setErr("Nom du salon : 1 à 64 caractères.");
      return;
    }
    if (!supabase) return;
    setErr(null);
    setChannelBusy(true);
    try {
      const { data: rows } = await supabase.from("guild_channels").select("position").eq("guild_id", guildId);
      const maxP = Math.max(-1, ...(rows || []).map((r) => r.position ?? 0));
      const { error: e } = await supabase.from("guild_channels").insert({
        guild_id: guildId,
        name: t,
        kind,
        position: maxP + 1,
      });
      if (e) {
        setErr(e.message);
        return;
      }
      if (kind === "text") setNewTextName("");
      else setNewVoiceName("");
      await loadChannels();
      onRefreshChannels?.();
    } finally {
      setChannelBusy(false);
    }
  }

  async function handleDeleteServer() {
    setErr(null);
    setMsg(null);
    if (purgeName.trim() !== guildName.trim()) {
      setErr("Tape exactement le nom du serveur pour confirmer la suppression.");
      return;
    }
    const r = await onDeleteGuild?.(guildId);
    if (!r?.ok) setErr(r?.message || "Suppression impossible");
  }

  async function setRole(targetId, newRole) {
    setErr(null);
    const { error: e } = await supabase
      .from("guild_members")
      .update({ role: newRole })
      .eq("guild_id", guildId)
      .eq("user_id", targetId);
    if (e) {
      setErr(e.message);
      return;
    }
    await loadMembers();
    onChanged?.();
  }

  async function kick(targetId) {
    setErr(null);
    const { error: e } = await supabase
      .from("guild_members")
      .delete()
      .eq("guild_id", guildId)
      .eq("user_id", targetId);
    if (e) {
      setErr(e.message);
      return;
    }
    await loadMembers();
    onChanged?.();
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="guild-manage-title"
    >
      <div className="flex max-h-[min(90dvh,40rem)] w-full max-w-lg flex-col rounded-xl border border-discord-border bg-discord-sidebar shadow-2xl">
        <div className="border-b border-discord-border px-5 py-4">
          <h2 id="guild-manage-title" className="text-lg font-semibold text-discord-text">
            {guildName}
          </h2>
          <p className="text-xs text-discord-muted">Salons, membres, invitations</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-discord px-5 py-4">
          {canModerate ? (
            <div className="mb-4 space-y-3 rounded-lg border border-discord-border bg-discord-elevated/80 p-3">
              <p className="text-xs font-semibold uppercase text-discord-muted">Salons texte</p>
              <ul className="space-y-1 text-sm text-discord-muted">
                {channels.text.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-discord-text">
                    <span aria-hidden>#</span>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {onDeleteChannel ? (
                      <button
                        type="button"
                        disabled={channelBusy}
                        onClick={() => void deleteChannelRow(c)}
                        className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium text-red-300 hover:bg-red-950/35 disabled:opacity-40"
                      >
                        Supprimer
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <input
                  value={newTextName}
                  onChange={(e) => setNewTextName(e.target.value)}
                  maxLength={64}
                  placeholder="Nouveau salon texte"
                  className="min-w-0 flex-1 rounded bg-discord-input px-2 py-1.5 text-sm text-discord-text outline-none placeholder:text-discord-muted/60"
                />
                <button
                  type="button"
                  disabled={channelBusy || !newTextName.trim()}
                  onClick={() => void addChannel("text")}
                  className="shrink-0 rounded bg-discord-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-discord-accent/90 disabled:opacity-40"
                >
                  Ajouter
                </button>
              </div>

              <p className="pt-2 text-xs font-semibold uppercase text-discord-muted">Salons vocaux</p>
              <ul className="space-y-1 text-sm text-discord-muted">
                {channels.voice.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-discord-text">
                    <span aria-hidden>🔊</span>
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {onDeleteChannel ? (
                      <button
                        type="button"
                        disabled={channelBusy}
                        onClick={() => void deleteChannelRow(c)}
                        className="shrink-0 rounded px-2 py-0.5 text-[11px] font-medium text-red-300 hover:bg-red-950/35 disabled:opacity-40"
                      >
                        Supprimer
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <input
                  value={newVoiceName}
                  onChange={(e) => setNewVoiceName(e.target.value)}
                  maxLength={64}
                  placeholder="Nouveau salon vocal"
                  className="min-w-0 flex-1 rounded bg-discord-input px-2 py-1.5 text-sm text-discord-text outline-none placeholder:text-discord-muted/60"
                />
                <button
                  type="button"
                  disabled={channelBusy || !newVoiceName.trim()}
                  onClick={() => void addChannel("voice")}
                  className="shrink-0 rounded bg-discord-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-discord-accent/90 disabled:opacity-40"
                >
                  Ajouter
                </button>
              </div>
            </div>
          ) : null}

          {canModerate && friendsNotInGuild.length > 0 ? (
            <div className="mb-4 rounded-lg border border-discord-border bg-discord-elevated/80 p-3">
              <p className="text-xs font-semibold uppercase text-discord-muted">Inviter un ami</p>
              <div className="mt-2 flex gap-2">
                <select
                  value={inviteUserId}
                  onChange={(e) => setInviteUserId(e.target.value)}
                  className="min-w-0 flex-1 rounded bg-discord-input px-2 py-1.5 text-sm text-discord-text outline-none"
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
                  onClick={() => void handleInvite()}
                  disabled={!inviteUserId}
                  className="shrink-0 rounded bg-discord-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-discord-accent/90 disabled:opacity-40"
                >
                  Inviter
                </button>
              </div>
            </div>
          ) : null}

          {msg ? <p className="mb-2 text-sm text-discord-green">{msg}</p> : null}
          {err ? <p className="mb-2 text-sm text-red-400">{err}</p> : null}

          {loading ? (
            <p className="text-sm text-discord-muted">Chargement…</p>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => {
                const self = m.userId === myUserId;
                const canKick =
                  !self &&
                  m.role !== "owner" &&
                  (isOwner || (resolvedRole === "admin" && m.role === "member"));
                const canPromote =
                  isOwner && !self && m.role !== "owner" && m.role === "member";
                const canDemote = isOwner && !self && m.role === "admin";

                return (
                  <li
                    key={m.userId}
                    className="flex items-center gap-2 rounded-lg border border-discord-border/80 bg-discord-bg/40 px-2 py-2"
                  >
                    <AvatarBubble
                      avatarUrl={m.avatarUrl}
                      avatarColor="#5865f2"
                      avatarEmoji="👤"
                      className="h-9 w-9"
                      textClassName="text-sm"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-discord-text">
                        {m.displayName}
                        {self ? (
                          <span className="ml-2 text-xs font-normal text-discord-muted">(toi)</span>
                        ) : null}
                      </div>
                      <div className="text-[11px] uppercase text-discord-muted">{m.role}</div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {canPromote ? (
                        <button
                          type="button"
                          onClick={() => void setRole(m.userId, "admin")}
                          className="rounded bg-discord-input px-2 py-1 text-[11px] text-discord-text hover:bg-discord-hover"
                        >
                          Admin
                        </button>
                      ) : null}
                      {canDemote ? (
                        <button
                          type="button"
                          onClick={() => void setRole(m.userId, "member")}
                          className="rounded bg-discord-input px-2 py-1 text-[11px] text-discord-text hover:bg-discord-hover"
                        >
                          Retirer admin
                        </button>
                      ) : null}
                      {canKick ? (
                        <button
                          type="button"
                          onClick={() => void kick(m.userId)}
                          className="rounded border border-red-500/40 px-2 py-1 text-[11px] text-red-300 hover:bg-red-950/40"
                        >
                          Exclure
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {isOwner && onDeleteGuild ? (
            <div className="mt-6 rounded-lg border border-red-500/35 bg-red-950/25 p-3">
              <p className="text-xs font-semibold uppercase text-red-200">Zone de danger</p>
              <p className="mt-1 text-[11px] leading-snug text-red-100/85">
                Supprimer ce serveur efface tous les salons, messages et membres. Irréversible.
              </p>
              <label className="mt-2 block text-[11px] text-red-100/90">
                Tape le nom exact du serveur pour confirmer
                <input
                  value={purgeName}
                  onChange={(e) => setPurgeName(e.target.value)}
                  className="mt-1 w-full rounded border border-red-500/30 bg-discord-input px-2 py-1.5 text-sm text-discord-text outline-none"
                  placeholder={guildName}
                  autoComplete="off"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleDeleteServer()}
                className="mt-2 w-full rounded border border-red-500/50 bg-red-950/50 py-2 text-sm font-medium text-red-200 hover:bg-red-900/50"
              >
                Supprimer le serveur
              </button>
            </div>
          ) : null}
        </div>

        <div className="border-t border-discord-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-discord-border py-2 text-sm text-discord-text hover:bg-discord-hover"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
