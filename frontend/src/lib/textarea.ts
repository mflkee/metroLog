import type { KeyboardEvent } from "react";

import type { MarkdownEditorHandle } from "@/components/MarkdownEditor";

/** Поле ввода — обычная textarea или Markdown-редактор: оба умеют вставить текст у курсора. */
export type TextEntryTarget = HTMLTextAreaElement | MarkdownEditorHandle;

function isMarkdownEditor(target: TextEntryTarget | null): target is MarkdownEditorHandle {
  return Boolean(target && "insertAtSelection" in target);
}

/**
 * Submits the surrounding form on plain Enter (Shift+Enter keeps the newline).
 * Shared by every message/comment composer so the UX is identical everywhere.
 *
 * Форму ищем и у самой textarea, и у её контейнера: Markdown-редактор — это div внутри формы,
 * у него нет свойства `form`.
 */
export function handleTextareaSubmitShortcut(event: KeyboardEvent<HTMLTextAreaElement>): void {
  if (event.key !== "Enter" || event.shiftKey) {
    return;
  }

  const target = event.currentTarget as unknown as HTMLElement & { form?: HTMLFormElement | null };
  const form = target.form ?? target.closest?.("form") ?? null;
  if (!form) {
    return;
  }

  event.preventDefault();
  form.requestSubmit();
}

/**
 * Grows a textarea to fit its content, never below `minHeight` pixels.
 * Markdown-редактор растёт сам, поэтому для него это ничего не делает.
 */
export function resizeTextareaToContent(target: TextEntryTarget | null, minHeight = 64): void {
  if (!target || isMarkdownEditor(target)) {
    return;
  }

  target.style.height = "0px";
  target.style.height = `${Math.max(target.scrollHeight, minHeight)}px`;
}

/**
 * Inserts an emoji at the caret and restores the caret right after it.
 * Для Markdown-редактора возвращает получившийся текст: сам он обновляет своё состояние.
 */
export function insertEmojiAtCursor(
  target: TextEntryTarget | null,
  value: string,
  emoji: string,
): string {
  if (isMarkdownEditor(target)) {
    return target.insertAtSelection(emoji);
  }

  if (!target) {
    return `${value}${emoji}`;
  }

  const selectionStart = target.selectionStart ?? value.length;
  const selectionEnd = target.selectionEnd ?? value.length;
  const nextValue = `${value.slice(0, selectionStart)}${emoji}${value.slice(selectionEnd)}`;

  requestAnimationFrame(() => {
    const caretPosition = selectionStart + emoji.length;
    target.focus();
    target.setSelectionRange(caretPosition, caretPosition);
  });

  return nextValue;
}
