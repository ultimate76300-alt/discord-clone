import { AttachmentExpiryCountdown } from "./AttachmentExpiryCountdown";

function guessImageFromUrl(url) {
  if (!url || typeof url !== "string") return false;
  return /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(url);
}

export function ChatMessageAttachment({ fileUrl, fileName, fileType, expiresAtMs }) {
  if (!fileUrl) return null;
  const isImg =
    (typeof fileType === "string" && fileType.startsWith("image/")) || guessImageFromUrl(fileUrl);

  return (
    <div className="mt-1 flex flex-wrap items-start gap-3">
      {isImg ? (
        <a
          href={fileUrl}
          target="_blank"
          rel="noreferrer"
          className="block max-h-52 max-w-[min(100%,20rem)] overflow-hidden rounded-lg ring-1 ring-discord-border"
        >
          <img src={fileUrl} alt={fileName || ""} className="max-h-52 w-full object-contain" loading="lazy" />
        </a>
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        <a
          href={fileUrl}
          download={fileName}
          target="_blank"
          rel="noreferrer"
          className="truncate text-sm text-discord-accent hover:underline"
        >
          {fileName || "Télécharger le fichier"}
        </a>
        {fileType ? <span className="text-[11px] text-discord-muted">{fileType}</span> : null}
        {expiresAtMs != null ? (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-discord-muted">Expire dans</span>
            <AttachmentExpiryCountdown expiresAtMs={expiresAtMs} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
