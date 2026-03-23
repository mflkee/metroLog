import {
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  applyAutocompleteSuggestion,
  getAutocompleteTokenContext,
  rankAutocompleteSuggestions,
} from "@/lib/autocomplete";

export type AutocompleteSuggestion =
  | string
  | {
    value: string;
    label: string;
  };

type AutocompleteTextareaProps = Omit<
  ComponentPropsWithoutRef<"textarea">,
  "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  suggestions: AutocompleteSuggestion[];
  maxSuggestions?: number;
};

export const AutocompleteTextarea = forwardRef<HTMLTextAreaElement, AutocompleteTextareaProps>(
  function AutocompleteTextarea(
    {
      className,
      maxSuggestions = 8,
      onBlur,
      onChange,
      onFocus,
      onKeyDown,
      suggestions,
      value,
      ...props
    },
    ref,
  ) {
    const listboxId = useId();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [open, setOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const caretPosition = textareaRef.current?.selectionStart ?? value.length;
    const normalizedSuggestions = useMemo(
      () =>
        Array.from(
          new Map(
            suggestions
              .map((suggestion) =>
                typeof suggestion === "string"
                  ? { value: suggestion, label: suggestion }
                  : suggestion
              )
              .map((suggestion) => [suggestion.value, suggestion]),
          ).values(),
        ),
      [suggestions],
    );
    const tokenContext = useMemo(
      () => getAutocompleteTokenContext(value, caretPosition),
      [caretPosition, value],
    );
    const filteredSuggestions = useMemo(
      () =>
        tokenContext.token.trim()
          ? rankAutocompleteSuggestions(
            normalizedSuggestions.map((suggestion) => suggestion.value),
            tokenContext.token,
          )
            .slice(0, maxSuggestions)
            .map((rankedValue) =>
              normalizedSuggestions.find((suggestion) => suggestion.value === rankedValue),
            )
            .filter((suggestion): suggestion is { value: string; label: string } => Boolean(suggestion))
          : [],
      [maxSuggestions, normalizedSuggestions, tokenContext.token],
    );

    useEffect(() => {
      if (!open) {
        return;
      }
      setHighlightedIndex((current) => {
        if (!filteredSuggestions.length) {
          return -1;
        }
        if (current < 0 || current >= filteredSuggestions.length) {
          return 0;
        }
        return current;
      });
    }, [filteredSuggestions.length, open]);

    useEffect(() => {
      function handlePointerDown(event: MouseEvent) {
        if (containerRef.current?.contains(event.target as Node)) {
          return;
        }
        setOpen(false);
        setHighlightedIndex(-1);
      }

      document.addEventListener("mousedown", handlePointerDown);
      return () => {
        document.removeEventListener("mousedown", handlePointerDown);
      };
    }, []);

    function assignTextareaRef(node: HTMLTextAreaElement | null) {
      textareaRef.current = node;
      if (typeof ref === "function") {
        ref(node);
        return;
      }
      if (ref) {
        ref.current = node;
      }
    }

    function handleSelect(nextValue: string) {
      const selectionStart = textareaRef.current?.selectionStart ?? value.length;
      const selectionEnd = textareaRef.current?.selectionEnd ?? selectionStart;
      const currentContext = getAutocompleteTokenContext(value, selectionStart);
      const replacement = applyAutocompleteSuggestion(
        value,
        currentContext.start,
        Math.max(currentContext.end, selectionEnd),
        nextValue,
      );
      onChange(replacement.nextValue);
      setOpen(false);
      setHighlightedIndex(-1);
      requestAnimationFrame(() => {
        if (!textareaRef.current) {
          return;
        }
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(replacement.nextCaret, replacement.nextCaret);
      });
    }

    function handleFocus(event: FocusEvent<HTMLTextAreaElement>) {
      if (filteredSuggestions.length > 0) {
        setOpen(true);
      }
      onFocus?.(event);
    }

    function handleBlur(event: FocusEvent<HTMLTextAreaElement>) {
      const nextFocusedNode = event.relatedTarget;
      if (nextFocusedNode && containerRef.current?.contains(nextFocusedNode)) {
        onBlur?.(event);
        return;
      }
      setOpen(false);
      setHighlightedIndex(-1);
      onBlur?.(event);
    }

    function handleKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
      if (event.key === "ArrowDown" && filteredSuggestions.length) {
        event.preventDefault();
        setOpen(true);
        setHighlightedIndex((current) =>
          current < filteredSuggestions.length - 1 ? current + 1 : 0,
        );
        return;
      }

      if (event.key === "ArrowUp" && filteredSuggestions.length) {
        event.preventDefault();
        setOpen(true);
        setHighlightedIndex((current) =>
          current > 0 ? current - 1 : filteredSuggestions.length - 1,
        );
        return;
      }

      if ((event.key === "Enter" || event.key === "Tab") && open && highlightedIndex >= 0) {
        event.preventDefault();
        handleSelect(filteredSuggestions[highlightedIndex].value);
        return;
      }

      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        setHighlightedIndex(-1);
        return;
      }

      onKeyDown?.(event);
    }

    return (
      <div className="autocomplete-input" ref={containerRef}>
        <textarea
          {...props}
          aria-autocomplete="list"
          aria-controls={open && filteredSuggestions.length ? listboxId : undefined}
          aria-expanded={open && filteredSuggestions.length > 0}
          className={className}
          ref={assignTextareaRef}
          value={value}
          onBlur={handleBlur}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
        />

        {open && filteredSuggestions.length ? (
          <div className="autocomplete-input__menu" id={listboxId} role="listbox">
            {filteredSuggestions.map((suggestion, index) => (
              <button
                key={suggestion.value}
                aria-selected={highlightedIndex === index}
                className={[
                  "autocomplete-input__option",
                  highlightedIndex === index ? "autocomplete-input__option--active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                role="option"
                tabIndex={-1}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  handleSelect(suggestion.value);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {suggestion.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  },
);
