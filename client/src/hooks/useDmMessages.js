import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export function useDmMessages(enabled, myUserId, peerUserId) {
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ready, setReady] = useState(false);

  const fetchMessages = useCallback(async (convId) => {
    if (!supabase || !convId) return;
    const { data, error: mErr } = await supabase
      .from("dm_messages")
      .select("id, body, sender_id, created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(400);
    if (mErr) throw mErr;
    setMessages(data || []);
  }, []);

  useEffect(() => {
    if (!enabled || !myUserId || !peerUserId || !supabase) {
      setConversationId(null);
      setMessages([]);
      setError(null);
      setReady(false);
      return;
    }

    let cancelled = false;
    let channel = null;

    (async () => {
      setLoading(true);
      setError(null);
      setReady(false);
      try {
        const { data: cid, error: rpcErr } = await supabase.rpc("get_or_create_dm", {
          other_user_id: peerUserId,
        });
        if (rpcErr) throw rpcErr;
        if (cancelled) return;
        const conv = typeof cid === "string" ? cid : cid;
        setConversationId(conv);
        await fetchMessages(conv);
        if (cancelled) return;

        channel = supabase
          .channel(`dm-msg:${conv}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "dm_messages",
              filter: `conversation_id=eq.${conv}`,
            },
            (payload) => {
              const row = payload.new;
              if (!row?.id) return;
              setMessages((prev) => {
                if (prev.some((m) => m.id === row.id)) return prev;
                return [
                  ...prev,
                  {
                    id: row.id,
                    body: row.body,
                    sender_id: row.sender_id,
                    created_at: row.created_at,
                  },
                ];
              });
            }
          )
          .subscribe();
        setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e?.message || "Impossible d’ouvrir la conversation");
          setConversationId(null);
          setMessages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled, myUserId, peerUserId, fetchMessages]);

  const sendMessage = useCallback(
    async (text) => {
      if (!supabase || !conversationId || !myUserId) return;
      const body = String(text || "").trim().slice(0, 2000);
      if (!body) return;
      const { error: insErr } = await supabase.from("dm_messages").insert({
        conversation_id: conversationId,
        sender_id: myUserId,
        body,
      });
      if (insErr) throw insErr;
    },
    [conversationId, myUserId]
  );

  return { conversationId, messages, loading, error, ready, sendMessage, refetch: () => fetchMessages(conversationId) };
}
