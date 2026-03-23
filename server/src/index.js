import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import http from "http";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { Server } from "socket.io";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIENT_DIST = path.join(__dirname, "../../client/dist");

const PORT = Number(process.env.PORT) || 3001;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

/** Allow configured origin + localhost + Railway public URLs. */
function isOriginAllowed(origin) {
  if (!origin) return true;
  if (origin === CLIENT_ORIGIN) return true;
  try {
    const u = new URL(origin);
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
    if (u.hostname.endsWith(".railway.app")) return true;
    if (u.hostname.endsWith(".up.railway.app")) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * The `cors` package requires `origin: (origin, cb) => cb(null, allowed)`.
 * A sync `(origin) => boolean` never calls `cb`, so every request hangs (static assets + Socket.IO).
 */
function corsAllow(origin, callback) {
  callback(null, isOriginAllowed(origin));
}

const app = express();

// Before CORS: Railway healthchecks use Host healthcheck.railway.app and must always get 200.
app.get("/health", (_req, res) => {
  res.status(200).type("text/plain").send("OK");
});
app.head("/health", (_req, res) => {
  res.status(200).end();
});

app.set("trust proxy", 1);
app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(self), microphone=(self), display-capture=(self)"
  );
  next();
});
app.use(cors({ origin: corsAllow }));

/**
 * Config Supabase pour le navigateur au runtime (pas seulement au build Vite).
 * Sur Railway, définir SUPABASE_URL + SUPABASE_ANON_KEY (ou VITE_SUPABASE_*), puis redéployer :
 * le bundle n’a plus besoin d’embarquer les VITE_* au moment du build.
 * La clé anon est déjà publique (équivalent à l’inclure dans le JS).
 */
app.get("/api/client-env.json", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const supabaseUrl = (
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    ""
  ).trim();
  const supabaseAnonKey = (
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    ""
  ).trim();
  res.json({ supabaseUrl, supabaseAnonKey });
});

if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/socket.io")) return next();
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsAllow,
    methods: ["GET", "POST"],
  },
});

const supabaseUrl = (process.env.SUPABASE_URL || "").trim();
const supabaseServiceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const supabaseServer =
  supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

if (supabaseServer) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token || typeof token !== "string") {
        return next(new Error("auth_missing"));
      }
      const {
        data: { user },
        error,
      } = await supabaseServer.auth.getUser(token);
      if (error || !user) {
        return next(new Error("auth_invalid"));
      }
      socket.data.supabaseUserId = user.id;
      next();
    } catch (err) {
      next(err);
    }
  });
}

/** @type {Map<string, { displayName: string; avatarColor: string; avatarEmoji: string; clientId: string; avatarUrl?: string }>} */
const identities = new Map();

/** @type {Map<string, string | null>} socketId -> text channel id */
const textChannelBySocket = new Map();

/** @type {Map<string, string | null>} socketId -> voice channel id */
const voiceChannelBySocket = new Map();

/** @type {Map<string, string | null>} socketId -> guild uuid or null (public lobby) */
const guildIdBySocket = new Map();

/** @type {Record<string, Array<{ id: string; clientId: string; displayName: string; avatarColor: string; avatarEmoji: string; avatarUrl?: string; text: string; ts: number }>>} */
const messagesByChannel = {};

const TEXT_CHANNELS = ["general", "random", "dev", "off-topic"];
const VOICE_CHANNELS = ["Lobby", "Gaming", "Study"];

const PUBLIC_TEXT_SET = new Set(TEXT_CHANNELS);
const PUBLIC_VOICE_SET = new Set(VOICE_CHANNELS);

TEXT_CHANNELS.forEach((id) => {
  const k = `p:${id}`;
  if (!messagesByChannel[k]) messagesByChannel[k] = [];
});

function textRoom(guildId, channelId) {
  return guildId ? `text:g:${guildId}:${channelId}` : `text:p:${channelId}`;
}

function voiceRoom(guildId, channelId) {
  return guildId ? `voice:g:${guildId}:${channelId}` : `voice:p:${channelId}`;
}

