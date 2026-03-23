import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { loadIdentity } from "./lib/identity";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { userToIdentity } from "./lib/authProfile";
import { normalizeChannelList } from "./lib/channelList";
import { IdentityModal } from "./components/IdentityModal";
import { AuthModal } from "./components/AuthModal";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { VoiceView } from "./components/VoiceView";
import { UserBar } from "./components/UserBar";
import { RemoteVoiceAudios } from "./components/RemoteVoiceAudios";
import { SettingsModal } from "./components/SettingsModal";
import { ProfilePhotoSettings } from "./components/ProfilePhotoSettings";
import { ConnectedUsersTab } from "./components/ConnectedUsersTab";
import { CreateGuildModal } from "./components/CreateGuildModal";
import { GuildManageModal } from "./components/GuildManageModal";
import { useVoiceConnection } from "./hooks/useVoiceConnection";
import { loadVoiceSettings, saveVoiceSettings } from "./lib/voiceSettings";
import { syncProfileToSupabase } from "./lib/syncProfile";
import { useFriends } from "./hooks/useFriends";
import { useDmMessages } from "./hooks/useDmMessages";
import { usePrivateGuilds } from "./hooks/usePrivateGuilds";
import { DmChatView } from "./components/DmChatView";

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
  const useSupabaseAuth = isSupabaseConfigured;
  const [guestIdentity, setGuestIdentity] = useState(() => loadIdentity());
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(() => !useSupabaseAuth);
  const [connected, setConnected] = useState(false);
  const [socketError, setSocketError] = useState(null);
  const [textChannels, setTextChannels] = useState(() =>
    DEFAULT_TEXT.map((id) => ({ id, name: id }))
  );
  const [voiceChannels, setVoiceChannels] = useState(() =>
    DEFAULT_VOICE.map((id) => ({ id, name: id }))
  );
  const [activeGuildId, setActiveGuildId] = useState(null);
  const [myGuildRole, setMyGuildRole] = useState(null);
  const [createGuildOpen, setCreateGuildOpen] = useState(false);
  const [manageGuildOpen, setManageGuildOpen] = useState(false);
  const activeGuildIdRef = useRef(null);
  const [selectedTextId, setSelectedTextId] = useState("general");
  const [mainPane, setMainPane] = useState("text");
  const [connectedVoiceId, setConnectedVoiceId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState(() => loadVoiceSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [peerMix, setPeerMix] = useState(() => new Map());
  const [selectedDmPeerId, setSelectedDmPeerId] = useState(null);
  const [friendAddError, setFriendAddError] = useState(null);

  useEffect(() => {
    if (!useSupabaseAuth || !supabase) return;
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!cancelled) {
        setSession(s);
        setAuthReady(true);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [useSupabaseAuth]);

  const identity = useMemo(() => {
    if (useSupabaseAuth) {
      if (!session?.user) return null;
      return userToIdentity(session.user);
    }
    return guestIdentity;
  }, [useSupabaseAuth, session, guestIdentity]);

  useEffect(() => {
    if (!useSupabaseAuth || !session?.user?.id || !identity) return;
    void syncProfileToSupabase(session.user.id, identity);
  }, [useSupabaseAuth, session?.user?.id, identity]);

  const myUserId = session?.user?.id;

  const {
    friends,
    incoming,
    outgoing,
    sendFriendRequest,
    acceptRequest,
    declineRequest,
    cancelOutgoing,
  } = useFriends(Boolean(useSupabaseAuth && myUserId), myUserId);

  const {
    guilds: privateGuildsList,
    incomingInvites: guildIncomingInvites,
    createGuild,
    sendGuildInvite,
    acceptGuildInvite,
    declineGuildInvite,
    reload: reloadGuilds,
  } = usePrivateGuilds(Boolean(useSupabaseAuth && myUserId), myUserId);

  activeGuildIdRef.current = activeGuildId;

  const dmActive = Boolean(useSupabaseAuth && mainPane === "dm" && selectedDmPeerId);
  const { messages: dmMessages, loading: dmLoading, error: dmError, ready: dmReady, sendMessage: sendDmMessage } =
    useDmMessages(dmActive, myUserId, selectedDmPeerId);

  const selectedDmPeer = friends.find((f) => f.id === selectedDmPeerId);

  const accessToken = useSupabaseAuth ? session?.access_token ?? null : null;

  const socketUrl = useMemo(() => socketBaseUrl(), []);
  const socket = useMemo(
    () =>
      io(socketUrl, {
        autoConnect: false,
        transports: ["websocket", "polling"],
        reconnectionAttempts: 8,
        reconnectionDelay: 1000,
        auth: useSupabaseAuth ? { token: accessToken || "" } : {},
      }),
    [socketUrl, useSupabaseAuth, accessToken]
  );

  const onScreenShareEnd = useCallback(() => {
    setScreenOn(false);
    setCameraOn(false);
  }, []);

  const voice = useVoiceConnection(socket, connectedVoiceId, identity || {}, {
    onScreenShareEnd,
    micSettings: voiceSettings,
  });

  const onPeerVolume = useCallback((peerId, volume) => {
    setPeerMix((prev) => {
      const next = new Map(prev);
      const cur = next.get(peerId) || { volume: 1, muted: false };
      next.set(peerId, { ...cur, volume });
      return next;
    });
  }, []);

  const onPeerMuteToggle = useCallback((peerId) => {
    setPeerMix((prev) => {
      const next = new Map(prev);
      const cur = next.get(peerId) || { volume: 1, muted: false };
      next.set(peerId, { ...cur, muted: !cur.muted });
      return next;
    });
  }, []);

  useEffect(() => {
    voice.setMuted(muted);
  }, [muted, voice.setMuted]);

  useEffect(() => {
    const canConnect = useSupabaseAuth
      ? Boolean(session?.access_token)
      : Boolean(guestIdentity);
    if (!canConnect) {
      if (socket.connected) socket.disconnect();
      return;
    }

    const onConnect = () => {
      setSocketError(null);
      setConnected(true);
    };
    const onChannelsConfig = (res) => {
      setMessages([]);
      const gid = res?.guildId ?? null;
      setActiveGuildId(gid);
      setMyGuildRole(res?.myRole ?? null);
      const t = normalizeChannelList(res?.text);
      const v = normalizeChannelList(res?.voice);
      if (t.length) {
        setTextChannels(t);
        setSelectedTextId((prev) => (t.some((c) => c.id === prev) ? prev : t[0].id));
      }
      if (v.length) setVoiceChannels(v);
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
  }, [socket, useSupabaseAuth, session?.access_token, guestIdentity]);

  useEffect(() => {
    if (!identity || !connected) return;
    socket.emit("identity:set", {
      clientId: identity.clientId,
      displayName: identity.displayName,
      avatarColor: identity.avatarColor,
      avatarEmoji: identity.avatarEmoji,
      avatarUrl: identity.avatarUrl ?? "",
    });
  }, [identity, connected, socket]);

  useEffect(() => {
    if (!connected || !identity) return;
    socket.emit("guild:select", activeGuildId);
  }, [connected, identity, activeGuildId, socket]);

  useEffect(() => {
    if (!connected || !identity || !selectedTextId.trim()) return;
    socket.emit("text:join", selectedTextId);
  }, [connected, identity, selectedTextId, socket]);

  useEffect(() => {
    if (!identity) return;
    const onHistory = ({ channelId, guildId: g, messages: list }) => {
      if (channelId !== selectedTextId) return;
      if ((g ?? null) !== (activeGuildIdRef.current ?? null)) return;
      setMessages(list);
    };
    const onMessage = ({ channelId, guildId: g, message }) => {
      if (channelId !== selectedTextId) return;
      if ((g ?? null) !== (activeGuildIdRef.current ?? null)) return;
      setMessages((prev) => [...prev, message]);
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
    setSelectedDmPeerId(null);
  }, []);

  const handleSelectVoice = useCallback((id) => {
    setConnectedVoiceId(id);
    setMainPane("voice");
    setSelectedDmPeerId(null);
    setCameraOn(false);
    setScreenOn(false);
  }, []);

  const handleSelectDmPeer = useCallback((peerId) => {
    setSelectedDmPeerId(peerId);
    setMainPane("dm");
  }, []);

  const handleDisconnectVoice = useCallback(() => {
    setConnectedVoiceId(null);
    setMainPane("text");
    setSelectedDmPeerId(null);
    setCameraOn(false);
    setScreenOn(false);
  }, []);

  const handleSelectPublicLobby = useCallback(() => {
    setActiveGuildId(null);
    setConnectedVoiceId(null);
    setMainPane("text");
    setSelectedDmPeerId(null);
    setCameraOn(false);
    setScreenOn(false);
    setSelectedTextId("general");
  }, []);

  const handleSelectPrivateGuild = useCallback((guildId) => {
    setSelectedTextId("");
    setMessages([]);
    setActiveGuildId(guildId);
    setConnectedVoiceId(null);
    setMainPane("text");
    setSelectedDmPeerId(null);
    setCameraOn(false);
    setScreenOn(false);
  }, []);

  const handleCreateGuildSubmit = useCallback(
    async (name) => {
      setSelectedTextId("");
      setMessages([]);
      const r = await createGuild(name);
      if (r?.ok && r.guildId) {
        setActiveGuildId(r.guildId);
        setCreateGuildOpen(false);
      }
      return r;
    },
    [createGuild]
  );

  const handleAcceptGuildInvite = useCallback(
    async (inviteId) => {
      setSelectedTextId("");
      setMessages([]);
      const inv = guildIncomingInvites.find((i) => i.id === inviteId);
      const r = await acceptGuildInvite(inviteId);
      if (r?.ok && inv?.guildId) {
        setActiveGuildId(inv.guildId);
      }
      return r;
    },
    [acceptGuildInvite, guildIncomingInvites]
  );

  const handleDeclineGuildInvite = useCallback(
    async (inviteId) => {
      return declineGuildInvite(inviteId);
    },
    [declineGuildInvite]
  );

  const handleGuildInviteFromModal = useCallback(
    async (guildId, inviteeUserId) => {
      return sendGuildInvite(guildId, inviteeUserId);
    },
    [sendGuildInvite]
  );

  const selectedTextLabel = useMemo(() => {
    const c = textChannels.find((x) => x.id === selectedTextId);
    return c?.name ?? selectedTextId;
  }, [textChannels, selectedTextId]);

  const selectedVoiceLabel = useMemo(() => {
    if (!connectedVoiceId) return "";
    const c = voiceChannels.find((x) => x.id === connectedVoiceId);
    return c?.name ?? connectedVoiceId;
  }, [voiceChannels, connectedVoiceId]);

  const serverSubtitle = useMemo(() => {
    if (!activeGuildId) return "Lobby public";
    const g = privateGuildsList.find((x) => x.id === activeGuildId);
    return g ? `Serveur · ${g.name}` : "Serveur privé";
  }, [activeGuildId, privateGuildsList]);

  const currentGuildName = useMemo(() => {
    if (!activeGuildId) return "";
    return privateGuildsList.find((x) => x.id === activeGuildId)?.name ?? "Serveur";
  }, [activeGuildId, privateGuildsList]);

  const handleSendFriendRequest = useCallback(
    async (raw) => {
      setFriendAddError(null);
      const r = await sendFriendRequest(raw);
      if (!r.ok) setFriendAddError(r.message);
      return r;
    },
    [sendFriendRequest]
  );

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
        await voice.toggleScreenShare(next, voiceSettings.screenPreset);
        setScreenOn(next);
        if (next) setCameraOn(true);
        else setCameraOn(false);
      } catch (e) {
        console.error(e);
        setScreenOn(false);
        setCameraOn(false);
      }
    },
    [voice, voiceSettings.screenPreset]
  );

  const onScreenPresetChange = useCallback((preset) => {
    setVoiceSettings((prev) => {
      const next = { ...prev, screenPreset: preset };
      saveVoiceSettings({ screenPreset: preset });
      return next;
    });
  }, []);

  if (useSupabaseAuth && !authReady) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-discord-bg text-discord-muted">
        Chargement…
      </div>
    );
  }

  if (useSupabaseAuth && !session) {
    return <AuthModal />;
  }

  if (!useSupabaseAuth && !guestIdentity) {
    return <IdentityModal onComplete={setGuestIdentity} />;
  }

  if (!identity) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-discord-bg text-discord-muted">
        Chargement…
      </div>
    );
  }

  const connectedUsersTab = (
    <ConnectedUsersTab socket={socket} connected={connected} myClientId={identity.clientId} />
  );

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
          friendsEnabled={useSupabaseAuth}
          friends={friends}
          incoming={incoming}
          outgoing={outgoing}
          selectedDmPeerId={selectedDmPeerId}
          onSelectDmPeer={handleSelectDmPeer}
          friendAddError={friendAddError}
          onClearFriendAddError={() => setFriendAddError(null)}
          onSendFriendRequest={handleSendFriendRequest}
          onAcceptRequest={(id) => void acceptRequest(id)}
          onDeclineRequest={(id) => void declineRequest(id)}
          onCancelOutgoing={(id) => void cancelOutgoing(id)}
          serverSubtitle={serverSubtitle}
          activeGuildId={activeGuildId}
          myGuildRole={myGuildRole}
          privateGuilds={privateGuildsList}
          incomingGuildInvites={guildIncomingInvites}
          onSelectPublicLobby={handleSelectPublicLobby}
          onSelectPrivateGuild={handleSelectPrivateGuild}
          onOpenCreateGuild={() => setCreateGuildOpen(true)}
          onOpenManageGuild={() => setManageGuildOpen(true)}
          onAcceptGuildInvite={(id) => void handleAcceptGuildInvite(id)}
          onDeclineGuildInvite={(id) => void handleDeclineGuildInvite(id)}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {mainPane === "text" && !selectedTextId.trim() ? (
            <div className="flex min-h-0 flex-1 flex-col bg-discord-bg">
              <header className="flex h-12 shrink-0 items-center justify-end border-b border-discord-border bg-discord-elevated px-3">
                {connectedUsersTab}
              </header>
              <div className="flex flex-1 items-center justify-center text-sm text-discord-muted">
                Chargement des salons…
              </div>
            </div>
          ) : null}
          {mainPane === "text" && selectedTextId.trim() ? (
            <ChatView
              channelId={selectedTextId}
              channelTitle={selectedTextLabel}
              messages={messages}
              connected={connected}
              connectionError={socketError}
              onSend={sendChat}
              headerTrailing={connectedUsersTab}
            />
          ) : null}
          {mainPane === "dm" ? (
            selectedDmPeerId && selectedDmPeer ? (
              <DmChatView
                peerDisplayName={selectedDmPeer.displayName}
                peerAvatarUrl={selectedDmPeer.avatarUrl}
                selfUserId={myUserId}
                selfDisplayName={identity.displayName}
                selfAvatarUrl={identity.avatarUrl}
                selfAvatarColor={identity.avatarColor}
                selfAvatarEmoji={identity.avatarEmoji}
                messages={dmMessages}
                loading={dmLoading}
                error={dmError}
                ready={dmReady}
                headerTrailing={connectedUsersTab}
                onSend={async (text) => {
                  await sendDmMessage(text);
                }}
              />
            ) : (
              <div className="flex min-h-0 flex-1 flex-col bg-discord-bg">
                <header className="flex h-12 shrink-0 items-center justify-end border-b border-discord-border bg-discord-elevated px-3">
                  {connectedUsersTab}
                </header>
                <div className="flex flex-1 items-center justify-center text-sm text-discord-muted">
                  Choisis une conversation dans la liste Amis.
                </div>
              </div>
            )
          ) : null}
          {mainPane === "voice" && connectedVoiceId && (
            <VoiceView
              channelId={connectedVoiceId}
              channelTitle={selectedVoiceLabel}
              profile={identity}
              localStreamRef={voice.localStreamRef}
              localRenderTick={voice.localRenderTick}
              remoteStreams={voice.remoteStreams}
              peerMeta={voice.peerMeta}
              cameraOn={cameraOn}
              screenOn={screenOn}
              onToggleCamera={onToggleCamera}
              onToggleScreen={onToggleScreen}
              screenPreset={voiceSettings.screenPreset}
              onScreenPresetChange={onScreenPresetChange}
              peerMix={peerMix}
              onPeerVolume={onPeerVolume}
              onPeerMuteToggle={onPeerMuteToggle}
              headerTrailing={connectedUsersTab}
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
        onOpenSettings={() => setSettingsOpen(true)}
        onSignOut={
          useSupabaseAuth && supabase
            ? async () => {
                await supabase.auth.signOut();
              }
            : undefined
        }
      />
      {connectedVoiceId ? (
        <RemoteVoiceAudios
          remoteStreams={voice.remoteStreams}
          deafened={deafened}
          peerMix={peerMix}
        />
      ) : null}
      {settingsOpen ? (
        <SettingsModal
          onClose={() => setSettingsOpen(false)}
          onSaved={(s) => setVoiceSettings(s)}
          profileSection={
            useSupabaseAuth && session?.user ? (
              <ProfilePhotoSettings
                userId={session.user.id}
                avatarUrl={identity.avatarUrl}
                avatarColor={identity.avatarColor}
                avatarEmoji={identity.avatarEmoji}
              />
            ) : null
          }
        />
      ) : null}
      {createGuildOpen ? (
        <CreateGuildModal
          onClose={() => setCreateGuildOpen(false)}
          onCreate={handleCreateGuildSubmit}
        />
      ) : null}
      {manageGuildOpen && activeGuildId ? (
        <GuildManageModal
          guildId={activeGuildId}
          guildName={currentGuildName}
          myRole={myGuildRole}
          myUserId={myUserId}
          friends={friends}
          onClose={() => setManageGuildOpen(false)}
          onChanged={() => void reloadGuilds()}
          onInvite={handleGuildInviteFromModal}
        />
      ) : null}
    </div>
  );
}
