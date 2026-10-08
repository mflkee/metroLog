import "@testing-library/jest-dom/vitest";

/**
 * jsdom in this toolchain does not expose `window.localStorage`, and the auth/theme stores read
 * it at import time. Provide a minimal in-memory implementation when it is missing.
 */
function ensureLocalStorage(): void {
  if (typeof window === "undefined") {
    return;
  }

  let available = false;
  try {
    available = Boolean(window.localStorage);
  } catch {
    available = false;
  }
  if (available) {
    return;
  }

  const entries = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        entries.set(key, String(value));
      },
      removeItem: (key: string) => {
        entries.delete(key);
      },
      clear: () => {
        entries.clear();
      },
      key: (index: number) => Array.from(entries.keys())[index] ?? null,
      get length() {
        return entries.size;
      },
    },
  });
}

ensureLocalStorage();
