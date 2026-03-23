import { randomUUID } from "crypto";
import express from "express";
import multer from "multer";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const uploadChat = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const ALLOWED_CHAT_MIME = /^image\/|video\/|audio\/|application\/pdf|application\/zip|text\/plain/i;

const CHAT_ATTACHMENTS_BUCKET = "chat-attachments";

/** Crée le bucket si absent (évite « Bucket not found »). Utilise getBucket + createBucket (plus fiable que listBuckets selon les projets). */
async function ensureChatAttachmentsBucket(client) {
  const { data: existing } = await client.storage.getBucket(CHAT_ATTACHMENTS_BUCKET);
  if (existing && (existing.id || existing.name)) {
    return { ok: true, step: "exists" };
  }
  const { error: createErr } = await client.storage.createBucket(CHAT_ATTACHMENTS_BUCKET, {
    public: true,
    fileSizeLimit: 26214400,
  });
  if (!createErr) return { ok: true, step: "created" };
  const m = String(createErr.message || "").toLowerCase();
  if (
    m.includes("already") ||
    m.includes("exists") ||
    m.includes("duplicate") ||
    m.includes("taken") ||
    m.includes("unique")
  ) {
    return { ok: true, step: "race" };
  }
  return { ok: false, step: "create", message: createErr.message };
}

export function registerApiRoutes(app, { supabaseServer }) {
  const publicRouter = express.Router();

  publicRouter.post("/auth/register", async (req, res, next) => {
    try {
      if (!supabaseServer) throw createError(503, "Supabase non configuré.");
      const email = String(req.body?.email || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      const displayName = String(req.body?.displayName || "").trim().slice(0, 32);
      const avatarColor =
        typeof req.body?.avatarColor === "string" && req.body.avatarColor.length <= 16
          ? req.body.avatarColor
          : "#5865f2";
      const avatarEmoji =
        typeof req.body?.avatarEmoji === "string" ? req.body.avatarEmoji.slice(0, 8) : "👤";

      if (!EMAIL_RE.test(email)) throw createError(400, "E-mail invalide.");
      if (password.length < 6) throw createError(400, "Mot de passe : au moins 6 caractères.");
      if (displayName.length < 1) throw createError(400, "Indiquez un pseudo.");

      const { error } = await supabaseServer.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          display_name: displayName,
          avatar_color: avatarColor,
          avatar_emoji: avatarEmoji,
        },
      });
      if (error) throw createError(400, error.message);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

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

  router.post(
    "/chat/upload",
    uploadChat.single("file"),
    async (req, res, next) => {
      try {
        const userId = req.authUser.id;
        const f = req.file;
        if (!f?.buffer) throw createError(400, "Fichier manquant.");
        const mime = String(f.mimetype || "application/octet-stream");
        if (!ALLOWED_CHAT_MIME.test(mime)) {
          throw createError(400, "Type de fichier non autorisé.");
        }
        const safe =
          String(f.originalname || "file")
            .replace(/[^\w.\-()+@\[\]\s]/g, "_")
            .trim()
            .slice(0, 120) || "file";
        const path = `${userId}/${randomUUID()}_${safe}`;
        const bucketId = CHAT_ATTACHMENTS_BUCKET;
        const ensureRes = await ensureChatAttachmentsBucket(supabaseServer);
        if (!ensureRes.ok) {
          console.warn("chat-attachments ensure failed", ensureRes.step, ensureRes.message);
          throw createError(503, `Stockage indisponible (${ensureRes.step}): ${ensureRes.message || "erreur"}`);
        }
        let { error: upErr } = await supabaseServer.storage.from(bucketId).upload(path, f.buffer, {
          contentType: mime,
          upsert: false,
        });
        if (upErr && /bucket.*not found|not found/i.test(String(upErr.message || ""))) {
          const again = await ensureChatAttachmentsBucket(supabaseServer);
          if (again.ok) {
            const second = await supabaseServer.storage.from(bucketId).upload(path, f.buffer, {
              contentType: mime,
              upsert: false,
            });
            upErr = second.error;
          }
        }
        if (upErr) throw createError(400, upErr.message);
        const { data: pub } = supabaseServer.storage.from(bucketId).getPublicUrl(path);
        res.json({
          ok: true,
          url: pub.publicUrl,
          storagePath: path,
          fileName: f.originalname || safe,
          mimeType: mime,
        });
      } catch (e) {
        next(e);
      }
    }
  );

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
      const { data: memberships, error: mErr } = await supabaseServer
        .from("guild_members")
        .select("guild_id, role")
        .eq("user_id", myUserId);
      if (mErr) throw createError(500, mErr.message);
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
      const myUserId = req.authUser.id;
      const inviteId = String(req.params.inviteId || "");
      if (!inviteId) throw createError(400, "Paramètres invalides.");

      const { data: inviteRow, error: acceptErr } = await supabaseServer
        .from("guild_invites")
        .update({ status: "accepted" })
        .eq("id", inviteId)
        .eq("invitee_id", myUserId)
        .eq("status", "pending")
        .select("guild_id")
        .maybeSingle();
      if (acceptErr) throw createError(400, acceptErr.message);
      if (!inviteRow?.guild_id) throw createError(404, "Invitation introuvable.");

      const { error: memberErr } = await supabaseServer.from("guild_members").upsert(
        {
          guild_id: inviteRow.guild_id,
          user_id: myUserId,
          role: "member",
        },
        { onConflict: "guild_id,user_id", ignoreDuplicates: true }
      );
      if (memberErr) throw createError(400, memberErr.message);

      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  app.use("/api", express.json());
  app.use("/api", publicRouter);
  app.use("/api", router);

  app.use("/api", (err, _req, res, _next) => {
    if (err?.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ ok: false, message: "Fichier trop volumineux (max 25 Mo)." });
    }
    const status = Number(err?.status) || 500;
    res.status(status).json({ ok: false, message: err?.message || "Erreur API." });
  });
}
