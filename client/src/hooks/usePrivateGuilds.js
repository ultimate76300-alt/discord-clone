import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function isMissingGuildRpcError(e) {
  if (!e) return false;
  const msg = `${e.message || ""} ${e.details || ""} ${e.hint || ""}`.toLowerCase();
  if (e.code === "PGRST202") return true;
  if (msg.includes("create_guild_with_defaults")) return true;
  if (msg.includes("could not find the function")) return true;
  if (msg.includes("schema cache")) return true;
  return false;
}

export function usePrivateGuilds(enabled, userId) {
  const [guilds, setGuilds] = useState([]);
  const [incomingInvites, setIncomingInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!enabled || !userId || !supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data: memberships, error: mErr } = await supabase
        .from("guild_members")
        .select("role, guild_id, guilds(id, name, owner_id)")
        .eq("user_id", userId);
      if (mErr) throw mErr;
      const list = (memberships || [])
        .map((row) => {
          const g = row.guilds;
          if (!g?.id) return null;
          return {
            id: g.id,
            name: g.name || "Serveur",
            ownerId: g.owner_id,
            myRole: row.role,
          };
        })
        .filter(Boolean);
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      setGuilds(list);

      const { data: invites, error: iErr } = await supabase
        .from("guild_invites")
        .select("id, guild_id, invited_by, guilds(name)")
        .eq("invitee_id", userId)
        .eq("status", "pending");
      if (iErr) throw iErr;

      const inviterIds = [...new Set((invites || []).map((i) => i.invited_by).filter(Boolean))];
      let nameById = new Map();
      if (inviterIds.length) {
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("id, display_name")
          .in("id", inviterIds);
        if (pErr) throw pErr;
        nameById = new Map((profs || []).map((p) => [p.id, p.display_name || "Utilisateur"]));
      }

      setIncomingInvites(
        (invites || []).map((i) => ({
          id: i.id,
          guildId: i.guild_id,
          guildName: i.guilds?.name || "Serveur",
          inviterName: nameById.get(i.invited_by) || "Quelqu’un",
        }))
      );
    } catch (e) {
      setError(e?.message || "Erreur serveurs privés");
      setGuilds([]);
      setIncomingInvites([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createGuild = useCallback(
    async (name) => {
      if (!supabase) return { ok: false, message: "Supabase indisponible" };
      if (!userId) return { ok: false, message: "Non connecté" };
      const t = name.trim();
      if (t.length < 1 || t.length > 64) return { ok: false, message: "Nom invalide (1–64 car.)" };

      const rpc = await supabase.rpc("create_guild_with_defaults", { p_name: t });
      if (!rpc.error) {
        await load();
        return { ok: true, guildId: rpc.data };
      }

      if (!isMissingGuildRpcError(rpc.error)) {
        return { ok: false, message: rpc.error.message };
      }

      const ins = await supabase
        .from("guilds")
        .insert({ name: t, owner_id: userId })
        .select("id")
        .single();
      if (ins.error) {
        return {
          ok: false,
          message:
            ins.error.message +
            (ins.error.message.includes("row-level security")
              ? " — exécute aussi la politique guilds_select_owner (fichier supabase/private-guilds.sql)."
              : ""),
        };
      }
      const gid = ins.data.id;

      const mem = await supabase.from("guild_members").insert({
        guild_id: gid,
        user_id: userId,
        role: "owner",
      });
      if (mem.error) return { ok: false, message: mem.error.message };

      const ch = await supabase.from("guild_channels").insert([
        { guild_id: gid, name: "général", kind: "text", position: 0 },
        { guild_id: gid, name: "Salon vocal", kind: "voice", position: 1 },
      ]);
      if (ch.error) return { ok: false, message: ch.error.message };

      await load();
      return { ok: true, guildId: gid };
    },
    [load, userId]
  );

  const sendGuildInvite = useCallback(
    async (guildId, inviteeUserId) => {
      if (!supabase || !userId) return { ok: false, message: "Non connecté" };
      const { error: e } = await supabase.from("guild_invites").insert({
        guild_id: guildId,
        invited_by: userId,
        invitee_id: inviteeUserId,
        status: "pending",
      });
      if (e) return { ok: false, message: e.message };
      return { ok: true };
    },
    [userId]
  );

  const acceptGuildInvite = useCallback(
    async (inviteId) => {
      if (!supabase) return { ok: false, message: "Supabase indisponible" };
      const { error: e } = await supabase.rpc("accept_guild_invite", { p_invite_id: inviteId });
      if (e) return { ok: false, message: e.message };
      await load();
      return { ok: true };
    },
    [load]
  );

  const declineGuildInvite = useCallback(
    async (inviteId) => {
      if (!supabase) return { ok: false, message: "Supabase indisponible" };
      const { error: e } = await supabase
        .from("guild_invites")
        .update({ status: "declined" })
        .eq("id", inviteId)
        .eq("invitee_id", userId);
      if (e) return { ok: false, message: e.message };
      await load();
      return { ok: true };
    },
    [load, userId]
  );

  return {
    guilds,
    incomingInvites,
    loading,
    error,
    reload: load,
    createGuild,
    sendGuildInvite,
    acceptGuildInvite,
    declineGuildInvite,
  };
}
