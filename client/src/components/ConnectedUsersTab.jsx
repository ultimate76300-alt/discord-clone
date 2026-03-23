import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Onglet en haut à droite : liste des personnes connectées (pseudo), mise à jour temps réel.
 */
export function ConnectedUsersTab({ socket, connected, myClientId }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState([]);
  const rootRef = useRef(null);

  useEffect(() => {
    const onUpdate = (payload) => {
      const list = payload?.users;
      setUsers(Array.isArray(list) ? list : []);
    };
    socket.on("presence:update", onUpdate);
    return () => socket.off("presence:update", onUpdate);
  }, [socket]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const mySocketId = socket.id;
  const isSelf = useCallback(
    (u) => u.clientId === myClientId || u.socketId === mySocketId,
    [myClientId, mySocketId]
  );

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!connected}
        className="flex items-center gap-2 rounded-lg border border-white/10 bg-discord-sidebar px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-discord-hover disabled:cursor-not-allowed disabled:opacity-40"
        title={connected ? "Qui est en ligne" : "Hors ligne"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className="flex h-2 w-2 rounded-full bg-discord-green" aria-hidden />
        <span>En ligne</span>
        <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-xs tabular-nums text-discord-muted">
          {users.length}
        </span>
      </button>

      {open && connected ? (
        <div
          className="absolute right-0 top-[calc(100%+6px)] z-[60] w-[min(100vw-1.5rem,18rem)] rounded-lg border border-white/10 bg-discord-sidebar py-2 shadow-xl"
          role="dialog"
          aria-label="Utilisateurs connectés"
        >
          <div className="border-b border-white/10 px-3 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-discord-muted">
              Connectés maintenant
            </p>
            <p className="mt-0.5 text-[11px] text-discord-muted">
              Temps réel · pseudo enregistré sur l’appareil
            </p>
          </div>
          <ul className="max-h-[min(60dvh,20rem)] overflow-y-auto scroll-discord px-2 py-1">
            {users.length === 0 ? (
              <li className="px-2 py-4 text-center text-sm text-discord-muted">
                Personne d’autre pour l’instant
              </li>
            ) : (
              users.map((u) => {
                const self = isSelf(u);
                return (
                  <li
                    key={u.socketId}
                    className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-discord-hover/80"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base"
                      style={{ backgroundColor: u.avatarColor }}
                    >
                      {u.avatarEmoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-white">
                          {u.displayName}
                        </span>
                        {self ? (
                          <span className="shrink-0 rounded bg-discord-accent/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-discord-accent">
                            Vous
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
