import express from "express";

function createError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function mapProfile(p) {
  return {
    id: p.id,
    displayName: p.display_name || "Utilisateur",
    avatarUrl: p.avatar_url || undefined,
  };
}

export function registerApiRoutes(app, { supabaseServer }) {
  const router = express.Router();

  router.use(async (req, _res, next) => {
    try {
      if (!supabaseServer) throw createError(503, "Supabase non configuré.");
      const auth = String(req.headers.authorization || "");
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!token) throw createError(401, "Token manquant.");
      const {
        data: { user },
        error,
      } = await supabaseServer.auth.getUser(token);
      if (error || !user) throw createError(401, "Token invalide.");
      req.authUser = user;
      next();
    } catch (e) {
      next(e);
    }
  });

  router.get("/health/details", async (_req, res) => {
    const started = Date.now();
    const ping = await supabaseServer.from("profiles").select("id", { head: true, count: "exact" }).limit(1);
    res.json({
      ok: !ping.error,
      dbLatencyMs: Date.now() - started,
      dbError: ping.error?.message || null,
    });
  });

  router.get("/friends", async (req, res, next) => {
    try {
      const myUserId = req.authUser.id;
      const { data: rows, error: qErr } = await supabaseServer
        .from("friend_requests")
        .select("id, from_id, to_id, status")
        .or(`from_id.eq.${myUserId},to_id.eq.${myUserId}`);
      if (qErr) throw createError(500, qErr.message);

      const accepted = (rows || []).filter((r) => r.status === "accepted");
      const incoming = (rows || []).filter((r) => r.status === "pending" && r.to_id === myUserId);
      const outgoing = (rows || []).filter((r) => r.status === "pending" && r.from_id === myUserId);
      const ids = new Set();
      for (const r of accepted) ids.add(r.from_id === myUserId ? r.to_id : r.from_id);
      for (const r of incoming) ids.add(r.from_id);
      for (const r of outgoing) ids.add(r.to_id);

      let profileMap = new Map();
      if (ids.size > 0) {
        const { data: profs, error: pErr } = await supabaseServer
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", [...ids]);
        if (pErr) throw createError(500, pErr.message);
        profileMap = new Map((profs || []).map((p) => [p.id, mapProfile(p)]));
      }

      res.json({
        friends: accepted.map((r) => {
          const oid = r.from_id === myUserId ? r.to_id : r.from_id;
          return profileMap.get(oid) || { id: oid, displayName: "Utilisateur" };
        }),
        incoming: incoming.map((r) => ({
          requestId: r.id,
          fromId: r.from_id,
          ...(profileMap.get(r.from_id) || { id: r.from_id, displayName: "Utilisateur" }),
        })),
        outgoing: outgoing.map((r) => ({
          requestId: r.id,
          toId: r.to_id,
          ...(profileMap.get(r.to_id) || { id: r.to_id, displayName: "Utilisateur" }),
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/friends/:requestId/accept", async (req, res, next) => {
    try {
      const myUserId = req.authUser.id;
      const requestId = String(req.params.requestId || "");
      const { error } = await supabaseServer
        .from("friend_requests")
        .update({ status: "accepted" })
        .eq("id", requestId)
        .eq("to_id", myUserId);
      if (error) throw createError(400, error.message);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.post("/friends/:requestId/decline", async (req, res, next) => {
    try {
      const myUserId = req.authUser.id;
      const requestId = String(req.params.requestId || "");
      const { error } = await supabaseServer
        .from("friend_requests")
        .delete()
        .eq("id", requestId)
        .eq("to_id", myUserId)
        .eq("status", "pending");
      if (error) throw createError(400, error.message);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.get("/guilds", async (req, res, next) => {
    try {
      const myUserId = req.authUser.id;
      const rpc = await supabaseServer.rpc("list_my_guild_memberships");
      if (rpc.error) throw createError(500, rpc.error.message);
      const memberships = (rpc.data || []).map((r) => ({ guild_id: r.guild_id, role: r.role }));
      const guildIds = [...new Set(memberships.map((m) => m.guild_id).filter(Boolean))];
      const roleByGuild = new Map(memberships.map((m) => [m.guild_id, m.role]));
      let guilds = [];
      if (guildIds.length > 0) {
        const { data, error } = await supabaseServer
          .from("guilds")
          .select("id, name, owner_id, icon_url, icon_brand_key")
          .in("id", guildIds);
        if (error) throw createError(500, error.message);
        guilds = (data || []).map((g) => ({
          id: g.id,
          name: g.name || "Serveur",
          ownerId: g.owner_id,
          myRole: roleByGuild.get(g.id) || "member",
          iconUrl: g.icon_url || null,
          iconBrandKey: g.icon_brand_key || null,
        }));
      }

      const { data: invites, error: iErr } = await supabaseServer
        .from("guild_invites")
        .select("id, guild_id, invited_by")
        .eq("invitee_id", myUserId)
        .eq("status", "pending");
      if (iErr) throw createError(500, iErr.message);

      const inviterIds = [...new Set((invites || []).map((i) => i.invited_by).filter(Boolean))];
      const inviteGuildIds = [...new Set((invites || []).map((i) => i.guild_id).filter(Boolean))];
      let inviterMap = new Map();
      let inviteGuildMap = new Map();
      if (inviterIds.length) {
        const { data, error } = await supabaseServer
          .from("profiles")
          .select("id, display_name")
          .in("id", inviterIds);
        if (error) throw createError(500, error.message);
        inviterMap = new Map((data || []).map((p) => [p.id, p.display_name || "Quelqu’un"]));
      }
      if (inviteGuildIds.length) {
        const { data, error } = await supabaseServer.from("guilds").select("id, name").in("id", inviteGuildIds);
        if (error) throw createError(500, error.message);
        inviteGuildMap = new Map((data || []).map((g) => [g.id, g.name || "Serveur"]));
      }

      res.json({
        guilds,
        incomingInvites: (invites || []).map((i) => ({
          id: i.id,
          guildId: i.guild_id,
          guildName: inviteGuildMap.get(i.guild_id) || "Serveur",
          inviterName: inviterMap.get(i.invited_by) || "Quelqu’un",
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  router.post("/guilds/invite", async (req, res, next) => {
    try {
      const userId = req.authUser.id;
      const guildId = String(req.body?.guildId || "");
      const inviteeUserId = String(req.body?.inviteeUserId || "");
      if (!guildId || !inviteeUserId) throw createError(400, "Paramètres invalides.");
      const { error } = await supabaseServer.from("guild_invites").insert({
        guild_id: guildId,
        invited_by: userId,
        invitee_id: inviteeUserId,
        status: "pending",
      });
      if (error) throw createError(400, error.message);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  router.post("/guilds/invites/:inviteId/accept", async (req, res, next) => {
    try {
      const inviteId = String(req.params.inviteId || "");
      const { error } = await supabaseServer.rpc("accept_guild_invite", { p_invite_id: inviteId });
      if (error) throw createError(400, error.message);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  app.use(express.json());
  app.use("/api", router);

  app.use("/api", (err, _req, res, _next) => {
    const status = Number(err?.status) || 500;
    res.status(status).json({ ok: false, message: err?.message || "Erreur API." });
  });
}
