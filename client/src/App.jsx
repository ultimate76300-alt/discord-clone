import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import { loadIdentity } from "./lib/identity";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { userToIdentity } from "./lib/authProfile";
import { normalizeChannelList } from "./lib/channelList";
import { IdentityModal } from "./components/IdentityModal";
import { AuthModal } from "./components/AuthModal";
import { Sidebar } from "./components/Sidebar";
import { GuildServerRail } from "./components/GuildServerRail";
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
import { useServerTextChat } from "./hooks/useServerTextChat";
import { DmChatView } from "./components/DmChatView";
import {
  PUBLIC_TEXT_SLUGS,
  buildTextChatTarget,
  canonicalPublicTextChannelId,
} from "./lib/textChatProtocol";
import { playVoiceJoinChime, playVoiceLeaveChime } from "./lib/voiceChimes";

const DEFAULT_TEXT = PUBLIC_TEXT_SLUGS;
const DEFAULT_VOICE = ["Lobby", "Gaming", "Study"];

const LAST_GUILD_STORAGE_KEY = "atomvoice:lastGuildCtx";
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readStoredGuildIdForUser(userId) {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_GUILD_STORAGE_KEY);
    if (!raw) return null;
    const j = JSON.parse(raw);
    if (j?.u !== userId || typeof j?.g !== "string" || !UUID_RE.test(j.g)) return null;
    return j.g;
  } catch {
    return null;
  }
}

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
  const [profileRow, setProfileRow] = useState(null);
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
  const selectedTextIdRef = useRef("");
  const lastGuildHydratedUserRef = useRef(null);
  const loadGuildChannelsSeqRef = useRef(0);
  const [selectedTextId, setSelectedTextId] = useState("general");
  /** True après un changement de serveur / F5 : on n’affiche pas les salons du lobby tant que le socket n’a pas renvoyé la config. */
  const [awaitingChannelSync, setAwaitingChannelSync] = useState(false);
  const [mainPane, setMainPane] = useState("text");
  const [connectedVoiceId, setConnectedVoiceId] = useState(null);
  const [connectedVoiceGuildId, setConnectedVoiceGuildId] = useState(null);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState(() => loadVoiceSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [peerMix, setPeerMix] = useState(() => new Map());
  const [selectedDmPeerId, setSelectedDmPeerId] = useState(null);
  const [friendAddError, setFriendAddError] = useState(null);
  const [onlineUserIds, setOnlineUserIds] = useState(() => new Set());

  useEffect(() => {
    if (!useSupabaseAuth || !supabase) return;
    let cancelled = false;
    void supabase.auth
      .getSession()
      .then(({ data: { session: s }, error }) => {
        if (!cancelled) {
          setSession(s);
          setAuthReady(true);
        }
      })
      .catch((e) => {
        if (!cancelled) setAuthReady(true);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setAuthReady(true);
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

  useEffect(() => {
    if (!useSupabaseAuth || !myUserId || !supabase) return;
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("display_name, avatar_url")
          .eq("id", myUserId)
          .maybeSingle();
        if (cancelled) return;
        if (error || !data) return;
        setProfileRow({
          displayName: String(data.display_name || "").slice(0, 64),
          avatarUrl: data.avatar_url ?? undefined,
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [useSupabaseAuth, myUserId]);

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
    guildTablesMissing,
    loading: guildsLoading,
    error: guildsLoadError,
    createGuild,
    sendGuildInvite,
    acceptGuildInvite,
    declineGuildInvite,
    deleteGuild,
    addGuildChannel,
    deleteGuildChannel,
    reload: reloadGuilds,
  } = usePrivateGuilds(Boolean(useSupabaseAuth && myUserId), myUserId);

  activeGuildIdRef.current = activeGuildId;
  selectedTextIdRef.current = selectedTextId;

  useLayoutEffect(() => {
    if (!useSupabaseAuth || !myUserId) {
      lastGuildHydratedUserRef.current = null;
      return;
    }
    if (lastGuildHydratedUserRef.current === myUserId) return;
    lastGuildHydratedUserRef.current = myUserId;
    const stored = readStoredGuildIdForUser(myUserId);
    setActiveGuildId(stored);
    if (stored) {
      setAwaitingChannelSync(true);
      setTextChannels([]);
      setVoiceChannels([]);
      setSelectedTextId("");
      setMessages([]);
    }
  }, [useSupabaseAuth, myUserId]);

  useEffect(() => {
    if (!useSupabaseAuth || !myUserId) return;
    try {
      if (activeGuildId) {
        localStorage.setItem(LAST_GUILD_STORAGE_KEY, JSON.stringify({ u: myUserId, g: activeGuildId }));
      } else {
        localStorage.removeItem(LAST_GUILD_STORAGE_KEY);
      }
    } catch {
      /* ignore */
    }
  }, [useSupabaseAuth, myUserId, activeGuildId]);

  useEffect(() => {
    if (!useSupabaseAuth || !session?.user) {
      try {
        localStorage.removeItem(LAST_GUILD_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      lastGuildHydratedUserRef.current = null;
    }
  }, [useSupabaseAuth, session?.user]);

  useEffect(() => {
    if (!myUserId || guildsLoading || guildTablesMissing) return;
    if (!activeGuildId) return;
    if (privateGuildsList.length === 0) return;
    if (!privateGuildsList.some((g) => g.id === activeGuildId)) {
      setAwaitingChannelSync(true);
      setTextChannels([]);
      setVoiceChannels([]);
      setSelectedTextId("");
      setMessages([]);
      setActiveGuildId(null);
      try {
        localStorage.removeItem(LAST_GUILD_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [myUserId, guildsLoading, guildTablesMissing, activeGuildId, privateGuildsList]);

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

  useEffect(() => {
    const onPresence = (payload) => {
      const users = Array.isArray(payload?.users) ? payload.users : [];
      const next = new Set();
      for (const u of users) {
        if (u?.clientId && typeof u.clientId === "string") next.add(u.clientId);
      }
      setOnlineUserIds(next);
    };
    socket.on("presence:update", onPresence);
    return () => socket.off("presence:update", onPresence);
  }, [socket]);

  const { messages, sendChat, setMessages } = useServerTextChat({
    socket,
    activeGuildId,
    selectedTextId,
  });

  const onScreenShareEnd = useCallback(() => {
    setScreenOn(false);
    setCameraOn(false);
  }, []);

  const effectiveIdentity = profileRow?.displayName
    ? {
        ...identity,
        displayName: profileRow.displayName,
        avatarUrl: profileRow.avatarUrl,
      }
    : identity;

  const voice = useVoiceConnection(socket, connectedVoiceId, effectiveIdentity || {}, {
    onScreenShareEnd,
    micSettings: voiceSettings,
    voiceGuildId: connectedVoiceGuildId,
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
      const incoming = res?.guildId ?? null;
      const mine = activeGuildIdRef.current ?? null;
      if (incoming !== mine) return;

      setMyGuildRole(res?.myRole ?? null);

      // Lobby public : les salons viennent du socket.
      if (mine === null) {
        setAwaitingChannelSync(false);
        const prevNorm = canonicalPublicTextChannelId(selectedTextIdRef.current);
        const t = normalizeChannelList(res?.text);
        const v = normalizeChannelList(res?.voice);
        const keepMessages =
          prevNorm !== "" && t.some((c) => canonicalPublicTextChannelId(c.id) === prevNorm);
        if (!keepMessages) setMessages([]);
        setTextChannels(t);
        setVoiceChannels(v);
        setSelectedTextId((prev) => {
          if (!t.length) return "";
          return t.some((c) => c.id === prev) ? prev : t[0].id;
        });
        return;
      }

      // Serveur privé : ne jamais appliquer text/voice depuis le socket (courses avec le lobby ou données retardées).
      // Source de vérité : loadGuildChannelsFromSupabase + afterGuildChannelsChange.
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
    if (!effectiveIdentity || !connected) return;
    socket.emit("identity:set", {
      clientId: effectiveIdentity?.clientId,
      displayName: effectiveIdentity?.displayName,
      avatarColor: effectiveIdentity?.avatarColor,
      avatarEmoji: effectiveIdentity?.avatarEmoji,
      avatarUrl: effectiveIdentity?.avatarUrl ?? "",
    });
  }, [effectiveIdentity, connected, socket]);

  useEffect(() => {
    if (!connected || !identity) return;
    socket.emit("guild:select", activeGuildId);
    const t = buildTextChatTarget(activeGuildId, selectedTextId);
    if (!t) return;
    socket.emit("text:join", {
      scope: t.scope,
      guildId: t.scope === "guild" ? t.guildId : undefined,
      channelId: t.channelId,
    });
  }, [connected, identity, activeGuildId, selectedTextId, socket]);

  const handleSelectText = useCallback((id) => {
    setSelectedTextId(id);
    setMainPane("text");
    setSelectedDmPeerId(null);
  }, []);

  const handleSelectVoice = useCallback(
    (id) => {
      // Déclenché dans le gesture utilisateur (clic) : le navigateur autorise plus facilement l'audio.
      if (connectedVoiceId && connectedVoiceId !== id) void playVoiceLeaveChime();
      void playVoiceJoinChime();
      setConnectedVoiceId(id);
      setConnectedVoiceGuildId(activeGuildId ?? null);
      setMainPane("voice");
      setSelectedDmPeerId(null);
      setCameraOn(false);
      setScreenOn(false);
    },
    [connectedVoiceId, activeGuildId]
  );

  const handleSelectDmPeer = useCallback((peerId) => {
    setSelectedDmPeerId(peerId);
    setMainPane("dm");
  }, []);

  const handleDisconnectVoice = useCallback(() => {
    // On joue aussi le son pour la personne qui quitte (elle ne reçoit pas l'event socket).
    void playVoiceLeaveChime();
    setConnectedVoiceId(null);
    setConnectedVoiceGuildId(null);
    setMainPane("text");
    setSelectedDmPeerId(null);
    setCameraOn(false);
    setScreenOn(false);
  }, []);

  const handleSelectPublicLobby = useCallback(() => {
    // Salons du lobby tout de suite (ne pas attendre channels:config : courses possibles privé → public).
    setTextChannels(DEFAULT_TEXT.map((id) => ({ id, name: id })));
    setVoiceChannels(DEFAULT_VOICE.map((id) => ({ id, name: id })));
    setSelectedTextId("general");
    setAwaitingChannelSync(false);
    setMessages([]);
    setActiveGuildId(null);
    setConnectedVoiceId(null);
    setConnectedVoiceGuildId(null);
    setMainPane("text");
    setSelectedDmPeerId(null);
    setCameraOn(false);
    setScreenOn(false);
  }, []);

  const handleSelectPrivateGuild = useCallback((guildId) => {
    setAwaitingChannelSync(true);
    setTextChannels([]);
    setVoiceChannels([]);
    setSelectedTextId("");
    setMessages([]);
    setActiveGuildId(guildId);
    setConnectedVoiceId(null);
    setConnectedVoiceGuildId(null);
    setMainPane("text");
    setSelectedDmPeerId(null);
    setCameraOn(false);
    setScreenOn(false);
  }, []);

  const handleCreateGuildSubmit = useCallback(
    async (payload) => {
      const name = typeof payload === "string" ? payload : payload?.name ?? "";
      const iconOpts =
        typeof payload === "string"
          ? {}
          : { iconUrl: payload?.iconUrl ?? null, iconBrandKey: payload?.iconBrandKey ?? null };
      setSelectedTextId("");
      setMessages([]);
      const r = await createGuild(name, iconOpts);
      if (r?.ok && r.guildId) {
        setAwaitingChannelSync(true);
        setTextChannels([]);
        setVoiceChannels([]);
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
        setAwaitingChannelSync(true);
        setTextChannels([]);
        setVoiceChannels([]);
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

  const refreshGuildSocketChannels = useCallback(() => {
    if (socket.connected && activeGuildId) {
      socket.emit("guild:select", activeGuildId);
    }
  }, [socket, activeGuildId]);

  /** Liste salons serveur privé : uniquement Supabase (évite d’écraser avec le lobby public via le socket). */
  const loadGuildChannelsFromSupabase = useCallback(async () => {
    const gid = activeGuildId;
    if (!gid) return;
    if (!supabase) {
      setAwaitingChannelSync(false);
      return;
    }
    const seq = ++loadGuildChannelsSeqRef.current;
    const { data, error } = await supabase
      .from("guild_channels")
      .select("id, name, kind")
      .eq("guild_id", gid)
      .order("position", { ascending: true });
    if (seq !== loadGuildChannelsSeqRef.current) return;
    if (activeGuildIdRef.current !== gid) return;
    if (error) {
      console.warn("guild_channels client refresh", error.message);
      if (activeGuildIdRef.current === gid) setAwaitingChannelSync(false);
      refreshGuildSocketChannels();
      return;
    }
    const rows = data || [];
    const t = normalizeChannelList(
      rows.filter((c) => c.kind === "text").map((c) => ({ id: c.id, name: c.name }))
    );
    const v = normalizeChannelList(
      rows.filter((c) => c.kind === "voice").map((c) => ({ id: c.id, name: c.name }))
    );
    setTextChannels(t);
    setVoiceChannels(v);
    setSelectedTextId((prev) => {
      if (!t.length) return "";
      return t.some((c) => c.id === prev) ? prev : t[0].id;
    });
    setAwaitingChannelSync(false);
  }, [activeGuildId, supabase, refreshGuildSocketChannels]);

  useEffect(() => {
    if (!activeGuildId || !supabase) return;
    void loadGuildChannelsFromSupabase();
  }, [activeGuildId, supabase, loadGuildChannelsFromSupabase]);

  const afterGuildChannelsChange = useCallback(() => {
    if (!activeGuildId) {
      refreshGuildSocketChannels();
      return;
    }
    if (!supabase) {
      setAwaitingChannelSync(false);
      return;
    }
    void loadGuildChannelsFromSupabase();
  }, [activeGuildId, supabase, loadGuildChannelsFromSupabase, refreshGuildSocketChannels]);

  const handleDeleteGuildFromModal = useCallback(
    async (guildId) => {
      const r = await deleteGuild(guildId);
      if (r?.ok) {
        setManageGuildOpen(false);
        handleSelectPublicLobby();
      }
      return r;
    },
    [deleteGuild, handleSelectPublicLobby]
  );

  const selectedTextLabel = useMemo(() => {
    const c = textChannels.find((x) => x.id === selectedTextId);
    return c?.name ?? selectedTextId;
  }, [textChannels, selectedTextId]);

  const selectedVoiceLabel = useMemo(() => {
    if (!connectedVoiceId) return "";
    if (connectedVoiceId.startsWith("dm:")) {
      if (selectedDmPeer?.displayName) return `Appel privé · ${selectedDmPeer.displayName}`;
      return "Appel privé";
    }
    const c = voiceChannels.find((x) => x.id === connectedVoiceId);
    return c?.name ?? connectedVoiceId;
  }, [voiceChannels, connectedVoiceId, selectedDmPeer]);

  const serverSubtitle = useMemo(() => {
    if (!activeGuildId) return "Lobby public";
    const g = privateGuildsList.find((x) => x.id === activeGuildId);
    return g ? `Serveur · ${g.name}` : "Serveur privé";
  }, [activeGuildId, privateGuildsList]);

  const currentGuildName = useMemo(() => {
    if (!activeGuildId) return "";
    return privateGuildsList.find((x) => x.id === activeGuildId)?.name ?? "Serveur";
  }, [activeGuildId, privateGuildsList]);

  /** Rôle depuis la liste Supabase (fiable) ; le socket peut encore être null au premier rendu. */
  const effectiveGuildRole = useMemo(() => {
    if (!activeGuildId) return null;
    return privateGuildsList.find((g) => g.id === activeGuildId)?.myRole ?? myGuildRole ?? null;
  }, [activeGuildId, privateGuildsList, myGuildRole]);

  const canModerateGuild = Boolean(
    activeGuildId && (effectiveGuildRole === "owner" || effectiveGuildRole === "admin")
  );
  const isGuildOwner = effectiveGuildRole === "owner";

  const handleCreateGuildChannel = useCallback(
    async (kind, name) => {
      if (!activeGuildId) return { ok: false, message: "Aucun serveur sélectionné." };
      const r = await addGuildChannel(activeGuildId, kind, name);
      if (r.ok) afterGuildChannelsChange();
      return r;
    },
    [activeGuildId, addGuildChannel, afterGuildChannelsChange]
  );

  const handleDeleteGuildChannel = useCallback(
    async (channelId) => {
      if (!activeGuildId) return { ok: false, message: "Aucun serveur sélectionné." };
      const r = await deleteGuildChannel(activeGuildId, channelId);
      if (r.ok) {
        if (connectedVoiceId === channelId) {
          setConnectedVoiceId(null);
          setMainPane("text");
        }
        afterGuildChannelsChange();
      }
      return r;
    },
    [activeGuildId, deleteGuildChannel, afterGuildChannelsChange, connectedVoiceId]
  );

  const handleInviteToCurrentGuild = useCallback(
    async (inviteeUserId) => {
      if (!activeGuildId) return { ok: false, message: "Aucun serveur sélectionné." };
      return sendGuildInvite(activeGuildId, inviteeUserId);
    },
    [activeGuildId, sendGuildInvite]
  );

  const handleDeleteCurrentGuildQuick = useCallback(async () => {
    if (!activeGuildId || !isGuildOwner) return { ok: false, message: "Réservé au propriétaire." };
    const ok = window.confirm(
      `Supprimer définitivement le serveur « ${currentGuildName} » ?\nTous les salons, messages et membres seront effacés.`
    );
    if (!ok) return { ok: false, message: "Annulé." };
    const r = await handleDeleteGuildFromModal(activeGuildId);
    if (!r?.ok && r?.message) window.alert(r.message);
    return r;
  }, [activeGuildId, isGuildOwner, currentGuildName, handleDeleteGuildFromModal]);

  const handleSendFriendRequest = useCallback(
    async (raw) => {
      setFriendAddError(null);
      const r = await sendFriendRequest(raw);
      if (!r.ok) setFriendAddError(r.message);
      return r;
    },
    [sendFriendRequest]
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
        {useSupabaseAuth ? (
          <GuildServerRail
            activeGuildId={activeGuildId}
            privateGuilds={privateGuildsList}
            guildTablesMissing={guildTablesMissing}
            onSelectPublicLobby={handleSelectPublicLobby}
            onSelectPrivateGuild={handleSelectPrivateGuild}
            onOpenCreateGuild={() => setCreateGuildOpen(true)}
          />
        ) : null}
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
          onlineFriendIds={onlineUserIds}
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
          canModerateGuild={canModerateGuild}
          isGuildOwner={isGuildOwner}
          onCreateGuildChannel={handleCreateGuildChannel}
          onDeleteGuildChannel={handleDeleteGuildChannel}
          onInviteToGuild={handleInviteToCurrentGuild}
          onDeleteCurrentGuild={() => void handleDeleteCurrentGuildQuick()}
          incomingGuildInvites={guildIncomingInvites}
          onOpenManageGuild={() => setManageGuildOpen(true)}
          onAcceptGuildInvite={(id) => void handleAcceptGuildInvite(id)}
          onDeclineGuildInvite={(id) => void handleDeclineGuildInvite(id)}
          guildTablesMissing={guildTablesMissing}
          guildsLoadError={guildsLoadError}
        />
        <main className="flex min-w-0 flex-1 flex-col">
          {mainPane === "text" && !selectedTextId.trim() && awaitingChannelSync ? (
            <div className="flex min-h-0 flex-1 flex-col bg-discord-bg">
              <header className="flex h-12 shrink-0 items-center justify-end border-b border-discord-border bg-discord-elevated px-3">
                {connectedUsersTab}
              </header>
              <div className="flex flex-1 items-center justify-center text-sm text-discord-muted">
                Chargement des salons…
              </div>
            </div>
          ) : null}
          {mainPane === "text" &&
          !selectedTextId.trim() &&
          !awaitingChannelSync &&
          activeGuildId &&
          textChannels.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col bg-discord-bg">
              <header className="flex h-12 shrink-0 items-center justify-end border-b border-discord-border bg-discord-elevated px-3">
                {connectedUsersTab}
              </header>
              <div className="flex max-w-md flex-col items-center justify-center gap-3 px-6 text-center text-sm text-discord-muted">
                <p className="text-discord-text">Ce serveur n’a encore aucun salon texte.</p>
                <p>
                  Ouvre <span className="font-medium text-discord-text">Gestion du serveur</span> dans la barre
                  latérale pour créer ton premier salon.
                </p>
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
                selfDisplayName={effectiveIdentity.displayName}
                selfAvatarUrl={effectiveIdentity.avatarUrl}
                selfAvatarColor={effectiveIdentity.avatarColor}
                selfAvatarEmoji={effectiveIdentity.avatarEmoji}
                messages={dmMessages}
                loading={dmLoading}
                error={dmError}
                ready={dmReady}
                headerTrailing={connectedUsersTab}
                peerOnline={onlineUserIds.has(selectedDmPeerId)}
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
              profile={effectiveIdentity}
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
        profile={effectiveIdentity}
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
          myRole={effectiveGuildRole}
          myUserId={myUserId}
          friends={friends}
          onClose={() => setManageGuildOpen(false)}
          onChanged={() => void reloadGuilds()}
          onInvite={handleGuildInviteFromModal}
          onDeleteChannel={handleDeleteGuildChannel}
          onRefreshChannels={afterGuildChannelsChange}
          onDeleteGuild={handleDeleteGuildFromModal}
        />
      ) : null}
    </div>
  );
}
