import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { loadIdentity } from "./lib/identity";
import { IdentityModal } from "./components/IdentityModal";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { VoiceView } from "./components/VoiceView";
import { UserBar } from "./components/UserBar";
import { RemoteVoiceAudios } from "./components/RemoteVoiceAudios";
import { useVoiceConnection } from "./hooks/useVoiceConnection";

const DEFAULT_TEXT = ["general", "random", "dev", "off-topic"];
const DEFAULT_VOICE = ["Lobby", "Gaming", "Study"];

/** Production must not use a localhost URL baked at build time (common Railway misconfig). */
function socketBaseUrl() {
  const raw = (import.meta.env.VITE_SOCKET_URL || "").trim();
  if (import.meta.env.DEV) {
    return raw || "http://localhost:3001";
  }
  const isLocal = /^(https?:\/\/)(localhost|127\.0\.0\.1)(:\d+)?\/?$/i.test(raw);
  if (raw && !isLocal) {
    return raw.replace(/\/$/, "");
  }
  return window.location.origin;
}

export default function App() {
  const [identity, setIdentity] = useState(() => loadIdentity());
  const [connected, setConnected] = useState(false);
  const [socketError, setSocketError] = useState(null);
  const [textChannels, setTextChannels] = useState(DEFAULT_TEXT);
  const [voiceChannels, setVoiceChannels] = useState(DEFAULT_VOICE);
  const [selectedTextId, setSelectedTextId] = useState("general");
  const [mainPane, setMainPane] = useState("text");
  const [connectedVoiceId, setConnectedVoiceId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);

  const socketUrl = useMemo(() => socketBaseUrl(), []);
  const socket = useMemo(
    () =>
      io(socketUrl, {
        autoConnect: false,
        transports: ["websocket", "polling"],
        reconnectionAttempts: 8,
        reconnectionDelay: 1000,
      }),
    [socketUrl]
  );

  const onScreenShareEnd = useCallback(() => {
    setScreenOn(false);
    setCameraOn(false);
  }, []);

  const voice = useVoiceConnection(socket, connectedVoiceId, identity || {}, {
    onScreenShareEnd,
  });

  useEffect(() => {
    voice.setMuted(muted);
  }, [muted, voice.setMuted]);

  useEffect(() => {
    const onConnect = () => {
      setSocketError(null);
      setConnected(true);
      const id = loadIdentity();
      if (id) {
        socket.emit("identity:set", {
          clientId: id.clientId,
          displayName: id.displayName,
          avatarColor: id.avatarColor,
          avatarEmoji: id.avatarEmoji,
        });
      }
    };
    const onChannelsConfig = (res) => {
      if (res?.text?.length) setTextChannels(res.text);
      if (res?.voice?.length) setVoiceChannels(res.voice);
    };
    const onDisconnect = () => setConnected(false);
    const onConnectError = (err) => {
      setSocketError(err?.message || "Connection failed");
    };
    const onReconnectFailed = () => {
      setSocketError((prev) => prev || "Trop de tentatives, connexion abandonnée.");
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.on("reconnect_failed", onReconnectFailed);
    socket.on("channels:config", onChannelsConfig);
    socket.connect();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("reconnect_failed", onReconnectFailed);
      socket.off("channels:config", onChannelsConfig);
      socket.disconnect();
    };
  }, [socket]);

  useEffect(() => {
    if (!identity || !connected) return;
    socket.emit("identity:set", {
      clientId: identity.clientId,
      displayName: identity.displayName,
      avatarColor: identity.avatarColor,
      avatarEmoji: identity.avatarEmoji,
    });
  }, [identity, connected, socket]);

  useEffect(() => {
    if (!connected || !identity) return;
    socket.emit("text:join", selectedTextId);
  }, [connected, identity, selectedTextId, socket]);

  useEffect(() => {
    if (!identity) return;
    const onHistory = ({ channelId, messages: list }) => {
      if (channelId === selectedTextId) setMessages(list);
    };
    const onMessage = ({ channelId, message }) => {
      if (channelId === selectedTextId) {
        setMessages((prev) => [...prev, message]);
      }
    };
    socket.on("text:history", onHistory);
    socket.on("text:message", onMessage);
    return () => {
      socket.off("text:history", onHistory);
      socket.off("text:message", onMessage);
    };
  }, [identity, selectedTextId, socket]);

  const handleSelectText = useCallback((id) => {
    setSelectedTextId(id);
    setMainPane("text");
  }, []);

  const handleSelectVoice = useCallback((id) => {
    setConnectedVoiceId(id);
    setMainPane("voice");
    setCameraOn(false);
    setScreenOn(false);
  }, []);

  const handleDisconnectVoice = useCallback(() => {
    setConnectedVoiceId(null);
    setMainPane("text");
    setCameraOn(false);
    setScreenOn(false);
  }, []);

  const sendChat = useCallback(
    (text) => {
      socket.emit("text:message", { text });
    },
    [socket]
  );

  const onToggleCamera = useCallback(
    async (next) => {
      try {
        await voice.toggleCamera(next);
        setCameraOn(next);
        if (next) setScreenOn(false);
      } catch (e) {
        console.error(e);
        setCameraOn(false);
      }
    },
    [voice]
  );

  const onToggleScreen = useCallback(
    async (next) => {
      try {
        await voice.toggleScreenShare(next);
        setScreenOn(next);
        if (next) setCameraOn(true);
        else setCameraOn(false);
      } catch (e) {
        console.error(e);
        setScreenOn(false);
        setCameraOn(false);
      }
    },
    [voice]
  );

  if (!identity) {
    return <IdentityModal onComplete={setIdentity} />;
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-discord-bg">
      <div className="flex min-h-0 flex-1">
        <Sidebar
          textChannels={textChannels}
          voiceChannels={voiceChannels}
          selectedTextId={selectedTextId}
          connectedVoiceId={connectedVoiceId}
          mainPane={mainPane}
          onSelectText={handleSelectText}
          onSelectVoice={handleSelectVoice}
          onDisconnectVoice={handleDisconnectVoice}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {mainPane === "text" && (
            <ChatView
              channelId={selectedTextId}
              messages={messages}
              connected={connected}
              connectionError={socketError}
              onSend={sendChat}
            />
          )}
          {mainPane === "voice" && connectedVoiceId && (
            <VoiceView
              channelId={connectedVoiceId}
              profile={identity}
              localStreamRef={voice.localStreamRef}
              localRenderTick={voice.localRenderTick}
              remoteStreams={voice.remoteStreams}
              peerMeta={voice.peerMeta}
              cameraOn={cameraOn}
              screenOn={screenOn}
              onToggleCamera={onToggleCamera}
              onToggleScreen={onToggleScreen}
            />
          )}
        </main>
      </div>
      <UserBar
        profile={identity}
        muted={muted}
        deafened={deafened}
        onToggleMute={() => setMuted((m) => !m)}
        onToggleDeafen={() => setDeafened((d) => !d)}
        connectedVoiceId={connectedVoiceId}
      />
      {connectedVoiceId ? (
        <RemoteVoiceAudios remoteStreams={voice.remoteStreams} deafened={deafened} />
      ) : null}
    </div>
  );
}
