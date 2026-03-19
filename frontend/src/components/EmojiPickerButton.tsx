import { useEffect, useRef, useState } from "react";

const defaultEmojis = ["😀", "👍", "✅", "⚠️", "❗", "🔧", "🧪", "📦", "📄", "📷", "🚚", "📝"];

type EmojiPickerButtonProps = {
  disabled?: boolean;
  emojis?: string[];
  onPick: (emoji: string) => void;
};

export function EmojiPickerButton({
  disabled = false,
  emojis = defaultEmojis,
  onPick,
}: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-label="Открыть эмодзи"
        className="icon-action-button"
        disabled={disabled}
        title="Эмодзи"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="text-base leading-none">🙂</span>
      </button>
      {open ? (
        <div className="tone-grandchild absolute bottom-full right-0 z-[120] mb-2 grid w-[176px] grid-cols-4 gap-1 rounded-2xl border border-line p-2 shadow-panel">
          {emojis.map((emoji) => (
            <button
              key={emoji}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-base transition hover:bg-[var(--accent-soft)]"
              title={emoji}
              type="button"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
