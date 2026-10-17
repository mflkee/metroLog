import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";
import type { EditorState } from "@codemirror/state";

/**
 * Живой предпросмотр Markdown: строка получает оформление прямо во время набора, а пометки
 * разметки (`#`, `**`, `-`, `>`) скрыты на строках, которые сейчас не редактируются — как в
 * Obsidian. Линия с курсором показывает разметку как есть, чтобы её можно было править.
 *
 * Планирование декораций вынесено в чистую функцию: она работает от синтаксического дерева
 * состояния, без DOM, и её можно проверить тестом.
 */

// Тот же разбор, что и в вендорном `lib/mentions.ts`: `@` начинает слово, дальше буквы и цифры.
// Дублируем шаблон здесь, потому что вендорный файл править нельзя (стережёт `npm run check:ui`).
const MENTION_PATTERN = /(?<![\p{L}\p{N}._@-])@([\p{L}\p{N}]+)/gu;

export const HEADING_LINE_CLASS: Record<string, string> = {
  ATXHeading1: "cm-md-h1",
  ATXHeading2: "cm-md-h2",
  ATXHeading3: "cm-md-h3",
  ATXHeading4: "cm-md-h4",
  ATXHeading5: "cm-md-h5",
  ATXHeading6: "cm-md-h6",
};

/** Пометки разметки: на неактивных строках они не показываются. */
export const MARKER_NODE_NAMES = new Set([
  "HeaderMark",
  "EmphasisMark",
  "CodeMark",
  "QuoteMark",
  "ListMark",
  "LinkMark",
  "URL",
  "CodeInfo",
]);

const INLINE_STYLE_CLASS: Record<string, string> = {
  StrongEmphasis: "cm-md-strong",
  Emphasis: "cm-md-em",
  InlineCode: "cm-md-code",
};

const BLOCK_STYLE_CLASS: Record<string, string> = {
  Blockquote: "cm-md-quote",
  FencedCode: "cm-md-pre",
  HorizontalRule: "cm-md-hr",
};

export type MarkdownDecoration = {
  from: number;
  to: number;
  className: string;
  kind: "line" | "mark" | "hide";
};

type Range = { from: number; to: number };

export function activeLineNumbers(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const from = state.doc.lineAt(range.from).number;
    const to = state.doc.lineAt(range.to).number;
    for (let line = from; line <= to; line += 1) {
      lines.add(line);
    }
  }
  return lines;
}

export function planMarkdownDecorations(
  state: EditorState,
  ranges: readonly Range[],
  activeLines: Set<number>,
): MarkdownDecoration[] {
  const plan: MarkdownDecoration[] = [];
  // Разбор запрашиваем сразу: без этого дерево готово только после простоя и первый кадр был бы
  // без оформления. Для комментариев и сообщений тексты короткие, синхронный разбор дешёвый.
  const lastRange = ranges.length ? ranges[ranges.length - 1] : null;
  const tree = ensureSyntaxTree(state, lastRange?.to ?? state.doc.length, 100) ?? syntaxTree(state);

  for (const range of ranges) {
    tree.iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        const line = state.doc.lineAt(node.from);
        const lineClass = HEADING_LINE_CLASS[node.name];
        if (lineClass) {
          plan.push({ from: line.from, to: line.from, className: lineClass, kind: "line" });
        }

        const inlineClass = INLINE_STYLE_CLASS[node.name];
        if (inlineClass) {
          const content = innerContentRange(node);
          if (content.from < content.to) {
            plan.push({ ...content, className: inlineClass, kind: "mark" });
          }
        }

        const blockClass = BLOCK_STYLE_CLASS[node.name];
        if (blockClass) {
          plan.push({ from: line.from, to: line.from, className: blockClass, kind: "line" });
        }

        if (node.name === "Link") {
          const content = innerContentRange(node);
          if (content.from < content.to) {
            plan.push({ ...content, className: "cm-md-link", kind: "mark" });
          }
        }

        if (MARKER_NODE_NAMES.has(node.name) && !activeLines.has(line.number)) {
          plan.push({ from: node.from, to: node.to, className: "", kind: "hide" });
        }
      },
    });
  }

  // упоминания — как в готовом тексте, только видны и во время набора
  const text = state.doc.toString();
  for (const match of text.matchAll(new RegExp(MENTION_PATTERN.source, "gu"))) {
    const from = match.index ?? 0;
    plan.push({ from, to: from + match[0].length, className: "cm-md-mention", kind: "mark" });
  }

  return sortPlan(plan);
}

/** Содержимое узла без обрамляющих пометок (`**жирный**` → `жирный`). */
function innerContentRange(ref: SyntaxNodeRef): Range {
  const first = ref.node.firstChild;
  const last = ref.node.lastChild;
  if (!first || !last) {
    return { from: 0, to: 0 };
  }
  return { from: first.to, to: last.from };
}

/** Порядок для RangeSetBuilder: по позиции, строчные раньше остальных, скрытия последними. */
function sortPlan(plan: MarkdownDecoration[]): MarkdownDecoration[] {
  const order: Record<MarkdownDecoration["kind"], number> = { line: 0, mark: 1, hide: 2 };
  return plan.sort((left, right) => {
    if (left.from !== right.from) {
      return left.from - right.from;
    }
    if (order[left.kind] !== order[right.kind]) {
      return order[left.kind] - order[right.kind];
    }
    return left.to - right.to;
  });
}
