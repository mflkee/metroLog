import { useEffect, useId, useRef, useState } from "react";

import { FloatingAutocompleteMenu } from "@/components/FloatingAutocompleteMenu";

const defaultEmojis = ["😀", "👍", "✅", "⚠️", "❗", "🔧", "🧪", "📦", "📄", "📷", "🚚", "📝"];

type EmojiPickerButtonProps = {
  disabled?: boolean;
  emojis?: string[];
  onPick: (emoji: string) => void;
};

/**
 * Emoji picker. The grid is rendered outside the layout (portal + fixed), so a modal never clips
 * it, and it reuses the shared menu surface so every popup in the app looks the same.
 */
export function EmojiPickerButton({
  disabled = false,
  emojis = defaultEmojis,
  onPick,
}: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (fieldRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div className="relative" ref={fieldRef}>
      <button
        aria-controls={open ? listboxId : undefined}
        aria-expanded={open}
        aria-label="Открыть эмодзи"
        className="icon-action-button"
        disabled={disabled}
        title="Эмодзи"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="text-base leading-none">🙂</span>
      </button>
      <FloatingAutocompleteMenu
        anchorRef={fieldRef}
        id={listboxId}
        layoutKey={`${open}\u0000${emojis.join("")}`}
        menuRef={menuRef}
        open={open}
      >
        <div className="grid grid-cols-4 gap-1">
          {emojis.map((emoji) => (
            <button
              key={emoji}
              aria-selected={false}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-base transition hover:bg-[var(--accent-soft)]"
              role="option"
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
      </FloatingAutocompleteMenu>
    </div>
  );
}