function msgKey(guildId, channelId) {
  return guildId ? `g:${guildId}:${channelId}` : `p:${channelId}`;
}

async function loadGuildChannelMeta(guildId) {
  if (!supabaseServer || !guildId) return null;
  const { data: channels, error } = await supabaseServer
    .from("guild_channels")
    .select("id, name, kind")
    .eq("guild_id", guildId)
    .order("position", { ascending: true });
  if (error || !channels?.length) return null;
  const textIds = new Set();
  const voiceIds = new Set();
  const text = [];
  const voice = [];
  for (const c of channels) {
    if (c.kind === "text") {
      textIds.add(c.id);
      text.push({ id: c.id, name: c.name });
    } else if (c.kind === "voice") {
      voiceIds.add(c.id);
      voice.push({ id: c.id, name: c.name });
    }
  }
  return { textIds, voiceIds, text, voice };
}

async function verifyGuildMember(guildId, userId) {
  if (!supabaseServer || !guildId || !userId) return null;
  const { data, error } = await supabaseServer
    .from("guild_members")
    .select("role")
    .eq("guild_id", guildId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return data.role;
}

function getVoicePeers(channelId, excludeSocketId, guildId) {
  const peers = [];
  for (const [sid, ch] of voiceChannelBySocket.entries()) {
    if (ch !== channelId || sid === excludeSocketId) continue;
    if ((guildIdBySocket.get(sid) ?? null) !== (guildId ?? null)) continue;
    const profile = identities.get(sid);
    if (profile) peers.push({ socketId: sid, ...profile });
  }
  return peers;
}

async function fetchGuildMessageHistory(channelId) {
  if (!supabaseServer) return [];
  const { data: rows, error } = await supabaseServer
    .from("guild_messages")
    .select("id, body, created_at, sender_id")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error || !rows?.length) {
    if (error) console.warn("fetchGuildMessageHistory", error.message);
    return [];
  }
  const ids = [...new Set(rows.map((r) => r.sender_id))];
  const { data: profs } = await supabaseServer
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", ids);
  const pm = new Map((profs || []).map((p) => [p.id, p]));
  return rows.map((row) => {
    const p = pm.get(row.sender_id);
    return {
      id: row.id,
      clientId: row.sender_id,
      displayName: p?.display_name || "Utilisateur",
      avatarColor: "#5865f2",
      avatarEmoji: "👤",
      ...(p?.avatar_url ? { avatarUrl: p.avatar_url } : {}),
      text: row.body,
      ts: new Date(row.created_at).getTime(),
    };
  });
}

function buildPresenceList() {
  const users = [];
  for (const [socketId, profile] of identities.entries()) {
    users.push({ socketId: socketId, ...profile });
  }
  users.sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
  );
  return users;
}

function broadcastPresence() {
  io.emit("presence:update", { users: buildPresenceList() });
}

/** Only https URLs; used for profile photos (e.g. Supabase Storage public URL). */
function sanitizeAvatarUrl(raw) {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (t.length < 16 || t.length > 600) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:") return null;
    return t;
  } catch {
    return null;
  }
}

