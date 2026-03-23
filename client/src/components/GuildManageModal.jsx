import { useCallback, useEffect, useState } from "react";
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
}) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inviteUserId, setInviteUserId] = useState("");
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const canModerate = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  const loadMembers = useCallback(async () => {
    if (!guildId || !supabase) return;
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

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
      <div className="flex max-h-[min(90dvh,36rem)] w-full max-w-lg flex-col rounded-xl border border-discord-border bg-discord-sidebar shadow-2xl">
        <div className="border-b border-discord-border px-5 py-4">
          <h2 id="guild-manage-title" className="text-lg font-semibold text-discord-text">
            {guildName}
          </h2>
          <p className="text-xs text-discord-muted">Membres, invitations et rôles</p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scroll-discord px-5 py-4">
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
                  (isOwner || (myRole === "admin" && m.role === "member"));
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
