import { matchesSearchQuery, normalizeSearchText } from "@/lib/search";

describe("matchesSearchQuery", () => {
  it("matches terms that live in different fields, in any order", () => {
    const row = ["Кужим Андрей Петрович", "МКАИР", "Инженер"];
    expect(matchesSearchQuery(row, "Мкаир Кужим")).toBe(true);
    expect(matchesSearchQuery(row, "Кужим Мкаир")).toBe(true);
    expect(matchesSearchQuery(row, "инженер кужим мкаир")).toBe(true);
  });

  it("matches the case that started this: a name fragment and a number", () => {
    const row = ["Прибор измерительный", "СИКН 1520", "81-2024"];
    expect(matchesSearchQuery(row, "При 81")).toBe(true);
    expect(matchesSearchQuery(row, "81 При")).toBe(true);
  });

  it("requires every term, so an unmatched one drops the row", () => {
    const row = ["Прибор измерительный", "81-2024"];
    expect(matchesSearchQuery(row, "При 82")).toBe(false);
    expect(matchesSearchQuery(row, "Манометр 81")).toBe(false);
  });

  it("ignores case, extra spaces and «ё»/«е»", () => {
    expect(matchesSearchQuery(["Эталон Фёдоровский"], "федоров")).toBe(true);
    expect(matchesSearchQuery(["Эталон Фёдоровский"], "ФЁДОРОВ")).toBe(true);
    expect(matchesSearchQuery(["Прибор измерительный"], "   прибор    измерит  ")).toBe(true);
  });

  it("treats an empty query as no filter at all", () => {
    expect(matchesSearchQuery(["что угодно"], "")).toBe(true);
    expect(matchesSearchQuery(["что угодно"], "   ")).toBe(true);
    expect(matchesSearchQuery([], "прибор")).toBe(false);
  });

  it("skips the values that are not set", () => {
    expect(matchesSearchQuery([null, undefined, "", "Ленск"], "ленск")).toBe(true);
    expect(matchesSearchQuery([null, undefined, ""], "ленск")).toBe(false);
  });
});

describe("normalizeSearchText", () => {
  it("lower-cases, folds «ё» and collapses the spaces", () => {
    expect(normalizeSearchText("  ФЁДОРОВ   Пётр ")).toBe("федоров пётр".replace("ё", "е"));
  });
});
