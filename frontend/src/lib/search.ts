/**
 * Term-based text matching, shared by every search box that filters a list in the browser.
 *
 * Every whitespace-separated term has to appear somewhere in the row, so the order does not matter
 * and the terms may live in different fields: «Мкаир Кужим» finds a user whose organisation and
 * surname say so, and «При 81» finds an instrument whose name and number are two different columns.
 * A plain substring test found neither.
 *
 * Matching is case-insensitive and treats «ё» as «е» on both sides, so «Федоров» finds «Фёдоров».
 */
export function normalizeSearchText(value: string): string {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

/** True when the query is empty, or when every term of it appears in one of the values. */
export function matchesSearchQuery(
  values: Array<string | null | undefined>,
  query: string,
): boolean {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);
  if (!terms.length) {
    return true;
  }

  const haystack = normalizeSearchText(
    values
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join(" "),
  );

  return terms.every((term) => haystack.includes(term));
}
