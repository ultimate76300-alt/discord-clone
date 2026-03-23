import { useEffect, useRef, useState } from "react";

const EMOJIS = [
  "😀",
  "😃",
  "😄",
  "😁",
  "😅",
  "😂",
  "🤣",
  "😊",
  "😍",
  "🥰",
  "😘",
  "😋",
  "😛",
  "😜",
  "🤪",
  "🤑",
  "🤔",
  "😐",
  "😑",
  "😏",
  "😒",
  "🙄",
  "😬",
  "😌",
  "😔",
  "😪",
  "😴",
  "😷",
  "🤒",
  "🤕",
  "🥵",
  "🥶",
  "😵",
  "🤯",
  "🥳",
  "😎",
  "🤓",
  "😕",
  "🙁",
  "😮",
  "😲",
  "🥺",
  "😢",
  "😭",
  "😱",
  "😤",
  "😡",
  "🤬",
  "💀",
  "👻",
  "👍",
  "👎",
  "👌",
  "✌️",
  "🤞",
  "🤘",
  "👋",
  "🤝",
  "💪",
  "🙏",
  "✨",
  "❤️",
  "🧡",
  "💛",
  "💚",
  "💙",
  "💜",
  "🖤",
  "💔",
  "💕",
  "💖",
  "🔥",
  "⭐",
  "🌟",
  "✅",
  "❌",
  "❓",
  "💬",
  "🎉",
  "🎊",
  "🎮",
  "☕",
  "🍕",
  "🍔",
];

function insertIntoInput(inputEl, chars) {
  if (!inputEl) return;
  const start = inputEl.selectionStart ?? inputEl.value.length;
  const end = inputEl.selectionEnd ?? inputEl.value.length;
  const v = inputEl.value;
  inputEl.value = v.slice(0, start) + chars + v.slice(end);
  inputEl.focus();
  const pos = start + chars.length;
  queueMicrotask(() => inputEl.setSelectionRange(pos, pos));
}

export function EmojiPicker({ inputRef, disabled }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        disabled={disabled}
        title="Emojis"
        onClick={() => setOpen((o) => !o)}
        className="rounded p-2 text-lg leading-none text-discord-muted transition hover:bg-discord-hover hover:text-discord-text disabled:cursor-not-allowed disabled:opacity-40"
        aria-expanded={open}
      >
        😊
      </button>
      {open && !disabled ? (
        <div
          className="absolute bottom-[calc(100%+6px)] left-0 z-[80] w-[min(16rem,calc(100vw-2rem))] rounded-xl border border-discord-border bg-discord-sidebar p-2 shadow-2xl shadow-black/40"
          role="listbox"
          aria-label="Choisir un emoji"
        >
          <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto scroll-discord">
            {EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => {
                  insertIntoInput(inputRef?.current, em);
                  setOpen(false);
                }}
                className="flex h-9 w-9 items-center justify-center rounded text-xl leading-none transition hover:bg-discord-hover"
              >
                {em}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
