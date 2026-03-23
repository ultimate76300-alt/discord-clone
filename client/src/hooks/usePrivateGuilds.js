import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { isValidBrandPresetKey } from "../lib/guildBrandPresets";
import { apiGet, apiPost } from "../lib/backendApi";

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
  if (!iconUrl && !iconBrandKey) {
    return { ok: true };
  }
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
  "Ouvre Supabase → SQL Editor, exécute le fichier supabase/full-setup.sql du dépôt, puis recharge la page.";

function isMissingGuildRpcError(e) {
  if (!e) return false;
  const msg = `${e.message || ""} ${e.details || ""} ${e.hint || ""}`.toLowerCase();
  if (e.code === "PGRST202" && msg.includes("function")) return true;
  if (msg.includes("create_guild_with_defaults")) return true;
  if (msg.includes("could not find the function")) return true;
  return false;
}

function isMissingListMyGuildMembershipsRpcError(e) {
  if (!e) return false;
  const msg = `${e.message || ""} ${e.details || ""} ${e.hint || ""}`.toLowerCase();
  if (e.code === "PGRST202" && msg.includes("function")) return true;
  if (msg.includes("list_my_guild_memberships")) return true;
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
  /** Permet de fusionner les icônes optimistes avec les données rechargées (évite fallback immédiat sur la lettre). */
  const guildsRef = useRef([]);
  const [incomingInvites, setIncomingInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [guildTablesMissing, setGuildTablesMissing] = useState(false);
  /** Évite qu’un load() démarré avant la création d’un serveur écrase la liste après coup. */
  const loadSeq = useRef(0);

  useEffect(() => {
    guildsRef.current = guilds;
  }, [guilds]);

  const load = useCallback(async () => {
    if (!enabled || !userId || !supabase) return;
    const seq = ++loadSeq.current;
    setLoading(true);
    setError(null);
    try {
      try {
        const body = await apiGet("/api/guilds");
        if (seq !== loadSeq.current) return;
        setGuilds(Array.isArray(body?.guilds) ? body.guilds : []);
        setIncomingInvites(Array.isArray(body?.incomingInvites) ? body.incomingInvites : []);
        setGuildTablesMissing(false);
        setLoading(false);
        return;
      } catch {
        // fallback to Supabase direct flow
      }
      // S’assure que le JWT est bien chargé avant les requêtes RLS (sinon 0 ligne sans erreur au F5 / en prod).
      await supabase.auth.getSession();

      // 1) RPC security definer : liste fiable des membreships (évite RLS cassée sur guild_members).
      // 2) Sinon requête table + retry (bases sans la RPC).
      let memberships;
      let mErr;
      const rpcRes = await supabase.rpc("list_my_guild_memberships");
      if (!rpcRes.error) {
        memberships = (rpcRes.data ?? []).map((r) => ({
          guild_id: r.guild_id,
          role: r.role,
        }));
      } else if (isMissingListMyGuildMembershipsRpcError(rpcRes.error)) {
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
      } else {
        mErr = rpcRes.error;
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
        const prevIconsByGid = new Map(
          (guildsRef.current || []).map((g) => [
            g.id,
            { iconUrl: g.iconUrl ?? null, iconBrandKey: g.iconBrandKey ?? null },
          ])
        );
        list = (guildRows || [])
          .map((g) => guildEntryFromRow(g, roleByGid))
          .map((entry) => {
            // Si la DB ne renvoie pas encore les colonnes icon_*, on conserve l'optimiste (immédiat après création).
            if (!entry.iconUrl && !entry.iconBrandKey) {
              const prev = prevIconsByGid.get(entry.id);
              if (prev?.iconUrl || prev?.iconBrandKey) {
                return { ...entry, iconUrl: prev.iconUrl, iconBrandKey: prev.iconBrandKey };
              }
            }
            return entry;
          })
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
      const networkDown = /failed to fetch|network|timeout|upstream|connect/i.test(String(e?.message || ""));
      setError(
        missing
          ? GUILD_SQL_SETUP_HINT
          : networkDown
            ? "Connexion Supabase impossible (réseau/URL). Vérifie les variables SUPABASE_* et l’état du projet."
            : e?.message || "Erreur serveurs privés"
      );
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
      try {
        await apiPost("/api/guilds/invite", { guildId, inviteeUserId });
        return { ok: true };
      } catch (e) {
        // fallback below
      }
      const { error: e } = await supabase.from("guild_invites").insert({
        guild_id: guildId,
        invited_by: userId,
        invitee_id: inviteeUserId,
        status: "pending",
      });
      if (e) return { ok: false, message: e?.message || String(e) };
      return { ok: true };
    },
    [userId]
  );

  const acceptGuildInvite = useCallback(
    async (inviteId) => {
      if (!supabase) return { ok: false, message: "Supabase indisponible" };
      let e = null;
      try {
        await apiPost(`/api/guilds/invites/${inviteId}/accept`);
      } catch (err) {
        const rpc = await supabase.rpc("accept_guild_invite", { p_invite_id: inviteId });
        e = rpc.error || err;
      }
      if (e) return { ok: false, message: e?.message || String(e) };
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

  const deleteGuild = useCallback(
    async (guildId) => {
      if (!supabase || !userId) return { ok: false, message: "Non connecté" };
      const gid = normalizeGuildId(guildId);
      if (!gid) return { ok: false, message: "Serveur invalide" };
      const { error: e } = await supabase.from("guilds").delete().eq("id", gid).eq("owner_id", userId);
      if (e) return { ok: false, message: e.message };
      setGuilds((prev) => prev.filter((g) => g.id !== gid));
      await load();
      return { ok: true };
    },
    [userId, load]
  );

  const addGuildChannel = useCallback(
    async (guildId, kind, rawName) => {
      if (!supabase || !userId) return { ok: false, message: "Non connecté" };
      const gid = normalizeGuildId(guildId);
      if (!gid) return { ok: false, message: "Serveur invalide" };
      const t = (typeof rawName === "string" ? rawName : "").trim();
      if (t.length < 1 || t.length > 64) return { ok: false, message: "Nom du salon : 1 à 64 caractères." };
      if (kind !== "text" && kind !== "voice") return { ok: false, message: "Type de salon invalide." };
      const { data: rows, error: qErr } = await supabase.from("guild_channels").select("position").eq("guild_id", gid);
      if (qErr) return { ok: false, message: qErr.message };
      const maxP = Math.max(-1, ...(rows || []).map((r) => r.position ?? 0));
      const { error: e } = await supabase.from("guild_channels").insert({
        guild_id: gid,
        name: t,
        kind,
        position: maxP + 1,
      });
      if (e) return { ok: false, message: e.message };
      return { ok: true };
    },
    [userId]
  );

  const deleteGuildChannel = useCallback(
    async (guildId, channelId) => {
      if (!supabase || !userId) return { ok: false, message: "Non connecté" };
      const gid = normalizeGuildId(guildId);
      const cid = normalizeGuildId(channelId);
      if (!gid || !cid) return { ok: false, message: "Paramètres invalides." };
      const { error: e } = await supabase.from("guild_channels").delete().eq("id", cid).eq("guild_id", gid);
      if (e) return { ok: false, message: e.message };
      return { ok: true };
    },
    [userId]
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
    deleteGuild,
    addGuildChannel,
    deleteGuildChannel,
  };
}
