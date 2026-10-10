import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { coerceThemePreference, defaultVisibleThemes, themeOptions } from "@/store/theme";

/*
 * `import.meta.glob` is Vite's own file reader: it hands back the sources as strings, so the guard
 * needs no path arithmetic (and `import.meta.url` is not a file URL inside the test transform).
 */
const RAW_SOURCES = import.meta.glob("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const SOURCE_FILES = Object.entries(RAW_SOURCES)
  .filter(([file]) => !/\.test\.tsx?$/.test(file))
  .map(([file, source]) => [file.replace("../", "src/"), source] as const);

/**
 * The stylesheet is read from disk: `?raw` on a `.css` file comes back empty, because Vite runs the
 * CSS pipeline on it even when only the source is asked for.
 */
function readStyles(): string {
  const candidates = [
    path.resolve(process.cwd(), "frontend/src/shared/styles.css"),
    path.resolve(process.cwd(), "src/shared/styles.css"),
  ];
  const found = candidates.find((file) => existsSync(file));
  if (!found) {
    throw new Error("frontend/src/shared/styles.css was not found");
  }
  return readFileSync(found, "utf8");
}

const STYLES = readStyles();

/*
 * The state convention is a written rule, and a written rule is the one that gets broken: these
 * guards read the source. Interactive state (hover, selection, active) is a background change —
 * a border recolour is not a state indicator anywhere in this app.
 */
describe("state is carried by the surface", () => {
  it("never recolours a border on hover", () => {
    const offenders = SOURCE_FILES.filter(([, source]) => source.includes("hover:border-")).map(
      ([file]) => file,
    );

    expect(offenders).toEqual([]);
  });

  it("never marks a selection with an accent border", () => {
    const accentBorder = /border-\[(?:color:)?var\(--accent\)\]/;
    const offenders = SOURCE_FILES.filter(([, source]) => accentBorder.test(source)).map(
      ([file]) => file,
    );

    expect(offenders).toEqual([]);
  });

  it("draws the keyboard focus ring once, from the shared layer", () => {
    expect(STYLES).toMatch(/:focus-visible\s*\{\s*outline:\s*2px solid var\(--accent\)/);
  });
});

/*
 * The catalogue is dark-only and curated by hand: a light theme was tried and removed because it
 * never fitted the product, and moonfly was removed because it read as a second neutral dark.
 */
describe("the theme catalogue is curated and dark-only", () => {
  it("ships no light theme and no near-duplicate of dark", () => {
    const values: string[] = themeOptions.map((option) => option.value);
    expect(values).not.toContain("light");
    expect(values).not.toContain("moonfly");
    expect(values[0]).toBe("dark");
  });

  it("carries nothing but the name, because that is all the picker shows", () => {
    for (const option of themeOptions) {
      expect(Object.keys(option).sort()).toEqual(["label", "value"]);
    }
  });

  it("falls a retired preference back to the neutral dark theme", () => {
    for (const retired of ["light", "gray", "flexoki", "moonfly", "tokyo-night"]) {
      expect(coerceThemePreference(retired)).toBe("dark");
    }
  });

  it("leaves an unknown value to the caller", () => {
    expect(coerceThemePreference("solarized")).toBeNull();
  });

  it("offers every remaining theme out of the box", () => {
    expect(defaultVisibleThemes).toEqual(themeOptions.map((option) => option.value));
  });

  it("leaves no light palette and no moonfly block in the stylesheet", () => {
    expect(STYLES).not.toContain('data-theme="light"');
    expect(STYLES).not.toContain("moonfly");
    expect(STYLES).toContain("color-scheme: dark");
  });
});

/*
 * The app draws its own dialogs: a browser dialog cannot carry our theme, our wording or a pending
 * state, and on some platforms the OS draws it. `beforeunload` is the one deliberate exception —
 * the browser owns the unsaved-edit warning — so this guard looks only at the three dialog calls.
 */
describe("the app draws its own dialogs", () => {
  it("never calls a browser confirm, alert or prompt", () => {
    const browserDialog =
      /(?<![\w.$])(?:window|globalThis)\.(?:confirm|alert|prompt)\s*\(|(?<![\w.$])(?:confirm|alert|prompt)\s*\(/;
    const offenders = SOURCE_FILES.filter(([, source]) => browserDialog.test(source)).map(
      ([file]) => file,
    );

    expect(offenders).toEqual([]);
  });
});
