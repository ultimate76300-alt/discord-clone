import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_VOICE_SETTINGS, SCREEN_SHARE_PRESETS } from "../lib/voiceSettings";

function getIceServers() {
  const raw = import.meta.env.VITE_ICE_SERVERS;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.warn("VITE_ICE_SERVERS is not valid JSON", e);
    }
  }
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
}

function newPeerConnection() {
  return new RTCPeerConnection({ iceServers: getIceServers() });
}

function shouldOffer(myId, peerId) {
  return myId < peerId;
}

function buildAudioConstraints(settings) {
  const audio = {
    echoCancellation: settings.echoCancellation,
    noiseSuppression: settings.noiseSuppression,
    autoGainControl: settings.autoGainControl,
  };
  if (settings.micDeviceId) {
    audio.deviceId = { exact: settings.micDeviceId };
  }
  const supported = navigator.mediaDevices.getSupportedConstraints?.() || {};
  if (settings.voiceIsolation && supported.voiceIsolation) {
    audio.voiceIsolation = true;
  }
  return audio;
}

export function useVoiceConnection(socket, voiceChannelId, profile, options = {}) {
  const { onScreenShareEnd, micSettings = DEFAULT_VOICE_SETTINGS } = options;
  const [remoteStreams, setRemoteStreams] = useState(() => new Map());
  const [peerMeta, setPeerMeta] = useState(() => new Map());
  const [localRenderTick, setLocalRenderTick] = useState(0);
  const localStreamRef = useRef(null);
  const pcsRef = useRef(new Map());
  const voiceChannelRef = useRef(null);
  const renegotiateTimeoutRef = useRef(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const micSettingsRef = useRef(micSettings);
  micSettingsRef.current = micSettings;

  const micCtxRef = useRef(null);
  const micGainNodeRef = useRef(null);
  const micSourceNodeRef = useRef(null);
  const rawMicStreamRef = useRef(null);

  const micConstraintKey = useMemo(
    () =>
      JSON.stringify({
        d: micSettings.micDeviceId,
        e: micSettings.echoCancellation,
        n: micSettings.noiseSuppression,
        a: micSettings.autoGainControl,
        v: micSettings.voiceIsolation,
      }),
    [
      micSettings.micDeviceId,
      micSettings.echoCancellation,
      micSettings.noiseSuppression,
      micSettings.autoGainControl,
      micSettings.voiceIsolation,
    ]
  );

  const bumpLocal = useCallback(() => setLocalRenderTick((n) => n + 1), []);

  const cleanupPeer = useCallback((peerId) => {
    const pc = pcsRef.current.get(peerId);
    if (pc) {
      pc.close();
      pcsRef.current.delete(peerId);
    }
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
    setPeerMeta((prev) => {
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  const stopMicPipeline = useCallback(() => {
    if (micSourceNodeRef.current) {
      try {
        micSourceNodeRef.current.disconnect();
      } catch {
        /* ignore */
      }
      micSourceNodeRef.current = null;
    }
    if (micGainNodeRef.current) {
      try {
        micGainNodeRef.current.disconnect();
      } catch {
        /* ignore */
      }
      micGainNodeRef.current = null;
    }
    if (rawMicStreamRef.current) {
      rawMicStreamRef.current.getTracks().forEach((t) => t.stop());
      rawMicStreamRef.current = null;
    }
  }, []);

  const closeAudioContext = useCallback(async () => {
    stopMicPipeline();
    if (micCtxRef.current && micCtxRef.current.state !== "closed") {
      try {
        await micCtxRef.current.close();
      } catch {
        /* ignore */
      }
    }
    micCtxRef.current = null;
  }, [stopMicPipeline]);

  const cleanupAll = useCallback(() => {
    if (renegotiateTimeoutRef.current) {
      clearTimeout(renegotiateTimeoutRef.current);
      renegotiateTimeoutRef.current = null;
    }
    for (const id of [...pcsRef.current.keys()]) cleanupPeer(id);
    void closeAudioContext();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  }, [cleanupPeer, closeAudioContext]);

  const ensureMicTrackOnStream = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    for (const t of [...stream.getAudioTracks()]) {
      stream.removeTrack(t);
      t.stop();
    }
    stopMicPipeline();

    let ctx = micCtxRef.current;
    if (!ctx || ctx.state === "closed") {
      ctx = new AudioContext();
      micCtxRef.current = ctx;
    }
    if (ctx.state === "suspended") {
      await ctx.resume().catch(() => {});
    }

    const constraints = buildAudioConstraints(micSettingsRef.current);
    let raw;
    try {
      raw = await navigator.mediaDevices.getUserMedia({ audio: constraints, video: false });
    } catch (e) {
      if (constraints.voiceIsolation) {
        const { voiceIsolation: _v, ...rest } = constraints;
        raw = await navigator.mediaDevices.getUserMedia({ audio: rest, video: false });
      } else {
        throw e;
      }
    }
    rawMicStreamRef.current = raw;

    const rawTrack = raw.getAudioTracks()[0];
    const source = ctx.createMediaStreamSource(new MediaStream([rawTrack]));
    const gain = ctx.createGain();
    gain.gain.value = micSettingsRef.current.inputGain ?? 1;
    const dest = ctx.createMediaStreamDestination();
    source.connect(gain);
    gain.connect(dest);

    micSourceNodeRef.current = source;
    micGainNodeRef.current = gain;

    const out = dest.stream.getAudioTracks()[0];
    stream.addTrack(out);
  }, [stopMicPipeline]);

  const getLocalStream = useCallback(async () => {
    if (!localStreamRef.current) {
      localStreamRef.current = new MediaStream();
    }
    await ensureMicTrackOnStream();
    return localStreamRef.current;
  }, [ensureMicTrackOnStream]);

  const attachLocalTracks = useCallback((pc) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    for (const track of stream.getTracks()) {
      const exists = pc.getSenders().some((s) => s.track === track);
      if (!exists) pc.addTrack(track, stream);
    }
  }, []);

  const renegotiatePeers = useCallback(async () => {
    const ch = voiceChannelRef.current;
    if (!ch || !socket?.connected) return;
    for (const [peerId, pc] of pcsRef.current.entries()) {
      if (pc.signalingState !== "stable") continue;
      try {
        pc._suppressNegotiation = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc:offer", { to: peerId, sdp: offer, channelId: ch });
      } catch (e) {
        console.error("renegotiatePeers", peerId, e);
      } finally {
        pc._suppressNegotiation = false;
      }
    }
  }, [socket]);

  const scheduleRenegotiate = useCallback(() => {
    if (renegotiateTimeoutRef.current) clearTimeout(renegotiateTimeoutRef.current);
    renegotiateTimeoutRef.current = setTimeout(() => {
      renegotiateTimeoutRef.current = null;
      void renegotiatePeers();
    }, 200 + Math.floor(Math.random() * 350));
  }, [renegotiatePeers]);

  const createPeerConnection = useCallback(
    (peerId) => {
      if (pcsRef.current.has(peerId)) return pcsRef.current.get(peerId);
      const pc = newPeerConnection();
      pcsRef.current.set(peerId, pc);

      pc.onicecandidate = (ev) => {
        if (ev.candidate && socket?.connected) {
          socket.emit("webrtc:ice", { to: peerId, candidate: ev.candidate });
        }
      };

      pc.ontrack = (ev) => {
        const [stream] = ev.streams;
        if (!stream) return;
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(peerId, stream);
          return next;
        });
      };

      attachLocalTracks(pc);
      return pc;
    },
    [attachLocalTracks, socket]
  );

  const sendOffer = useCallback(
    async (peerId) => {
      const ch = voiceChannelRef.current;
      if (!ch || !socket?.connected) return;
      const pc = createPeerConnection(peerId);
      attachLocalTracks(pc);
      try {
        pc._suppressNegotiation = true;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("webrtc:offer", { to: peerId, sdp: offer, channelId: ch });
      } catch (e) {
        console.error("sendOffer", e);
      } finally {
        pc._suppressNegotiation = false;
      }
    },
    [attachLocalTracks, createPeerConnection, socket]
  );

  const syncTracksToPeersInner = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audio = stream.getAudioTracks()[0];
    const video = stream.getVideoTracks()[0];
    for (const pc of pcsRef.current.values()) {
      if (audio) {
        const aSender = pc.getSenders().find((s) => s.track?.kind === "audio");
        if (aSender) {
          if (aSender.track !== audio) aSender.replaceTrack(audio);
        } else {
          pc.addTrack(audio, stream);
        }
      }
      const vSender = pc.getSenders().find((s) => s.track?.kind === "video");
      if (video) {
        if (vSender) vSender.replaceTrack(video);
        else pc.addTrack(video, stream);
      } else if (vSender?.track) {
        vSender.replaceTrack(null);
      }
    }
    bumpLocal();
  }, [bumpLocal]);

  const syncTracksToPeers = useCallback(() => {
    syncTracksToPeersInner();
    if (pcsRef.current.size > 0) scheduleRenegotiate();
  }, [syncTracksToPeersInner, scheduleRenegotiate]);

  useEffect(() => {
    voiceChannelRef.current = voiceChannelId;
  }, [voiceChannelId]);

  useEffect(() => {
    if (micGainNodeRef.current) {
      micGainNodeRef.current.gain.value = micSettings.inputGain ?? 1;
    }
  }, [micSettings.inputGain]);

  useEffect(() => {
    if (!voiceChannelId || !localStreamRef.current) return;
    void (async () => {
      try {
        await ensureMicTrackOnStream();
        syncTracksToPeersInner();
        if (pcsRef.current.size > 0) scheduleRenegotiate();
      } catch (e) {
        console.error("mic settings / device change", e);
      }
    })();
  }, [
    voiceChannelId,
    micConstraintKey,
    ensureMicTrackOnStream,
    syncTracksToPeersInner,
    scheduleRenegotiate,
  ]);

  useEffect(() => {
    if (!socket) return;

    const onPeers = ({ channelId, peers }) => {
      if (channelId !== voiceChannelRef.current) return;
      const myId = socket.id;
      for (const p of peers) {
        setPeerMeta((prev) => {
          const next = new Map(prev);
          next.set(p.socketId, {
            displayName: p.displayName,
            avatarColor: p.avatarColor,
            avatarEmoji: p.avatarEmoji,
          });
          return next;
        });
        if (shouldOffer(myId, p.socketId)) {
          sendOffer(p.socketId);
        }
      }
    };

    const onPeerJoined = ({ channelId, peer }) => {
      if (channelId !== voiceChannelRef.current) return;
      const myId = socket.id;
      setPeerMeta((prev) => {
        const next = new Map(prev);
        next.set(peer.socketId, {
          displayName: peer.displayName,
          avatarColor: peer.avatarColor,
          avatarEmoji: peer.avatarEmoji,
        });
        return next;
      });
      if (shouldOffer(myId, peer.socketId)) {
        sendOffer(peer.socketId);
      }
    };

    const onPeerLeft = ({ socketId }) => {
      cleanupPeer(socketId);
    };

    const onOffer = async ({ from, sdp }) => {
      if (!voiceChannelRef.current) return;
      const pc = createPeerConnection(from);
      attachLocalTracks(pc);
      try {
        pc._suppressNegotiation = true;
        if (pc.signalingState === "have-local-offer") {
          try {
            await pc.setLocalDescription({ type: "rollback" });
          } catch {
            /* ignore */
          }
        }
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("webrtc:answer", { to: from, sdp: answer });
      } catch (e) {
        console.error("onOffer", e);
      } finally {
        pc._suppressNegotiation = false;
      }
    };

    const onAnswer = async ({ from, sdp }) => {
      const pc = pcsRef.current.get(from);
      if (!pc) return;
      try {
        pc._suppressNegotiation = true;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      } catch (e) {
        console.error("onAnswer", e);
      } finally {
        pc._suppressNegotiation = false;
      }
    };

    const onIce = async ({ from, candidate }) => {
      const pc = pcsRef.current.get(from);
      if (!pc || !candidate) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("onIce", e);
      }
    };

    socket.on("voice:peers", onPeers);
    socket.on("voice:peer-joined", onPeerJoined);
    socket.on("voice:peer-left", onPeerLeft);
    socket.on("webrtc:offer", onOffer);
    socket.on("webrtc:answer", onAnswer);
    socket.on("webrtc:ice", onIce);

    return () => {
      socket.off("voice:peers", onPeers);
      socket.off("voice:peer-joined", onPeerJoined);
      socket.off("voice:peer-left", onPeerLeft);
      socket.off("webrtc:offer", onOffer);
      socket.off("webrtc:answer", onAnswer);
      socket.off("webrtc:ice", onIce);
    };
  }, [socket, cleanupPeer, createPeerConnection, attachLocalTracks, sendOffer]);

  useEffect(() => {
    if (!socket || !voiceChannelId) {
      cleanupAll();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        await getLocalStream();
        if (cancelled) return;
        socket.emit("identity:set", {
          clientId: profileRef.current.clientId,
          displayName: profileRef.current.displayName,
          avatarColor: profileRef.current.avatarColor,
          avatarEmoji: profileRef.current.avatarEmoji,
        });
        socket.emit("voice:join", voiceChannelId);
      } catch (e) {
        console.error("voice join", e);
      }
    })();

    return () => {
      cancelled = true;
      socket.emit("voice:leave");
      cleanupAll();
    };
  }, [socket, voiceChannelId, getLocalStream, cleanupAll]);

  const setMuted = useCallback((muted) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = !muted;
    });
  }, []);

  const toggleCamera = useCallback(
    async (enabled) => {
      const stream = await getLocalStream();
      const videoTracks = stream.getVideoTracks();
      if (enabled) {
        if (videoTracks.length && videoTracks[0].readyState === "live") return;
        for (const t of videoTracks) {
          t.stop();
          stream.removeTrack(t);
        }
        const cam = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
          audio: false,
        });
        const vt = cam.getVideoTracks()[0];
        stream.addTrack(vt);
      } else {
        videoTracks.forEach((t) => {
          t.stop();
          stream.removeTrack(t);
        });
      }
      syncTracksToPeers();
    },
    [getLocalStream, syncTracksToPeers]
  );

  const stopAllVideoTracks = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => {
      t.stop();
      stream.removeTrack(t);
    });
    syncTracksToPeers();
  }, [syncTracksToPeers]);

  const toggleScreenShare = useCallback(
    async (enabled, preset) => {
      const stream = await getLocalStream();
      const key = preset || micSettingsRef.current.screenPreset || "1080p30";
      const videoConstraints = SCREEN_SHARE_PRESETS[key] || SCREEN_SHARE_PRESETS["1080p30"];
      if (enabled) {
        for (const t of stream.getVideoTracks()) {
          t.stop();
          stream.removeTrack(t);
        }
        const screen = await navigator.mediaDevices.getDisplayMedia({
          video: videoConstraints,
          audio: false,
        });
        const vt = screen.getVideoTracks()[0];
        stream.addTrack(vt);
        vt.addEventListener("ended", () => {
          stopAllVideoTracks();
          onScreenShareEnd?.();
        });
      } else {
        for (const t of stream.getVideoTracks()) {
          t.stop();
          stream.removeTrack(t);
        }
      }
      syncTracksToPeers();
    },
    [getLocalStream, syncTracksToPeers, stopAllVideoTracks, onScreenShareEnd]
  );

  return {
    localStreamRef,
    localRenderTick,
    remoteStreams,
    peerMeta,
    getLocalStream,
    setMuted,
    toggleCamera,
    toggleScreenShare,
    stopAllVideoTracks,
    syncTracksToPeers,
    cleanupAll,
  };
}
