import { useEffect, useMemo, useRef, useState } from "react";

export type SearchableOption = {
  value: number;
  label: string;
  hint?: string;
};

type SharedProps = {
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /** Caps the rendered results, e.g. 5 for an equipment picker. */
  maxResults?: number;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
};

type SingleProps = SharedProps & {
  value: number | null;
  onChange: (next: number | null) => void;
};

type MultiProps = SharedProps & {
  value: number[];
  onChange: (next: number[]) => void;
  /** Recent queries shown when the search box is empty. */
  history?: string[];
  /** Called when a query is actually used (a selection or Enter), to record it. */
  onQueryCommitted?: (query: string) => void;
  /** Mirrors the typed query, for callers that search on the server. */
  onQueryChange?: (query: string) => void;
  /** Turn off when the caller already filtered the options (e.g. a server-side search). */
  filterLocally?: boolean;
};

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        onClose();
      }
    }
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [onClose]);
  return ref;
}

function useFiltered(
  options: SearchableOption[],
  query: string,
  maxResults?: number,
  filterLocally = true,
) {
  return useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches =
      filterLocally && needle
        ? options.filter((option) =>
            `${option.label} ${option.hint ?? ""}`.toLowerCase().includes(needle),
          )
        : options;
    return typeof maxResults === "number" ? matches.slice(0, maxResults) : matches;
  }, [filterLocally, maxResults, options, query]);
}

/**
 * Searchable single choice. The input doubles as the search box: on focus it clears to show the
 * full list, and when closed it shows the current label. Keyboard: arrows, Enter, Escape.
 */
export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "— выберите —",
  searchPlaceholder = "Поиск…",
  emptyLabel = "Ничего не найдено",
  maxResults,
  loading = false,
  disabled = false,
  className,
}: SingleProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const ref = useOutsideClose(() => setOpen(false));
  const filtered = useFiltered(options, query, maxResults);
  const selected = options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    setHighlighted(0);
  }, [query, open]);

  function choose(option: SearchableOption) {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className={["relative", className].filter(Boolean).join(" ")} ref={ref}>
      <input
        aria-expanded={open}
        aria-haspopup="listbox"
        autoComplete="off"
        className="form-input"
        disabled={disabled}
        placeholder={open ? searchPlaceholder : placeholder}
        role="combobox"
        value={open ? query : (selected?.label ?? "")}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQuery("");
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHighlighted((current) => Math.min(current + 1, filtered.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlighted((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter" && open && filtered[highlighted]) {
            event.preventDefault();
            choose(filtered[highlighted]);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open ? (
        <div
          className="tone-child absolute left-0 right-0 z-[300] mt-1 max-h-64 overflow-y-auto rounded-xl border border-line p-1 shadow-panel"
          role="listbox"
        >
          {loading ? <p className="px-2 py-1.5 text-sm text-steel">Загрузка…</p> : null}
          {!loading && filtered.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-steel">{emptyLabel}</p>
          ) : null}
          {filtered.map((option, index) => (
            <button
              key={option.value}
              aria-selected={option.value === value}
              className={[
                "block w-full rounded-lg px-2 py-1.5 text-left text-sm text-ink transition",
                index === highlighted ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--accent-soft)]",
              ].join(" ")}
              role="option"
              type="button"
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => choose(option)}
            >
              <span className="block truncate">{option.label}</span>
              {option.hint ? (
                <span className="block truncate text-xs text-steel">{option.hint}</span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Searchable multiple choice with removable chips. Same visual language as the single variant;
 * the results are capped by `maxResults` (the equipment picker uses 5).
 */
export function SearchableMultiSelect({
  options,
  value,
  onChange,
  placeholder = "Начните вводить…",
  emptyLabel = "Ничего не найдено",
  maxResults,
  loading = false,
  disabled = false,
  className,
  history,
  onQueryCommitted,
  onQueryChange,
  filterLocally = true,
}: MultiProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const ref = useOutsideClose(() => setOpen(false));
  const filtered = useFiltered(
    options.filter((option) => !value.includes(option.value)),
    query,
    maxResults,
    filterLocally,
  );
  const selected = value
    .map((id) => options.find((option) => option.value === id))
    .filter((option): option is SearchableOption => Boolean(option));

  useEffect(() => {
    setHighlighted(0);
  }, [query, open]);

  function add(option: SearchableOption) {
    onChange([...value, option.value]);
    if (query.trim()) {
      onQueryCommitted?.(query);
    }
    setQuery("");
    onQueryChange?.("");
  }

  function updateQuery(next: string) {
    setQuery(next);
    onQueryChange?.(next);
  }

  const showHistory = query.trim() === "" && (history?.length ?? 0) > 0;

  return (
    <div className={["relative", className].filter(Boolean).join(" ")} ref={ref}>
      {selected.length ? (
        <div className="mb-1 flex flex-wrap gap-1">
          {selected.map((option) => (
            <span
              key={option.value}
              className="inline-flex max-w-full items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-ink"
            >
              <span className="truncate">{option.label}</span>
              <button
                aria-label={`Убрать ${option.label}`}
                className="text-steel transition hover:text-[color:var(--danger)]"
                disabled={disabled}
                type="button"
                onClick={() => onChange(value.filter((id) => id !== option.value))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        aria-expanded={open}
        aria-haspopup="listbox"
        autoComplete="off"
        className="form-input"
        disabled={disabled}
        placeholder={placeholder}
        role="combobox"
        value={query}
        onChange={(event) => {
          updateQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHighlighted((current) => Math.min(current + 1, filtered.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setHighlighted((current) => Math.max(current - 1, 0));
          } else if (event.key === "Enter" && open && filtered[highlighted]) {
            event.preventDefault();
            add(filtered[highlighted]);
            setOpen(true);
          } else if (event.key === "Enter" && query.trim()) {
            onQueryCommitted?.(query);
          } else if (event.key === "Escape") {
            setOpen(false);
          } else if (event.key === "Backspace" && query === "" && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
      />
      {open ? (
        <div className="tone-child absolute left-0 right-0 z-[300] mt-1 max-h-64 overflow-y-auto rounded-xl border border-line p-1 shadow-panel">
          {showHistory ? (
            <div className="mb-1 border-b border-line pb-1">
              <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-steel">
                Последние запросы
              </p>
              {history?.map((entry) => (
                <button
                  key={entry}
                  className="block w-full truncate rounded-lg px-2 py-1.5 text-left text-sm text-steel transition hover:bg-[var(--accent-soft)] hover:text-ink"
                  type="button"
                  onClick={() => updateQuery(entry)}
                >
                  {entry}
                </button>
              ))}
            </div>
          ) : null}
          <div role="listbox">
            {loading ? <p className="px-2 py-1.5 text-sm text-steel">Загрузка…</p> : null}
            {!loading && filtered.length === 0 ? (
              <p className="px-2 py-1.5 text-sm text-steel">{emptyLabel}</p>
            ) : null}
            {filtered.map((option, index) => (
              <button
                key={option.value}
                className={[
                  "block w-full rounded-lg px-2 py-1.5 text-left text-sm text-ink transition",
                  index === highlighted ? "bg-[var(--accent-soft)]" : "hover:bg-[var(--accent-soft)]",
                ].join(" ")}
                role="option"
                type="button"
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => add(option)}
              >
                <span className="block truncate">{option.label}</span>
                {option.hint ? (
                  <span className="block truncate text-xs text-steel">{option.hint}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
