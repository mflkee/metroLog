/*
 * The app draws its own controls, and a numeric field is one of them. The browser's number field
 * (`input type=number`) leaves the browser in charge of a value the app stores, and the browser's
 * rules are not ours: the mouse wheel changes a focused field, `min`/`step` raise the browser's own
 * validation bubble, and `e`, `+`, `-` and a locale separator are accepted by some browsers and
 * rejected by others.
 */

type NumericInputOptions = {
  allowDecimal?: boolean;
  allowNegative?: boolean;
  maxLength?: number;
};

/** Keeps only what a numeric field may hold: digits, at most one separator, at most one leading sign. */
export function sanitizeNumericInput(raw: string, options: NumericInputOptions = {}): string {
  const { allowDecimal = false, allowNegative = false, maxLength } = options;
  const characters = Array.from(allowDecimal ? raw.replace(/,/g, ".") : raw);
  let result = "";
  let hasSeparator = false;

  characters.forEach((character, index) => {
    if (character >= "0" && character <= "9") {
      result += character;
      return;
    }
    if (character === "." && allowDecimal && !hasSeparator) {
      hasSeparator = true;
      result += character;
      return;
    }
    if (character === "-" && allowNegative && index === 0) {
      result += character;
    }
  });

  return maxLength === undefined ? result : result.slice(0, maxLength);
}

/** A stored number as its field shows it: an absent value is an empty field. */
export function numericInputValue(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}
