import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

function rowToMessage(row) {
  const m = {
    id: row.id,
    body: row.body,
    sender_id: row.sender_id,
    created_at: row.created_at,
  };
  if (row.file_url) {
    m.file_url = row.file_url;
    m.file_name = row.file_name;
    m.file_type = row.file_type;
    m.expires_at = row.expires_at;
  }
  return m;
}

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
      .select("id, body, sender_id, created_at, file_url, file_name, file_type, expires_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true })
      .limit(400);
    if (mErr) throw mErr;
    setMessages((data || []).map(rowToMessage));
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
                return [...prev, rowToMessage(row)];
              });
            }
          )
          .on(
            "postgres_changes",
            {
              event: "DELETE",
              schema: "public",
              table: "dm_messages",
              filter: `conversation_id=eq.${conv}`,
            },
            (payload) => {
              const oldRow = payload.old;
              if (!oldRow?.id) return;
              setMessages((prev) => prev.filter((m) => m.id !== oldRow.id));
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
    async (text, attachmentMeta) => {
      if (!supabase || !conversationId || !myUserId) return;
      const t = String(text || "").trim().slice(0, 2000);
      const hasFile =
        attachmentMeta &&
        typeof attachmentMeta.url === "string" &&
        typeof attachmentMeta.storagePath === "string";
      if (!t && !hasFile) return;
      const body = t || (hasFile ? "📎" : "");
      const row = {
        conversation_id: conversationId,
        sender_id: myUserId,
        body,
        file_url: hasFile ? attachmentMeta.url : null,
        file_name: hasFile ? String(attachmentMeta.fileName || "fichier").slice(0, 256) : null,
        file_type: hasFile ? String(attachmentMeta.mimeType || "").slice(0, 128) || null : null,
        file_storage_path: hasFile ? attachmentMeta.storagePath : null,
      };
      const { error: insErr } = await supabase.from("dm_messages").insert(row);
      if (insErr) throw insErr;
    },
    [conversationId, myUserId]
  );

  return { conversationId, messages, loading, error, ready, sendMessage, refetch: () => fetchMessages(conversationId) };
}
