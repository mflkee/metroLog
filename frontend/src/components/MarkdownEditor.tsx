import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState, RangeSetBuilder, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  keymap,
} from "@codemirror/view";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import type { AutocompleteSuggestion } from "@/components/AutocompleteTextarea";
import {
  activeLineNumbers,
  planMarkdownDecorations,
  type MarkdownDecoration,
} from "@/lib/markdownLivePreview";

export type MarkdownEditorHandle = {
  focus: () => void;
  blur: () => void;
  /** Вставляет текст в позицию курсора и возвращает получившийся текст (для состояния формы). */
  insertAtSelection: (text: string) => string;
  getValue: () => string;
};

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  minHeight?: number;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
  onKeyDown?: (event: KeyboardEvent) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  suggestions?: AutocompleteSuggestion[];
  maxSuggestions?: number;
};

function decorationsFor(view: EditorView): DecorationSet {
  const plan = planMarkdownDecorations(view.state, view.visibleRanges, activeLineNumbers(view.state));
  const builder = new RangeSetBuilder<Decoration>();
  for (const item of plan) {
    builder.add(item.from, item.to, decorationFor(item));
  }
  return builder.finish();
}

function decorationFor(item: MarkdownDecoration): Decoration {
  if (item.kind === "line") {
    return Decoration.line({ class: item.className });
  }
  if (item.kind === "hide") {
    return Decoration.replace({});
  }
  return Decoration.mark({ class: item.className });
}

const livePreview: Extension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = decorationsFor(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = decorationsFor(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/**
 * Живой предпросмотр Markdown: то, что печатается, сразу оформляется (заголовок, список, цитата,
 * жирный, код), а пометки разметки скрыты на строках, которые не редактируются сейчас.
 *
 * Упоминания набираются как раньше: список подсказок открывается по `@` и вставляет значение.
 */
export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    {
      ariaLabel,
      className,
      disabled = false,
      maxLength,
      maxSuggestions = 8,
      minHeight,
      onBlur,
      onChange,
      onFocus,
      onKeyDown,
      placeholder,
      suggestions = [],
      value,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);
    const callbacks = useRef({ onBlur, onChange, onFocus, onKeyDown, suggestions, maxSuggestions });
    callbacks.current = { onBlur, onChange, onFocus, onKeyDown, suggestions, maxSuggestions };

    const mentionSource = (context: CompletionContext): CompletionResult | null => {
      const word = context.matchBefore(/@[^\s@]*/);
      if (!word || (word.from === word.to && !context.explicit)) {
        return null;
      }
      const query = word.text.slice(1).toLocaleLowerCase("ru-RU");
      const options = callbacks.current.suggestions
        .map((suggestion) =>
          typeof suggestion === "string"
            ? { value: suggestion, label: suggestion }
            : suggestion,
        )
        .filter((suggestion) => suggestion.label.toLocaleLowerCase("ru-RU").includes(query))
        .slice(0, callbacks.current.maxSuggestions)
        .map((suggestion) => ({
          label: suggestion.label,
          apply: `${suggestion.value} `,
          type: "keyword" as const,
        }));
      return { from: word.from, options };
    };

    useEffect(() => {
      if (!containerRef.current) {
        return;
      }

      const extensions: Extension[] = [
        history(),
        markdown(),
        closeBrackets(),
        EditorView.lineWrapping,
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        autocompletion({ override: [mentionSource], icons: false }),
        EditorState.changeFilter.of((transaction) =>
          maxLength === undefined || transaction.newDoc.length <= maxLength,
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            callbacks.current.onChange(update.state.doc.toString());
          }
        }),
        livePreview,
        EditorView.domEventHandlers({
          keydown: (event) => {
            callbacks.current.onKeyDown?.(event);
          },
          blur: () => {
            callbacks.current.onBlur?.();
          },
          focus: () => {
            callbacks.current.onFocus?.();
          },
        }),
      ];

      const view = new EditorView({
        parent: containerRef.current,
        state: EditorState.create({ doc: value, extensions }),
      });
      viewRef.current = view;
      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // Редактор создаётся один раз: дальше состояние синхронизируется эффектами ниже.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Внешнее значение (сброс формы, подстановка шаблона) переносим в документ редактора.
    useEffect(() => {
      const view = viewRef.current;
      if (!view || view.state.doc.toString() === value) {
        return;
      }
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }, [value]);

    useEffect(() => {
      const view = viewRef.current;
      if (view) {
        view.contentDOM.setAttribute("aria-label", ariaLabel ?? "Текст с разметкой Markdown");
      }
    }, [ariaLabel]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => viewRef.current?.focus(),
        blur: () => viewRef.current?.contentDOM.blur(),
        getValue: () => viewRef.current?.state.doc.toString() ?? "",
        insertAtSelection: (text: string) => {
          const view = viewRef.current;
          if (!view) {
            return value;
          }
          const range = view.state.selection.main;
          view.dispatch({
            changes: { from: range.from, to: range.to, insert: text },
            selection: { anchor: range.from + text.length },
          });
          view.focus();
          return view.state.doc.toString();
        },
      }),
      [value],
    );

    return (
      <div
        className={["markdown-editor", className ?? ""].join(" ").trim()}
        data-disabled={disabled ? "true" : undefined}
        style={minHeight ? { minHeight } : undefined}
      >
        {placeholder && !value ? <div className="markdown-editor__placeholder">{placeholder}</div> : null}
        <div className="markdown-editor__surface" ref={containerRef} />
      </div>
    );
  },
);
