import { useCallback, useState } from "react";

const MAX_ENTRIES = 8;

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

/** Recent queries for a search box, most recent first. Stored per browser, not per account. */
export function readSearchHistory(key: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return isStringList(parsed) ? parsed.slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

export function writeSearchHistory(key: string, entries: string[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch {
    // Storage can be unavailable (private mode); history is a convenience, not a requirement.
  }
}

export function nextSearchHistory(history: string[], query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return history;
  }
  return [trimmed, ...history.filter((entry) => entry !== trimmed)].slice(0, MAX_ENTRIES);
}

/**
 * Search history for a given search box. `remember` is meant to be called when a query is
 * actually used (submitted or turned into a selection), not on every keystroke.
 */
export function useSearchHistory(key: string) {
  const [history, setHistory] = useState<string[]>(() => readSearchHistory(key));

  const remember = useCallback(
    (query: string) => {
      setHistory((current) => {
        const next = nextSearchHistory(current, query);
        if (next !== current) {
          writeSearchHistory(key, next);
        }
        return next;
      });
    },
    [key],
  );

  const clear = useCallback(() => {
    writeSearchHistory(key, []);
    setHistory([]);
  }, [key]);

  return { history, remember, clear };
}
