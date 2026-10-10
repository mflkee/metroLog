import { splitMentionText } from "@/lib/mentions";

function mentionsOf(text: string): string[] {
  return splitMentionText(text)
    .filter((part) => part.type === "mention")
    .map((part) => part.value);
}

function plainTextOf(text: string): string {
  return splitMentionText(text)
    .map((part) => part.value)
    .join("");
}

describe("splitMentionText", () => {
  it("picks a mention out of a sentence", () => {
    expect(mentionsOf("привет @БулашевАН, посмотри")).toEqual(["@БулашевАН"]);
    expect(mentionsOf("@БулашевАН посмотри")).toEqual(["@БулашевАН"]);
    expect(mentionsOf("привет\n@БулашевАН")).toEqual(["@БулашевАН"]);
    expect(mentionsOf("привет,@БулашевАН")).toEqual(["@БулашевАН"]);
  });

  it("keeps the digits of a disambiguated key", () => {
    expect(mentionsOf("@БулашевАН12 смотри")).toEqual(["@БулашевАН12"]);
  });

  it("finds several mentions in one text", () => {
    expect(mentionsOf("@ИвановИИ и @ПетровПП, завтра")).toEqual(["@ИвановИИ", "@ПетровПП"]);
  });

  it("does not light up an email address", () => {
    expect(mentionsOf("пиши на user@mkair.ru")).toEqual([]);
    expect(mentionsOf("a@b")).toEqual([]);
  });

  it("needs a name after the @", () => {
    expect(mentionsOf("собака @ и всё")).toEqual([]);
    expect(mentionsOf("@ БулашевАН")).toEqual([]);
  });

  it("keeps the text around a mention unchanged", () => {
    expect(plainTextOf("привет @БулашевАН, посмотри")).toBe("привет @БулашевАН, посмотри");
    expect(plainTextOf("нет упоминаний")).toBe("нет упоминаний");
    expect(splitMentionText("нет упоминаний")).toEqual([
      { type: "text", value: "нет упоминаний" },
    ]);
  });
});
