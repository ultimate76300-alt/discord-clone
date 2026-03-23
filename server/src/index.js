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

/** @type {Record<string, Array<{ id: string; clientId: string; displayName: string; avatarColor: string; avatarEmoji: string; avatarUrl?: string; text: string; ts: number }>>} */
const messagesByChannel = {};

const TEXT_CHANNELS = ["general", "random", "dev", "off-topic"];
const VOICE_CHANNELS = ["Lobby", "Gaming", "Study"];

TEXT_CHANNELS.forEach((id) => {
  if (!messagesByChannel[id]) messagesByChannel[id] = [];
});

function getVoicePeers(channelId, excludeSocketId) {
  const peers = [];
  for (const [sid, ch] of voiceChannelBySocket.entries()) {
    if (ch === channelId && sid !== excludeSocketId) {
      const profile = identities.get(sid);
      if (profile) peers.push({ socketId: sid, ...profile });
    }
  }
  return peers;
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
  socket.emit("channels:config", { text: TEXT_CHANNELS, voice: VOICE_CHANNELS });
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

  socket.on("text:join", (channelId) => {
    if (typeof channelId !== "string" || !TEXT_CHANNELS.includes(channelId)) return;
    const prev = textChannelBySocket.get(socket.id);
    if (prev) socket.leave(`text:${prev}`);
    textChannelBySocket.set(socket.id, channelId);
    socket.join(`text:${channelId}`);
    const history = messagesByChannel[channelId] || [];
    socket.emit("text:history", { channelId, messages: history });
  });

  socket.on("text:message", (payload) => {
    const profile = identities.get(socket.id);
    if (!profile) return;
    const channelId = textChannelBySocket.get(socket.id);
    if (!channelId || typeof payload?.text !== "string") return;
    const text = payload.text.trim().slice(0, 2000);
    if (!text) return;
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
    const list = messagesByChannel[channelId];
    if (!list) return;
    list.push(msg);
    if (list.length > 500) list.splice(0, list.length - 500);
    io.to(`text:${channelId}`).emit("text:message", { channelId, message: msg });
  });

  socket.on("voice:join", (channelId) => {
    if (typeof channelId !== "string" || !VOICE_CHANNELS.includes(channelId)) return;
    const prev = voiceChannelBySocket.get(socket.id);
    if (prev) {
      socket.leave(`voice:${prev}`);
      socket.to(`voice:${prev}`).emit("voice:peer-left", { socketId: socket.id });
    }
    voiceChannelBySocket.set(socket.id, channelId);
    socket.join(`voice:${channelId}`);
    const profile = identities.get(socket.id);
    if (!profile) return;

    const existing = getVoicePeers(channelId, socket.id);
    socket.emit("voice:peers", {
      channelId,
      peers: existing,
    });

    socket.to(`voice:${channelId}`).emit("voice:peer-joined", {
      channelId,
      peer: { socketId: socket.id, ...profile },
    });
  });

  socket.on("voice:leave", () => {
    const ch = voiceChannelBySocket.get(socket.id);
    if (!ch) return;
    socket.leave(`voice:${ch}`);
    voiceChannelBySocket.set(socket.id, null);
    socket.to(`voice:${ch}`).emit("voice:peer-left", { socketId: socket.id });
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
    const t = textChannelBySocket.get(socket.id);
    if (t) socket.leave(`text:${t}`);
    textChannelBySocket.delete(socket.id);

    const v = voiceChannelBySocket.get(socket.id);
    if (v) {
      socket.to(`voice:${v}`).emit("voice:peer-left", { socketId: socket.id });
    }
    voiceChannelBySocket.delete(socket.id);
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
