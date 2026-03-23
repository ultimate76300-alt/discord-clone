import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import http from "http";
import cors from "cors";
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

/** @type {Map<string, { displayName: string; avatarColor: string; avatarEmoji: string; clientId: string }>} */
const identities = new Map();

/** @type {Map<string, string | null>} socketId -> text channel id */
const textChannelBySocket = new Map();

/** @type {Map<string, string | null>} socketId -> voice channel id */
const voiceChannelBySocket = new Map();

/** @type {Record<string, Array<{ id: string; clientId: string; displayName: string; avatarColor: string; avatarEmoji: string; text: string; ts: number }>>} */
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

io.on("connection", (socket) => {
  socket.emit("channels:config", { text: TEXT_CHANNELS, voice: VOICE_CHANNELS });

  socket.on("identity:set", (payload) => {
    if (!payload || typeof payload !== "object") return;
    const { clientId, displayName, avatarColor, avatarEmoji } = payload;
    if (!displayName || typeof displayName !== "string") return;
    identities.set(socket.id, {
      clientId: typeof clientId === "string" ? clientId : socket.id,
      displayName: displayName.slice(0, 32),
      avatarColor: typeof avatarColor === "string" ? avatarColor : "#5865f2",
      avatarEmoji: typeof avatarEmoji === "string" ? avatarEmoji.slice(0, 4) : "👤",
    });
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
  });
});

// Omit host so Node binds dual-stack (:: + IPv4-mapped) where supported; avoids probes failing on IPv6-only paths.
server.listen(PORT, () => {
  const hasUi = fs.existsSync(CLIENT_DIST);
  console.log(
    `Listening on port ${PORT} (static UI: ${hasUi ? "yes" : "no — run npm run build at repo root"})`
  );
});
