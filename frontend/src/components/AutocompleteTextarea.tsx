import { forwardRef, type ComponentPropsWithoutRef } from "react";

import { MarkdownEditor, type MarkdownEditorHandle } from "@/components/MarkdownEditor";

export type AutocompleteSuggestion =
  | string
  | {
    value: string;
    label: string;
  };

export type AutocompleteTextareaHandle = MarkdownEditorHandle;

type AutocompleteTextareaProps = Omit<
  ComponentPropsWithoutRef<"textarea">,
  "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  suggestions: AutocompleteSuggestion[];
  maxSuggestions?: number;
};

/**
 * Поле человеческого текста: комментарии, сообщения, описание задачи.
 *
 * Внутри — Markdown-редактор с живым предпросмотром (см. `MarkdownEditor`), а подсказки
 * `@упоминаний` открываются по `@` и вставляют значение. Проп `onInput` больше не нужен (редактор
 * растёт сам), но принимается, чтобы формы не пришлось переписывать: он не вызывается.
 */
export const AutocompleteTextarea = forwardRef<AutocompleteTextareaHandle, AutocompleteTextareaProps>(
  function AutocompleteTextarea(
    {
      className,
      maxLength,
      maxSuggestions = 8,
      onChange,
      onInput,
      onKeyDown,
      placeholder,
      rows,
      suggestions,
      value,
      ...props
    },
    ref,
  ) {
    void onInput;
    void props;

    return (
      <MarkdownEditor
        ariaLabel={props["aria-label"]}
        className={className}
        disabled={props.disabled}
        maxLength={typeof maxLength === "number" ? maxLength : undefined}
        maxSuggestions={maxSuggestions}
        minHeight={typeof rows === "number" ? rows * 24 : undefined}
        onBlur={undefined}
        onChange={onChange}
        onFocus={undefined}
        onKeyDown={onKeyDown ? (event) => onKeyDown(event as never) : undefined}
        placeholder={typeof placeholder === "string" ? placeholder : undefined}
        ref={ref}
        suggestions={suggestions}
        value={value}
      />
    );
  },
);
