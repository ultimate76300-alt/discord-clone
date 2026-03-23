import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { isValidBrandPresetKey } from "../lib/guildBrandPresets";

function normalizeGuildId(v) {
  if (v == null) return null;
  if (typeof v === "string") return v;
  return String(v);
}

function upsertGuildSorted(prev, entry) {
  const others = prev.filter((x) => x.id !== entry.id);
  const next = [...others, entry];
  next.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return next;
}

function normalizeIconOpts(iconOpts) {
  const rawUrl = iconOpts?.iconUrl;
  const iconUrl =
    typeof rawUrl === "string" && rawUrl.startsWith("data:image/") && rawUrl.length < 290_000
      ? rawUrl.trim()
      : null;
  const iconBrandKey =
    !iconUrl && iconOpts?.iconBrandKey && isValidBrandPresetKey(iconOpts.iconBrandKey)
      ? iconOpts.iconBrandKey
      : null;
  return { iconUrl, iconBrandKey };
}

async function persistNewGuildIcons(gid, iconOpts) {
  const { iconUrl, iconBrandKey } = normalizeIconOpts(iconOpts || {});
  if (!iconUrl && !iconBrandKey) return { ok: true };
  if (!supabase) return { ok: false, message: "Supabase indisponible" };

  const patch = iconUrl
    ? { icon_url: iconUrl, icon_brand_key: null }
    : { icon_brand_key: iconBrandKey, icon_url: null };

  const { error } = await supabase.from("guilds").update(patch).eq("id", gid);
  if (error) {
    const col = /column|schema|icon_/i.test(`${error.message || ""} ${error.details || ""}`);
    return {
      ok: false,
      message: col
        ? "Colonne icône absente : exécute supabase/guilds-icon-columns.sql dans Supabase, puis réessaie."
        : error.message || "Sauvegarde de l’icône impossible",
    };
  }
  return { ok: true };
}

function guildEntryFromRow(g, roleByGid) {
  return {
    id: g.id,
    name: g.name || "Serveur",
    ownerId: g.owner_id,
    myRole: roleByGid.get(g.id) || "member",
    iconUrl: g.icon_url || null,
    iconBrandKey: g.icon_brand_key || null,
  };
}

/** Tables guild_* absentes : exécuter supabase/private-guilds.sql dans le SQL Editor. */
export const GUILD_SQL_SETUP_HINT =
  "Ouvre Supabase → SQL Editor, colle tout le fichier supabase/private-guilds.sql du dépôt (après friends-dm.sql), exécute, puis recharge la page.";

function isMissingGuildRpcError(e) {
  if (!e) return false;
  const msg = `${e.message || ""} ${e.details || ""} ${e.hint || ""}`.toLowerCase();
  if (e.code === "PGRST202" && msg.includes("function")) return true;
  if (msg.includes("create_guild_with_defaults")) return true;
  if (msg.includes("could not find the function")) return true;
  return false;
}

export function isGuildTablesMissingError(e) {
  if (!e) return false;
  const msg = `${e.message || ""} ${e.details || ""} ${e.hint || ""}`.toLowerCase();
  if (e.code === "PGRST205") return true;
  if (msg.includes("could not find the table") && msg.includes("guild")) return true;
  if (msg.includes("public.guilds")) return true;
  if (msg.includes("guild_members") && (msg.includes("schema cache") || msg.includes("not find"))) return true;
  if (msg.includes("relation") && msg.includes("guild") && msg.includes("does not exist")) return true;
  return false;
}

