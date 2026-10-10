import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { defaultVisibleThemes, themeOptions } from "@/store/theme";

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

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.trim().replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function relativeLuminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [
    relativeLuminance(hexToRgb(foreground)),
    relativeLuminance(hexToRgb(background)),
  ].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

/** The first `:root` block of the stylesheet is the light theme. */
function readLightThemeTokens(): Record<string, string> {
  const block = /:root\s*\{([\s\S]*?)\n\}/.exec(STYLES);
  if (!block) {
    throw new Error("the light theme block was not found in styles.css");
  }
  const tokens: Record<string, string> = {};
  for (const [, name, value] of block[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

/*
 * A 1px hairline is antialiased across two device rows whenever it misses a device pixel boundary
 * (a zoomed-out viewport, a fractional ratio), and contrast is what decides whether that reads as a
 * line or as a ripple. These are the floors the light theme was rebuilt to hold.
 */
describe("the light theme keeps its contrast floor", () => {
  const tokens = readLightThemeTokens();
  const panel = tokens["--panel-bg"];

  it("is drawn on a white panel", () => {
    expect(panel).toBe("#ffffff");
  });

  it.each<[string, number]>([
    ["--border-color", 2.0],
    ["--border-strong", 2.8],
    ["--text-muted", 7.0],
  ])("%s contrasts at least %s against the panel", (token, floor) => {
    expect(contrast(tokens[token], panel)).toBeGreaterThanOrEqual(floor);
  });
});

describe("defaults enable everything", () => {
  it("offers every theme out of the box", () => {
    expect(defaultVisibleThemes).toEqual(themeOptions.map((option) => option.value));
  });
});
