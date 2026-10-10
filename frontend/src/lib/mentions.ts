/*
 * A mention is what makes the notification fire, so it is worth seeing in the text. The backend
 * builds the key from the name (`build_user_mention_base`): the surname plus the initials with
 * everything that is not alphanumeric removed (`БулашевАН`, and `БулашевАН12` when two people
 * collide), then looks for `@key` in the text. The highlight follows the same shape.
 */

export type MentionTextPart = {
  type: "text" | "mention";
  value: string;
};

/*
 * The `@` must start a word: an email address (`user@mkair.ru`) is not half-lit, and neither is a
 * mention glued to a letter. Everything alphanumeric after the `@` belongs to the mention, which is
 * exactly what the backend keys contain.
 */
const MENTION_PATTERN = /(?<![\p{L}\p{N}._@-])@([\p{L}\p{N}]+)/gu;

export function splitMentionText(text: string): MentionTextPart[] {
  const parts: MentionTextPart[] = [];
  let cursor = 0;

  for (const match of text.matchAll(MENTION_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      parts.push({ type: "text", value: text.slice(cursor, index) });
    }
    const mention = `@${match[1]}`;
    parts.push({ type: "mention", value: mention });
    cursor = index + mention.length;
  }

  if (cursor < text.length) {
    parts.push({ type: "text", value: text.slice(cursor) });
  }

  return parts;
}