io.on("connection", (socket) => {
  guildIdBySocket.set(socket.id, null);
  // Pas de channels:config ici : le client envoie guild:select (null ou uuid) pour éviter
  // d’écraser l’espace privé choisi à chaque reconnexion.
  socket.emit("presence:update", { users: buildPresenceList() });

  socket.on("identity:set", (payload) => {
    if (!payload || typeof payload !== "object") return;
    const { clientId, displayName, avatarColor, avatarEmoji, avatarUrl } = payload;
    if (!displayName || typeof displayName !== "string") return;
    const verifiedId = socket.data.supabaseUserId;
    const resolvedClientId =
      typeof verifiedId === "string"
        ? verifiedId
        : typeof clientId === "string"
          ? clientId
          : socket.id;
    const next = {
      clientId: resolvedClientId,
      displayName: displayName.slice(0, 32),
      avatarColor: typeof avatarColor === "string" ? avatarColor : "#5865f2",
      avatarEmoji: typeof avatarEmoji === "string" ? avatarEmoji.slice(0, 4) : "👤",
    };
    const url = sanitizeAvatarUrl(avatarUrl);
    if (url) next.avatarUrl = url;
    identities.set(socket.id, next);
    broadcastPresence();
  });

  socket.on("guild:select", async (raw) => {
    const guildId =
      raw === null || raw === undefined || raw === ""
        ? null
        : typeof raw === "string"
          ? raw
          : null;
    const oldG = guildIdBySocket.get(socket.id) ?? null;

    const vCh = voiceChannelBySocket.get(socket.id);
    if (vCh) {
      socket.leave(voiceRoom(oldG, vCh));
      socket.to(voiceRoom(oldG, vCh)).emit("voice:peer-left", { socketId: socket.id });
      voiceChannelBySocket.set(socket.id, null);
    }

    const tCh = textChannelBySocket.get(socket.id);
    if (tCh) {
      socket.leave(textRoom(oldG, tCh));
      textChannelBySocket.delete(socket.id);
    }

    if (!guildId) {
      guildIdBySocket.set(socket.id, null);
      socket.emit("channels:config", {
        guildId: null,
        text: TEXT_CHANNELS,
        voice: VOICE_CHANNELS,
        myRole: null,
      });
      return;
    }

    const userId = socket.data.supabaseUserId;
    if (!userId || !supabaseServer) return;

    try {
      const role = await verifyGuildMember(guildId, userId);
      if (!role) return;
      guildIdBySocket.set(socket.id, guildId);
      const meta = await loadGuildChannelMeta(guildId);
      if (!meta) return;
      socket.emit("channels:config", {
        guildId,
        text: meta.text,
        voice: meta.voice,
        myRole: role,
      });
    } catch (e) {
      console.error("guild:select", e);
    }
  });

  socket.on("text:join", async (channelId) => {
    if (typeof channelId !== "string" || !channelId.trim()) return;
    const guildId = guildIdBySocket.get(socket.id) ?? null;

    try {
      if (guildId) {
        if (!supabaseServer) return;
        const meta = await loadGuildChannelMeta(guildId);
        if (!meta || !meta.textIds.has(channelId)) return;
      } else if (!PUBLIC_TEXT_SET.has(channelId)) {
        return;
      }

      const prevCh = textChannelBySocket.get(socket.id);
      const prevG = guildIdBySocket.get(socket.id) ?? null;
      if (prevCh) socket.leave(textRoom(prevG, prevCh));

      textChannelBySocket.set(socket.id, channelId);
      socket.join(textRoom(guildId, channelId));

      let history = [];
      if (guildId && supabaseServer) {
        history = await fetchGuildMessageHistory(channelId);
      } else {
        history = messagesByChannel[msgKey(null, channelId)] || [];
      }
      socket.emit("text:history", { channelId, guildId, messages: history });
    } catch (e) {
      console.error("text:join", e);
    }
  });

  socket.on("text:message", (payload) => {
    void (async () => {
      const profile = identities.get(socket.id);
      if (!profile) return;
      const channelId = textChannelBySocket.get(socket.id);
      if (!channelId || typeof payload?.text !== "string") return;
      const text = payload.text.trim().slice(0, 2000);
      if (!text) return;
      const guildId = guildIdBySocket.get(socket.id) ?? null;

      const msg = {
        id: `${Date.now()}-${socket.id}`,
        clientId: profile.clientId,
        displayName: profile.displayName,
        avatarColor: profile.avatarColor,
        avatarEmoji: profile.avatarEmoji,
        ...(profile.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
        text,
        ts: Date.now(),
      };

      const room = textRoom(guildId, channelId);

      if (guildId) {
        const userId = socket.data.supabaseUserId;
        if (!userId || !supabaseServer) return;
        const meta = await loadGuildChannelMeta(guildId);
        if (!meta || !meta.textIds.has(channelId)) return;
        const { data: row, error } = await supabaseServer
          .from("guild_messages")
          .insert({
            channel_id: channelId,
            sender_id: userId,
            body: text,
          })
          .select("id, created_at")
          .single();
        if (error || !row) {
          console.error("guild_messages insert", error);
          return;
        }
        msg.id = row.id;
        msg.ts = new Date(row.created_at).getTime();
        io.to(room).emit("text:message", { channelId, guildId, message: msg });
        return;
      }

      const key = msgKey(null, channelId);
      const list = messagesByChannel[key];
      if (!list) return;
      list.push(msg);
      if (list.length > 500) list.splice(0, list.length - 500);
      io.to(room).emit("text:message", { channelId, guildId: null, message: msg });
    })();
  });

  socket.on("voice:join", async (channelId) => {
    if (typeof channelId !== "string" || !channelId.trim()) return;
    const guildId = guildIdBySocket.get(socket.id) ?? null;

    try {
      if (guildId) {
        if (!supabaseServer) return;
        const meta = await loadGuildChannelMeta(guildId);
        if (!meta || !meta.voiceIds.has(channelId)) return;
      } else if (!PUBLIC_VOICE_SET.has(channelId)) {
        return;
      }

      const prev = voiceChannelBySocket.get(socket.id);
      const prevG = guildIdBySocket.get(socket.id) ?? null;
      if (prev) {
        socket.leave(voiceRoom(prevG, prev));
        socket.to(voiceRoom(prevG, prev)).emit("voice:peer-left", { socketId: socket.id });
      }

      voiceChannelBySocket.set(socket.id, channelId);
      socket.join(voiceRoom(guildId, channelId));
      const profile = identities.get(socket.id);
      if (!profile) return;

      const existing = getVoicePeers(channelId, socket.id, guildId);
      socket.emit("voice:peers", {
        channelId,
        peers: existing,
      });

      socket.to(voiceRoom(guildId, channelId)).emit("voice:peer-joined", {
        channelId,
        peer: { socketId: socket.id, ...profile },
      });
    } catch (e) {
      console.error("voice:join", e);
    }
  });

  socket.on("voice:leave", () => {
    const ch = voiceChannelBySocket.get(socket.id);
    if (!ch) return;
    const g = guildIdBySocket.get(socket.id) ?? null;
    socket.leave(voiceRoom(g, ch));
    voiceChannelBySocket.set(socket.id, null);
    socket.to(voiceRoom(g, ch)).emit("voice:peer-left", { socketId: socket.id });
  });

  socket.on("webrtc:offer", (payload) => {
    if (!payload || typeof payload.to !== "string" || !payload.sdp) return;
    socket.to(payload.to).emit("webrtc:offer", {
      from: socket.id,
      sdp: payload.sdp,
      channelId: payload.channelId,
    });
  });

  socket.on("webrtc:answer", (payload) => {
    if (!payload || typeof payload.to !== "string" || !payload.sdp) return;
    socket.to(payload.to).emit("webrtc:answer", {
      from: socket.id,
      sdp: payload.sdp,
    });
  });

  socket.on("webrtc:ice", (payload) => {
    if (!payload || typeof payload.to !== "string" || !payload.candidate) return;
    socket.to(payload.to).emit("webrtc:ice", {
      from: socket.id,
      candidate: payload.candidate,
    });
  });

  socket.on("disconnect", () => {
    const g = guildIdBySocket.get(socket.id) ?? null;
    const t = textChannelBySocket.get(socket.id);
    if (t) socket.leave(textRoom(g, t));
    textChannelBySocket.delete(socket.id);

    const v = voiceChannelBySocket.get(socket.id);
    if (v) {
      socket.to(voiceRoom(g, v)).emit("voice:peer-left", { socketId: socket.id });
    }
    voiceChannelBySocket.delete(socket.id);
    guildIdBySocket.delete(socket.id);
    identities.delete(socket.id);
    broadcastPresence();
  });
});

// Omit host so Node binds dual-stack (:: + IPv4-mapped) where supported; avoids probes failing on IPv6-only paths.
server.listen(PORT, () => {
  const hasUi = fs.existsSync(CLIENT_DIST);
  console.log(
    `Listening on port ${PORT} (static UI: ${hasUi ? "yes" : "no — run npm run build at repo root"})`
  );
});
