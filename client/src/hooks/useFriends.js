import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapProfiles(rows) {
  const m = new Map();
  for (const p of rows || []) {
    m.set(p.id, {
      id: p.id,
      displayName: p.display_name || "Utilisateur",
      avatarUrl: p.avatar_url || undefined,
    });
  }
  return m;
}

export function useFriends(enabled, myUserId) {
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!enabled || !myUserId || !supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data: rows, error: qErr } = await supabase
        .from("friend_requests")
        .select("id, from_id, to_id, status")
        .or(`from_id.eq.${myUserId},to_id.eq.${myUserId}`);

      if (qErr) throw qErr;

      const accepted = (rows || []).filter((r) => r.status === "accepted");
      const pendingIn = (rows || []).filter(
        (r) => r.status === "pending" && r.to_id === myUserId
      );
      const pendingOut = (rows || []).filter(
        (r) => r.status === "pending" && r.from_id === myUserId
      );

      const ids = new Set();
      for (const r of accepted) {
        ids.add(r.from_id === myUserId ? r.to_id : r.from_id);
      }
      for (const r of pendingIn) ids.add(r.from_id);
      for (const r of pendingOut) ids.add(r.to_id);

      let profileMap = new Map();
      if (ids.size > 0) {
        const { data: profs, error: pErr } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", [...ids]);
        if (pErr) throw pErr;
        profileMap = mapProfiles(profs);
      }

      setFriends(
        accepted.map((r) => {
          const oid = r.from_id === myUserId ? r.to_id : r.from_id;
          return profileMap.get(oid) || { id: oid, displayName: "Utilisateur" };
        })
      );
      setIncoming(
        pendingIn.map((r) => ({
          requestId: r.id,
          fromId: r.from_id,
          ...(profileMap.get(r.from_id) || {
            id: r.from_id,
            displayName: "Utilisateur",
          }),
        }))
      );
      setOutgoing(
        pendingOut.map((r) => ({
          requestId: r.id,
          toId: r.to_id,
          ...(profileMap.get(r.to_id) || { id: r.to_id, displayName: "Utilisateur" }),
        }))
      );
    } catch (e) {
      setError(e?.message || "Impossible de charger les amis");
      setFriends([]);
      setIncoming([]);
      setOutgoing([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, myUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!enabled || !myUserId || !supabase) return;
    const ch = supabase
      .channel(`friends:${myUserId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_requests",
          filter: `from_id=eq.${myUserId}`,
        },
        () => void load()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_requests",
          filter: `to_id=eq.${myUserId}`,
        },
        () => void load()
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [enabled, myUserId, load]);

  const sendFriendRequest = useCallback(
    async (rawTargetId) => {
      if (!supabase || !myUserId) return { ok: false, message: "Non connecté" };
      const tid = String(rawTargetId || "").trim();
      if (!UUID_RE.test(tid)) {
        return { ok: false, message: "ID invalide (UUID attendu)." };
      }
      if (tid === myUserId) {
        return { ok: false, message: "Tu ne peux pas t’ajouter toi-même." };
      }

      const { data: existing, error: exErr } = await supabase
        .from("friend_requests")
        .select("id, status, from_id, to_id")
        .or(
          `and(from_id.eq.${myUserId},to_id.eq.${tid}),and(from_id.eq.${tid},to_id.eq.${myUserId})`
        );

      if (exErr) return { ok: false, message: exErr.message };

      for (const r of existing || []) {
        if (r.status === "accepted") {
          return { ok: false, message: "Vous êtes déjà amis." };
        }
        if (r.status === "pending") {
          if (r.from_id === myUserId && r.to_id === tid) {
            return { ok: false, message: "Demande déjà envoyée." };
          }
          if (r.from_id === tid && r.to_id === myUserId) {
            return { ok: false, message: "Cette personne t’a déjà invité — accepte la demande." };
          }
        }
      }

      const { error: insErr } = await supabase.from("friend_requests").insert({
        from_id: myUserId,
        to_id: tid,
        status: "pending",
      });
      if (insErr) return { ok: false, message: insErr.message };
      await load();
      return { ok: true };
    },
    [myUserId, load]
  );

  const acceptRequest = useCallback(
    async (requestId) => {
      if (!supabase) return;
      const { error: uErr } = await supabase
        .from("friend_requests")
        .update({ status: "accepted" })
        .eq("id", requestId)
        .eq("to_id", myUserId);
      if (uErr) throw uErr;
      await load();
    },
    [myUserId, load]
  );

  const declineRequest = useCallback(
    async (requestId) => {
      if (!supabase) return;
      const { error: dErr } = await supabase
        .from("friend_requests")
        .delete()
        .eq("id", requestId)
        .eq("to_id", myUserId)
        .eq("status", "pending");
      if (dErr) throw dErr;
      await load();
    },
    [myUserId, load]
  );

  const cancelOutgoing = useCallback(
    async (requestId) => {
      if (!supabase) return;
      const { error: dErr } = await supabase
        .from("friend_requests")
        .delete()
        .eq("id", requestId)
        .eq("from_id", myUserId)
        .eq("status", "pending");
      if (dErr) throw dErr;
      await load();
    },
    [myUserId, load]
  );

  return {
    friends,
    incoming,
    outgoing,
    loading,
    error,
    reload: load,
    sendFriendRequest,
    acceptRequest,
    declineRequest,
    cancelOutgoing,
  };
}
