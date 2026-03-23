import { useEffect, useRef, useState } from "react";
import { formatMessageTime } from "../lib/time";
import { apiUploadChatFile } from "../lib/backendApi";
import { AvatarBubble } from "./AvatarBubble";
import { ChatMessageAttachment } from "./ChatMessageAttachment";
import { EmojiPicker } from "./EmojiPicker";

function expiresAtToMs(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

export function DmChatView({
  peerDisplayName,
  peerAvatarUrl,
  selfUserId,
  selfDisplayName,
  selfAvatarUrl,
  selfAvatarColor,
  selfAvatarEmoji,
  messages,
  loading,
  error,
  ready,
  onSend,
  headerTrailing,
  peerOnline = false,
}) {
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const [attachmentMeta, setAttachmentMeta] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadErr, setUploadErr] = useState(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function onPickFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !ready) return;
    setUploadErr(null);
    setUploadBusy(true);
    setAttachmentMeta(null);
    try {
      const meta = await apiUploadChatFile(f);
      setAttachmentMeta({
        url: meta.url,
        storagePath: meta.storagePath,
        fileName: meta.fileName,
        mimeType: meta.mimeType,
      });
    } catch (err) {
      setUploadErr(err?.message || "Upload impossible");
    } finally {
      setUploadBusy(false);
    }
  }

  function senderLabel(senderId) {
    if (senderId === selfUserId) return selfDisplayName || "Vous";
    return peerDisplayName || "Ami";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const el = inputRef.current;
    if (!el || !ready) return;
    const text = el.value.trim();
    if (!text && !attachmentMeta) return;
    try {
      await onSend({ text, attachment: attachmentMeta || undefined });
      el.value = "";
      setAttachmentMeta(null);
      setUploadErr(null);
    } catch {
      /* parent peut afficher une erreur */
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-discord-bg">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-discord-border bg-discord-elevated px-4">
        <span className="shrink-0 text-lg text-discord-muted" aria-hidden>
          @
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <h2 className="min-w-0 truncate text-sm font-bold text-discord-text">{peerDisplayName}</h2>
          <span className="shrink-0 text-xs text-discord-muted">
            {peerOnline ? "En ligne" : "Hors ligne"}
          </span>
        </div>
        {headerTrailing ? <div className="shrink-0">{headerTrailing}</div> : null}
      </header>

      <div className="scroll-discord flex-1 overflow-y-auto px-4 py-4">
        {error ? (
          <div className="mb-4 rounded-lg border border-red-500/35 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        ) : null}
        {loading && !ready ? (
          <p className="text-sm text-discord-muted">Ouverture de la conversation…</p>
        ) : null}
        <ul className="space-y-4">
          {messages.map((m) => {
            const mine = m.sender_id === selfUserId;
            const expMs = expiresAtToMs(m.expires_at);
            return (
              <li key={m.id} className="group flex gap-3">
                <AvatarBubble
                  avatarUrl={mine ? selfAvatarUrl : peerAvatarUrl}
                  avatarColor={mine ? selfAvatarColor : "#5865f2"}
                  avatarEmoji={mine ? selfAvatarEmoji : "👤"}
                  className="h-10 w-10"
                  textClassName="text-lg"
                  title={senderLabel(m.sender_id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-discord-text">{senderLabel(m.sender_id)}</span>
                    <time
                      className="text-xs text-discord-muted"
                      dateTime={new Date(m.created_at).toISOString()}
                    >
                      {formatMessageTime(new Date(m.created_at).getTime())}
                    </time>
                  </div>
                  {m.body && m.body !== "📎" ? (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] text-discord-text">
                      {m.body}
                    </p>
                  ) : null}
                  {m.file_url ? (
                    <ChatMessageAttachment
                      fileUrl={m.file_url}
                      fileName={m.file_name}
                      fileType={m.file_type}
                      expiresAtMs={expMs}
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="shrink-0 border-t border-discord-border bg-discord-bg p-4"
      >
        {attachmentMeta ? (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-discord-input px-3 py-2 text-xs text-discord-text ring-1 ring-discord-border">
            <span className="min-w-0 truncate">📎 {attachmentMeta.fileName}</span>
            <button
              type="button"
              onClick={() => setAttachmentMeta(null)}
              className="shrink-0 text-discord-muted hover:text-red-300"
            >
              Retirer
            </button>
          </div>
        ) : null}
        {uploadErr ? <p className="mb-2 text-xs text-red-400">{uploadErr}</p> : null}
        <div className="flex items-center gap-1 rounded-lg bg-discord-input px-1 py-1 ring-1 ring-discord-border/80 sm:px-2">
          <input ref={fileRef} type="file" className="hidden" onChange={onPickFile} />
          <button
            type="button"
            disabled={!ready || uploadBusy}
            onClick={() => fileRef.current?.click()}
            title="Joindre un fichier"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-lg text-discord-muted transition hover:bg-discord-hover hover:text-discord-text disabled:opacity-40"
          >
            {uploadBusy ? "…" : "📎"}
          </button>
          <EmojiPicker inputRef={inputRef} disabled={!ready} />
          <input
            ref={inputRef}
            disabled={!ready}
            placeholder={ready ? `Message à ${peerDisplayName}` : "Connexion…"}
            className="min-w-0 flex-1 bg-transparent py-1 pl-1 pr-2 text-[15px] text-discord-text outline-none placeholder:text-discord-muted"
          />
        </div>
      </form>
    </div>
  );
}
