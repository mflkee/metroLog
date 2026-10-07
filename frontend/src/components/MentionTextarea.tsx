import { type ChangeEvent, type KeyboardEvent, useRef, useState } from "react";

import type { UserMention } from "@/api/users";

type MentionTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  users: UserMention[];
  placeholder?: string;
  rows?: number;
};

export function MentionTextarea({ value, onChange, users, placeholder, rows = 2 }: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState<string | null>(null);

  const suggestions =
    query === null
      ? []
      : users
          .filter((user) => {
            const needle = query.toLowerCase();
            return (
              user.mentionKey.toLowerCase().includes(needle) ||
              user.displayName.toLowerCase().includes(needle)
            );
          })
          .slice(0, 6);

  function recomputeQuery(next: string) {
    const caret = textareaRef.current?.selectionStart ?? next.length;
    const before = next.slice(0, caret);
    const atIndex = before.lastIndexOf("@");
    if (atIndex < 0) {
      setQuery(null);
      return;
    }
    const fragment = before.slice(atIndex + 1);
    setQuery(/\s/.test(fragment) ? null : fragment);
    setActiveIndex(0);
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    onChange(event.target.value);
    recomputeQuery(event.target.value);
  }

  function applyMention(user: UserMention) {
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const atIndex = before.lastIndexOf("@");
    const after = value.slice(caret);
    const next = `${value.slice(0, atIndex)}@${user.mentionKey} ${after}`;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (query === null || suggestions.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      applyMention(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setQuery(null);
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        className="form-input"
        placeholder={placeholder}
        rows={rows}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      {query !== null && suggestions.length > 0 ? (
        <ul className="absolute z-30 mt-1 max-h-48 w-64 overflow-y-auto rounded-xl border border-line bg-white shadow-panel">
          {suggestions.map((user, index) => (
            <li key={user.id}>
              <button
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${
                  index === activeIndex ? "bg-[var(--accent-soft)] text-ink" : "text-steel"
                }`}
                onMouseDown={(event) => {
                  event.preventDefault();
                  applyMention(user);
                }}
                type="button"
              >
                <span className="truncate">{user.displayName || user.email}</span>
                <span className="shrink-0 text-xs text-steel">@{user.mentionKey}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