export function usePrivateGuilds(enabled, userId) {
  const [guilds, setGuilds] = useState([]);
  const [incomingInvites, setIncomingInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [guildTablesMissing, setGuildTablesMissing] = useState(false);
  /** Évite qu’un load() démarré avant la création d’un serveur écrase la liste après coup. */
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    if (!enabled || !userId || !supabase) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      // S’assure que le JWT est bien chargé avant les requêtes RLS (sinon 0 ligne sans erreur au F5 / en prod).
      await supabase.auth.getSession();

      // Deux requêtes : l’embed PostgREST `guilds(...)` peut renvoyer null selon RLS / cache,
      // ce qui vidait la liste côté client alors que les lignes guild_members existent.
      let memberships;
      let mErr;
      for (let attempt = 0; attempt < 2; attempt++) {
        if (attempt > 0) {
          if (seq !== loadSeq.current) return;
          await new Promise((r) => setTimeout(r, 450));
        }
        const res = await supabase.from("guild_members").select("role, guild_id").eq("user_id", userId);
        memberships = res.data;
        mErr = res.error;
        if (mErr) break;
        if ((memberships?.length ?? 0) > 0) break;
      }
      if (mErr) throw mErr;
      if (seq !== loadSeq.current) return;
      setGuildTablesMissing(false);

      const guildIds = [...new Set((memberships || []).map((m) => m.guild_id).filter(Boolean))];
      let list = [];
      if (guildIds.length) {
        let guildRows;
        let gErr;
        const selFull = await supabase
          .from("guilds")
          .select("id, name, owner_id, icon_url, icon_brand_key")
          .in("id", guildIds);
        guildRows = selFull.data;
        gErr = selFull.error;
        const msg = `${gErr?.message || ""} ${gErr?.details || ""}`.toLowerCase();
        if (gErr && (msg.includes("icon_url") || msg.includes("icon_brand") || msg.includes("column"))) {
          const fallback = await supabase.from("guilds").select("id, name, owner_id").in("id", guildIds);
          guildRows = fallback.data;
          gErr = fallback.error;
        }
        if (gErr) throw gErr;
        if (seq !== loadSeq.current) return;
        const roleByGid = new Map((memberships || []).map((m) => [m.guild_id, m.role]));
        list = (guildRows || [])
          .map((g) => guildEntryFromRow(g, roleByGid))
          .filter((x) => x.id);
        list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      }
      if (seq !== loadSeq.current) return;
      setGuilds(list);

      const { data: invites, error: iErr } = await supabase
        .from("guild_invites")
        .select("id, guild_id, invited_by")
        .eq("invitee_id", userId)
        .eq("status", "pending");

      if (seq !== loadSeq.current) return;

      if (iErr) {
        console.warn("guild_invites load", iErr.message);
        setIncomingInvites([]);
      } else {
        const inviterIds = [...new Set((invites || []).map((i) => i.invited_by).filter(Boolean))];
        let nameById = new Map();
        if (inviterIds.length) {
          const { data: profs, error: pErr } = await supabase
            .from("profiles")
            .select("id, display_name")
            .in("id", inviterIds);
          if (!pErr && profs) {
            nameById = new Map((profs || []).map((p) => [p.id, p.display_name || "Utilisateur"]));
          }
        }

        const inviteGuildIds = [...new Set((invites || []).map((i) => i.guild_id).filter(Boolean))];
        let guildNameById = new Map();
        if (inviteGuildIds.length) {
          const { data: igRows, error: igErr } = await supabase
            .from("guilds")
            .select("id, name")
            .in("id", inviteGuildIds);
          if (!igErr && igRows) {
            guildNameById = new Map((igRows || []).map((g) => [g.id, g.name || "Serveur"]));
          }
        }

        if (seq !== loadSeq.current) return;
        setIncomingInvites(
          (invites || []).map((i) => ({
            id: i.id,
            guildId: i.guild_id,
            guildName: guildNameById.get(i.guild_id) || "Serveur",
            inviterName: nameById.get(i.invited_by) || "Quelqu’un",
          }))
        );
      }
    } catch (e) {
      if (seq !== loadSeq.current) return;
      const missing = isGuildTablesMissingError(e);
      setGuildTablesMissing(missing);
      setError(missing ? GUILD_SQL_SETUP_HINT : e?.message || "Erreur serveurs privés");
      if (missing) {
        setGuilds([]);
        setIncomingInvites([]);
      }
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [enabled, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createGuild = useCallback(
    async (name, iconOpts) => {
      if (!supabase) return { ok: false, message: "Supabase indisponible" };
      if (!userId) return { ok: false, message: "Non connecté" };
      const t = (typeof name === "string" ? name : "").trim();
      if (t.length < 1 || t.length > 64) return { ok: false, message: "Nom invalide (1–64 car.)" };
      const icons = normalizeIconOpts(iconOpts);

      const rpc = await supabase.rpc("create_guild_with_defaults", { p_name: t });
      if (!rpc.error) {
        const gid = normalizeGuildId(rpc.data);
        if (!gid) return { ok: false, message: "Réponse serveur invalide (id manquant)" };

        const iconRes = await persistNewGuildIcons(gid, icons);
        const optimistic = {
          id: gid,
          name: t,
          ownerId: userId,
          myRole: "owner",
          iconUrl: icons.iconUrl,
          iconBrandKey: icons.iconBrandKey,
        };
        setGuilds((prev) => upsertGuildSorted(prev, optimistic));

        await load();
        return {
          ok: true,
          guildId: gid,
          warn: iconRes.ok ? undefined : iconRes.message,
        };
      }

      if (isGuildTablesMissingError(rpc.error)) {
        return { ok: false, message: GUILD_SQL_SETUP_HINT };
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
        if (isGuildTablesMissingError(ins.error)) {
          return { ok: false, message: GUILD_SQL_SETUP_HINT };
        }
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

      const gidStr = normalizeGuildId(gid);
      if (!gidStr) return { ok: false, message: "Id serveur invalide" };

      const iconRes = await persistNewGuildIcons(gidStr, icons);
      setGuilds((prev) =>
        upsertGuildSorted(prev, {
          id: gidStr,
          name: t,
          ownerId: userId,
          myRole: "owner",
          iconUrl: icons.iconUrl,
          iconBrandKey: icons.iconBrandKey,
        })
      );
      await load();
      return { ok: true, guildId: gidStr, warn: iconRes.ok ? undefined : iconRes.message };
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
    guildTablesMissing,
    reload: load,
    createGuild,
    sendGuildInvite,
    acceptGuildInvite,
    declineGuildInvite,
  };
}
