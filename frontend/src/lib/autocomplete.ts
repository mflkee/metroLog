export function sortAutocompleteSuggestions(values: Iterable<string | null | undefined>): string[] {
  return Array.from(
    new Map(
      Array.from(values)
        .map((value) => value?.trim() ?? "")
        .filter(Boolean)
        .map((value) => [value.toLocaleLowerCase("ru-RU"), value]),
    ).values(),
  ).sort((left, right) => left.localeCompare(right, "ru-RU", { sensitivity: "base" }));
}

export function rankAutocompleteSuggestions(values: string[], query: string): string[] {
  const normalizedQuery = normalizeAutocompleteValue(query);
  const uniqueValues = sortAutocompleteSuggestions(values);

  if (!normalizedQuery) {
    return uniqueValues;
  }

  return uniqueValues
    .map((value) => ({
      value,
      rank: calculateSuggestionRank(value, normalizedQuery),
    }))
    .filter((item): item is { value: string; rank: number } => item.rank !== null)
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      return left.value.localeCompare(right.value, "ru-RU", { sensitivity: "base" });
    })
    .map((item) => item.value);
}

export function getAutocompleteTokenContext(text: string, caret: number) {
  const safeCaret = Math.max(0, Math.min(caret, text.length));
  let start = safeCaret;
  while (start > 0 && !isAutocompleteSeparator(text[start - 1])) {
    start -= 1;
  }

  let end = safeCaret;
  while (end < text.length && !isAutocompleteSeparator(text[end])) {
    end += 1;
  }

  return {
    token: text.slice(start, end),
    start,
    end,
  };
}

export function applyAutocompleteSuggestion(
  text: string,
  rangeStart: number,
  rangeEnd: number,
  suggestion: string,
): { nextValue: string; nextCaret: number } {
  const prefix = text.slice(0, rangeStart);
  const suffix = text.slice(rangeEnd);
  const needsSpace = suffix.length === 0 || !/^\s/.test(suffix);
  const insertion = needsSpace ? `${suggestion} ` : suggestion;
  const nextValue = `${prefix}${insertion}${suffix}`;
  return {
    nextValue,
    nextCaret: prefix.length + insertion.length,
  };
}

function calculateSuggestionRank(value: string, normalizedQuery: string): number | null {
  const normalizedValue = normalizeAutocompleteValue(value);
  if (normalizedValue.startsWith(normalizedQuery)) {
    return 0;
  }

  if (normalizedValue.split(/\s+/).some((part) => part.startsWith(normalizedQuery))) {
    return 1;
  }

  if (normalizedValue.includes(normalizedQuery)) {
    return 2;
  }

  return null;
}

function normalizeAutocompleteValue(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function isAutocompleteSeparator(value: string): boolean {
  return /[\s,;:()[\]{}"'`]/.test(value);
}
