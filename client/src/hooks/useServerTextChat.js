import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildTextChatTarget,
  eventMatchesChatTarget,
  textChatTargetKey,
  unwrapSocketData,
} from "../lib/textChatProtocol";

/**
 * Chat texte synchronisé avec le socket : public (mémoire serveur) et privé (Supabase).
 * Les écouteurs sont posés dès que `socket` existe (avant connect dans le parent).
 * Le parent doit émettre `guild:select` puis `text:join` dans le même effet après `connect`.
 */
export function useServerTextChat({ socket, activeGuildId, selectedTextId }) {
  const [messages, setMessages] = useState([]);
  const targetRef = useRef(null);
  const lastKeyRef = useRef("");

  const target = buildTextChatTarget(activeGuildId, selectedTextId);
  targetRef.current = target;

  const key = textChatTargetKey(target);
  useEffect(() => {
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;
    setMessages([]);
  }, [key]);

  useEffect(() => {
    const onHistory = (raw) => {
      const pkt = unwrapSocketData(raw);
      const t = targetRef.current;
      if (!t || !eventMatchesChatTarget(t, pkt)) return;
      const list = pkt.messages;
      // #region agent log
      fetch("http://127.0.0.1:7417/ingest/f928b117-4eb1-4e9d-bfda-60aee881559e", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "4bd8e4" },
        body: JSON.stringify({
          sessionId: "4bd8e4",
          runId: "site-empty-slow",
          hypothesisId: "H4",
          location: "client/src/hooks/useServerTextChat.js:onHistory",
          message: "Text history received",
          data: { scope: pkt?.scope || null, guildId: pkt?.guildId || null, count: Array.isArray(list) ? list.length : -1 },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setMessages(Array.isArray(list) ? list : []);
    };

    const onMessage = (raw) => {
      const pkt = unwrapSocketData(raw);
      const t = targetRef.current;
      if (!t || !eventMatchesChatTarget(t, pkt)) return;
      if (!pkt.message) return;
      setMessages((prev) => [...prev, pkt.message]);
    };

    socket.on("text:history", onHistory);
    socket.on("text:message", onMessage);
    return () => {
      socket.off("text:history", onHistory);
      socket.off("text:message", onMessage);
    };
  }, [socket]);

  const sendChat = useCallback(
    (text) => {
      socket.emit("text:message", { text });
    },
    [socket]
  );

  return { messages, sendChat, setMessages };
}
