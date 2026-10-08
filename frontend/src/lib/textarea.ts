import type { KeyboardEvent } from "react";

/**
 * Submits the surrounding form on plain Enter (Shift+Enter keeps the newline).
 * Shared by every message/comment composer so the UX is identical everywhere.
 */
export function handleTextareaSubmitShortcut(event: KeyboardEvent<HTMLTextAreaElement>): void {
  if (event.key !== "Enter" || event.shiftKey) {
    return;
  }

  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

/**
 * Grows a textarea to fit its content, never below `minHeight` pixels.
 */
export function resizeTextareaToContent(textarea: HTMLTextAreaElement, minHeight = 64): void {
  textarea.style.height = "0px";
  textarea.style.height = `${Math.max(textarea.scrollHeight, minHeight)}px`;
}

/**
 * Inserts an emoji at the caret and restores the caret right after it.
 */
export function insertEmojiAtCursor(
  textarea: HTMLTextAreaElement | null,
  value: string,
  emoji: string,
): string {
  if (!textarea) {
    return `${value}${emoji}`;
  }

  const selectionStart = textarea.selectionStart ?? value.length;
  const selectionEnd = textarea.selectionEnd ?? value.length;
  const nextValue = `${value.slice(0, selectionStart)}${emoji}${value.slice(selectionEnd)}`;

  requestAnimationFrame(() => {
    const caretPosition = selectionStart + emoji.length;
    textarea.focus();
    textarea.setSelectionRange(caretPosition, caretPosition);
  });

  return nextValue;
}
