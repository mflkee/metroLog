import { nextSearchHistory, readSearchHistory, writeSearchHistory } from "@/lib/searchHistory";

describe("search history", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps the most recent query first, without duplicates, capped at eight", () => {
    let history: string[] = [];
    for (let index = 1; index <= 10; index += 1) {
      history = nextSearchHistory(history, `запрос ${index}`);
    }
    expect(history).toHaveLength(8);
    expect(history[0]).toBe("запрос 10");
    expect(history).not.toContain("запрос 1");

    history = nextSearchHistory(history, "запрос 5");
    expect(history[0]).toBe("запрос 5");
    expect(history.filter((entry) => entry === "запрос 5")).toHaveLength(1);
  });

  it("ignores blank queries", () => {
    expect(nextSearchHistory(["а"], "   ")).toEqual(["а"]);
  });

  it("round-trips through localStorage and survives corrupt data", () => {
    writeSearchHistory("metroLog.test.search", ["а", "б"]);
    expect(readSearchHistory("metroLog.test.search")).toEqual(["а", "б"]);

    window.localStorage.setItem("metroLog.test.search", "{not json");
    expect(readSearchHistory("metroLog.test.search")).toEqual([]);

    window.localStorage.setItem("metroLog.test.search", JSON.stringify([1, 2]));
    expect(readSearchHistory("metroLog.test.search")).toEqual([]);
  });
});
