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
  type FloatingAutocompleteMenuPlacement,
  FloatingAutocompleteMenu,
} from "@/components/FloatingAutocompleteMenu";
import { rankAutocompleteSuggestions } from "@/lib/autocomplete";

type AutocompleteInputProps = Omit<
  ComponentPropsWithoutRef<"input">,
  "type" | "value" | "onChange"
> & {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  maxSuggestions?: number;
};

export const AutocompleteInput = forwardRef<HTMLInputElement, AutocompleteInputProps>(
  function AutocompleteInput(
    {
      autoComplete,
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
    const menuRef = useRef<HTMLDivElement | null>(null);
    const [open, setOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const filteredSuggestions = useMemo(
      () => rankAutocompleteSuggestions(suggestions, value).slice(0, maxSuggestions),
      [maxSuggestions, suggestions, value],
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
        const targetNode = event.target as Node;
        if (
          containerRef.current?.contains(targetNode)
          || menuRef.current?.contains(targetNode)
        ) {
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

    function handleSelect(nextValue: string) {
      onChange(nextValue);
      setOpen(false);
      setHighlightedIndex(-1);
    }

    function handleFocus(event: FocusEvent<HTMLInputElement>) {
      if (filteredSuggestions.length > 0) {
        setOpen(true);
      }
      onFocus?.(event);
    }

    function handleBlur(event: FocusEvent<HTMLInputElement>) {
      const nextFocusedNode = event.relatedTarget;
      if (
        nextFocusedNode
        && (
          containerRef.current?.contains(nextFocusedNode)
          || menuRef.current?.contains(nextFocusedNode)
        )
      ) {
        onBlur?.(event);
        return;
      }
      setOpen(false);
      setHighlightedIndex(-1);
      onBlur?.(event);
    }

    function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
      if (event.key === "ArrowDown") {
        if (!filteredSuggestions.length) {
          onKeyDown?.(event);
          return;
        }
        event.preventDefault();
        setOpen(true);
        setHighlightedIndex((current) =>
          current < filteredSuggestions.length - 1 ? current + 1 : 0,
        );
      }

      if (event.key === "ArrowUp") {
        if (!filteredSuggestions.length) {
          onKeyDown?.(event);
          return;
        }
        event.preventDefault();
        setOpen(true);
        setHighlightedIndex((current) =>
          current > 0 ? current - 1 : filteredSuggestions.length - 1,
        );
      }

      if ((event.key === "Enter" || event.key === "Tab") && open && highlightedIndex >= 0) {
        event.preventDefault();
        handleSelect(filteredSuggestions[highlightedIndex]);
      }

      if (event.key === "Escape" && open) {
        event.preventDefault();
        setOpen(false);
        setHighlightedIndex(-1);
      }

      onKeyDown?.(event);
    }

    function renderSuggestions(placement: FloatingAutocompleteMenuPlacement) {
      const orderedSuggestions = filteredSuggestions.map((suggestion, index) => ({
        index,
        suggestion,
      }));

      if (placement === "top") {
        orderedSuggestions.reverse();
      }

      return orderedSuggestions.map(({ index, suggestion }) => (
        <button
          key={suggestion}
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
            handleSelect(suggestion);
          }}
          onMouseEnter={() => setHighlightedIndex(index)}
        >
          {suggestion}
        </button>
      ));
    }

    return (
      <div className="autocomplete-input" ref={containerRef}>
        <input
          {...props}
          aria-autocomplete="list"
          aria-controls={open && filteredSuggestions.length ? listboxId : undefined}
          aria-expanded={open && filteredSuggestions.length > 0}
          autoComplete={autoComplete ?? "off"}
          className={className}
          ref={ref}
          type="text"
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
          <FloatingAutocompleteMenu
            anchorRef={containerRef}
            id={listboxId}
            layoutKey={`${value}\0${filteredSuggestions.join("\0")}`}
            menuRef={menuRef}
            open={open}
          >
            {renderSuggestions}
          </FloatingAutocompleteMenu>
        ) : null}
      </div>
    );
  },
);
